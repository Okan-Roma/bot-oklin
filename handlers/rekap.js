const { getAllTransactions } = require("../services/googleSheets");

// ==============================
// ✅ HELPER
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

function getCurrentMonthYearWIB() {
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());

  const month = Number(parts.find((p) => p.type === "month").value);
  const year = Number(parts.find((p) => p.type === "year").value);

  return {
    month,
    year,
  };
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

  // Format Google Sheet kadang bisa jadi DD/MM/YYYY
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

function initAccountSummary(summaryByAccount, account) {
  if (!summaryByAccount[account]) {
    summaryByAccount[account] = {
      pemasukan: 0,
      pengeluaran: 0,
      transfer: 0,
    };
  }
}

// ==============================
// ✅ HANDLER REKAP
// ==============================

module.exports = (bot) => {
  bot.command("rekap", async (ctx) => {
    try {
      const rows = await getAllTransactions();

      if (!rows || !rows.length) {
        return ctx.reply("⚠️ Belum ada data transaksi untuk direkap.");
      }

      const { month, year } = getCurrentMonthYearWIB();

      let totalPemasukan = 0;
      let totalPengeluaran = 0;
      let totalTransfer = 0;
      let totalTransaksiAktif = 0;

      const summaryByAccount = {};

      rows.forEach((row) => {
        const tanggalTransaksi = row[2] || "";
        const account = row[6] || "-";
        const jenis = row[7] || "";
        const nominal = parseSheetNumber(row[8]);
        const status = (row[19] || "").toString().trim().toLowerCase();

        // Hanya hitung transaksi aktif
        if (status && status !== "aktif") {
          return;
        }

        const parsedDate = parseTransactionDate(tanggalTransaksi);

        if (!parsedDate) {
          return;
        }

        // Hanya bulan berjalan
        if (parsedDate.month !== month || parsedDate.year !== year) {
          return;
        }

        initAccountSummary(summaryByAccount, account);

        totalTransaksiAktif += 1;

        if (jenis === "Pemasukan") {
          totalPemasukan += nominal;
          summaryByAccount[account].pemasukan += nominal;
        }

        if (jenis === "Pengeluaran") {
          totalPengeluaran += nominal;
          summaryByAccount[account].pengeluaran += nominal;
        }

        if (jenis === "Transfer") {
          totalTransfer += nominal;
          summaryByAccount[account].transfer += nominal;
        }
      });

      if (totalTransaksiAktif === 0) {
        return ctx.reply(
          `📊 Rekap Bulan Ini\n\n` +
            `Periode: ${getMonthName(month)} ${year}\n\n` +
            `⚠️ Belum ada transaksi aktif pada periode ini.`
        );
      }

      const selisih = totalPemasukan - totalPengeluaran;

      let message =
        `📊 Rekap Bulan Ini\n\n` +
        `Periode : ${getMonthName(month)} ${year}\n` +
        `Transaksi Aktif : ${totalTransaksiAktif}\n\n` +
        `➕ Pemasukan   : ${formatRupiah(totalPemasukan)}\n` +
        `➖ Pengeluaran : ${formatRupiah(totalPengeluaran)}\n` +
        `🔁 Transfer    : ${formatRupiah(totalTransfer)}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `💰 Selisih     : ${formatRupiah(selisih)}\n\n`;

      message += `📌 Per Account\n`;

      Object.keys(summaryByAccount)
        .sort()
        .forEach((account) => {
          const item = summaryByAccount[account];
          const accountSelisih = item.pemasukan - item.pengeluaran;

          message +=
            `\n🏷 ${account}\n` +
            `➕ Masuk  : ${formatRupiah(item.pemasukan)}\n` +
            `➖ Keluar : ${formatRupiah(item.pengeluaran)}\n` +
            `🔁 Transfer: ${formatRupiah(item.transfer)}\n` +
            `💰 Selisih: ${formatRupiah(accountSelisih)}\n`;
        });

      return ctx.reply(message.trim());
    } catch (error) {
      console.error("Error /rekap:", error);

      return ctx.reply(
        "⚠️ Gagal membuat rekap.\nSilakan coba lagi beberapa saat."
      );
    }
  });

  // Tombol menu 📊 Rekap dari /start
  bot.action("menu_recap", async (ctx) => {
    await ctx.answerCbQuery();

    return ctx.reply(
      "📊 Untuk sementara rekap tersedia via command:\n\n/rekap"
    );
  });
};