import express from "express";
import { createServer as createViteServer } from "vite";
import pg from "pg";
const { Pool } = pg;
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Database Configuration (Supabase) ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const JWT_SECRET = process.env.JWT_SECRET || "default_secret_key";

// --- Gemini Configuration ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// --- Database Initialization (PostgreSQL) ---
let isDbInitialized = false;
const initDb = async () => {
  if (isDbInitialized) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        goal TEXT NOT NULL,
        content TEXT,
        lesson_points JSONB NOT NULL,
        students JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    isDbInitialized = true;
    console.log("Database initialized (PostgreSQL)");
  } catch (err) {
    console.error("Database initialization error:", err);
  } finally {
    client.release();
  }
};

const app = express();
app.use(express.json());

// Middleware to ensure DB is initialized
app.use(async (req, res, next) => {
  try {
    await initDb();
    next();
  } catch (err) {
    res.status(500).json({ error: "Database not ready" });
  }
});

// --- Auth Middleware ---
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: "Forbidden" });
    req.user = user;
    next();
  });
};

// --- Auth Routes ---
app.post("/api/auth/register", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: "Missing fields" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id",
      [email, hashedPassword, name]
    );

    const userId = result.rows[0].id;

    // Create initial notifications
    await pool.query(
      "INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)",
      [userId, 'system', 'Bienvenue !', 'Bienvenue sur AI Class Master. Commencez par créer votre première session.']
    );
    await pool.query(
      "INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)",
      [userId, 'deadline', 'Rappel de cours', 'Votre prochain cours commence dans 30 minutes.']
    );
    await pool.query(
      "INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)",
      [userId, 'message', 'Nouveau message', 'Un étudiant a posé une question sur le dernier cours.']
    );

    const token = jwt.sign({ id: userId, email, name }, JWT_SECRET);
    res.json({ token, user: { id: userId, email, name } });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: "Email already exists or error during registration" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    res.status(500).json({ error: "Server error during login" });
  }
});

app.get("/api/me", authenticateToken, (req: any, res) => {
  res.json(req.user);
});

// --- Session Routes ---
app.get("/api/sessions", authenticateToken, async (req: any, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM sessions WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

app.post("/api/sessions", authenticateToken, async (req: any, res) => {
  const { title, goal, content, lesson_points, students } = req.body;
  try {
    const result = await pool.query(`
      INSERT INTO sessions (user_id, title, goal, content, lesson_points, students)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      req.user.id,
      title,
      goal,
      content,
      JSON.stringify(lesson_points),
      JSON.stringify(students)
    ]);
    res.json({ id: result.rows[0].id });
  } catch (error) {
    res.status(500).json({ error: "Failed to save session" });
  }
});

app.delete("/api/sessions/:id", authenticateToken, async (req: any, res) => {
  try {
    await pool.query("DELETE FROM sessions WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete session" });
  }
});

// --- Notification Routes ---
app.get("/api/notifications", authenticateToken, async (req: any, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

app.post("/api/notifications/:id/read", authenticateToken, async (req: any, res) => {
  try {
    await pool.query("UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update notification" });
  }
});

app.post("/api/notifications/read-all", authenticateToken, async (req: any, res) => {
  try {
    await pool.query("UPDATE notifications SET is_read = TRUE WHERE user_id = $1", [req.user.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update notifications" });
  }
});

// --- Gemini API Bridge ---
app.post("/api/ai/generate", authenticateToken, async (req, res) => {
  const { prompt, context } = req.body;
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const fullPrompt = context
      ? `Context: ${context}\n\nTask: ${prompt}`
      : prompt;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    res.json({ text: response.text() });
  } catch (error) {
    console.error("Gemini Error:", error);
    res.status(500).json({ error: "Error calling Gemini API" });
  }
});

// --- Vite Middleware ---
if (process.env.NODE_ENV !== "production") {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

// Only listen in standalone development mode
if (process.env.PORT || process.cwd() === __dirname) {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
