const express = require("express");
const env = require("./config/env");
const bot = require("./bot");

const app = express();

// ==============================
// ✅ ENDPOINT
// ==============================

app.get("/", (req, res) => {
  res.json({
    app: "Bot Rekap Keuangan Oklin",
    status: "running",
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/ready", (req, res) => {
  const missing = [];

  if (!env.BOT_TOKEN) missing.push("BOT_TOKEN");
  if (!env.GOOGLE_SHEET_ID) missing.push("GOOGLE_SHEET_ID");

  if (missing.length > 0) {
    return res.json({
      status: "not_ready",
      missing,
    });
  }

  res.json({
    status: "ready",
    mode: env.NODE_ENV,
  });
});

// ==============================
// ✅ START SERVER
// ==============================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Bot Oklin running...");
  console.log("Port:", PORT);
});

// ==============================
// ✅ LAUNCH BOT
// ==============================

if (bot) {
  bot.launch({ dropPendingUpdates: true })
    .then(() => console.log("Bot aktif ✅"))
    .catch((err) => {
      console.error("Gagal launch bot:", err.message);
    });
}

process.once("SIGINT", () => bot && bot.stop("SIGINT"));
process.once("SIGTERM", () => bot && bot.stop("SIGTERM"));
