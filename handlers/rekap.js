const { Markup } = require("telegraf");
const { getAllTransactions } = require("../services/googleSheets");

// ==============================
// ✅ DATA MASTER
// ==============================

const ACCOUNTS = ["Semua Account", "Oklin", "Mamah", "Isal"];

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

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateToDDMMYYYY(date) {
  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
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

// ==============================
// ✅ HELPER DATE WIB
// ==============================

function getTodayWIBDateOnly() {
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());

  const day = Number(parts.find((p) => p.type === "day").value);
  const month = Number(parts.find((p) => p.type === "month").value);
  const year = Number(parts.find((p) => p.type === "year").value);

  return new Date(year, month - 1, day);
}

function getCurrentMonthYearWIB() {
  const today = getTodayWIBDateOnly();

  return {
    month: today.getMonth() + 1,
    year: today.getFullYear(),
  };
}

function getWeekRangeWIB() {
  const today = getTodayWIBDateOnly();

  // JS: Minggu = 0, Senin = 1, dst.
  // Kita pakai minggu kerja Senin - Minggu.
  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const start = new Date(today);
  start.setDate(today.getDate() + diffToMonday);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return { start, end };
}

function parseTransactionDate(dateText) {
  if (!dateText) return null;

  const text = String(dateText).trim();

  // Format baru: DD-MM-YYYY
  let match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (match) {
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }

  // Format lama: YYYY-MM-DD
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  // Format Google Sheet kadang: DD/MM/YYYY
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (match) {
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }

  return null;
}

// ==============================
// ✅ HELPER KEYBOARD
// ==============================

function buildPeriodKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📅 Hari Ini", "rekap_period:today"),
      Markup.button.callback("🗓 Minggu Ini", "rekap_period:week"),
    ],
    [
      Markup.button.callback("📆 Bulan Ini", "rekap_period:month"),
    ],
    [
      Markup.button.callback("❌ Batal", "rekap_cancel"),
    ],
  ]);
}

function buildAccountKeyboard(period) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Semua Account", `rekap_account:${period}:ALL`),
    ],
    [
      Markup.button.callback("Oklin", `rekap_account:${period}:Oklin`),
      Markup.button.callback("Mamah", `rekap_account:${period}:Mamah`),
    ],
    [
      Markup.button.callback("Isal", `rekap_account:${period}:Isal`),
    ],
    [
      Markup.button.callback("⬅️ Kembali", "menu_recap"),
      Markup.button.callback("❌ Batal", "rekap_cancel"),
    ],
  ]);
}

// ==============================
// ✅ HELPER REKAP
// ==============================

function initAccountSummary(summaryByAccount, account) {
  if (!summaryByAccount[account]) {
    summaryByAccount[account] = {
      pemasukan: 0,
      pengeluaran: 0,
      transfer: 0,
      transaksi: 0,
    };
  }
}

function isDateInPeriod(date, period) {
  if (!date) return false;

  const today = getTodayWIBDateOnly();

  if (period === "today") {
    return date.getTime() === today.getTime();
  }

  if (period === "week") {
    const { start, end } = getWeekRangeWIB();

    return date >= start && date <= end;
  }

  if (period === "month") {
    const { month, year } = getCurrentMonthYearWIB();

    return date.getMonth() + 1 === month && date.getFullYear() === year;
  }

  return false;
}

function getPeriodTitle(period) {
  const today = getTodayWIBDateOnly();

  if (period === "today") {
    return `Hari Ini (${formatDateToDDMMYYYY(today)})`;
  }

  if (period === "week") {
    const { start, end } = getWeekRangeWIB();

    return `Minggu Ini (${formatDateToDDMMYYYY(start)} s/d ${formatDateToDDMMYYYY(end)})`;
  }

  if (period === "month") {
    const { month, year } = getCurrentMonthYearWIB();

    return `${getMonthName(month)} ${year}`;
  }

  return "-";
}

async function buildRekapMessage(period = "month", selectedAccount = "ALL") {
  const rows = await getAllTransactions();

  if (!rows || !rows.length) {
    return "⚠️ Belum ada data transaksi untuk direkap.";
  }

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

    if (status && status !== "aktif") {
      return;
    }

    if (selectedAccount !== "ALL" && account !== selectedAccount) {
      return;
    }

    const parsedDate = parseTransactionDate(tanggalTransaksi);

    if (!isDateInPeriod(parsedDate, period)) {
      return;
    }

    initAccountSummary(summaryByAccount, account);

    totalTransaksiAktif += 1;
    summaryByAccount[account].transaksi += 1;

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

  const accountText =
    selectedAccount === "ALL" ? "Semua Account" : selectedAccount;

  if (totalTransaksiAktif === 0) {
    return (
      `📊 Rekap\n\n` +
      `Periode : ${getPeriodTitle(period)}\n` +
      `Account : ${accountText}\n\n` +
      `⚠️ Belum ada transaksi aktif pada periode ini.`
    );
  }

  const selisih = totalPemasukan - totalPengeluaran;

  let message =
    `📊 Rekap\n\n` +
    `Periode : ${getPeriodTitle(period)}\n` +
    `Account : ${accountText}\n` +
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
        `Transaksi : ${item.transaksi}\n` +
        `➕ Masuk  : ${formatRupiah(item.pemasukan)}\n` +
        `➖ Keluar : ${formatRupiah(item.pengeluaran)}\n` +
        `🔁 Transfer: ${formatRupiah(item.transfer)}\n` +
        `💰 Selisih: ${formatRupiah(accountSelisih)}\n`;
    });

  return message.trim();
}

// ==============================
// ✅ HANDLER REKAP
// ==============================

module.exports = (bot) => {
  // Default command:
  // /rekap = bulan ini, semua account
  bot.command("rekap", async (ctx) => {
    try {
      const message = await buildRekapMessage("month", "ALL");
      return ctx.reply(message);
    } catch (error) {
      console.error("Error /rekap:", error);

      return ctx.reply(
        "⚠️ Gagal membuat rekap.\nSilakan coba lagi beberapa saat."
      );
    }
  });

  // Tombol 📊 Rekap dari /start
  bot.action("menu_recap", async (ctx) => {
    await ctx.answerCbQuery();

    return ctx.reply(
      "📊 Pilih periode rekap:",
      buildPeriodKeyboard()
    );
  });

  // Pilih periode
  bot.action(/^rekap_period:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const period = ctx.match[1];

    return ctx.reply(
      "Pilih account:",
      buildAccountKeyboard(period)
    );
  });

  // Pilih account dan tampilkan rekap
  bot.action(/^rekap_account:(.+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const period = ctx.match[1];
    const account = ctx.match[2];

    try {
      const message = await buildRekapMessage(period, account);
      return ctx.reply(message);
    } catch (error) {
      console.error("Error rekap account:", error);

      return ctx.reply(
        "⚠️ Gagal membuat rekap.\nSilakan coba lagi beberapa saat."
      );
    }
  });

  bot.action("rekap_cancel", async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply("❌ Rekap dibatalkan.");
  });
};