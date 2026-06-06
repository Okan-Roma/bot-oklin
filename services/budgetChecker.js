const {
  getAllTransactions,
  getActiveBudgetsByMonthYear,
} = require("./googleSheets");

// ==============================
// ✅ FORMAT HELPERS
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
// ✅ DATA HELPERS
// ==============================

function normalizeTransaction(row) {
  return {
    tanggal: row[2] || "-",
    account: row[6] || "-",
    jenis: row[7] || "-",
    nominal: parseSheetNumber(row[8]),
    status: (row[19] || "").toString().trim().toLowerCase(),
  };
}

function normalizeBudgetRow(item) {
  return {
    account: item["Account"] || "-",
    bulan: Number(item["Bulan"] || 0),
    tahun: Number(item["Tahun"] || 0),
    kategori: (item["Kategori"] || "").toString().trim().toUpperCase(),
    limitBudget: parseSheetNumber(item["Limit Budget"]),
    status: (item["Status"] || "").toString().trim().toLowerCase(),
  };
}

function getProgressPercent(used, budget) {
  if (!budget || budget <= 0) {
    return 0;
  }

  return Math.round((used / budget) * 100);
}

// ==============================
// ✅ BUILD WARNING MESSAGE
// ==============================

function buildBudgetWarningMessage(account, month, year, limitBudget, used) {
  if (!limitBudget || limitBudget <= 0) {
    return null;
  }

  const percent = getProgressPercent(used, limitBudget);

  if (percent < 80) {
    return null;
  }

  const remaining = limitBudget - used;

  if (used >= limitBudget) {
    return (
      `🚨🚨 OVER BUDGET 🚨🚨\n\n` +
      `Account : ${account}\n` +
      `Periode : ${getMonthName(month)} ${year}\n\n` +
      `Limit Budget : ${formatRupiah(limitBudget)}\n` +
      `Terpakai     : ${formatRupiah(used)}\n` +
      `🚨 Over !!!   : ${formatRupiah(used - limitBudget)}\n` +
      `Progress     : ${percent}%\n\n` +
      `⛔ Budget bulan ini sudah terlampaui.\n` +
      `Sebaiknya tahan pengeluaran tambahan sampai periode berikutnya.`
    );
  }

  return (
    `⚠️⚠️ PERINGATAN BUDGET ⚠️⚠️\n\n` +
    `Account : ${account}\n` +
    `Periode : ${getMonthName(month)} ${year}\n\n` +
    `Limit Budget : ${formatRupiah(limitBudget)}\n` +
    `Terpakai     : ${formatRupiah(used)}\n` +
    `Sisa         : ${formatRupiah(remaining)}\n` +
    `Progress     : ${percent}%\n\n` +
    `⚠️ Budget hampir habis.\n` +
    `Harap mulai kendalikan pengeluaran.`
  );
}

// ==============================
// ✅ PUBLIC FUNCTION
// ==============================

async function getBudgetWarningMessageForAccount(account) {
  const { month, year } = getCurrentMonthYearWIB();

  const budgetRows = await getActiveBudgetsByMonthYear(month, year);
  const transactionRows = await getAllTransactions();

  let limitBudget = 0;
  let used = 0;

  // ==============================
  // ✅ Ambil budget TOTAL account
  // ==============================

  budgetRows
    .map(normalizeBudgetRow)
    .forEach((budget) => {
      if (budget.status !== "aktif") {
        return;
      }

      if (budget.account !== account) {
        return;
      }

      if (budget.kategori !== "TOTAL") {
        return;
      }

      limitBudget += budget.limitBudget;
    });

  // Kalau belum ada limit budget, jangan munculkan warning otomatis.
  if (!limitBudget || limitBudget <= 0) {
    return null;
  }

  // ==============================
  // ✅ Hitung pengeluaran aktif bulan berjalan
  // ==============================

  transactionRows
    .map(normalizeTransaction)
    .forEach((trx) => {
      if (trx.status !== "aktif") {
        return;
      }

      if (trx.account !== account) {
        return;
      }

      if (trx.jenis !== "Pengeluaran") {
        return;
      }

      if (!isCurrentMonth(trx.tanggal, month, year)) {
        return;
      }

      used += trx.nominal;
    });

  return buildBudgetWarningMessage(account, month, year, limitBudget, used);
}

module.exports = {
  getBudgetWarningMessageForAccount,
};