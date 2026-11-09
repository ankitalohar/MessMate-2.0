const path = require("path");
const nodemailer = require("nodemailer");

// ==========================================
// 1. LOAD ENVIRONMENT VARIABLES
// ==========================================

const envPath = path.join(__dirname, "..", ".env");

const dotenvResult = require("dotenv").config({
    path: envPath
});

if (dotenvResult.error) {
    console.error("Failed to load server/.env:", dotenvResult.error.message);
} else {
    console.log("MessMate environment variables loaded.");
}

// ==========================================
// 2. READ EMAIL CONFIGURATION
// ==========================================

const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = Number(process.env.EMAIL_PORT);
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;

// ==========================================
// 3. SAFE CONFIGURATION DIAGNOSTICS
// ==========================================

console.log("\n========== MESSMATE SMTP DIAGNOSTICS ==========");
console.log("SMTP Host:", EMAIL_HOST || "MISSING");
console.log("SMTP Port:", EMAIL_PORT || "MISSING");
console.log("SMTP User:", EMAIL_USER || "MISSING");
console.log("Password Loaded:", Boolean(EMAIL_PASSWORD));
console.log("Password Length:", EMAIL_PASSWORD?.length || 0);
console.log("================================================\n");

// ==========================================
// 4. VALIDATE CONFIGURATION
// ==========================================

if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASSWORD) {
    throw new Error(
        "SMTP configuration missing. Check EMAIL_HOST, EMAIL_USER and EMAIL_PASSWORD in server/.env"
    );
}

if (![465, 587].includes(EMAIL_PORT)) {
    throw new Error("Invalid EMAIL_PORT. Use 465 or 587.");
}

// ==========================================
// 5. CREATE NODEMAILER TRANSPORTER
// ==========================================

const transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,

    secure: EMAIL_PORT === 465,

    ...(EMAIL_PORT === 587
        ? { requireTLS: true }
        : {}),

    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD
    },

    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000
});

// ==========================================
// 6. VERIFY SMTP CONNECTION
// ==========================================

async function verifyEmailTransport() {
    try {
        await transporter.verify();

        console.log("✅ MessMate SMTP connection successful!");
        console.log("✅ Gmail authentication verified.");

        return true;

    } catch (error) {
        console.error("\n❌ MESSMATE SMTP VERIFICATION FAILED");

        console.error("Error Code:", error.code || "UNKNOWN");
        console.error("Response Code:", error.responseCode || "N/A");
        console.error("Error Message:", error.message);

        return false;
    }
}

// ==========================================
// 7. EXPORT
// ==========================================

transporter.verifyEmailTransport = verifyEmailTransport;

module.exports = transporter;