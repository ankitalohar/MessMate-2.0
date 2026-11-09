require("dotenv").config();
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const connectDB = require("./config/db");
const authRoutes = require("../backend/routes/authRoutes");
const studentRoutes = require("../backend/routes/studentRoutes");
const adminRoutes = require("../backend/routes/adminRoutes");
const emailRoutes = require("../backend/routes/emailRoutes");
const {
  seedOfficialNovemberMenus,
  seedOfficialOctoberMenus,
} = require("../backend/utils/officialOctoberMenu");
const { seedApprovedStudents } = require("../backend/utils/approvedStudents");

const app = express();
const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];
const allowedOrigins = new Set([
  ...defaultAllowedOrigins,
  ...(process.env.CLIENT_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      const error = new Error("This origin is not allowed.");
      error.code = "CORS_ORIGIN_DENIED";
      callback(error);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({ success: true, message: "MessMate API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin", emailRoutes);

app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: "API endpoint not found." });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error.code === "CORS_ORIGIN_DENIED") {
    res.status(403).json({ success: false, message: error.message });
    return;
  }

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    res.status(400).json({ success: false, message: "Request body must be valid JSON." });
    return;
  }

  const statusCode = Number.isInteger(error.status) ? error.status : 500;
  if (process.env.NODE_ENV !== "production") {
    console.error("API request failed:", error.message);
  }
  res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? "An unexpected server error occurred." : error.message,
  });
});

async function startServer() {
  const jwtSecret = process.env.JWT_SECRET;
  if (typeof jwtSecret !== "string" || jwtSecret.trim().length < 32) {
    throw new Error("JWT_SECRET in server/.env must be at least 32 characters.");
  }

  const configuredPort = process.env.PORT || "5000";
  const port = Number(configuredPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port between 1 and 65535.");
  }

  await connectDB();
  await seedApprovedStudents();
  await seedOfficialOctoberMenus();
  await seedOfficialNovemberMenus();
  return app.listen(port, () => {
    console.info(`MessMate API listening on port ${port}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    const safeMessage =
      error.message.startsWith("JWT_SECRET") ||
      error.message.startsWith("PORT ") ||
      error.message === "MONGODB_URI is required to connect to MongoDB."
        ? error.message
        : "MongoDB connection failed. Check server/.env and confirm MongoDB is reachable.";
    console.error("Unable to start MessMate API:", safeMessage);
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };
