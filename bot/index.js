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
const helpHandler = require("../handlers/help");
const verHandler = require("../handlers/ver");
const detailHandler = require("../handlers/detail");
const fastInputHandler = require("../handlers/fastInput");
const hapusHandler = require("../handlers/hapus");

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
        `Silakan pilih menu dari keyboard bawah.\n\n` +
        `Command cepat:\n` +
        `/help - bantuan\n` +
        `/ping - cek bot\n` +
        `/last - 5 transaksi terakhir\n` +
        `/saldo - saldo dompet\n` +
        `/rekap - rekap bulan ini\n` +
        `/batal - batalkan input`,
      mainMenuKeyboard()
    );
  });

  // ==============================
  // ✅ REGISTER HANDLER
  // ==============================

  pingHandler(bot);
  lastHandler(bot);
  helpHandler(bot);
  verHandler(bot);
  detailHandler(bot);
  hapusHandler(bot);

  // Menu keyboard bawah
  menuHandler(bot);

  // Flow transaksi
  incomeHandler(bot);
  expenseHandler(bot);
  transferHandler(bot);

  fastInputHandler(bot);

  // Report
  saldoHandler(bot);
  rekapHandler(bot);
  riwayatHandler(bot);
}

module.exports = bot;