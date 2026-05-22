const { Telegraf } = require("telegraf");
const env = require("../config/env");

// handlers
const pingHandler = require("../handlers/ping");
const lastHandler = require("../handlers/last");

let bot = null;

if (env.BOT_TOKEN) {
  bot = new Telegraf(env.BOT_TOKEN);

  // ✅ START
  bot.start((ctx) => {
    const name = ctx.from.first_name || "User";

    ctx.reply(
      `Halo ${name} 👋\nSelamat datang di Bot Rekap Keuangan Oklin.\n\nGunakan:\n/help\n/ping\n/ver`
    );
  });

  // ✅ REGISTER HANDLER
  pingHandler(bot);
  lastHandler(bot);
}

module.exports = bot;