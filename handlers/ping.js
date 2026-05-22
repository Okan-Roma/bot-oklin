module.exports = (bot) => {
  bot.command("ping", (ctx) => {

    const now = new Date().toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: "full",
      timeStyle: "medium"
    });

    ctx.reply(
      `🏓 Pong!\nStatus bot: Aktif ✅\nWaktu server: ${now}`
    );
  });
};