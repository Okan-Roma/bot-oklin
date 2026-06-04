function formatRupiah(value) {
  const number = Number(String(value || 0).replace(/[^\d.-]/g, "")) || 0;
  return "Rp " + number.toLocaleString("id-ID");
}

function formatTanggal(dateStr) {
  if (!dateStr) return "-";

  const text = String(dateStr).trim();

  // Format DD-MM-YYYY
  let match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (match) {
    const day = match[1];
    const month = match[2];

    return `${day}/${month}`;
  }

  // Format YYYY-MM-DD
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    const month = match[2];
    const day = match[3];

    return `${day}/${month}`;
  }

  // Format DD/MM/YYYY
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (match) {
    const day = String(match[1]).padStart(2, "0");
    const month = String(match[2]).padStart(2, "0");

    return `${day}/${month}`;
  }

  return text;
}

function getJenisIcon(jenis) {
  const text = String(jenis || "").toLowerCase();

  if (text.includes("pengeluaran")) return "➖";
  if (text.includes("pemasukan")) return "➕";
  if (text.includes("transfer")) return "🔁";

  return "•";
}

function normalizeTransaction(trx) {
  const id = trx.id || trx["ID Transaksi"] || "-";
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
    id,
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

  let text = "🧾 5 Transaksi Terakhir\n\n";

  data.forEach((trx, index) => {
    const item = normalizeTransaction(trx);
    const icon = getJenisIcon(item.jenis);
    const tanggal = formatTanggal(item.tanggal);

    if (String(item.jenis).toLowerCase().includes("transfer")) {
      text +=
        `${index + 1}. ${item.id} | ${tanggal} | ${icon} ${formatRupiah(item.nominal)} | ${item.dompet}\n`;
    } else {
      text +=
        `${index + 1}. ${item.id} | ${tanggal} | ${icon} ${formatRupiah(item.nominal)} | ${item.kategori} | ${item.dompet}\n`;
    }
  });

  text += `\nDetail:\nKetik /detail T2`;

  return text;
}

module.exports = {
  formatRupiah,
  formatTanggal,
  formatLastTransactions,
};