const { getAllTransactions } = require("../services/googleSheets");

module.exports = (bot) => {

  bot.command("saldo", async (ctx) => {
    try {
      const rows = await getAllTransactions();

      if (!rows.length) {
        return ctx.reply("⚠️ Belum ada data transaksi.");
      }

      const saldoMap = {};

      rows.forEach((row) => {
        const jenis = row[7];
        const nominal = Number(row[8]) || 0;
        const sumber = row[11];
        const tujuan = row[12];

        // ======================
        // Pemasukan
        // ======================
        if (jenis === "Pemasukan" && tujuan) {
          saldoMap[tujuan] = (saldoMap[tujuan] || 0) + nominal;
        }

        // ======================
        // Pengeluaran
        // ======================
        if (jenis === "Pengeluaran" && sumber) {
          saldoMap[sumber] = (saldoMap[sumber] || 0) - nominal;
        }

        // ======================
        // Transfer
        // ======================
        if (jenis === "Transfer") {
          if (sumber) {
            saldoMap[sumber] = (saldoMap[sumber] || 0) - nominal;
          }
          if (tujuan) {
            saldoMap[tujuan] = (saldoMap[tujuan] || 0) + nominal;
          }
        }
      });

      let message = "💰 Saldo Dompet\n\n";

      Object.keys(saldoMap).forEach((wallet) => {
        message += `${wallet} : Rp ${saldoMap[wallet].toLocaleString("id-ID")}\n`;
      });

      return ctx.reply(message);

    } catch (error) {
      console.error(error);
      return ctx.reply("⚠️ Gagal mengambil saldo.");
    }
  });

};