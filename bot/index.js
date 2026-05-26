const { Telegraf, Markup } = require("telegraf");
const env = require("../config/env");

// handlers
const pingHandler = require("../handlers/ping");
const lastHandler = require("../handlers/last");
const incomeHandler = require("../handlers/income");

let bot = null;

if (env.BOT_TOKEN) {
  bot = new Telegraf(env.BOT_TOKEN);

  // ==============================
  // ✅ START
  // ==============================

  bot.start((ctx) => {
    const name = ctx.from.first_name || "User";

    return ctx.reply(
      `Halo ${name} 👋\n` +
      `Selamat datang di Bot Rekap Keuangan Oklin.\n\n` +
      `Silakan pilih menu di bawah ini atau gunakan perintah:\n` +
      `/help\n` +
      `/ping\n` +
      `/ver`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("➕ Pemasukan", "menu_income"),
          Markup.button.callback("➖ Pengeluaran", "menu_expense"),
        ],
        [
          Markup.button.callback("🔁 Transfer Dompet", "menu_transfer"),
          Markup.button.callback("📊 Rekap", "menu_recap"),
        ],
        [
          Markup.button.callback("🔔 Reminder", "menu_reminder"),
          Markup.button.callback("❓ Bantuan", "menu_help"),
        ],
      ])
    );
  });

  // ==============================
  // ✅ REGISTER HANDLER
  // ==============================

  pingHandler(bot);
  lastHandler(bot);
  incomeHandler(bot);
}

module.exports = bot;