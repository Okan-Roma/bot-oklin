const { Telegraf, Markup } = require("telegraf");
const env = require("../config/env");

// handlers
const pingHandler = require("../handlers/ping");
const lastHandler = require("../handlers/last");
const incomeHandler = require("../handlers/income");
const expenseHandler = require("../handlers/expense"); // ✅ jangan langsung panggil
const transferHandler = require("../handlers/transfer");

let bot = null;

if (env.BOT_TOKEN) {
  bot = new Telegraf(env.BOT_TOKEN);

  // ✅ START
  bot.start((ctx) => {
    const name = ctx.from.first_name || "User";

    return ctx.reply(
      `Halo ${name} 👋\n` +
        `Selamat datang di Bot Rekap Keuangan Oklin.`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback("➕ Pemasukan", "menu_income"),
          Markup.button.callback("➖ Pengeluaran", "menu_expense"),
          Markup.button.callback("🔁 Transfer Dompet", "menu_transfer"),
        ],
      ])
    );
  });

  // ✅ REGISTER HANDLER (INI PENTING)
  pingHandler(bot);
  lastHandler(bot);
  incomeHandler(bot);
  expenseHandler(bot); // ✅ WAJIB ADA
  transferHandler(bot);
}

module.exports = bot;