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

  // DD-MM-YYYY
  let match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (match) {
    return {
      day: Number(match[1]),
      month: Number(match[2]),
      year: Number(match[3]),
    };
  }

  // YYYY-MM-DD
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    return {
      day: Number(match[3]),
      month: Number(match[2]),
      year: Number(match[1]),
    };
  }

  // DD/MM/YYYY
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

function buildBudgetAccountKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Semua Account", "budget_account:ALL")],
    [
      Markup.button.callback("Oklin", "budget_account:Oklin"),
      Markup.button.callback("Mamah", "budget_account:Mamah"),
    ],
    [Markup.button.callback("Isal", "budget_account:Isal")],
    [Markup.button.callback("❌ Batal", "budget_cancel")],
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
    status: (row[19] || "").toString().trim().toLowerCase(),
  };
}

function normalizeBudgetRow(item) {
  return {
    idBudget: item["ID Budget"] || "-",
    account: item["Account"] || "-",
    bulan: Number(item["Bulan"] || 0),
    tahun: Number(item["Tahun"] || 0),
    kategori: (item["Kategori"] || "").toString().trim().toUpperCase(),
    limitBudget: parseSheetNumber(item["Limit Budget"]),
    notif80: item["Notifikasi 80%"] || "",
    notif100: item["Notifikasi 100%"] || "",
    status: item["Status"] || "",
    catatan: item["Catatan"] || "-",
  };
}

function initAccountBudget(map, account) {
  if (!map[account]) {
    map[account] = {
      account,
      limitBudget: 0,
      used: 0,
    };
  }
}

function getProgressPercent(used, budget) {
  if (!budget || budget <= 0) {
    return 0;
  }

  return Math.round((used / budget) * 100);
}

function getBudgetStatusText(used, budget) {
  if (!budget || budget <= 0) {
    if (used > 0) return "⚠️ Belum ada budget";
    return "Belum ada budget";
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

function buildBudgetSummaryBlock(label, limitBudget, used) {
  const remaining = limitBudget - used;
  const percent = getProgressPercent(used, limitBudget);
  const status = getBudgetStatusText(used, limitBudget);

  let message =
    `${label}\n` +
    `Limit Budget : ${formatRupiah(limitBudget)}\n` +
    `Terpakai     : ${formatRupiah(used)}\n`;

  if (used > limitBudget && limitBudget > 0) {
    message += `🚨 Over !!!   : ${formatRupiah(used - limitBudget)}\n`;
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

async function buildBudgetMessage(selectedAccount = "ALL") {
  const { month, year } = getCurrentMonthYearWIB();

  const budgetRows = await getActiveBudgetsByMonthYear(month, year);
  const transactionRows = await getAllTransactions();

  const budgetByAccount = {};

  // ==============================
  // ✅ 1. Load budget TOTAL
  // ==============================

  budgetRows
    .map(normalizeBudgetRow)
    .forEach((budget) => {
      if (budget.kategori !== "TOTAL") {
        return;
      }

      if (selectedAccount !== "ALL" && budget.account !== selectedAccount) {
        return;
      }

      initAccountBudget(budgetByAccount, budget.account);
      budgetByAccount[budget.account].limitBudget += budget.limitBudget;
    });

  // ==============================
  // ✅ 2. Hitung pengeluaran aktual
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

      initAccountBudget(budgetByAccount, trx.account);
      budgetByAccount[trx.account].used += trx.nominal;
    });

  const accountText =
    selectedAccount === "ALL" ? "Semua Account" : selectedAccount;

  const accounts = Object.values(budgetByAccount).sort((a, b) => {
    return ACCOUNTS.indexOf(a.account) - ACCOUNTS.indexOf(b.account);
  });

  if (!accounts.length) {
    return (
      `💸 Budget Bulanan\n\n` +
      `Periode : ${getMonthName(month)} ${year}\n` +
      `Account : ${accountText}\n\n` +
      `⚠️ Belum ada budget atau pengeluaran pada periode ini.\n\n` +
      `Pastikan tab Budget sudah diisi dengan Kategori = TOTAL.`
    );
  }

  const totalLimit = accounts.reduce((sum, item) => sum + item.limitBudget, 0);
  const totalUsed = accounts.reduce((sum, item) => sum + item.used, 0);

  let message =
    `💸 Budget Bulanan\n\n` +
    `Periode : ${getMonthName(month)} ${year}\n` +
    `Account : ${accountText}\n\n`;

  message += buildBudgetSummaryBlock("📌 Total", totalLimit, totalUsed);

  if (selectedAccount === "ALL") {
    message += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    accounts.forEach((item) => {
      message += buildBudgetSummaryBlock(
        `🏷 ${item.account}`,
        item.limitBudget,
        item.used
      );

      message += `\n`;
    });
  }

  return message.trim();
}

// ==============================
// ✅ HANDLER
// ==============================

module.exports = (bot) => {
  // /budget = bulan ini + semua account
  bot.command("budget", async (ctx) => {
    try {
      const message = await buildBudgetMessage("ALL");
      return ctx.reply(message);
    } catch (error) {
      console.error("Error /budget:", error);

      return ctx.reply(
        "⚠️ Gagal membuat laporan budget.\n" +
          "Pastikan tab Budget sudah ada dan format header benar."
      );
    }
  });

  bot.action("menu_budget", async (ctx) => {
    await ctx.answerCbQuery();

    return ctx.reply(
      "💸 Pilih account budget:",
      buildBudgetAccountKeyboard()
    );
  });

  bot.action(/^budget_account:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const account = ctx.match[1];

    try {
      const message = await buildBudgetMessage(account);
      return ctx.reply(message);
    } catch (error) {
      console.error("Error budget_account:", error);

      return ctx.reply(
        "⚠️ Gagal membuat laporan budget.\n" +
          "Pastikan tab Budget sudah ada dan format header benar."
      );
    }
  });

  bot.action("budget_cancel", async (ctx) => {
    await ctx.answerCbQuery();

    return ctx.reply("❌ Budget dibatalkan.");
  });
};