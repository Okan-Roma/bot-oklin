const { Markup } = require("telegraf");
const {
  getAllTransactions,
  updateTransactionCells,
} = require("../services/googleSheets");

// ==============================
// ✅ SESSION EDIT
// ==============================

const editSessions = new Map();

// ==============================
// ✅ HELPERS
// ==============================

function formatRupiah(value) {
  const number = Number(String(value || 0).replace(/[^\d.-]/g, "")) || 0;
  return "Rp " + number.toLocaleString("id-ID");
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

function pad2(value) {
  return String(value).padStart(2, "0");
}

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

  const isValid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  if (!isValid) return null;

  return date;
}

function formatDateToDDMMYYYY(date) {
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`;
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

  return { valid: true };
}

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

function buildEditFieldKeyboard(transactionId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("💰 Nominal", `edit_field:${transactionId}:nominal`),
      Markup.button.callback("📅 Tanggal", `edit_field:${transactionId}:tanggal`),
    ],
    [
      Markup.button.callback("📂 Kategori", `edit_field:${transactionId}:kategori`),
      Markup.button.callback("📝 Keterangan", `edit_field:${transactionId}:keterangan`),
    ],
    [
      Markup.button.callback("❌ Batal", "edit_cancel"),
    ],
  ]);
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
  return field;
}

function getOldValueByField(trx, field) {
  if (field === "nominal") return formatRupiah(trx.nominal);
  if (field === "tanggal") return trx.tanggal;
  if (field === "kategori") return trx.kategori;
  if (field === "keterangan") return trx.keterangan;
  return "-";
}

// ==============================
// ✅ HANDLER
// ==============================

module.exports = (bot) => {
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

      const rows = await getAllTransactions();

      if (!rows || !rows.length) {
        return ctx.reply("⚠️ Belum ada data transaksi.");
      }

      let found = null;

      rows.forEach((row, index) => {
        const rowId = String(row[0] || "").trim().toUpperCase();

        if (rowId === normalizedId) {
          found = normalizeRow(row, index + 2);
        }
      });

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
        buildEditFieldKeyboard(found.id)
      );
    } catch (error) {
      console.error("Error /edit:", error);

      return ctx.reply(
        "⚠️ Gagal memproses edit transaksi.\nSilakan coba lagi beberapa saat."
      );
    }
  });

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

    session.step = "input_value";
    session.field = field;

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

    let newDisplayValue = input;
    let updates = {};

    if (field === "nominal") {
      const nominal = parseNominal(input);

      if (!nominal) {
        return ctx.reply(
          "⚠️ Nominal baru tidak dikenali.\n\nContoh: 125rb"
        );
      }

      newDisplayValue = formatRupiah(nominal);

      updates = {
        I: nominal,
        J: input,
        Z: `Diedit via Bot Telegram - Nominal`,
      };
    }

    if (field === "tanggal") {
      const parsedDate = parseManualDate(input);

      if (!parsedDate) {
        return ctx.reply(
          "⚠️ Format tanggal belum dikenali.\n\nGunakan DD-MM-YYYY."
        );
      }

      const validation = validateTransactionDate(parsedDate);

      if (!validation.valid) {
        return ctx.reply(validation.message);
      }

      const tanggal = formatDateToDDMMYYYY(parsedDate);
      const bulan = Number(tanggal.split("-")[1]);
      const tahun = Number(tanggal.split("-")[2]);

      newDisplayValue = tanggal;

      updates = {
        C: tanggal,
        R: bulan,
        S: tahun,
        Z: `Diedit via Bot Telegram - Tanggal`,
      };
    }

    if (field === "kategori") {
      const kategori = input || "-";

      newDisplayValue = kategori;

      updates = {
        K: kategori,
        Z: `Diedit via Bot Telegram - Kategori`,
      };
    }

    if (field === "keterangan") {
      const keterangan = input || "-";

      newDisplayValue = keterangan;

      updates = {
        P: keterangan,
        Z: `Diedit via Bot Telegram - Keterangan`,
      };
    }

    if (!Object.keys(updates).length) {
      return ctx.reply("⚠️ Edit tidak dapat diproses.");
    }

    session.step = "confirm";
    session.newDisplayValue = newDisplayValue;
    session.updates = updates;

    editSessions.set(userKey, session);

    return ctx.reply(
      `✏️ Konfirmasi Edit\n\n` +
        `ID     : ${trx.id}\n` +
        `Field  : ${getFieldLabel(field)}\n` +
        `Dari   : ${getOldValueByField(trx, field)}\n` +
        `Ke     : ${newDisplayValue}\n\n` +
        `Simpan perubahan ini?`,
      buildConfirmKeyboard()
    );
  });

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

      editSessions.delete(userKey);

      return ctx.reply(
        `✅ Transaksi berhasil diedit.\n\n` +
          `ID    : ${trxId}\n` +
          `Field : ${fieldLabel}\n` +
          `Nilai : ${newValue}`
      );
    } catch (error) {
      console.error("Error edit_confirm:", error);

      return ctx.reply(
        "⚠️ Gagal menyimpan edit transaksi.\nSilakan coba lagi."
      );
    }
  });

  bot.action("edit_cancel", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = String(ctx.from.id);
    editSessions.delete(userKey);

    return ctx.reply("❌ Edit transaksi dibatalkan.");
  });
};