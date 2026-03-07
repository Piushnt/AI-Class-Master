import express from "express";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Environment Validation ---
const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY', 'JWT_SECRET'];
const missingEnv = requiredEnv.filter(env => !process.env[env]);
if (missingEnv.length > 0) {
  console.error(`CRITICAL: Missing environment variables: ${missingEnv.join(', ')}`);
}

// --- Supabase Configuration ---
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; // Use Service Role Key for server-side
const supabase = createClient(supabaseUrl, supabaseKey);

const JWT_SECRET = process.env.JWT_SECRET || "default_secret_key";

// --- Gemini Configuration ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const app = express();
app.use(express.json());

// --- Database Initialization (Supabase via SDK is different, schema should be handled in Supabase Dashboard) ---
// Note: We'll assume tables are already created via the SQL provided earlier.

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
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert([{ email, password: hashedPassword, name }])
      .select()
      .single();

    if (userError) throw userError;

    const userId = newUser.id;

    // Create initial notifications
    await supabase.from('notifications').insert([
      { user_id: userId, type: 'system', title: 'Bienvenue !', message: 'Bienvenue sur AI Class Master. Commencez par créer votre première session.' },
      { user_id: userId, type: 'deadline', title: 'Rappel de cours', message: 'Votre prochain cours commence dans 30 minutes.' },
      { user_id: userId, type: 'message', title: 'Nouveau message', message: 'Un étudiant a posé une question sur le dernier cours.' }
    ]);

    const token = jwt.sign({ id: userId, email, name }, JWT_SECRET);
    res.json({ token, user: { id: userId, email, name } });
  } catch (error: any) {
    console.error("Registration Error Detail:", error);
    res.status(400).json({ error: error.message || "Error during registration" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Missing fields" });
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user || !(await bcrypt.compare(password, user.password))) {
      if (error && error.code !== 'PGRST116') console.error("Login DB Error:", error);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error("Login Server Error:", error);
    res.status(500).json({ error: "Server error during login" });
  }
});

app.get("/api/me", authenticateToken, (req: any, res) => {
  res.json(req.user);
});

// --- Session Routes ---
app.get("/api/sessions", authenticateToken, async (req: any, res) => {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

app.post("/api/sessions", authenticateToken, async (req: any, res) => {
  const { title, goal, content, lesson_points, students } = req.body;
  try {
    const { data, error } = await supabase
      .from('sessions')
      .insert([{
        user_id: req.user.id,
        title,
        goal,
        content,
        lesson_points,
        students
      }])
      .select()
      .single();

    if (error) throw error;
    res.json({ id: data.id });
  } catch (error) {
    res.status(500).json({ error: "Failed to save session" });
  }
});

app.delete("/api/sessions/:id", authenticateToken, async (req: any, res) => {
  try {
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete session" });
  }
});

// --- Notification Routes ---
app.get("/api/notifications", authenticateToken, async (req: any, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

app.post("/api/notifications/:id/read", authenticateToken, async (req: any, res) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update notification" });
  }
});

app.post("/api/notifications/read-all", authenticateToken, async (req: any, res) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', req.user.id);

    if (error) throw error;
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
