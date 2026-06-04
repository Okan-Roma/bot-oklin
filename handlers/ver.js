module.exports = (bot) => {
  bot.command("ver", async (ctx) => {
    return ctx.reply(
      `🤖 Bot Rekap Keuangan Oklin\n` +
        `Versi: 1.0.0\n` +
        `Status: Aktif ✅\n` +
        `Mode: Production-ready basic finance tracker`
    );
  });
};