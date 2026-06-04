const { Markup } = require("telegraf");
const { getAllTransactions } = require("../services/googleSheets");

// ==============================
// ✅ HELPERS FORMAT
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
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`;
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
// ✅ HELPERS DATE WIB
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

  // JS: Minggu = 0, Senin = 1
  // Bot pakai Senin - Minggu.
  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const start = new Date(today);
  start.setDate(today.getDate() + diffToMonday);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    start,
    end,
  };
}

function parseTransactionDate(dateText) {
  if (!dateText) return null;

  const text = String(dateText).trim();

  // DD-MM-YYYY
  let match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (match) {
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }

  // YYYY-MM-DD
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  // DD/MM/YYYY
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (match) {
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }

  return null;
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

// ==============================
// ✅ KEYBOARD
// ==============================

function buildKategoriPeriodKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📅 Hari Ini", "kategori_period:today"),
      Markup.button.callback("🗓 Minggu Ini", "kategori_period:week"),
    ],
    [Markup.button.callback("📆 Bulan Ini", "kategori_period:month")],
    [Markup.button.callback("❌ Batal", "kategori_cancel")],
  ]);
}

function buildKategoriAccountKeyboard(period) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Semua Account", `kategori_account:${period}:ALL`)],
    [
      Markup.button.callback("Oklin", `kategori_account:${period}:Oklin`),
      Markup.button.callback("Mamah", `kategori_account:${period}:Mamah`),
    ],
    [Markup.button.callback("Isal", `kategori_account:${period}:Isal`)],
    [
      Markup.button.callback("⬅️ Kembali", "menu_category"),
      Markup.button.callback("❌ Batal", "kategori_cancel"),
    ],
  ]);
}

// ==============================
// ✅ DATA HELPERS
// ==============================

function normalizeTransaction(row) {
  return {
    id: row[0] || "-",
    tanggal: row[2] || "-",
    account: row[6] || "-",
    jenis: row[7] || "-",
    nominal: parseSheetNumber(row[8]),
    kategori: row[10] || "-",
    status: (row[19] || "").toString().trim().toLowerCase(),
  };
}

function addToMap(map, key, amount) {
  const finalKey = key || "-";
  map[finalKey] = (map[finalKey] || 0) + amount;
}

function sortEntriesByAmountDesc(map) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function buildCategoryLines(title, icon, entries) {
  let text = `${icon} ${title}\n`;

  if (!entries.length) {
    text += `- Tidak ada data\n`;
    return text;
  }

  entries.forEach(([category, amount], index) => {
    text += `${index + 1}. ${category}: ${formatRupiah(amount)}\n`;
  });

  return text;
}

// ==============================
// ✅ BUILD MESSAGE
// ==============================

async function buildKategoriMessage(period = "month", selectedAccount = "ALL") {
  const rows = await getAllTransactions();

  if (!rows || !rows.length) {
    return "⚠️ Belum ada data transaksi.";
  }

  const pemasukanByCategory = {};
  const pengeluaranByCategory = {};

  let totalPemasukan = 0;
  let totalPengeluaran = 0;
  let totalTransfer = 0;
  let totalTransaksi = 0;

  rows
    .map(normalizeTransaction)
    .forEach((trx) => {
      if (trx.status !== "aktif") {
        return;
      }

      if (selectedAccount !== "ALL" && trx.account !== selectedAccount) {
        return;
      }

      const parsedDate = parseTransactionDate(trx.tanggal);

      if (!isDateInPeriod(parsedDate, period)) {
        return;
      }

      totalTransaksi += 1;

      if (trx.jenis === "Pemasukan") {
        totalPemasukan += trx.nominal;
        addToMap(pemasukanByCategory, trx.kategori, trx.nominal);
      }

      if (trx.jenis === "Pengeluaran") {
        totalPengeluaran += trx.nominal;
        addToMap(pengeluaranByCategory, trx.kategori, trx.nominal);
      }

      if (trx.jenis === "Transfer") {
        totalTransfer += trx.nominal;
      }
    });

  const accountText = selectedAccount === "ALL" ? "Semua Account" : selectedAccount;

  if (totalTransaksi === 0) {
    return (
      `📂 Rekap Kategori\n\n` +
      `Periode : ${getPeriodTitle(period)}\n` +
      `Account : ${accountText}\n\n` +
      `⚠️ Belum ada transaksi aktif pada periode ini.`
    );
  }

  const pemasukanEntries = sortEntriesByAmountDesc(pemasukanByCategory);
  const pengeluaranEntries = sortEntriesByAmountDesc(pengeluaranByCategory);

  let message =
    `📂 Rekap Kategori\n\n` +
    `Periode : ${getPeriodTitle(period)}\n` +
    `Account : ${accountText}\n` +
    `Transaksi Aktif : ${totalTransaksi}\n\n` +
    `Ringkasan:\n` +
    `➕ Pemasukan   : ${formatRupiah(totalPemasukan)}\n` +
    `➖ Pengeluaran : ${formatRupiah(totalPengeluaran)}\n` +
    `🔁 Transfer    : ${formatRupiah(totalTransfer)}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n`;

  message += buildCategoryLines("Kategori Pengeluaran", "➖", pengeluaranEntries);
  message += `\n`;
  message += buildCategoryLines("Kategori Pemasukan", "➕", pemasukanEntries);

  return message.trim();
}

// ==============================
// ✅ HANDLER
// ==============================

module.exports = (bot) => {
  // /kategori = Bulan Ini + Semua Account
  bot.command("kategori", async (ctx) => {
    try {
      const message = await buildKategoriMessage("month", "ALL");
      return ctx.reply(message);
    } catch (error) {
      console.error("Error /kategori:", error);

      return ctx.reply(
        "⚠️ Gagal membuat rekap kategori.\nSilakan coba lagi beberapa saat."
      );
    }
  });

  bot.action("menu_category", async (ctx) => {
    await ctx.answerCbQuery();

    return ctx.reply(
      "📂 Pilih periode rekap kategori:",
      buildKategoriPeriodKeyboard()
    );
  });

  bot.action(/^kategori_period:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const period = ctx.match[1];

    return ctx.reply(
      "Pilih account:",
      buildKategoriAccountKeyboard(period)
    );
  });

  bot.action(/^kategori_account:(.+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const period = ctx.match[1];
    const account = ctx.match[2];

    try {
      const message = await buildKategoriMessage(period, account);
      return ctx.reply(message);
    } catch (error) {
      console.error("Error kategori_account:", error);

      return ctx.reply(
        "⚠️ Gagal membuat rekap kategori.\nSilakan coba lagi beberapa saat."
      );
    }
  });

  bot.action("kategori_cancel", async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply("❌ Rekap kategori dibatalkan.");
  });
};