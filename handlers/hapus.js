const { Markup } = require("telegraf");
const {
  getAllTransactions,
  updateTransactionStatusAndNote,
} = require("../services/googleSheets");

// ==============================
// ✅ SESSION HAPUS
// ==============================

const deleteSessions = new Map();

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

  text = text.replace(/^\/HAPUS/i, "").trim();

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

function buildDeleteConfirmMessage(trx) {
  const icon = getJenisIcon(trx.jenis);
  const dompet = getDompetText(trx);

  return (
    `⚠️ Konfirmasi Hapus Transaksi\n\n` +
    `ID      : ${trx.id}\n` +
    `Jenis   : ${icon} ${trx.jenis}\n` +
    `Account : ${trx.account}\n` +
    `Nominal : ${formatRupiah(trx.nominal)}\n` +
    `Kategori: ${trx.kategori}\n` +
    `Dompet  : ${dompet}\n` +
    `Tanggal : ${trx.tanggal}\n` +
    `Ket     : ${trx.keterangan}\n` +
    `Status  : ${trx.status}\n\n` +
    `Hapus transaksi ini?`
  );
}

function buildConfirmKeyboard(transactionId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Hapus", `hapus_confirm:${transactionId}`),
      Markup.button.callback("❌ Batal", "hapus_cancel"),
    ],
  ]);
}

// ==============================
// ✅ HANDLER
// ==============================

module.exports = (bot) => {
  bot.command("hapus", async (ctx) => {
    try {
      const text = ctx.message.text || "";
      const args = text.split(" ").slice(1).join(" ").trim();

      if (!args) {
        return ctx.reply(
          `⚠️ Format hapus belum lengkap.\n\n` +
            `Contoh:\n` +
            `/hapus T3\n` +
            `/hapus T-0003\n` +
            `/hapus 3`
        );
      }

      const normalizedId = normalizeTransactionId(args);

      if (!normalizedId) {
        return ctx.reply(
          `⚠️ ID transaksi tidak dikenali.\n\n` +
            `Contoh:\n` +
            `/hapus T3\n` +
            `/hapus T-0003\n` +
            `/hapus 3`
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
          // getAllTransactions baca dari A2, jadi row sheet = index + 2
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
          `⚠️ Transaksi ${normalizedId} tidak bisa dihapus.\n\n` +
            `Status saat ini: ${found.status}`
        );
      }

      const userKey = String(ctx.from.id);

      deleteSessions.set(userKey, found);

      return ctx.reply(
        buildDeleteConfirmMessage(found),
        buildConfirmKeyboard(found.id)
      );
    } catch (error) {
      console.error("Error /hapus:", error);

      return ctx.reply(
        "⚠️ Gagal memproses hapus transaksi.\nSilakan coba lagi beberapa saat."
      );
    }
  });

  bot.action(/^hapus_confirm:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = String(ctx.from.id);
    const session = deleteSessions.get(userKey);

    if (!session) {
      return ctx.reply(
        "⚠️ Sesi hapus transaksi tidak ditemukan.\nSilakan ulangi dengan /hapus ID."
      );
    }

    const requestedId = String(ctx.match[1] || "").trim().toUpperCase();

    if (requestedId !== String(session.id).toUpperCase()) {
      return ctx.reply("⚠️ ID konfirmasi tidak cocok.");
    }

    try {
      await updateTransactionStatusAndNote(
        session.rowNumber,
        "Dihapus",
        `Dihapus via Bot Telegram`
      );

      deleteSessions.delete(userKey);

      return ctx.reply(
        `✅ Transaksi berhasil dihapus.\n\n` +
          `ID: ${session.id}\n` +
          `${getJenisIcon(session.jenis)} ${session.jenis} ${formatRupiah(session.nominal)}`
      );
    } catch (error) {
      console.error("Error hapus_confirm:", error);

      return ctx.reply(
        "⚠️ Gagal menghapus transaksi.\nSilakan coba lagi."
      );
    }
  });

  bot.action("hapus_cancel", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = String(ctx.from.id);
    deleteSessions.delete(userKey);

    return ctx.reply("❌ Hapus transaksi dibatalkan.");
  });
};