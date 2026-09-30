const Database = require("better-sqlite3");
const bcrypt = require("bcrypt");
const path = require("path");

// ========================================
// DATABASE CONNECTION
// ========================================

const dbPath = path.join(__dirname, "database", "website.db");
const db = new Database(dbPath);

// ========================================
// ADMIN DETAILS
// ========================================

const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;

// ========================================
// VALIDATE ADMIN DETAILS
// ========================================

if (!username || !password) {
    console.error(
        "ERROR: ADMIN_USERNAME and ADMIN_PASSWORD must be set."
    );

    db.close();
    process.exit(1);
}

// ========================================
// HASH PASSWORD
// ========================================

const passwordHash = bcrypt.hashSync(password, 10);

// ========================================
// INSERT ADMIN USER
// ========================================

try {

    const insertUser = db.prepare(`
        INSERT INTO users (username, password_hash)
        VALUES (?, ?)
    `);

    const result = insertUser.run(
        username,
        passwordHash
    );

    console.log("Admin account created successfully!");
    console.log("Username:", username);
    console.log("User ID:", result.lastInsertRowid);

} catch (error) {

    console.error(
        "Error creating admin:",
        error.message
    );

} finally {

    db.close();

}