const { Markup } = require("telegraf");
const {
  hasActiveFlow,
  getActiveFlow,
  clearUserSession,
} = require("../services/sessionManager");

const {
  getAllTransactions,
  getActiveInitialBalances,
} = require("../services/googleSheets");

const { getLastActiveTransactions } = require("../services/googleSheets");
const { formatLastTransactions } = require("../services/formatter");

// ==============================
// ✅ MAIN KEYBOARD
// ==============================

function mainMenuKeyboard() {
  return Markup.keyboard([
    ["➕ Pemasukan", "➖ Pengeluaran"],
    ["🔁 Transfer", "📊 Rekap"],
    ["💰 Saldo", "📜 Riwayat"],
    ["❓ Bantuan", "❌ Batal"],
  ]).resize();
}

// ==============================
// ✅ HELPERS
// ==============================

function formatRupiah(value) {
  return "Rp " + Number(value || 0).toLocaleString("id-ID");
}

function parseSheetNumber(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  return Number(String(value).replace(/[^\d-]/g, "")) || 0;
}

function makeSaldoKey(account, wallet) {
  return `${account}|||${wallet}`;
}

function addSaldo(saldoMap, account, wallet, amount) {
  if (!account || !wallet) return;

  const key = makeSaldoKey(account, wallet);

  if (!saldoMap[key]) {
    saldoMap[key] = {
      account,
      wallet,
      saldo: 0,
    };
  }

  saldoMap[key].saldo += amount;
}

function getFlowLabel(flow) {
  if (flow === "income") return "Pemasukan";
  if (flow === "expense") return "Pengeluaran";
  if (flow === "transfer") return "Transfer Dompet";
  return "transaksi";
}

function isProtectedMenuText(text) {
  return [
    "➕ Pemasukan",
    "➖ Pengeluaran",
    "🔁 Transfer",
    "📊 Rekap",
    "💰 Saldo",
    "📜 Riwayat",
    "❓ Bantuan",
  ].includes(text);
}

function buildAccountKeyboard(callbackPrefix) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Oklin", `${callbackPrefix}:Oklin`)],
    [Markup.button.callback("Mamah", `${callbackPrefix}:Mamah`)],
    [Markup.button.callback("Isal", `${callbackPrefix}:Isal`)],
    [Markup.button.callback("❌ Batal", `${callbackPrefix.includes("income") ? "income" : callbackPrefix.includes("expense") ? "expense" : "transfer"}_cancel`)],
  ]);
}

function buildRekapPeriodKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📅 Hari Ini", "rekap_period:today"),
      Markup.button.callback("🗓 Minggu Ini", "rekap_period:week"),
    ],
    [Markup.button.callback("📆 Bulan Ini", "rekap_period:month")],
    [Markup.button.callback("❌ Batal", "rekap_cancel")],
  ]);
}

async function buildSaldoMessage() {
  const saldoMap = {};

  const initialBalances = await getActiveInitialBalances();

  initialBalances.forEach((item) => {
    const account = item["Account"] || "-";
    const wallet = item["Nama Dompet"] || "-";
    const saldoAwal = parseSheetNumber(item["Saldo Awal"]);

    addSaldo(saldoMap, account, wallet, saldoAwal);
  });

  const rows = await getAllTransactions();

  rows.forEach((row) => {
    const account = row[6] || "-";
    const jenis = row[7] || "";
    const nominal = parseSheetNumber(row[8]);
    const sumber = row[11] || "";
    const tujuan = row[12] || "";
    const status = (row[19] || "").toString().trim().toLowerCase();

    if (status && status !== "aktif") {
      return;
    }

    if (jenis === "Pemasukan" && tujuan) {
      addSaldo(saldoMap, account, tujuan, nominal);
    }

    if (jenis === "Pengeluaran" && sumber) {
      addSaldo(saldoMap, account, sumber, -nominal);
    }

    if (jenis === "Transfer") {
      if (sumber) {
        addSaldo(saldoMap, account, sumber, -nominal);
      }

      if (tujuan) {
        addSaldo(saldoMap, account, tujuan, nominal);
      }
    }
  });

  const saldoItems = Object.values(saldoMap);

  if (!saldoItems.length) {
    return "⚠️ Belum ada saldo yang bisa dihitung.";
  }

  const grouped = {};

  saldoItems.forEach((item) => {
    if (!grouped[item.account]) {
      grouped[item.account] = [];
    }

    grouped[item.account].push(item);
  });

  let message = "💰 Saldo Dompet\n\n";

  Object.keys(grouped)
    .sort()
    .forEach((account) => {
      message += `🏷 Account: ${account}\n`;

      grouped[account]
        .sort((a, b) => a.wallet.localeCompare(b.wallet))
        .forEach((item) => {
          message += `- ${item.wallet}: ${formatRupiah(item.saldo)}\n`;
        });

      message += "\n";
    });

  return message.trim();
}

function guardActiveFlow(ctx) {
  const text = ctx.message && ctx.message.text;

  if (!text || !isProtectedMenuText(text)) {
    return false;
  }

  if (!hasActiveFlow(ctx.from.id)) {
    return false;
  }

  const flow = getActiveFlow(ctx.from.id);

  return ctx.reply(
    `⚠️ Kamu sedang mengisi ${getFlowLabel(flow)}.\n\n` +
      `Selesaikan dulu input tersebut, atau tekan ❌ Batal / ketik /batal untuk membatalkan.`
  );
}

// ==============================
// ✅ MENU HANDLER
// ==============================

function menuHandler(bot) {
  // ==============================
  // ✅ /batal global
  // ==============================

  bot.command("batal", async (ctx) => {
    clearUserSession(ctx.from.id);

    return ctx.reply(
      "❌ Input yang sedang berjalan sudah dibatalkan.",
      mainMenuKeyboard()
    );
  });

  bot.hears("❌ Batal", async (ctx) => {
    clearUserSession(ctx.from.id);

    return ctx.reply(
      "❌ Input yang sedang berjalan sudah dibatalkan.",
      mainMenuKeyboard()
    );
  });

  // ==============================
  // ✅ Pemasukan
  // ==============================

  bot.hears("➕ Pemasukan", async (ctx) => {
    const guarded = await guardActiveFlow(ctx);
    if (guarded) return;

    return ctx.reply(
      "➕ Pemasukan\n\nPilih Account keuangan:",
      Markup.inlineKeyboard([
        [Markup.button.callback("Oklin", "income_account:Oklin")],
        [Markup.button.callback("Mamah", "income_account:Mamah")],
        [Markup.button.callback("Isal", "income_account:Isal")],
        [Markup.button.callback("❌ Batal", "income_cancel")],
      ])
    );
  });

  // ==============================
  // ✅ Pengeluaran
  // ==============================

  bot.hears("➖ Pengeluaran", async (ctx) => {
    const guarded = await guardActiveFlow(ctx);
    if (guarded) return;

    return ctx.reply(
      "➖ Pengeluaran\n\nPilih Account keuangan:",
      Markup.inlineKeyboard([
        [Markup.button.callback("Oklin", "expense_account:Oklin")],
        [Markup.button.callback("Mamah", "expense_account:Mamah")],
        [Markup.button.callback("Isal", "expense_account:Isal")],
        [Markup.button.callback("❌ Batal", "expense_cancel")],
      ])
    );
  });

  // ==============================
  // ✅ Transfer
  // ==============================

  bot.hears("🔁 Transfer", async (ctx) => {
    const guarded = await guardActiveFlow(ctx);
    if (guarded) return;

    return ctx.reply(
      "🔁 Transfer Dompet\n\nPilih Account:",
      Markup.inlineKeyboard([
        [Markup.button.callback("Oklin", "transfer_account:Oklin")],
        [Markup.button.callback("Mamah", "transfer_account:Mamah")],
        [Markup.button.callback("Isal", "transfer_account:Isal")],
        [Markup.button.callback("❌ Batal", "transfer_cancel")],
      ])
    );
  });

  // ==============================
  // ✅ Rekap
  // ==============================

  bot.hears("📊 Rekap", async (ctx) => {
    const guarded = await guardActiveFlow(ctx);
    if (guarded) return;

    return ctx.reply(
      "📊 Pilih periode rekap:",
      buildRekapPeriodKeyboard()
    );
  });

  // ==============================
  // ✅ Saldo
  // ==============================

  bot.hears("💰 Saldo", async (ctx) => {
    const guarded = await guardActiveFlow(ctx);
    if (guarded) return;

    try {
      const message = await buildSaldoMessage();
      return ctx.reply(message);
    } catch (error) {
      console.error("Error menu saldo:", error);

      return ctx.reply(
        "⚠️ Gagal mengambil saldo.\nSilakan coba lagi beberapa saat."
      );
    }
  });

  // ==============================
  // ✅ Riwayat
  // ==============================

  bot.hears("📜 Riwayat", async (ctx) => {
    const guarded = await guardActiveFlow(ctx);
    if (guarded) return;

    try {
      const transactions = await getLastActiveTransactions(5);

      if (!transactions.length) {
        return ctx.reply("📭 Belum ada transaksi aktif di Google Sheet.");
      }

      return ctx.reply(formatLastTransactions(transactions));
    } catch (error) {
      console.error("Error menu riwayat:", error);

      return ctx.reply(
        "⚠️ Gagal mengambil riwayat transaksi.\nSilakan coba lagi beberapa saat."
      );
    }
  });

  // ==============================
  // ✅ Bantuan
  // ==============================

  bot.hears("❓ Bantuan", async (ctx) => {
    const guarded = await guardActiveFlow(ctx);
    if (guarded) return;

    return ctx.reply(
      `❓ Bantuan Bot Oklin\n\n` +
        `Menu utama tersedia di keyboard bawah.\n\n` +
        `Command:\n` +
        `/ping - cek status bot\n` +
        `/last - 5 transaksi terakhir\n` +
        `/saldo - saldo dompet\n` +
        `/rekap - rekap bulan ini\n` +
        `/batal - batalkan input berjalan\n\n` +
        `Format nominal:\n` +
        `- 20000\n` +
        `- 20k\n` +
        `- 100rb\n` +
        `- 100ribu\n` +
        `- 1,5jt\n` +
        `- 2juta`
    );
  });
}

module.exports = {
  menuHandler,
  mainMenuKeyboard,
};