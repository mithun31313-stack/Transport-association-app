require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const path = require("path");

const authRoutes = require("./routes/auth");
const driverRoutes = require("./routes/drivers");
const salaryRoutes = require("./routes/salaries");
const salaryPaymentRoutes = require("./routes/salaryPayments");
const financeRoutes = require("./routes/finance");
const memberRoutes = require("./routes/members");
const vehicleRoutes = require("./routes/vehicles");
const attendanceRoutes = require("./routes/attendance");
const notificationRoutes = require("./routes/notifications");
const reportRoutes = require("./routes/reports");
const auditRoutes = require("./routes/audit");

const app = express();

// Render (and most hosts) sit behind a reverse proxy that sets X-Forwarded-For.
// Without this, express-rate-limit throws on every request trying to identify the
// real client IP, which was causing intermittent 502s on rate-limited routes.
app.set("trust proxy", 1);

// ---- Security middleware ----
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN === "*" ? true : (process.env.CORS_ORIGIN || "").split(",") }));
app.use(express.json({ limit: "5mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
app.use("/api", apiLimiter);

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: "Too many login attempts, try again later" } });
app.use("/api/auth/login", loginLimiter);

// Generated PDF receipts are served statically (put behind your own auth/proxy in production
// if receipts must not be link-guessable — e.g. serve via a signed, short-lived URL instead).
app.use("/receipts", express.static(path.join(__dirname, "..", "receipts")));

app.get("/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/salaries", salaryRoutes);
app.use("/api/salary-payments", salaryPaymentRoutes);
app.use("/api", financeRoutes); // /api/income, /api/expenses, /api/dues, /api/balance
app.use("/api/members", memberRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api", notificationRoutes); // /api/announcements, /api/notifications
app.use("/api/reports", reportRoutes);
app.use("/api/audit-logs", auditRoutes);

// ---- Error handler (last) ----
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.httpStatus || 500).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Transport Association API listening on port ${PORT}`));
