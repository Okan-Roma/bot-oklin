const { getLastActiveTransactions } = require("../services/googleSheets");

// ==============================
// ✅ FORMAT HELPERS
// ==============================

function formatRupiah(value) {
  const number = Number(String(value).replace(/[^\d.-]/g, "")) || 0;

  return "Rp " + number.toLocaleString("id-ID");
}

function formatTanggal(dateStr) {
  if (!dateStr) return "-";

  const date = new Date(dateStr);

  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getJenisIcon(jenis) {
  const text = (jenis || "").toLowerCase();

  if (text.includes("pengeluaran")) return "➖";
  if (text.includes("pemasukan")) return "➕";
  if (text.includes("transfer")) return "🔁";
  return "•";
}

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

      const lines = ["📋 5 Transaksi Terakhir", ""];

      transactions.forEach((trx, index) => {
        const jenis = trx["Jenis Transaksi"] || "-";
        const icon = getJenisIcon(jenis);
        const account = trx["Account"] || "-";
        const nominal = formatRupiah(trx["Nominal"]);
        const kategori = trx["Kategori"] || "-";
        const dompetSumber = trx["Dompet Sumber"] || "-";
        const dompetTujuan = trx["Dompet Tujuan"] || "-";
        const tanggal = formatTanggal(trx["Tanggal Transaksi"]);
        const keterangan = trx["Keterangan"] || "-";

        let dompetText = "-";

        if (jenis.toLowerCase().includes("pengeluaran")) {
          dompetText = dompetSumber;
        } else if (jenis.toLowerCase().includes("pemasukan")) {
          dompetText = dompetTujuan;
        } else if (jenis.toLowerCase().includes("transfer")) {
          dompetText = `${dompetSumber} → ${dompetTujuan}`;
        }

        lines.push(
          `${index + 1}. ${icon} ${jenis}\n` +
          `💳 Account : ${account}\n` +
          `💰 Nominal : ${nominal}\n` +
          `📂 Kategori: ${kategori}\n` +
          `🏦 Dompet  : ${dompetText}\n` +
          `📅 Tanggal : ${tanggal}\n` +
          `📝 Ket     : ${keterangan}\n` +
          `━━━━━━━━━━━━━━`
        );
      });

      return ctx.reply(lines.join("\n\n"));
    } catch (error) {
      console.error("Error /last:", error);

      return ctx.reply(
        "⚠️ Bot sedang kesulitan membaca data transaksi.\nSilakan coba lagi beberapa detik."
      );
    }
  });
};