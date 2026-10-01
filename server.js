require("dotenv").config();

const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

// ========================================
// 1. MIDDLEWARE
// ========================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========================================
// 2. PRODUCTION PROXY
// ========================================

if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

// ========================================
// 3. SESSION CONFIGURATION
// ========================================

app.use(
    session({
        secret:
            process.env.SESSION_SECRET ||
            "development-secret-change-this",

        resave: false,
        saveUninitialized: false,

        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 1000 * 60 * 60
        }
    })
);

// ========================================
// 4. POSTGRESQL DATABASE CONNECTION
// ========================================

if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is not configured.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error:", error);
});

// ========================================
// 5. SERVE FRONTEND FILES
// ========================================

app.use(express.static(path.join(__dirname, "public")));

// ========================================
// 6. AUTHENTICATION MIDDLEWARE
// ========================================

function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized"
        });
    }

    next();
}

// ========================================
// 7. TEST API
// ========================================

app.get("/api/hello", (req, res) => {
    res.json({
        message: "Hello from my Express backend!"
    });
});

// ========================================
// 8. PROFILE API
// ========================================

app.get("/api/profile", (req, res) => {
    res.json({
        name: "Tinsae Solomon",
        title: "IT Professional",
        email: "7tinsae17@gmail.com",
        linkedin:
            "https://www.linkedin.com/in/tinsae-solomon-ab44761a4",
        github: "https://github.com/tinsae17"
    });
});

// ========================================
// 9. PROTECTED ADMIN PAGE
// ========================================

app.get("/admin.html", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "admin", "admin.html"));
});

// ========================================
// 10. CONTACT FORM
// ========================================

app.post("/api/contact", async (req, res) => {
    try {
        const { name, email, message } = req.body;

        // Validate input
        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof message !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid input."
            });
        }

        const cleanName = name.trim();
        const cleanEmail = email.trim();
        const cleanMessage = message.trim();

        if (!cleanName || !cleanEmail || !cleanMessage) {
            return res.status(400).json({
                success: false,
                message: "All fields are required."
            });
        }

        // Save message to PostgreSQL
        await pool.query(
            `
            INSERT INTO messages
                (name, email, message)
            VALUES
                ($1, $2, $3)
            `,
            [cleanName, cleanEmail, cleanMessage]
        );

        res.json({
            success: true,
            message: "Message sent successfully."
        });

    } catch (error) {
        console.error("Contact form error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to save message."
        });
    }
});

// ========================================
// 11. LOGIN
// ========================================

app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (
            typeof username !== "string" ||
            typeof password !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Username and password are required."
            });
        }

        const result = await pool.query(
            `
            SELECT id, username, password_hash
            FROM users
            WHERE username = $1
            `,
            [username.trim()]
        );
       

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password."
            });
        }

        const user = result.rows[0];

        const passwordMatches = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password."
            });
        }

        req.session.userId = user.id;
        req.session.username = user.username;

        res.json({
            success: true,
            message: "Login successful."
        });

    } catch (error) {
        console.error("Login error:", error);

        res.status(500).json({
            success: false,
            message: "Login failed."
        });
    }
});

// ========================================
// 12. LOGOUT
// ========================================

app.post("/api/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error("Logout error:", error);

            return res.status(500).json({
                success: false,
                message: "Logout failed."
            });
        }

        res.clearCookie("connect.sid");

        res.json({
            success: true,
            message: "Logged out successfully."
        });
    });
});

// ========================================
// 13. GET CONTACT MESSAGES
// ========================================

app.get("/api/messages", requireLogin, async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                id,
                name,
                email,
                message,
                created_at
            FROM messages
            ORDER BY id DESC
            `
        );

        res.json(result.rows);

    } catch (error) {
        console.error("Messages retrieval error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to retrieve messages."
        });
    }
});

// ========================================
// 14. INITIALIZE DATABASE
// ========================================

async function initializeDatabase() {
    console.log("Connecting to PostgreSQL...");

    await pool.query("SELECT NOW()");

    console.log("PostgreSQL connection successful!");

    // Messages table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log("Messages table is ready!");

    // Users table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id BIGSERIAL PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log("Users table is ready!");

    // ========================================
    // CREATE INITIAL ADMIN ACCOUNT
    // ========================================

    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminUsername && adminPassword) {
        const existingAdmin = await pool.query(
            `
            SELECT id
            FROM users
            WHERE username = $1
            `,
            [adminUsername]
        );

        if (existingAdmin.rows.length === 0) {
            const passwordHash = await bcrypt.hash(
                adminPassword,
                10
            );

            await pool.query(
                `
                INSERT INTO users
                    (username, password_hash)
                VALUES
                    ($1, $2)
                `,
                [adminUsername, passwordHash]
            );

            console.log("Initial admin account created.");
        } else {
            console.log("Configured admin account already exists.");
        }
    } else {
        console.log(
            "ADMIN_USERNAME or ADMIN_PASSWORD is not configured."
        );
    }
}

// ========================================
// 15. START SERVER
// ========================================

async function startServer() {
    try {
        await initializeDatabase();

        const server = app.listen(PORT, () => {
            console.log(
                `Server running at http://localhost:${PORT}`
            );
        });

        // ========================================
        // GRACEFUL SHUTDOWN
        // ========================================

        const shutdown = async () => {
            console.log("Shutting down server...");

            server.close(async () => {
                try {
                    await pool.end();

                    console.log(
                        "PostgreSQL connection pool closed."
                    );

                    process.exit(0);
                } catch (error) {
                    console.error(
                        "Error closing PostgreSQL pool:",
                        error
                    );

                    process.exit(1);
                }
            });
        };

        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);

    } catch (error) {
        console.error(
            "Failed to start server:",
            error
        );

        await pool.end();

        process.exit(1);
    }
}

startServer();