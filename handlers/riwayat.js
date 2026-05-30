const { getAllTransactions } = require("../services/googleSheets");

// ==============================
// ✅ HELPER FORMAT
// ==============================

function parseSheetNumber(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  return Number(String(value).replace(/[^\d-]/g, "")) || 0;
}

function formatRupiah(value) {
  return "Rp " + Number(value || 0).toLocaleString("id-ID");
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

function getCurrentMonthYearWIB() {
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());

  const month = Number(parts.find((p) => p.type === "month").value);
  const year = Number(parts.find((p) => p.type === "year").value);

  return { month, year };
}

function getMonthName(monthNumber) {
  const monthNames = [
    "",
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];

  return monthNames[monthNumber] || "-";
}

function parseTransactionDate(dateText) {
  if (!dateText) return null;

  const text = String(dateText).trim();

  // Format baru: DD-MM-YYYY
  let match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (match) {
    return {
      day: Number(match[1]),
      month: Number(match[2]),
      year: Number(match[3]),
    };
  }

  // Format lama: YYYY-MM-DD
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    return {
      day: Number(match[3]),
      month: Number(match[2]),
      year: Number(match[1]),
    };
  }

  // Format Google Sheet kadang: DD/MM/YYYY
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (match) {
    return {
      day: Number(match[1]),
      month: Number(match[2]),
      year: Number(match[3]),
    };
  }

  return null;
}

function isThisMonth(dateText) {
  const parsedDate = parseTransactionDate(dateText);

  if (!parsedDate) {
    return false;
  }

  const { month, year } = getCurrentMonthYearWIB();

  return parsedDate.month === month && parsedDate.year === year;
}

function normalizeTransaction(row) {
  return {
    timestampInput: row[1] || "-",
    tanggal: row[2] || "-",
    waktu: row[3] || "-",
    userInput: row[4] || "-",
    account: row[6] || "-",
    jenis: row[7] || "-",
    nominal: parseSheetNumber(row[8]),
    nominalInput: row[9] || "-",
    kategori: row[10] || "-",
    dompetSumber: row[11] || "",
    dompetTujuan: row[12] || "",
    keterangan: row[15] || "-",
    status: (row[19] || "").toString().trim().toLowerCase(),
  };
}

function buildRiwayatMessage(transactions) {
  const { month, year } = getCurrentMonthYearWIB();

  if (!transactions.length) {
    return (
      `📜 Riwayat Transaksi\n\n` +
      `Periode: ${getMonthName(month)} ${year}\n\n` +
      `⚠️ Belum ada transaksi aktif pada bulan ini.`
    );
  }

  let message =
    `📜 Riwayat Transaksi\n\n` +
    `Periode : ${getMonthName(month)} ${year}\n` +
    `Jumlah  : ${transactions.length} transaksi terakhir\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n`;

  transactions.forEach((trx, index) => {
    const icon = getJenisIcon(trx.jenis);
    const dompetText = getDompetText(
      trx.jenis,
      trx.dompetSumber,
      trx.dompetTujuan
    );

    message +=
      `${index + 1}. ${icon} ${trx.jenis}\n` +
      `🏷 Account : ${trx.account}\n` +
      `💰 Nominal : ${formatRupiah(trx.nominal)}\n` +
      `📂 Kategori: ${trx.kategori}\n` +
      `🏦 Dompet  : ${dompetText}\n` +
      `📅 Tanggal : ${trx.tanggal}\n` +
      `📝 Ket     : ${trx.keterangan}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n`;
  });

  return message.trim();
}

// ==============================
// ✅ HANDLER RIWAYAT
// ==============================

module.exports = (bot) => {
  bot.command("riwayat", async (ctx) => {
    try {
      const rows = await getAllTransactions();

      if (!rows || !rows.length) {
        return ctx.reply("⚠️ Belum ada data transaksi.");
      }

      const transactions = rows
        .map(normalizeTransaction)
        .filter((trx) => {
          return trx.status === "aktif" && isThisMonth(trx.tanggal);
        })
        .slice(-10)
        .reverse();

      return ctx.reply(buildRiwayatMessage(transactions));
    } catch (error) {
      console.error("Error /riwayat:", error);

      return ctx.reply(
        "⚠️ Gagal mengambil riwayat transaksi.\nSilakan coba lagi beberapa saat."
      );
    }
  });

  // Kalau nanti ada tombol 📜 Riwayat di menu utama
  bot.action("menu_history", async (ctx) => {
    await ctx.answerCbQuery();

    try {
      const rows = await getAllTransactions();

      if (!rows || !rows.length) {
        return ctx.reply("⚠️ Belum ada data transaksi.");
      }

      const transactions = rows
        .map(normalizeTransaction)
        .filter((trx) => {
          return trx.status === "aktif" && isThisMonth(trx.tanggal);
        })
        .slice(-10)
        .reverse();

      return ctx.reply(buildRiwayatMessage(transactions));
    } catch (error) {
      console.error("Error menu_history:", error);

      return ctx.reply(
        "⚠️ Gagal mengambil riwayat transaksi.\nSilakan coba lagi beberapa saat."
      );
    }
  });
};