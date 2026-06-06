const { Markup } = require("telegraf");
const {
  getAllTransactions,
  updateTransactionStatusAndNote,
} = require("../services/googleSheets");

const {
  getBudgetWarningMessageForAccount,
} = require("../services/budgetChecker");

// ==============================
// ✅ SESSION RESTORE
// ==============================

const restoreSessions = new Map();

// ==============================
// ✅ HELPERS
// ==============================

function formatRupiah(value) {
  const number = Number(String(value || 0).replace(/[^\d.-]/g, "")) || 0;
  return "Rp " + number.toLocaleString("id-ID");
}

function normalizeTransactionId(input) {
  if (!input) return null;

  let text = String(input).trim().toUpperCase();

  text = text.replace(/^\/RESTORE/i, "").trim();

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
    status: row[19] || "-",
    sumberInput: row[23] || "-",
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

function buildRestoreConfirmMessage(trx) {
  const icon = getJenisIcon(trx.jenis);
  const dompet = getDompetText(trx);

  return (
    `♻️ Konfirmasi Restore Transaksi\n\n` +
    `ID      : ${trx.id}\n` +
    `Jenis   : ${icon} ${trx.jenis}\n` +
    `Account : ${trx.account}\n` +
    `Nominal : ${formatRupiah(trx.nominal)}\n` +
    `Kategori: ${trx.kategori}\n` +
    `Dompet  : ${dompet}\n` +
    `Tanggal : ${trx.tanggal}\n` +
    `Ket     : ${trx.keterangan}\n` +
    `Status  : ${trx.status}\n\n` +
    `Aktifkan kembali transaksi ini?`
  );
}

function buildConfirmKeyboard(transactionId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Restore", `restore_confirm:${transactionId}`),
      Markup.button.callback("❌ Batal", "restore_cancel"),
    ],
  ]);
}

// ==============================
// ✅ HANDLER RESTORE
// ==============================

module.exports = (bot) => {
  bot.command("restore", async (ctx) => {
    try {
      const text = ctx.message.text || "";
      const args = text.split(" ").slice(1).join(" ").trim();

      if (!args) {
        return ctx.reply(
          `⚠️ Format restore belum lengkap.\n\n` +
            `Contoh:\n` +
            `/restore T4\n` +
            `/restore T-0004\n` +
            `/restore 4`
        );
      }

      const normalizedId = normalizeTransactionId(args);

      if (!normalizedId) {
        return ctx.reply(
          `⚠️ ID transaksi tidak dikenali.\n\n` +
            `Contoh:\n` +
            `/restore T4\n` +
            `/restore T-0004\n` +
            `/restore 4`
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
          // getAllTransactions baca dari A2, jadi row Google Sheet = index + 2
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

      if (status === "aktif") {
        return ctx.reply(
          `⚠️ Transaksi ${normalizedId} sudah aktif.\n\n` +
            `Tidak perlu direstore.`
        );
      }

      if (status !== "dihapus") {
        return ctx.reply(
          `⚠️ Transaksi ${normalizedId} tidak bisa direstore.\n\n` +
            `Status saat ini: ${found.status}`
        );
      }

      const userKey = String(ctx.from.id);

      restoreSessions.set(userKey, found);

      return ctx.reply(
        buildRestoreConfirmMessage(found),
        buildConfirmKeyboard(found.id)
      );
    } catch (error) {
      console.error("Error /restore:", error);

      return ctx.reply(
        "⚠️ Gagal memproses restore transaksi.\nSilakan coba lagi beberapa saat."
      );
    }
  });

  bot.action(/^restore_confirm:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = String(ctx.from.id);
    const session = restoreSessions.get(userKey);

    if (!session) {
      return ctx.reply(
        "⚠️ Sesi restore transaksi tidak ditemukan.\nSilakan ulangi dengan /restore ID."
      );
    }

    const requestedId = String(ctx.match[1] || "").trim().toUpperCase();

    if (requestedId !== String(session.id).toUpperCase()) {
      return ctx.reply("⚠️ ID konfirmasi tidak cocok.");
    }

    try {
      await updateTransactionStatusAndNote(
        session.rowNumber,
        "Aktif",
        "Restore via Bot Telegram"
      );

      let budgetWarning = null;

      const jenis = String(session.jenis || "").toLowerCase();

      if (jenis.includes("pengeluaran")) {
        budgetWarning = await getBudgetWarningMessageForAccount(session.account);
      }

      restoreSessions.delete(userKey);

      let message =
        `✅ Transaksi berhasil direstore.\n\n` +
        `ID: ${session.id}\n` +
        `${getJenisIcon(session.jenis)} ${session.jenis} ${formatRupiah(session.nominal)}`;

      if (budgetWarning) {
        message += `\n\n${budgetWarning}`;
      }

      return ctx.reply(message);
    } catch (error) {
      console.error("Error restore_confirm:", error);

      return ctx.reply(
        "⚠️ Gagal restore transaksi.\nSilakan coba lagi."
      );
    }
  });

  bot.action("restore_cancel", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = String(ctx.from.id);
    restoreSessions.delete(userKey);

    return ctx.reply("❌ Restore transaksi dibatalkan.");
  });
};