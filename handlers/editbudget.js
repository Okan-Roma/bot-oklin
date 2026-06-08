const { Markup } = require("telegraf");
const {
  getAllBudgetRows,
  updateBudgetCells,
} = require("../services/googleSheets");

// ==============================
// ✅ SESSION
// ==============================

const editBudgetSessions = new Map();

// ==============================
// ✅ HELPERS
// ==============================

function parseSheetNumber(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  return Number(String(value).replace(/[^\d-]/g, "")) || 0;
}

function parseNominal(input) {
  if (!input) return null;

  let text = String(input)
    .trim()
    .toLowerCase()
    .replace(/\s/g, "");

  text = text.replace(",", ".");

  let multiplier = 1;

  if (text.endsWith("ribu")) {
    multiplier = 1000;
    text = text.replace("ribu", "");
  } else if (text.endsWith("rb")) {
    multiplier = 1000;
    text = text.replace("rb", "");
  } else if (text.endsWith("k")) {
    multiplier = 1000;
    text = text.replace("k", "");
  } else if (text.endsWith("juta")) {
    multiplier = 1000000;
    text = text.replace("juta", "");
  } else if (text.endsWith("jt")) {
    multiplier = 1000000;
    text = text.replace("jt", "");
  }

  if (multiplier === 1) {
    text = text.replace(/\./g, "");
  }

  const number = Number(text);

  if (!number || number <= 0 || Number.isNaN(number)) {
    return null;
  }

  return Math.round(number * multiplier);
}

function parseBudgetLimit(input) {
  if (input === undefined || input === null) return null;

  const raw = String(input).trim().toLowerCase();

  if (
    ["0", "nol", "unlimited", "tanpa_limit", "tanpa-limit", "tanpa limit"].includes(
      raw
    )
  ) {
    return 0;
  }

  return parseNominal(input);
}

function formatRupiah(value) {
  return "Rp " + Number(value || 0).toLocaleString("id-ID");
}

function formatBudgetLimit(value) {
  const number = parseSheetNumber(value);

  if (!number || number <= 0) {
    return "♾️ Tanpa limit";
  }

  return formatRupiah(number);
}

function normalizeBudgetId(input) {
  if (!input) return null;

  let text = String(input).trim().toUpperCase();

  text = text.replace(/^\/EDITBUDGET/i, "").trim();
  text = text.replace(/^\/EDIT/i, "").trim();
  text = text.replace(/[^0-9]/g, "");

  const number = Number(text);

  if (!number || Number.isNaN(number)) {
    return null;
  }

  return `B-${String(number).padStart(4, "0")}`;
}

function normalizeBudgetRow(row, rowNumber) {
  return {
    rowNumber,
    idBudget: row["ID Budget"] || "-",
    account: row["Account"] || "-",
    bulan: row["Bulan"] || "-",
    tahun: row["Tahun"] || "-",
    kategori: row["Kategori"] || "-",
    limitBudget: parseSheetNumber(row["Limit Budget"]),
    notif80: row["Notifikasi 80%"] || "-",
    notif100: row["Notifikasi 100%"] || "-",
    status: row["Status"] || "-",
    catatan: row["Catatan"] || "-",
  };
}

async function findBudgetById(budgetId) {
  const rows = await getAllBudgetRows();

  let found = null;

  rows.forEach((row, index) => {
    const rowId = String(row["ID Budget"] || "").trim().toUpperCase();

    if (rowId === budgetId) {
      found = normalizeBudgetRow(row, index + 2);
    }
  });

  return found;
}

function buildBudgetDetailMessage(budget) {
  return (
    `✏️ Edit Budget\n\n` +
    `ID Budget : ${budget.idBudget}\n` +
    `Account   : ${budget.account}\n` +
    `Periode   : ${budget.bulan}-${budget.tahun}\n` +
    `Kategori  : ${budget.kategori}\n` +
    `Limit     : ${formatBudgetLimit(budget.limitBudget)}\n` +
    `Notif 80% : ${budget.notif80}\n` +
    `Notif 100%: ${budget.notif100}\n` +
    `Status    : ${budget.status}\n` +
    `Catatan   : ${budget.catatan}\n\n` +
    `Pilih field yang mau diedit:`
  );
}

function buildEditBudgetFieldKeyboard(budgetId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        "💰 Limit Budget",
        `editbudget_field:${budgetId}:limit`
      ),
    ],
    [
      Markup.button.callback("✅ Status", `editbudget_field:${budgetId}:status`),
      Markup.button.callback("📝 Catatan", `editbudget_field:${budgetId}:catatan`),
    ],
    [Markup.button.callback("❌ Batal", "editbudget_cancel")],
  ]);
}

function buildStatusKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Aktif", "editbudget_status:Aktif"),
      Markup.button.callback("Nonaktif", "editbudget_status:Nonaktif"),
    ],
    [Markup.button.callback("❌ Batal", "editbudget_cancel")],
  ]);
}

function buildConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Simpan Edit", "editbudget_confirm"),
      Markup.button.callback("❌ Batal", "editbudget_cancel"),
    ],
  ]);
}

function getFieldLabel(field) {
  if (field === "limit") return "Limit Budget";
  if (field === "status") return "Status";
  if (field === "catatan") return "Catatan";

  return field;
}

function getOldValueByField(budget, field) {
  if (field === "limit") return formatBudgetLimit(budget.limitBudget);
  if (field === "status") return budget.status;
  if (field === "catatan") return budget.catatan;

  return "-";
}

function buildConfirmMessage(budget, field, oldValue, newValue) {
  return (
    `✏️ Konfirmasi Edit Budget\n\n` +
    `ID     : ${budget.idBudget}\n` +
    `Field  : ${getFieldLabel(field)}\n` +
    `Dari   : ${oldValue}\n` +
    `Ke     : ${newValue}\n\n` +
    `Simpan perubahan ini?`
  );
}

// ==============================
// ✅ HANDLER
// ==============================

module.exports = (bot) => {
  async function handleEditBudgetCommand(ctx, rawArgs) {
    const args = String(rawArgs || "").trim();

    if (!args) {
      return ctx.reply(
        `⚠️ Format edit budget belum lengkap.\n\n` +
          `Contoh:\n` +
          `/editbudget B2\n` +
          `/editbudget B-0002\n` +
          `/editbudget 2\n` +
          `/edit B2`
      );
    }

    const normalizedId = normalizeBudgetId(args);

    if (!normalizedId) {
      return ctx.reply(
        `⚠️ ID budget tidak dikenali.\n\n` +
          `Contoh:\n` +
          `/editbudget B2\n` +
          `/editbudget 2\n` +
          `/edit B2`
      );
    }

    const budget = await findBudgetById(normalizedId);

    if (!budget) {
      return ctx.reply(
        `⚠️ Budget ${normalizedId} tidak ditemukan.\n\n` +
          `Pastikan ID budget sudah benar.`
      );
    }

    const userKey = String(ctx.from.id);

    editBudgetSessions.set(userKey, {
      step: "choose_field",
      budget,
    });

    return ctx.reply(
      buildBudgetDetailMessage(budget),
      buildEditBudgetFieldKeyboard(budget.idBudget)
    );
  }

  // ==============================
  // ✅ /editbudget
  // ==============================

  bot.command("editbudget", async (ctx) => {
    try {
      const text = ctx.message.text || "";
      const args = text.split(" ").slice(1).join(" ").trim();

      return await handleEditBudgetCommand(ctx, args);
    } catch (error) {
      console.error("Error /editbudget:", error);

      return ctx.reply(
        "⚠️ Gagal memproses edit budget.\nSilakan coba lagi beberapa saat."
      );
    }
  });

  // ==============================
  // ✅ /edit B2 alias untuk budget
  // ==============================

  bot.command("edit", async (ctx, next) => {
    try {
      const text = ctx.message.text || "";
      const args = text.split(" ").slice(1).join(" ").trim();
      const firstArg = args.split(/\s+/)[0] || "";

      if (!/^b/i.test(firstArg)) {
        return next();
      }

      return await handleEditBudgetCommand(ctx, args);
    } catch (error) {
      console.error("Error /edit budget alias:", error);

      return ctx.reply(
        "⚠️ Gagal memproses edit budget.\nSilakan coba lagi beberapa saat."
      );
    }
  });

  // ==============================
  // ✅ PILIH FIELD
  // ==============================

  bot.action(/^editbudget_field:(.+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = String(ctx.from.id);
    const session = editBudgetSessions.get(userKey);

    if (!session || !session.budget) {
      return ctx.reply(
        "⚠️ Sesi edit budget tidak ditemukan.\nSilakan ulangi dengan /editbudget ID."
      );
    }

    const requestedId = String(ctx.match[1] || "").trim().toUpperCase();
    const field = String(ctx.match[2] || "").trim().toLowerCase();

    if (requestedId !== String(session.budget.idBudget).toUpperCase()) {
      return ctx.reply("⚠️ ID budget tidak cocok.");
    }

    session.field = field;

    if (field === "limit") {
      session.step = "input_value";
      editBudgetSessions.set(userKey, session);

      return ctx.reply(
        `Masukkan limit budget baru.\n\n` +
          `Contoh:\n` +
          `2000000\n` +
          `2jt\n` +
          `1,5jt\n` +
          `0 untuk tanpa limit`
      );
    }

    if (field === "catatan") {
      session.step = "input_value";
      editBudgetSessions.set(userKey, session);

      return ctx.reply(
        `Masukkan catatan baru.\n\n` +
          `Jika ingin kosong, ketik:\n` +
          `-`
      );
    }

    if (field === "status") {
      session.step = "choose_status";
      editBudgetSessions.set(userKey, session);

      return ctx.reply("Pilih status baru:", buildStatusKeyboard());
    }

    return ctx.reply("⚠️ Field edit budget tidak dikenali.");
  });

  // ==============================
  // ✅ PILIH STATUS
  // ==============================

  bot.action(/^editbudget_status:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = String(ctx.from.id);
    const session = editBudgetSessions.get(userKey);

    if (!session || session.step !== "choose_status") {
      return ctx.reply(
        "⚠️ Sesi pilih status tidak ditemukan.\nSilakan ulangi dengan /editbudget ID."
      );
    }

    const newStatus = ctx.match[1];
    const budget = session.budget;

    session.step = "confirm";
    session.field = "status";
    session.newDisplayValue = newStatus;
    session.oldDisplayValue = getOldValueByField(budget, "status");
    session.updates = {
      I: newStatus,
      J: "Diedit via Bot Telegram - Status",
    };

    editBudgetSessions.set(userKey, session);

    return ctx.reply(
      buildConfirmMessage(
        budget,
        "status",
        session.oldDisplayValue,
        newStatus
      ),
      buildConfirmKeyboard()
    );
  });

  // ==============================
  // ✅ INPUT TEXT LIMIT / CATATAN
  // ==============================

  bot.on("text", async (ctx, next) => {
    const userKey = String(ctx.from.id);
    const session = editBudgetSessions.get(userKey);

    if (!session || session.step !== "input_value") {
      return next();
    }

    if (ctx.message.text.startsWith("/")) {
      return next();
    }

    const input = ctx.message.text.trim();
    const field = session.field;
    const budget = session.budget;

    if (field === "limit") {
      const nominal = parseBudgetLimit(input);

      if (nominal === null || nominal === undefined || Number.isNaN(nominal)) {
        return ctx.reply(
          "⚠️ Limit budget baru tidak dikenali.\n\n" +
            "Contoh:\n" +
            "2jt\n" +
            "1500000\n" +
            "0 untuk tanpa limit"
        );
      }

      session.step = "confirm";
      session.newDisplayValue =
        nominal === 0 ? "♾️ Tanpa limit" : formatRupiah(nominal);
      session.oldDisplayValue = getOldValueByField(budget, "limit");
      session.updates = {
        F: nominal,
        G: "Belum",
        H: "Belum",
        J: "Diedit via Bot Telegram - Limit Budget",
      };

      editBudgetSessions.set(userKey, session);

      return ctx.reply(
        buildConfirmMessage(
          budget,
          "limit",
          session.oldDisplayValue,
          session.newDisplayValue
        ),
        buildConfirmKeyboard()
      );
    }

    if (field === "catatan") {
      const newCatatan = input || "-";

      session.step = "confirm";
      session.newDisplayValue = newCatatan;
      session.oldDisplayValue = getOldValueByField(budget, "catatan");
      session.updates = {
        J: newCatatan,
      };

      editBudgetSessions.set(userKey, session);

      return ctx.reply(
        buildConfirmMessage(
          budget,
          "catatan",
          session.oldDisplayValue,
          session.newDisplayValue
        ),
        buildConfirmKeyboard()
      );
    }

    return ctx.reply("⚠️ Input edit budget tidak dapat diproses.");
  });

  // ==============================
  // ✅ KONFIRMASI SIMPAN
  // ==============================

  bot.action("editbudget_confirm", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = String(ctx.from.id);
    const session = editBudgetSessions.get(userKey);

    if (!session || session.step !== "confirm") {
      return ctx.reply(
        "⚠️ Sesi konfirmasi edit budget tidak ditemukan.\nSilakan ulangi dengan /editbudget ID."
      );
    }

    try {
      await updateBudgetCells(session.budget.rowNumber, session.updates);

      const budgetId = session.budget.idBudget;
      const fieldLabel = getFieldLabel(session.field);
      const newValue = session.newDisplayValue;

      editBudgetSessions.delete(userKey);

      return ctx.reply(
        `✅ Budget berhasil diedit.\n\n` +
          `ID    : ${budgetId}\n` +
          `Field : ${fieldLabel}\n` +
          `Nilai : ${newValue}`
      );
    } catch (error) {
      console.error("Error editbudget_confirm:", error);

      return ctx.reply(
        "⚠️ Gagal menyimpan edit budget.\nSilakan coba lagi."
      );
    }
  });

  // ==============================
  // ✅ BATAL
  // ==============================

  bot.action("editbudget_cancel", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = String(ctx.from.id);
    editBudgetSessions.delete(userKey);

    return ctx.reply("❌ Edit budget dibatalkan.");
  });
};