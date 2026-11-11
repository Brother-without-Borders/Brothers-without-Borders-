
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const production = process.env.NODE_ENV === "production";

const secret = process.env.SESSION_SECRET;
if (production && (!secret || secret.length < 32)) {
  throw new Error("Set a SESSION_SECRET of at least 32 characters.");
}

const DATA_DIR = process.env.DATA_DIR || "./data";
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "bwb.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 full_name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL,
 status TEXT DEFAULT 'pending',
 role TEXT DEFAULT 'member',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcements (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 event_date TEXT,
 venue TEXT,
 description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL,
 subject TEXT NOT NULL,
 message TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

app.disable("x-powered-by");

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
      mediaSrc: ["'self'"],
      objectSrc: ["'none'"]
    }
  }
}));

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false }));

if (production) app.set("trust proxy", 1);

app.use(session({
  store: new SQLiteStore({
    db: "sessions.sqlite",
    dir: DATA_DIR
  }),
  name: "bwb.sid",
  secret: secret || crypto.randomBytes(48).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000
  }
}));

// CSRF protection
app.use((req, res, next) => {
  if (!req.session.csrf) {
    req.session.csrf = crypto.randomBytes(32).toString("hex");
  }
  next();
});

function csrf(req, res, next) {
  const token = req.get("x-csrf-token") || req.body?._csrf;
  if (!token || token !== req.session.csrf) {
    return res.status(403).json({
      error: "Security token expired. Refresh the page."
    });
  }
  next();
}

function getUser(req) {
  if (!req.session.userId) return null;

  return db.prepare(`
    SELECT id, full_name, email, role, status
    FROM users WHERE id = ?
  `).get(req.session.userId);
}

function loginRequired(req, res, next) {
  const user = getUser(req);

  if (!user || user.status !== "active") {
    return res.status(401).json({
      error: "Please log in with an approved account."
    });
  }

  req.user = user;
  next();
}

function adminRequired(req, res, next) {
  const user = getUser(req);

  if (!user || user.status !== "active" || user.role !== "admin") {
    return res.status(403).json({
      error: "Administrator access required."
    });
  }

  req.user = user;
  next();
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  message: { error: "Too many login attempts. Try again later." }
});

const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: { error: "Too many applications. Try again later." }
});

const clean = (v, max) => String(v || "").trim().slice(0, max);
const validEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Create the first administrator using environment variables.
function createAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) return;

  if (password.length < 12) {
    throw new Error("Admin password must be at least 12 characters.");
  }

  const existing = db.prepare(
    "SELECT id FROM users WHERE email = ? COLLATE NOCASE"
  ).get(email);

  if (!existing) {
    const hash = bcrypt.hashSync(password, 12);

    db.prepare(`
      INSERT INTO users
      (full_name,email,password_hash,status,role)
      VALUES (?,?,?,'active','admin')
    `).run("BWB Administrator", email, hash);

    console.log("Administrator account created.");
  }
}

createAdmin();

// CSRF token
app.get("/api/csrf", (req, res) => {
  res.json({ csrfToken: req.session.csrf });
});

// Current user
app.get("/api/me", (req, res) => {
  const user = getUser(req);

  res.json({
    user: user && user.status === "active" ? user : null
  });
});

// Membership application
app.post("/api/apply", applyLimiter, csrf, async (req, res) => {
  const fullName = clean(req.body.fullName, 100);
  const email = clean(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || "");

  if (
    fullName.length < 2 ||
    !validEmail(email) ||
    password.length < 10 ||
    password.length > 100
  ) {
    return res.status(400).json({
      error: "Enter your name, valid email and password of at least 10 characters."
    });
  }

  const exists = db.prepare(
    "SELECT id FROM users WHERE email = ? COLLATE NOCASE"
  ).get(email);

  if (exists) {
    return res.status(409).json({
      error: "An application already exists with this email."
    });
  }

  const hash = await bcrypt.hash(password, 12);

  db.prepare(`
    INSERT INTO users
    (full_name,email,password_hash,status,role)
    VALUES (?,?,?,'pending','member')
  `).run(fullName, email, hash);

  res.status(201).json({
    message: "Application submitted. Please wait for administrator approval."
  });
});

// Member login
app.post("/api/login", loginLimiter, csrf, async (req, res) => {
  const email = clean(req.body.email, 160).toLowerCase();
  const password = String(req.body.password || "");

  const user = db.prepare(
    "SELECT * FROM users WHERE email = ? COLLATE NOCASE"
  ).get(email);

  const valid = user
    ? await bcrypt.compare(password, user.password_hash)
    : false;

  if (!valid) {
    return res.status(401).json({
      error: "Email or password is incorrect."
    });
  }

  if (user.status === "pending") {
    return res.status(403).json({
      error: "Your membership application is awaiting approval."
    });
  }

  if (user.status !== "active") {
    return res.status(403).json({
      error: "Your membership is not active."
    });
  }

  req.session.regenerate(err => {
    if (err) {
      return res.status(500).json({
        error: "Unable to start your session."
      });
    }

    req.session.userId = user.id;
    req.session.csrf = crypto.randomBytes(32).toString("hex");

    res.json({
      message: "Login successful.",
      redirect: user.role === "admin"
        ? "/admin.html"
        : "/member.html"
    });
  });
});

// Logout
app.post("/api/logout", csrf, (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: "Logout failed." });
    }

    res.clearCookie("bwb.sid");
    res.json({ message: "Logged out." });
  });
});

// Public events
app.get("/api/events", (req, res) => {
  const events = db.prepare(
    "SELECT * FROM events ORDER BY event_date ASC LIMIT 30"
  ).all();

  res.json({ events });
});

// Member announcements
app.get("/api/announcements", loginRequired, (req, res) => {
  const announcements = db.prepare(
    "SELECT * FROM announcements ORDER BY id DESC LIMIT 50"
  ).all();

  res.json({ announcements });
});

// Admin: pending applications
app.get("/api/admin/pending", adminRequired, (req, res) => {
  const applicants = db.prepare(`
    SELECT id,full_name,email,created_at
    FROM users
    WHERE status='pending' AND role='member'
    ORDER BY id ASC
  `).all();

  res.json({ applicants });
});

// Admin: approve member
app.post("/api/admin/members/:id/approve", csrf, adminRequired, (req, res) => {
  const result = db.prepare(`
    UPDATE users SET status='active'
    WHERE id=? AND status='pending' AND role='member'
  `).run(Number(req.params.id));

  if (!result.changes) {
    return res.status(404).json({ error: "Application not found." });
  }

  res.json({ message: "Member approved." });
});

// Admin: reject member
app.post("/api/admin/members/:id/reject", csrf, adminRequired, (req, res) => {
  const result = db.prepare(`
    UPDATE users SET status='rejected'
    WHERE id=? AND status='pending' AND role='member'
  `).run(Number(req.params.id));

  if (!result.changes) {
    return res.status(404).json({ error: "Application not found." });
  }

  res.json({ message: "Application declined." });
});

// Admin: publish announcement
app.post("/api/admin/announcements", csrf, adminRequired, (req, res) => {
  const title = clean(req.body.title, 120);
  const body = clean(req.body.body, 4000);

  if (title.length < 3 || body.length < 3) {
    return res.status(400).json({ error: "Enter a title and message." });
  }

  db.prepare(
    "INSERT INTO announcements (title,body) VALUES (?,?)"
  ).run(title, body);

  res.status(201).json({ message: "Announcement published." });
});

// Admin: add event
app.post("/api/admin/events", csrf, adminRequired, (req, res) => {
  const title = clean(req.body.title, 120);
  const date = clean(req.body.eventDate, 30);
  const venue = clean(req.body.venue, 160);
  const description = clean(req.body.description, 2000);

  if (title.length < 3 || description.length < 3) {
    return res.status(400).json({
      error: "Enter event title and description."
    });
  }

  db.prepare(`
    INSERT INTO events (title,event_date,venue,description)
    VALUES (?,?,?,?)
  `).run(title, date || null, venue, description);

  res.status(201).json({ message: "Event added." });
});

// Public contact form
app.post("/api/contact", csrf, (req, res) => {
  const name = clean(req.body.name, 100);
  const email = clean(req.body.email, 160);
  const subject = clean(req.body.subject, 160);
  const message = clean(req.body.message, 3000);

  if (
    name.length < 2 ||
    !validEmail(email) ||
    subject.length < 2 ||
    message.length < 5
  ) {
    return res.status(400).json({
      error: "Please complete all contact form fields."
    });
  }

  db.prepare(`
    INSERT INTO messages (name,email,subject,message)
    VALUES (?,?,?,?)
  `).run(name, email, subject, message);

  res.status(201).json({
    message: "Your message has been received."
  });
});

// Admin: view contact messages
app.get("/api/admin/messages", adminRequired, (req, res) => {
  const messages = db.prepare(
    "SELECT * FROM messages ORDER BY id DESC LIMIT 100"
  ).all();

  res.json({ messages });
});

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`BWB website running at http://localhost:${PORT}`);
});
