const { getAllTransactions } = require("../services/googleSheets");

// ==============================
// ✅ FORMAT HELPERS
// ==============================

function formatRupiah(value) {
  const number = Number(String(value || 0).replace(/[^\d.-]/g, "")) || 0;
  return "Rp " + number.toLocaleString("id-ID");
}

function formatTanggal(dateStr) {
  if (!dateStr) return "-";

  const text = String(dateStr).trim();

  // DD-MM-YYYY
  let match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  // YYYY-MM-DD
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  // DD/MM/YYYY
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const day = String(match[1]).padStart(2, "0");
    const month = String(match[2]).padStart(2, "0");
    const year = match[3];

    return `${day}-${month}-${year}`;
  }

  return text;
}

function getJenisIcon(jenis) {
  const text = String(jenis || "").toLowerCase();

  if (text.includes("pemasukan")) return "➕";
  if (text.includes("pengeluaran")) return "➖";
  if (text.includes("transfer")) return "🔁";

  return "•";
}

function getDompetText(jenis, sumber, tujuan) {
  const text = String(jenis || "").toLowerCase();

  if (text.includes("pemasukan")) {
    return tujuan || "-";
  }

  if (text.includes("pengeluaran")) {
    return sumber || "-";
  }

  if (text.includes("transfer")) {
    return `${sumber || "-"} → ${tujuan || "-"}`;
  }

  return "-";
}

// ==============================
// ✅ ID HELPERS
// ==============================

function normalizeDetailId(input) {
  if (!input) return null;

  let text = String(input).trim().toUpperCase();

  // Buang command jika user kirim full text
  text = text.replace(/^\/DETAIL/i, "").trim();

  // Contoh valid:
  // T-0002
  // T0002
  // T2
  // 2

  // Kalau format lama TRX-xxxxx, tetap kembalikan uppercase apa adanya
  if (text.startsWith("TRX-")) {
    return text;
  }

  // Ambil angka dari input
  text = text.replace(/[^0-9]/g, "");

  const number = Number(text);

  if (!number || Number.isNaN(number)) {
    return null;
  }

  return `T-${String(number).padStart(4, "0")}`;
}

function normalizeRow(row) {
  return {
    id: row[0] || "-",
    timestampInput: row[1] || "-",
    tanggal: row[2] || "-",
    waktu: row[3] || "-",
    userInput: row[4] || "-",
    telegramId: row[5] || "-",
    account: row[6] || "-",
    jenis: row[7] || "-",
    nominal: row[8] || 0,
    nominalInput: row[9] || "-",
    kategori: row[10] || "-",
    dompetSumber: row[11] || "",
    dompetTujuan: row[12] || "",
    biayaAdmin: row[13] || "",
    dompetBiayaAdmin: row[14] || "",
    keterangan: row[15] || "-",
    periodeMinggu: row[16] || "-",
    bulan: row[17] || "-",
    tahun: row[18] || "-",
    status: row[19] || "-",
    referensiId: row[20] || "-",
    referensiTagihan: row[21] || "-",
    periodeTagihan: row[22] || "-",
    sumberInput: row[23] || "-",
    linkBukti: row[24] || "-",
    catatanSistem: row[25] || "-",
  };
}

function buildDetailMessage(trx) {
  const icon = getJenisIcon(trx.jenis);
  const dompetText = getDompetText(
    trx.jenis,
    trx.dompetSumber,
    trx.dompetTujuan
  );

  let message =
    `🧾 Detail Transaksi\n\n` +
    `ID        : ${trx.id}\n` +
    `Jenis     : ${icon} ${trx.jenis}\n` +
    `Account   : ${trx.account}\n` +
    `Nominal   : ${formatRupiah(trx.nominal)}\n` +
    `Kategori  : ${trx.kategori}\n` +
    `Dompet    : ${dompetText}\n` +
    `Tanggal   : ${formatTanggal(trx.tanggal)}\n` +
    `Waktu     : ${trx.waktu}\n` +
    `Ket       : ${trx.keterangan}\n` +
    `Status    : ${trx.status}\n\n` +
    `📌 Info Input\n` +
    `User      : ${trx.userInput}\n` +
    `Sumber    : ${trx.sumberInput}\n` +
    `Catatan   : ${trx.catatanSistem}`;

  if (trx.biayaAdmin && Number(trx.biayaAdmin) > 0) {
    message +=
      `\n\n💸 Biaya Admin\n` +
      `Nominal   : ${formatRupiah(trx.biayaAdmin)}\n` +
      `Dompet    : ${trx.dompetBiayaAdmin || "-"}`;
  }

  if (trx.linkBukti && trx.linkBukti !== "-") {
    message += `\n\n🔗 Bukti\n${trx.linkBukti}`;
  }

  return message;
}

// ==============================
// ✅ HANDLER DETAIL
// ==============================

module.exports = (bot) => {
  bot.command("detail", async (ctx) => {
    try {
      const text = ctx.message.text || "";
      const args = text.split(" ").slice(1).join(" ").trim();

      if (!args) {
        return ctx.reply(
          `⚠️ Format detail belum lengkap.\n\n` +
            `Contoh:\n` +
            `/detail T2\n` +
            `/detail T-0002\n` +
            `/detail 2`
        );
      }

      const normalizedId = normalizeDetailId(args);

      if (!normalizedId) {
        return ctx.reply(
          `⚠️ ID transaksi tidak dikenali.\n\n` +
            `Contoh:\n` +
            `/detail T2\n` +
            `/detail T-0002\n` +
            `/detail 2`
        );
      }

      const rows = await getAllTransactions();

      if (!rows || !rows.length) {
        return ctx.reply("⚠️ Belum ada data transaksi.");
      }

      const foundRow = rows.find((row) => {
        const rowId = String(row[0] || "").trim().toUpperCase();
        return rowId === normalizedId;
      });

      if (!foundRow) {
        return ctx.reply(
          `⚠️ Transaksi ${normalizedId} tidak ditemukan.\n\n` +
            `Pastikan ID transaksi sudah benar.\n` +
            `Contoh: /detail T2`
        );
      }

      const trx = normalizeRow(foundRow);

      return ctx.reply(buildDetailMessage(trx));
    } catch (error) {
      console.error("Error /detail:", error);

      return ctx.reply(
        "⚠️ Gagal mengambil detail transaksi.\nSilakan coba lagi beberapa saat."
      );
    }
  });
};