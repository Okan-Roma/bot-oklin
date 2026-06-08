const { Markup } = require("telegraf");
const {
  getActiveBudgetsByMonthYear,
  getAllBudgetRows,
  generateNextBudgetId,
  appendBudgetRows,
} = require("../services/googleSheets");

// ==============================
// ✅ SESSION
// ==============================

const copyBudgetSessions = new Map();

// ==============================
// ✅ HELPERS
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

function getPreviousMonthYear(month, year) {
  if (month === 1) {
    return {
      month: 12,
      year: year - 1,
    };
  }

  return {
    month: month - 1,
    year,
  };
}

function getNextMonthYear(month, year) {
  if (month === 12) {
    return {
      month: 1,
      year: year + 1,
    };
  }

  return {
    month: month + 1,
    year,
  };
}

function normalizeBudgetRow(item) {
  return {
    idBudget: item["ID Budget"] || "-",
    account: item["Account"] || "-",
    bulan: Number(item["Bulan"] || 0),
    tahun: Number(item["Tahun"] || 0),
    kategori: (item["Kategori"] || "").toString().trim(),
    limitBudget: parseSheetNumber(item["Limit Budget"]),
    notif80: item["Notifikasi 80%"] || "Belum",
    notif100: item["Notifikasi 100%"] || "Belum",
    status: (item["Status"] || "").toString().trim(),
    catatan: item["Catatan"] || "-",
  };
}

function makeBudgetKey(account, category, month, year) {
  return `${String(account).trim().toLowerCase()}|||${String(category)
    .trim()
    .toLowerCase()}|||${month}|||${year}`;
}

function buildConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Copy Budget", "copybudget_confirm"),
      Markup.button.callback("❌ Batal", "copybudget_cancel"),
    ],
  ]);
}

// ==============================
// ✅ PREPARE COPY
// ==============================

async function prepareCopyBudget(mode) {
  const current = getCurrentMonthYearWIB();

  let source;
  let target;

  if (mode === "next") {
    source = current;
    target = getNextMonthYear(current.month, current.year);
  } else {
    source = getPreviousMonthYear(current.month, current.year);
    target = current;
  }

  const sourceBudgets = await getActiveBudgetsByMonthYear(
    source.month,
    source.year
  );

  const allBudgetRows = await getAllBudgetRows();

  const activeTargetKeys = new Set();

  allBudgetRows.map(normalizeBudgetRow).forEach((budget) => {
    const status = String(budget.status || "").toLowerCase();

    if (status !== "aktif") {
      return;
    }

    if (budget.bulan !== target.month || budget.tahun !== target.year) {
      return;
    }

    activeTargetKeys.add(
      makeBudgetKey(
        budget.account,
        budget.kategori,
        budget.bulan,
        budget.tahun
      )
    );
  });

  const sourceNormalized = sourceBudgets.map(normalizeBudgetRow);

  const copyCandidates = [];
  const skipped = [];

  sourceNormalized.forEach((budget) => {
    const targetKey = makeBudgetKey(
      budget.account,
      budget.kategori,
      target.month,
      target.year
    );

    if (activeTargetKeys.has(targetKey)) {
      skipped.push(budget);
      return;
    }

    copyCandidates.push(budget);
  });

  return {
    mode,
    source,
    target,
    copyCandidates,
    skipped,
  };
}

function buildPreviewMessage(plan) {
  const sourceText = `${getMonthName(plan.source.month)} ${plan.source.year}`;
  const targetText = `${getMonthName(plan.target.month)} ${plan.target.year}`;

  if (!plan.copyCandidates.length && !plan.skipped.length) {
    return (
      `📋 Copy Budget\n\n` +
      `Dari : ${sourceText}\n` +
      `Ke   : ${targetText}\n\n` +
      `⚠️ Tidak ada budget aktif yang bisa dicopy dari periode sumber.`
    );
  }

  if (!plan.copyCandidates.length && plan.skipped.length) {
    return (
      `📋 Copy Budget\n\n` +
      `Dari : ${sourceText}\n` +
      `Ke   : ${targetText}\n\n` +
      `⚠️ Semua budget sudah ada di periode tujuan.\n` +
      `Tidak ada data baru yang perlu dicopy.`
    );
  }

  let message =
    `📋 Copy Budget\n\n` +
    `Dari : ${sourceText}\n` +
    `Ke   : ${targetText}\n\n` +
    `Budget yang akan dicopy:\n`;

  plan.copyCandidates.forEach((budget, index) => {
    message +=
      `${index + 1}. ${budget.account} | ${budget.kategori} | ${formatRupiah(
        budget.limitBudget
      )}\n`;
  });

  if (plan.skipped.length) {
    message +=
      `\nDilewati karena sudah ada di periode tujuan: ${plan.skipped.length} budget\n`;
  }

  message += `\nLanjut copy budget?`;

  return message;
}

// ==============================
// ✅ HANDLER
// ==============================

module.exports = (bot) => {
  bot.command("copybudget", async (ctx) => {
    try {
      const text = ctx.message.text || "";
      const arg = text.split(" ").slice(1).join(" ").trim().toLowerCase();

      // default:
      // /copybudget      = bulan sebelumnya -> bulan ini
      // /copybudget next = bulan ini -> bulan berikutnya
      const mode = arg === "next" ? "next" : "current";

      const plan = await prepareCopyBudget(mode);

      if (!plan.copyCandidates.length) {
        return ctx.reply(buildPreviewMessage(plan));
      }

      const userKey = String(ctx.from.id);
      copyBudgetSessions.set(userKey, plan);

      return ctx.reply(buildPreviewMessage(plan), buildConfirmKeyboard());
    } catch (error) {
      console.error("Error /copybudget:", error);

      return ctx.reply(
        "⚠️ Gagal menyiapkan copy budget.\nPastikan sheet Budget sudah benar."
      );
    }
  });

  bot.action("copybudget_confirm", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = String(ctx.from.id);
    const plan = copyBudgetSessions.get(userKey);

    if (!plan) {
      return ctx.reply(
        "⚠️ Sesi copy budget tidak ditemukan.\nSilakan ulangi dengan /copybudget."
      );
    }

    try {
      const rowsToAppend = [];

      for (const budget of plan.copyCandidates) {
        const nextId = await generateNextBudgetId();

        rowsToAppend.push([
          nextId,
          budget.account,
          plan.target.month,
          plan.target.year,
          budget.kategori,
          budget.limitBudget,
          "Belum",
          "Belum",
          "Aktif",
          `Copy dari ${getMonthName(plan.source.month)} ${plan.source.year}`,
        ]);
      }

      await appendBudgetRows(rowsToAppend);

      copyBudgetSessions.delete(userKey);

      return ctx.reply(
        `✅ Copy budget berhasil.\n\n` +
          `Dari : ${getMonthName(plan.source.month)} ${plan.source.year}\n` +
          `Ke   : ${getMonthName(plan.target.month)} ${plan.target.year}\n` +
          `Jumlah dicopy : ${rowsToAppend.length}`
      );
    } catch (error) {
      console.error("Error copybudget_confirm:", error);

      return ctx.reply(
        "⚠️ Gagal copy budget.\nSilakan coba lagi."
      );
    }
  });

  bot.action("copybudget_cancel", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = String(ctx.from.id);
    copyBudgetSessions.delete(userKey);

    return ctx.reply("❌ Copy budget dibatalkan.");
  });
};