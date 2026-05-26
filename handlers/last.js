const { getLastActiveTransactions } = require("../services/googleSheets");
const { formatLastTransactions } = require("../services/formatter");

// ==============================
// ✅ HANDLER
// ==============================

module.exports = (bot) => {
  bot.command("last", async (ctx) => {
    try {
      const transactions = await getLastActiveTransactions(5);

      if (!transactions.length) {
        return ctx.reply("📭 Belum ada transaksi aktif di Google Sheet.");
      }

      return ctx.reply(formatLastTransactions(transactions));

    } catch (error) {
      console.error("Error /last:", error);

      return ctx.reply(
        "⚠️ Bot sedang kesulitan membaca data transaksi.\nSilakan coba lagi beberapa detik."
      );
    }
  });
};