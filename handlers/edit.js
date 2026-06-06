const { Markup } = require("telegraf");
const {
  getAllTransactions,
  getActiveWalletsByAccount,
  updateTransactionCells,
} = require("../services/googleSheets");

const {
  getBudgetWarningMessageForAccount,
} = require("../services/budgetChecker");

// ==============================
// ✅ SESSION EDIT
// ==============================

const editSessions = new Map();

// ==============================
// ✅ FORMAT HELPERS
// ==============================

function formatRupiah(value) {
  const number = Number(String(value || 0).replace(/[^\d.-]/g, "")) || 0;
  return "Rp " + number.toLocaleString("id-ID");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateToDDMMYYYY(date) {
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`;
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

// ==============================
// ✅ ID HELPERS
// ==============================

function normalizeTransactionId(input) {
  if (!input) return null;

  let text = String(input).trim().toUpperCase();

  text = text.replace(/^\/EDIT/i, "").trim();

  if (text.startsWith("TRX-")) {
    return text;
  }

  text = text.replace(/[^0-9]/g, "");

  const number = Number(text);

  if (!number || Number.isNaN(number)) {
    return null;
  }

  return `T-${String(number).padStart(4, "0")}`;
}

// ==============================
// ✅ DATE HELPERS
// ==============================

function parseManualDate(input) {
  const text = String(input || "").trim();

  const match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const date = new Date(year, month - 1, day);

  const isValidDate =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  if (!isValidDate) {
    return null;
  }

  return date;
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

function validateTransactionDate(date) {
  const today = getTodayWIBDateOnly();

  if (date > today) {
    return {
      valid: false,
      message: "⚠️ Tanggal transaksi tidak boleh tanggal masa depan.",
    };
  }

  const diffMs = today.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 30) {
    return {
      valid: false,
      message: "⚠️ Tanggal transaksi maksimal 30 hari ke belakang.",
    };
  }

  return {
    valid: true,
  };
}

// ==============================
// ✅ TRANSACTION HELPERS
// ==============================

function normalizeRow(row, rowNumber) {
  return {
    rowNumber,
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
    keterangan: row[15] || "-",
    bulan: row[17] || "-",
    tahun: row[18] || "-",
    status: row[19] || "-",
    catatanSistem: row[25] || "-",
  };
}

function getJenisIcon(jenis) {
  const text = String(jenis || "").toLowerCase();

  if (text.includes("pemasukan")) return "➕";
  if (text.includes("pengeluaran")) return "➖";
  if (text.includes("transfer")) return "🔁";

  return "•";
}

function getDompetText(trx) {
  const jenis = String(trx.jenis || "").toLowerCase();

  if (jenis.includes("pemasukan")) {
    return trx.dompetTujuan || "-";
  }

  if (jenis.includes("pengeluaran")) {
    return trx.dompetSumber || "-";
  }

  if (jenis.includes("transfer")) {
    return `${trx.dompetSumber || "-"} → ${trx.dompetTujuan || "-"}`;
  }

  return "-";
}

function isTransferTransaction(trx) {
  return String(trx.jenis || "").toLowerCase().includes("transfer");
}

function isIncomeTransaction(trx) {
  return String(trx.jenis || "").toLowerCase().includes("pemasukan");
}

function isExpenseTransaction(trx) {
  return String(trx.jenis || "").toLowerCase().includes("pengeluaran");
}

// ==============================
// ✅ MESSAGE BUILDERS
// ==============================

function buildEditMenuMessage(trx) {
  const icon = getJenisIcon(trx.jenis);

  return (
    `✏️ Edit Transaksi\n\n` +
    `ID      : ${trx.id}\n` +
    `Jenis   : ${icon} ${trx.jenis}\n` +
    `Account : ${trx.account}\n` +
    `Nominal : ${formatRupiah(trx.nominal)}\n` +
    `Kategori: ${trx.kategori}\n` +
    `Dompet  : ${getDompetText(trx)}\n` +
    `Tanggal : ${trx.tanggal}\n` +
    `Ket     : ${trx.keterangan}\n` +
    `Status  : ${trx.status}\n\n` +
    `Pilih field yang mau diedit:`
  );
}

function buildEditFieldKeyboard(transactionId, jenis) {
  const isTransfer = String(jenis || "").toLowerCase().includes("transfer");

  const rows = [
    [
      Markup.button.callback("💰 Nominal", `edit_field:${transactionId}:nominal`),
      Markup.button.callback("📅 Tanggal", `edit_field:${transactionId}:tanggal`),
    ],
    [
      Markup.button.callback("📂 Kategori", `edit_field:${transactionId}:kategori`),
      Markup.button.callback("📝 Keterangan", `edit_field:${transactionId}:keterangan`),
    ],
  ];

  if (isTransfer) {
    rows.push([
      Markup.button.callback(
        "🏦 Dompet Sumber",
        `edit_field:${transactionId}:dompet_sumber`
      ),
      Markup.button.callback(
        "🏦 Dompet Tujuan",
        `edit_field:${transactionId}:dompet_tujuan`
      ),
    ]);
  } else {
    rows.push([
      Markup.button.callback("🏦 Dompet", `edit_field:${transactionId}:dompet`),
    ]);
  }

  rows.push([Markup.button.callback("❌ Batal", "edit_cancel")]);

  return Markup.inlineKeyboard(rows);
}

function buildWalletKeyboard(wallets, callbackPrefix) {
  const rows = [];

  for (let i = 0; i < wallets.length; i += 2) {
    const row = wallets.slice(i, i + 2).map((wallet) => {
      return Markup.button.callback(wallet, `${callbackPrefix}:${wallet}`);
    });

    rows.push(row);
  }

  rows.push([Markup.button.callback("❌ Batal", "edit_cancel")]);

  return Markup.inlineKeyboard(rows);
}

function buildConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Simpan Edit", "edit_confirm"),
      Markup.button.callback("❌ Batal", "edit_cancel"),
    ],
  ]);
}

function getFieldLabel(field) {
  if (field === "nominal") return "Nominal";
  if (field === "tanggal") return "Tanggal";
  if (field === "kategori") return "Kategori";
  if (field === "keterangan") return "Keterangan";
  if (field === "dompet") return "Dompet";
  if (field === "dompet_sumber") return "Dompet Sumber";
  if (field === "dompet_tujuan") return "Dompet Tujuan";

  return field;
}

function getOldValueByField(trx, field) {
  if (field === "nominal") return formatRupiah(trx.nominal);
  if (field === "tanggal") return trx.tanggal;
  if (field === "kategori") return trx.kategori;
  if (field === "keterangan") return trx.keterangan;

  if (field === "dompet") {
    if (isIncomeTransaction(trx)) return trx.dompetTujuan || "-";
    if (isExpenseTransaction(trx)) return trx.dompetSumber || "-";
    return getDompetText(trx);
  }

  if (field === "dompet_sumber") return trx.dompetSumber || "-";
  if (field === "dompet_tujuan") return trx.dompetTujuan || "-";

  return "-";
}

function buildEditConfirmMessage(trx, field, oldValue, newValue) {
  return (
    `✏️ Konfirmasi Edit\n\n` +
    `ID     : ${trx.id}\n` +
    `Field  : ${getFieldLabel(field)}\n` +
    `Dari   : ${oldValue}\n` +
    `Ke     : ${newValue}\n\n` +
    `Simpan perubahan ini?`
  );
}

// ==============================
// ✅ FIND TRANSACTION
// ==============================

async function findTransactionById(transactionId) {
  const rows = await getAllTransactions();

  if (!rows || !rows.length) {
    return null;
  }

  let found = null;

  rows.forEach((row, index) => {
    const rowId = String(row[0] || "").trim().toUpperCase();

    if (rowId === transactionId) {
      found = normalizeRow(row, index + 2);
    }
  });

  return found;
}

// ==============================
// ✅ UPDATE BUILDERS
// ==============================

function buildTextFieldUpdates(field, input, trx) {
  let newDisplayValue = input;
  let updates = {};

  if (field === "nominal") {
    const nominal = parseNominal(input);

    if (!nominal) {
      return {
        error: "⚠️ Nominal baru tidak dikenali.\n\nContoh: 125rb",
      };
    }

    newDisplayValue = formatRupiah(nominal);

    updates = {
      I: nominal,
      J: input,
      Z: "Diedit via Bot Telegram - Nominal",
    };
  }

  if (field === "tanggal") {
    const parsedDate = parseManualDate(input);

    if (!parsedDate) {
      return {
        error: "⚠️ Format tanggal belum dikenali.\n\nGunakan DD-MM-YYYY.",
      };
    }

    const validation = validateTransactionDate(parsedDate);

    if (!validation.valid) {
      return {
        error: validation.message,
      };
    }

    const tanggal = formatDateToDDMMYYYY(parsedDate);
    const bulan = Number(tanggal.split("-")[1]);
    const tahun = Number(tanggal.split("-")[2]);

    newDisplayValue = tanggal;

    updates = {
      C: tanggal,
      R: bulan,
      S: tahun,
      Z: "Diedit via Bot Telegram - Tanggal",
    };
  }

  if (field === "kategori") {
    const kategori = input || "-";

    newDisplayValue = kategori;

    updates = {
      K: kategori,
      Z: "Diedit via Bot Telegram - Kategori",
    };
  }

  if (field === "keterangan") {
    const keterangan = input || "-";

    newDisplayValue = keterangan;

    updates = {
      P: keterangan,
      Z: "Diedit via Bot Telegram - Keterangan",
    };
  }

  if (!Object.keys(updates).length) {
    return {
      error: "⚠️ Edit tidak dapat diproses.",
    };
  }

  return {
    updates,
    newDisplayValue,
    oldDisplayValue: getOldValueByField(trx, field),
  };
}

function buildWalletUpdates(field, newWallet, trx) {
  let updates = {};

  if (field === "dompet") {
    if (isIncomeTransaction(trx)) {
      updates = {
        M: newWallet,
        Z: "Diedit via Bot Telegram - Dompet",
      };
    } else if (isExpenseTransaction(trx)) {
      updates = {
        L: newWallet,
        Z: "Diedit via Bot Telegram - Dompet",
      };
    } else {
      return {
        error:
          "⚠️ Untuk transaksi Transfer, pilih Dompet Sumber atau Dompet Tujuan secara terpisah.",
      };
    }
  }

  if (field === "dompet_sumber") {
    if (!isTransferTransaction(trx)) {
      return {
        error: "⚠️ Dompet Sumber khusus untuk transaksi Transfer.",
      };
    }

    if (newWallet === trx.dompetTujuan) {
      return {
        error: "⚠️ Dompet sumber dan tujuan tidak boleh sama.",
      };
    }

    updates = {
      L: newWallet,
      Z: "Diedit via Bot Telegram - Dompet Sumber",
    };
  }

  if (field === "dompet_tujuan") {
    if (!isTransferTransaction(trx)) {
      return {
        error: "⚠️ Dompet Tujuan khusus untuk transaksi Transfer.",
      };
    }

    if (newWallet === trx.dompetSumber) {
      return {
        error: "⚠️ Dompet sumber dan tujuan tidak boleh sama.",
      };
    }

    updates = {
      M: newWallet,
      Z: "Diedit via Bot Telegram - Dompet Tujuan",
    };
  }

  if (!Object.keys(updates).length) {
    return {
      error: "⚠️ Edit dompet tidak dapat diproses.",
    };
  }

  return {
    updates,
    newDisplayValue: newWallet,
    oldDisplayValue: getOldValueByField(trx, field),
  };
}

// ==============================
// ✅ HANDLER
// ==============================

module.exports = (bot) => {
  // ==============================
  // ✅ /edit
  // ==============================

  bot.command("edit", async (ctx) => {
    try {
      const text = ctx.message.text || "";
      const args = text.split(" ").slice(1).join(" ").trim();

      if (!args) {
        return ctx.reply(
          `⚠️ Format edit belum lengkap.\n\n` +
            `Contoh:\n` +
            `/edit T3\n` +
            `/edit T-0003\n` +
            `/edit 3`
        );
      }

      const normalizedId = normalizeTransactionId(args);

      if (!normalizedId) {
        return ctx.reply(
          `⚠️ ID transaksi tidak dikenali.\n\n` +
            `Contoh:\n` +
            `/edit T3\n` +
            `/edit T-0003\n` +
            `/edit 3`
        );
      }

      const found = await findTransactionById(normalizedId);

      if (!found) {
        return ctx.reply(
          `⚠️ Transaksi ${normalizedId} tidak ditemukan.\n\n` +
            `Pastikan ID transaksi sudah benar.`
        );
      }

      const status = String(found.status || "").trim().toLowerCase();

      if (status !== "aktif") {
        return ctx.reply(
          `⚠️ Transaksi ${normalizedId} tidak bisa diedit.\n\n` +
            `Status saat ini: ${found.status}`
        );
      }

      const userKey = String(ctx.from.id);

      editSessions.set(userKey, {
        step: "choose_field",
        trx: found,
      });

      return ctx.reply(
        buildEditMenuMessage(found),
        buildEditFieldKeyboard(found.id, found.jenis)
      );
    } catch (error) {
      console.error("Error /edit:", error);

      return ctx.reply(
        "⚠️ Gagal memproses edit transaksi.\nSilakan coba lagi beberapa saat."
      );
    }
  });

  // ==============================
  // ✅ PILIH FIELD
  // ==============================

  bot.action(/^edit_field:(.+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = String(ctx.from.id);
    const session = editSessions.get(userKey);

    if (!session || !session.trx) {
      return ctx.reply(
        "⚠️ Sesi edit tidak ditemukan.\nSilakan ulangi dengan /edit ID."
      );
    }

    const requestedId = String(ctx.match[1] || "").trim().toUpperCase();
    const field = String(ctx.match[2] || "").trim().toLowerCase();

    if (requestedId !== String(session.trx.id).toUpperCase()) {
      return ctx.reply("⚠️ ID edit tidak cocok.");
    }

    session.field = field;

    if (["dompet", "dompet_sumber", "dompet_tujuan"].includes(field)) {
      try {
        const wallets = await getActiveWalletsByAccount(session.trx.account);

        if (!wallets.length) {
          return ctx.reply(
            `⚠️ Tidak ada dompet aktif untuk account ${session.trx.account}.\n` +
              `Silakan cek tab Dompet di Google Sheet.`
          );
        }

        session.step = "choose_wallet";
        editSessions.set(userKey, session);

        return ctx.reply(
          `Pilih ${getFieldLabel(field)} baru:`,
          buildWalletKeyboard(wallets, "edit_wallet")
        );
      } catch (error) {
        console.error("Error ambil dompet edit:", error);

        return ctx.reply(
          "⚠️ Bot sedang kesulitan membaca daftar dompet.\nSilakan coba lagi beberapa saat."
        );
      }
    }

    session.step = "input_value";
    editSessions.set(userKey, session);

    if (field === "nominal") {
      return ctx.reply(
        `Masukkan nominal baru.\n\n` +
          `Contoh:\n` +
          `125rb\n` +
          `1,5jt`
      );
    }

    if (field === "tanggal") {
      return ctx.reply(
        `Masukkan tanggal baru.\n\n` +
          `Format wajib:\n` +
          `DD-MM-YYYY\n\n` +
          `Contoh:\n` +
          `04-06-2026`
      );
    }

    if (field === "kategori") {
      return ctx.reply(
        `Masukkan kategori baru.\n\n` +
          `Contoh:\n` +
          `Makan\n` +
          `Belanja\n` +
          `Gaji`
      );
    }

    if (field === "keterangan") {
      return ctx.reply(
        `Masukkan keterangan baru.\n\n` +
          `Jika ingin kosong, ketik:\n` +
          `-`
      );
    }

    return ctx.reply("⚠️ Field edit tidak dikenali.");
  });

  // ==============================
  // ✅ PILIH DOMPET
  // ==============================

  bot.action(/^edit_wallet:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = String(ctx.from.id);
    const session = editSessions.get(userKey);

    if (!session || session.step !== "choose_wallet") {
      return ctx.reply(
        "⚠️ Sesi pilih dompet tidak ditemukan.\nSilakan ulangi dengan /edit ID."
      );
    }

    const newWallet = ctx.match[1];
    const field = session.field;
    const trx = session.trx;

    const result = buildWalletUpdates(field, newWallet, trx);

    if (result.error) {
      return ctx.reply(result.error);
    }

    session.step = "confirm";
    session.newDisplayValue = result.newDisplayValue;
    session.oldDisplayValue = result.oldDisplayValue;
    session.updates = result.updates;

    editSessions.set(userKey, session);

    return ctx.reply(
      buildEditConfirmMessage(
        trx,
        field,
        result.oldDisplayValue,
        result.newDisplayValue
      ),
      buildConfirmKeyboard()
    );
  });

  // ==============================
  // ✅ INPUT TEXT UNTUK FIELD
  // ==============================

  bot.on("text", async (ctx, next) => {
    const userKey = String(ctx.from.id);
    const session = editSessions.get(userKey);

    if (!session || session.step !== "input_value") {
      return next();
    }

    if (ctx.message.text.startsWith("/")) {
      return next();
    }

    const input = ctx.message.text.trim();
    const field = session.field;
    const trx = session.trx;

    const result = buildTextFieldUpdates(field, input, trx);

    if (result.error) {
      return ctx.reply(result.error);
    }

    session.step = "confirm";
    session.newDisplayValue = result.newDisplayValue;
    session.oldDisplayValue = result.oldDisplayValue;
    session.updates = result.updates;

    editSessions.set(userKey, session);

    return ctx.reply(
      buildEditConfirmMessage(
        trx,
        field,
        result.oldDisplayValue,
        result.newDisplayValue
      ),
      buildConfirmKeyboard()
    );
  });

  // ==============================
  // ✅ KONFIRMASI SIMPAN EDIT
  // ==============================

  bot.action("edit_confirm", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = String(ctx.from.id);
    const session = editSessions.get(userKey);

    if (!session || session.step !== "confirm") {
      return ctx.reply(
        "⚠️ Sesi konfirmasi edit tidak ditemukan.\nSilakan ulangi dengan /edit ID."
      );
    }

    try {
      await updateTransactionCells(session.trx.rowNumber, session.updates);

      const trxId = session.trx.id;
      const fieldLabel = getFieldLabel(session.field);
      const newValue = session.newDisplayValue;

      let budgetWarning = null;

      const jenis = String(session.trx.jenis || "").toLowerCase();
      const shouldCheckBudget =
        jenis.includes("pengeluaran") &&
        ["nominal", "tanggal"].includes(session.field);

      if (shouldCheckBudget) {
        budgetWarning = await getBudgetWarningMessageForAccount(session.trx.account);
      }

      editSessions.delete(userKey);

      let message =
      `✅ Transaksi berhasil diedit.\n\n` +
      `ID    : ${trxId}\n` +
      `Field : ${fieldLabel}\n` +
      `Nilai : ${newValue}`;

      if (budgetWarning) {
        message += `\n\n${budgetWarning}`;
      }

      return ctx.reply(message);

    } catch (error) {
      console.error("Error edit_confirm:", error);

      return ctx.reply(
        "⚠️ Gagal menyimpan edit transaksi.\nSilakan coba lagi."
      );
    }
  });

  // ==============================
  // ✅ BATAL EDIT
  // ==============================

  bot.action("edit_cancel", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = String(ctx.from.id);
    editSessions.delete(userKey);

    return ctx.reply("❌ Edit transaksi dibatalkan.");
  });
};