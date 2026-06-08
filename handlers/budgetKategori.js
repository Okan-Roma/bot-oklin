const { Markup } = require("telegraf");
const {
  getAllTransactions,
  getActiveBudgetsByMonthYear,
} = require("../services/googleSheets");

// ==============================
// ✅ DATA MASTER
// ==============================

const ACCOUNTS = ["Oklin", "Mamah", "Isal"];

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
// ✅ DATE HELPERS WIB
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

function parseTransactionDate(dateText) {
  if (!dateText) return null;

  const text = String(dateText).trim();

  let match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (match) {
    return {
      day: Number(match[1]),
      month: Number(match[2]),
      year: Number(match[3]),
    };
  }

  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    return {
      day: Number(match[3]),
      month: Number(match[2]),
      year: Number(match[1]),
    };
  }

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

function isCurrentMonth(dateText, month, year) {
  const parsedDate = parseTransactionDate(dateText);

  if (!parsedDate) {
    return false;
  }

  return parsedDate.month === month && parsedDate.year === year;
}

// ==============================
// ✅ KEYBOARD
// ==============================

function buildBudgetKategoriAccountKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Semua Account", "budgetkategori_account:ALL")],
    [
      Markup.button.callback("Oklin", "budgetkategori_account:Oklin"),
      Markup.button.callback("Mamah", "budgetkategori_account:Mamah"),
    ],
    [Markup.button.callback("Isal", "budgetkategori_account:Isal")],
    [Markup.button.callback("❌ Batal", "budgetkategori_cancel")],
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

function normalizeBudgetRow(item) {
  return {
    idBudget: item["ID Budget"] || "-",
    account: item["Account"] || "-",
    bulan: Number(item["Bulan"] || 0),
    tahun: Number(item["Tahun"] || 0),
    kategori: (item["Kategori"] || "").toString().trim(),
    kategoriUpper: (item["Kategori"] || "").toString().trim().toUpperCase(),
    limitBudget: parseSheetNumber(item["Limit Budget"]),
    status: (item["Status"] || "").toString().trim().toLowerCase(),
  };
}

function makeKey(account, kategori, selectedAccount) {
  if (selectedAccount === "ALL") {
    return String(kategori || "-").trim();
  }

  return `${account}|||${String(kategori || "-").trim()}`;
}

function initCategoryMap(map, key, account, kategori) {
  if (!map[key]) {
    map[key] = {
      account,
      kategori,
      budgetIds: [],
      limitBudget: 0,
      used: 0,
      hasBudget: false,
    };
  }
}

function getProgressPercent(used, budget) {
  if (!budget || budget <= 0) {
    return 0;
  }

  return Math.round((used / budget) * 100);
}

function getStatusText(used, budget, hasBudget) {
  if (!hasBudget) {
    return "⚠️ Belum ada budget";
  }

  if (!budget || budget <= 0) {
    return "♾️ Unlimited";
  }

  const percent = getProgressPercent(used, budget);

  if (used >= budget) {
    return `🚨 OVER BUDGET (${percent}%)`;
  }

  if (percent >= 80) {
    return `⚠️ Hampir habis (${percent}%)`;
  }

  return `✅ Aman (${percent}%)`;
}

function buildCategoryBlock(item) {
  const ids = item.budgetIds.length ? item.budgetIds.join(", ") : "-";

  let message =
    `📂 ${item.kategori}\n` +
    `ID Budget    : ${ids}\n`;

  if (!item.hasBudget) {
    message +=
      `Limit Budget : Rp 0\n` +
      `Terpakai     : ${formatRupiah(item.used)}\n` +
      `Sisa         : -\n` +
      `Progress     : -\n` +
      `Status       : ⚠️ Belum ada budget\n`;

    return message;
  }

  if (!item.limitBudget || item.limitBudget <= 0) {
    message +=
      `Limit Budget : ♾️ Tanpa limit\n` +
      `Terpakai     : ${formatRupiah(item.used)}\n` +
      `Sisa         : ♾️\n` +
      `Progress     : -\n` +
      `Status       : ♾️ Unlimited\n`;

    return message;
  }

  const remaining = item.limitBudget - item.used;
  const percent = getProgressPercent(item.used, item.limitBudget);
  const status = getStatusText(item.used, item.limitBudget, item.hasBudget);

  message +=
    `Limit Budget : ${formatRupiah(item.limitBudget)}\n` +
    `Terpakai     : ${formatRupiah(item.used)}\n`;

  if (item.used > item.limitBudget) {
    message += `🚨 Over !!!   : ${formatRupiah(item.used - item.limitBudget)}\n`;
  } else {
    message += `Sisa         : ${formatRupiah(remaining)}\n`;
  }

  message +=
    `Progress     : ${percent}%\n` +
    `Status       : ${status}\n`;

  return message;
}

// ==============================
// ✅ BUILD MESSAGE
// ==============================

async function buildBudgetKategoriMessage(selectedAccount = "ALL") {
  const { month, year } = getCurrentMonthYearWIB();

  const budgetRows = await getActiveBudgetsByMonthYear(month, year);
  const transactionRows = await getAllTransactions();

  const categoryMap = {};

  // ==============================
  // ✅ 1. Load budget kategori
  // ==============================

  budgetRows
    .map(normalizeBudgetRow)
    .forEach((budget) => {
      if (budget.status !== "aktif") {
        return;
      }

      if (budget.kategoriUpper === "TOTAL") {
        return;
      }

      if (selectedAccount !== "ALL" && budget.account !== selectedAccount) {
        return;
      }

      const key = makeKey(budget.account, budget.kategori, selectedAccount);

      initCategoryMap(categoryMap, key, budget.account, budget.kategori);

      categoryMap[key].limitBudget += budget.limitBudget;
      categoryMap[key].hasBudget = true;

      if (budget.idBudget && budget.idBudget !== "-") {
        categoryMap[key].budgetIds.push(budget.idBudget);
      }
    });

  // ==============================
  // ✅ 2. Hitung pengeluaran kategori
  // ==============================

  transactionRows
    .map(normalizeTransaction)
    .forEach((trx) => {
      if (trx.status !== "aktif") {
        return;
      }

      if (trx.jenis !== "Pengeluaran") {
        return;
      }

      if (selectedAccount !== "ALL" && trx.account !== selectedAccount) {
        return;
      }

      if (!isCurrentMonth(trx.tanggal, month, year)) {
        return;
      }

      const key = makeKey(trx.account, trx.kategori, selectedAccount);

      initCategoryMap(categoryMap, key, trx.account, trx.kategori);

      categoryMap[key].used += trx.nominal;
    });

  const accountText =
    selectedAccount === "ALL" ? "Semua Account" : selectedAccount;

  const categories = Object.values(categoryMap).sort((a, b) => {
    const usedDiff = b.used - a.used;

    if (usedDiff !== 0) {
      return usedDiff;
    }

    return b.limitBudget - a.limitBudget;
  });

  if (!categories.length) {
    return (
      `💸 Budget Per Kategori\n\n` +
      `Periode : ${getMonthName(month)} ${year}\n` +
      `Account : ${accountText}\n\n` +
      `⚠️ Belum ada budget kategori atau pengeluaran kategori pada periode ini.\n\n` +
      `Isi sheet Budget dengan Kategori selain TOTAL untuk mulai memakai fitur ini.`
    );
  }

  let totalLimit = 0;
  let totalUsed = 0;
  let hasUnlimited = false;

  categories.forEach((item) => {
    totalUsed += item.used;

    if (item.hasBudget && (!item.limitBudget || item.limitBudget <= 0)) {
      hasUnlimited = true;
      return;
    }

    if (item.hasBudget) {
      totalLimit += item.limitBudget;
    }
  });

  let message =
    `💸 Budget Per Kategori\n\n` +
    `Periode : ${getMonthName(month)} ${year}\n` +
    `Account : ${accountText}\n\n` +
    `Ringkasan:\n` +
    `Total Terpakai : ${formatRupiah(totalUsed)}\n`;

  if (hasUnlimited) {
    message += `Total Limit    : Sebagian unlimited\n`;
  } else {
    message += `Total Limit    : ${formatRupiah(totalLimit)}\n`;
  }

  message += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  categories.forEach((item, index) => {
    message += `${index + 1}. `;
    message += buildCategoryBlock(item);
    message += `\n`;
  });

  return message.trim();
}

// ==============================
// ✅ HANDLER
// ==============================

module.exports = (bot) => {
  bot.command("budgetkategori", async (ctx) => {
    try {
      const message = await buildBudgetKategoriMessage("ALL");
      return ctx.reply(message);
    } catch (error) {
      console.error("Error /budgetkategori:", error);

      return ctx.reply(
        "⚠️ Gagal membuat laporan budget kategori.\n" +
          "Pastikan tab Budget sudah ada dan format header benar."
      );
    }
  });

  bot.action("menu_budget_category", async (ctx) => {
    await ctx.answerCbQuery();

    return ctx.reply(
      "💸 Pilih account budget kategori:",
      buildBudgetKategoriAccountKeyboard()
    );
  });

  bot.action(/^budgetkategori_account:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const account = ctx.match[1];

    try {
      const message = await buildBudgetKategoriMessage(account);
      return ctx.reply(message);
    } catch (error) {
      console.error("Error budgetkategori_account:", error);

      return ctx.reply(
        "⚠️ Gagal membuat laporan budget kategori.\n" +
          "Pastikan tab Budget sudah ada dan format header benar."
      );
    }
  });

  bot.action("budgetkategori_cancel", async (ctx) => {
    await ctx.answerCbQuery();

    return ctx.reply("❌ Budget kategori dibatalkan.");
  });
};