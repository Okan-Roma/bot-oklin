function formatRupiah(angka) {
  return "Rp " + Number(angka).toLocaleString("id-ID");
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

function formatLastTransactions(data) {
  if (!data || data.length === 0) {
    return "📭 Belum ada transaksi.";
  }

  let text = "📋 5 Transaksi Terakhir\n\n";

  data.forEach((trx, index) => {
    const jenis = trx.jenis === "Pengeluaran" ? "➖" : "➕";

    text += `${index + 1}. ${jenis} ${trx.jenis}\n`;
    text += `💳 Account : ${trx.account || "-"}\n`;
    text += `💰 Nominal : ${formatRupiah(trx.nominal)}\n`;
    text += `📂 Kategori: ${trx.kategori || "-"}\n`;
    text += `🏦 Dompet  : ${trx.dompet || "-"}\n`;
    text += `📅 Tanggal : ${formatTanggal(trx.tanggal)}\n`;
    text += `📝 Ket     : ${trx.keterangan || "-"}\n`;
    text += `\n━━━━━━━━━━━━━━\n\n`;
  });

  return text;
}

module.exports = {
  formatLastTransactions,
};
