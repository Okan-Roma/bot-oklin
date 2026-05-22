require("dotenv").config();

const express = require("express");
const { Telegraf } = require("telegraf");

const app = express();

// ==============================
// ✅ ENV VALIDATION (ringan)
// ==============================
const BOT_TOKEN = process.env.BOT_TOKEN;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;

const isBotTokenReady = !!BOT_TOKEN;
const isSheetReady = !!GOOGLE_SHEET_ID;

// ==============================
// ✅ INIT BOT (jangan crash)
// ==============================
let bot = null;

if (isBotTokenReady) {
  bot = new Telegraf(BOT_TOKEN);
}

// ==============================
// ✅ BASIC COMMANDS
// ==============================
if (bot) {
  bot.start((ctx) => {
    const name = ctx.from.first_name || "User";

    ctx.reply(
      `Halo ${name} 👋\nSelamat datang di Bot Rekap Keuangan Oklin.\n\nGunakan:\n/help\n/ping\n/ver`
    );
  });

  bot.command("ping", (ctx) => {
    const now = new Date().toLocaleString("id-ID");

    ctx.reply(
      `🏓 Pong!\nStatus bot: Aktif ✅\nWaktu server: ${now}\n`
    );
  });
}

// ==============================
// ✅ EXPRESS ENDPOINT
// ==============================

// Root
app.get("/", (req, res) => {
  res.json({
    app: "Bot Rekap Keuangan Oklin",
    status: "running",
    message: "Service aktif",
  });
});

// Health (cepat, tanpa cek eksternal)
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Ready (cek config penting)
app.get("/ready", (req, res) => {
  const missing = [];

  if (!BOT_TOKEN) missing.push("BOT_TOKEN");
  if (!GOOGLE_SHEET_ID) missing.push("GOOGLE_SHEET_ID");

  if (missing.length > 0) {
    return res.json({
      status: "not_ready",
      missing,
    });
  }

  res.json({
    status: "ready",
    botToken: "ok",
    googleSheetId: "ok",
    mode: process.env.NODE_ENV || "development",
  });
});

// ==============================
// ✅ START SERVER
// ==============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("=================================");
  console.log("Bot Oklin is running...");
  console.log("Mode:", process.env.NODE_ENV || "development");
  console.log("Port:", PORT);
  console.log("Endpoint:");
  console.log("GET /");
  console.log("GET /health");
  console.log("GET /ready");
  console.log("=================================");
});

// ==============================
// ✅ LAUNCH BOT (polling dulu)
// ==============================
if (bot) {
  bot.launch()
    .then(() => console.log("Bot Telegram aktif ✅"))
    .catch((err) => console.error("Bot error:", err));
}

// graceful stop
process.once("SIGINT", () => bot && bot.stop("SIGINT"));
process.once("SIGTERM", () => bot && bot.stop("SIGTERM"));