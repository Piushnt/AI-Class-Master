import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("database.sqlite");
const JWT_SECRET = process.env.JWT_SECRET || "default_secret_key";

// --- Database Initialization ---
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    goal TEXT NOT NULL,
    content TEXT,
    lesson_points TEXT NOT NULL, -- JSON string
    students TEXT NOT NULL,      -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'deadline', 'absence', 'message', 'system'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
      const stmt = db.prepare("INSERT INTO users (email, password, name) VALUES (?, ?, ?)");
      const result = stmt.run(email, hashedPassword, name);
      
      const userId = result.lastInsertRowid;

      // Create initial notifications
      const notifyStmt = db.prepare("INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)");
      notifyStmt.run(userId, 'system', 'Bienvenue !', 'Bienvenue sur AI Class Master. Commencez par créer votre première session.');
      notifyStmt.run(userId, 'deadline', 'Rappel de cours', 'Votre prochain cours commence dans 30 minutes.');
      notifyStmt.run(userId, 'message', 'Nouveau message', 'Un étudiant a posé une question sur le dernier cours.');

      const token = jwt.sign({ id: userId, email, name }, JWT_SECRET);
      res.json({ token, user: { id: userId, email, name } });
    } catch (error) {
      res.status(400).json({ error: "Email already exists" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    const user: any = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  });

  app.get("/api/me", authenticateToken, (req: any, res) => {
    res.json(req.user);
  });

  // --- Session Routes ---
  app.get("/api/sessions", authenticateToken, (req: any, res) => {
    const sessions = db.prepare("SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC").all(req.user.id);
    res.json(sessions.map((s: any) => ({
      ...s,
      lesson_points: JSON.parse(s.lesson_points),
      students: JSON.parse(s.students)
    })));
  });

  app.post("/api/sessions", authenticateToken, (req: any, res) => {
    const { title, goal, content, lesson_points, students } = req.body;
    const stmt = db.prepare(`
      INSERT INTO sessions (user_id, title, goal, content, lesson_points, students)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      req.user.id,
      title,
      goal,
      content,
      JSON.stringify(lesson_points),
      JSON.stringify(students)
    );
    res.json({ id: result.lastInsertRowid });
  });

  app.delete("/api/sessions/:id", authenticateToken, (req: any, res) => {
    const stmt = db.prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?");
    stmt.run(req.params.id, req.user.id);
    res.json({ success: true });
  });

  // --- Notification Routes ---
  app.get("/api/notifications", authenticateToken, (req: any, res) => {
    const notifications = db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC").all(req.user.id);
    res.json(notifications);
  });

  app.post("/api/notifications/:id/read", authenticateToken, (req: any, res) => {
    const stmt = db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?");
    stmt.run(req.params.id, req.user.id);
    res.json({ success: true });
  });

  app.post("/api/notifications/read-all", authenticateToken, (req: any, res) => {
    const stmt = db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?");
    stmt.run(req.user.id);
    res.json({ success: true });
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
