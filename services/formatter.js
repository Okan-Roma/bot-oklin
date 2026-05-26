function formatRupiah(angka) {
  const number = Number(String(angka || 0).replace(/[^\d.-]/g, "")) || 0;
  return "Rp " + number.toLocaleString("id-ID");
}

function formatTanggal(dateStr) {
  if (!dateStr) return "-";

  const text = String(dateStr).trim();

  // Format DD-MM-YYYY
  const parts = text.split("-");

  if (parts.length === 3) {
    const [day, month, year] = parts;

    const date = new Date(Number(year), Number(month) - 1, Number(day));

    const isValidDate =
      date.getFullYear() === Number(year) &&
      date.getMonth() === Number(month) - 1 &&
      date.getDate() === Number(day);

    if (!isValidDate) return text;

    return date.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  // fallback kalau format lain
  const fallbackDate = new Date(text);

  if (Number.isNaN(fallbackDate.getTime())) {
    return text;
  }

  return fallbackDate.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getJenisIcon(jenis) {
  const text = String(jenis || "").toLowerCase();

  if (text.includes("pengeluaran")) return "➖";
  if (text.includes("pemasukan")) return "➕";
  if (text.includes("transfer")) return "🔁";

  return "•";
}

function normalizeTransaction(trx) {
  const jenis = trx.jenis || trx["Jenis Transaksi"] || "-";
  const account = trx.account || trx["Account"] || "-";
  const nominal = trx.nominal || trx["Nominal"] || 0;
  const kategori = trx.kategori || trx["Kategori"] || "-";
  const tanggal = trx.tanggal || trx["Tanggal Transaksi"] || "-";
  const keterangan = trx.keterangan || trx["Keterangan"] || "-";

  const dompetSumber = trx.dompetSumber || trx["Dompet Sumber"] || "";
  const dompetTujuan = trx.dompetTujuan || trx["Dompet Tujuan"] || "";

  let dompet = trx.dompet || "-";

  if (String(jenis).toLowerCase().includes("pengeluaran")) {
    dompet = dompetSumber || "-";
  } else if (String(jenis).toLowerCase().includes("pemasukan")) {
    dompet = dompetTujuan || "-";
  } else if (String(jenis).toLowerCase().includes("transfer")) {
    dompet = `${dompetSumber || "-"} → ${dompetTujuan || "-"}`;
  }

  return {
    jenis,
    account,
    nominal,
    kategori,
    dompet,
    tanggal,
    keterangan,
  };
}

function formatLastTransactions(data) {
  if (!data || data.length === 0) {
    return "📭 Belum ada transaksi.";
  }

  let text = "📋 5 Transaksi Terakhir\n\n";

  data.forEach((trx, index) => {
    const item = normalizeTransaction(trx);
    const icon = getJenisIcon(item.jenis);

    text += `${index + 1}. ${icon} ${item.jenis}\n`;
    text += `💳 Account : ${item.account || "-"}\n`;
    text += `💰 Nominal : ${formatRupiah(item.nominal)}\n`;
    text += `📂 Kategori: ${item.kategori || "-"}\n`;
    text += `🏦 Dompet  : ${item.dompet || "-"}\n`;
    text += `📅 Tanggal : ${formatTanggal(item.tanggal)}\n`;
    text += `📝 Ket     : ${item.keterangan || "-"}\n`;
    text += `\n━━━━━━━━━━━━━━\n\n`;
  });

  return text;
}

module.exports = {
  formatRupiah,
  formatTanggal,
  formatLastTransactions,
};