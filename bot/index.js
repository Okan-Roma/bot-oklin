const { Telegraf } = require("telegraf");
const env = require("../config/env");

// handlers
const pingHandler = require("../handlers/ping");
const lastHandler = require("../handlers/last");
const incomeHandler = require("../handlers/income");
const expenseHandler = require("../handlers/expense");
const transferHandler = require("../handlers/transfer");
const saldoHandler = require("../handlers/saldo");
const rekapHandler = require("../handlers/rekap");
const riwayatHandler = require("../handlers/riwayat");
const { menuHandler, mainMenuKeyboard } = require("../handlers/menu");

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
        `Silakan pilih menu dari keyboard bawah atau gunakan command:\n` +
        `/ping\n` +
        `/last\n` +
        `/saldo\n` +
        `/rekap\n` +
        `/batal`,
      mainMenuKeyboard()
    );
  });

  // ==============================
  // ✅ REGISTER HANDLER
  // Urutan penting:
  // menuHandler sebelum flow handler
  // supaya tombol keyboard bawah bisa dicegat dulu.
  // ==============================

  pingHandler(bot);
  lastHandler(bot);
  menuHandler(bot);

  incomeHandler(bot);
  expenseHandler(bot);
  transferHandler(bot);

  saldoHandler(bot);
  rekapHandler(bot);
  riwayatHandler(bot);
}

module.exports = bot;