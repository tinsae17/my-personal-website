
const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 3000;

// ========================================
// 1. MIDDLEWARE
// ========================================

// Parse JSON request bodies
app.use(express.json());

app.use(express.urlencoded({ extended: true }));

// ========================================
// SESSION CONFIGURATION
// ========================================

app.use(session({
    secret: process.env.SESSION_SECRET || "development-secret-change-this",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        maxAge: 1000 * 60 * 60
    }
}));

// Serve frontend files
app.use(express.static(path.join(__dirname, "public")));

// ========================================
// 2. SQLITE DATABASE CONNECTION
// ========================================

const dbPath = path.join(__dirname, "database", "website.db");

// Connect to the SQLite database.
// SQLite creates the database file if it does not exist,
// provided the database folder already exists.
const db = new Database(dbPath);

console.log("SQLite database connected successfully!");


// ========================================
// 3. CREATE DATABASE TABLE
// ========================================

// Create the messages table if it does not already exist.
db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
`);

console.log("Messages table is ready!");

// ========================================
// 3B. CREATE ADMIN USERS TABLE
// ========================================

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
`);

console.log("Users table is ready!");

// ========================================
// 4. TEST API
// ========================================

app.get("/api/hello", (req, res) => {
    res.json({
        success: true,
        message: "Hello from my Express backend!"
    });
});


// ========================================
// 5. PROFILE API
// ========================================

app.get("/api/profile", (req, res) => {
    res.json({
        name: "Tinsae Solomon",
        role: "IT Professional",
        location: "Addis Ababa",
        skills: [
            "BSS Operations",
            "IT Operations",
            "Cybersecurity",
            "Networking",
            "Node.js"
        ]
    });
});

// ========================================
// PROTECTED ADMIN PAGE
// ========================================

app.get("/admin.html", requireLogin, (req, res) => {

    res.sendFile(
        path.join(__dirname, "admin", "admin.html")
    );

});

// ========================================
// ADMIN LOGOUT
// ========================================

app.post("/api/logout", (req, res) => {

    req.session.destroy((error) => {

        if (error) {
            console.error("Logout error:", error);

            return res.status(500).json({
                success: false,
                message: "Unable to logout."
            });
        }

        res.clearCookie("connect.sid");

        return res.json({
            success: true,
            message: "Logout successful."
        });

    });

});

// ========================================
// 6. CONTACT FORM API
// ========================================

// Prepare the SQL statement once for reuse.
const insertMessage = db.prepare(`
    INSERT INTO messages (name, email, message)
    VALUES (?, ?, ?)
`);

app.post("/api/contact", (req, res) => {
    const { name, email, message } = req.body;

    // Validate required fields
    if (
        typeof name !== "string" ||
        typeof email !== "string" ||
        typeof message !== "string" ||
        !name.trim() ||
        !email.trim() ||
        !message.trim()
    ) {
        return res.status(400).json({
            success: false,
            message: "Please provide your name, email, and message."
        });
    }

    try {
        // Save the contact message to SQLite
        const result = insertMessage.run(
            name.trim(),
            email.trim(),
            message.trim()
        );

        console.log("New contact message saved!");
        console.log("Message ID:", result.lastInsertRowid);

        return res.status(201).json({
            success: true,
            message: "Your message was received and saved successfully!"
        });

    } catch (error) {
        console.error("Error saving contact message:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to save your message. Please try again later."
        });
    }
});

// ========================================
// ADMIN LOGIN
// ========================================

app.post("/api/login", async (req, res) => {

    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: "Username and password are required."
        });
    }

    try {

        // Find the user
        const user = db.prepare(`
            SELECT id, username, password_hash
            FROM users
            WHERE username = ?
        `).get(username);

        // User doesn't exist
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password."
            });
        }

        // Compare password with stored bcrypt hash
        const passwordMatch = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password."
            });
        }

        // Create login session
        req.session.userId = user.id;
        req.session.username = user.username;

        return res.json({
            success: true,
            message: "Login successful!"
        });

    } catch (error) {

        console.error("Login error:", error);

        return res.status(500).json({
            success: false,
            message: "An error occurred during login."
        });
    }
});

// ========================================
// AUTHENTICATION MIDDLEWARE
// ========================================

function requireLogin(req, res, next) {

    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            message: "Authentication required."
        });
    }

    next();
}

// ========================================
// 7. GET CONTACT MESSAGES
// ========================================

app.get("/api/messages", requireLogin, (req, res) => {
    try {
        const messages = db.prepare(`
            SELECT id, name, email, message, created_at
            FROM messages
            ORDER BY id DESC
        `).all();

        res.json({
            success: true,
            messages: messages
        });

    } catch (error) {
        console.error("Error retrieving messages:", error.message);

        res.status(500).json({
            success: false,
            message: "Unable to retrieve messages."
        });
    }
});


// ========================================
// 8. START SERVER
// ========================================

const server = app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

// Close the database connection gracefully when the app stops.
function shutdown() {
    console.log("\nClosing server and database...");

    server.close(() => {
        db.close();

        console.log("Database connection closed.");

        process.exit(0);
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);