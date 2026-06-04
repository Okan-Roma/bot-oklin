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

const { buildHelpMessage } = require("../services/helpText");

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
// ✅ HELPERS UMUM
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
// ✅ SALDO HELPERS
// ==============================

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

// ==============================
// ✅ REKAP KEYBOARD
// ==============================

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

// ==============================
// ✅ RIWAYAT HELPERS
// ==============================

function getJenisIcon(jenis) {
  const text = String(jenis || "").toLowerCase();

  if (text.includes("pemasukan")) return "➕";
  if (text.includes("pengeluaran")) return "➖";
  if (text.includes("transfer")) return "🔁";

  return "•";
}

function getDompetText(jenis, sumber, tujuan) {
  const text = String(jenis || "").toLowerCase();

  if (text.includes("pemasukan")) {
    return tujuan || "-";
  }

  if (text.includes("pengeluaran")) {
    return sumber || "-";
  }

  if (text.includes("transfer")) {
    return `${sumber || "-"} → ${tujuan || "-"}`;
  }

  return "-";
}

function getCurrentMonthYearWIB() {
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());

  const month = Number(parts.find((p) => p.type === "month").value);
  const year = Number(parts.find((p) => p.type === "year").value);

  return { month, year };
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

function parseTransactionDate(dateText) {
  if (!dateText) return null;

  const text = String(dateText).trim();

  // Format baru: DD-MM-YYYY
  let match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (match) {
    return {
      day: Number(match[1]),
      month: Number(match[2]),
      year: Number(match[3]),
    };
  }

  // Format lama: YYYY-MM-DD
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    return {
      day: Number(match[3]),
      month: Number(match[2]),
      year: Number(match[1]),
    };
  }

  // Format Google Sheet: DD/MM/YYYY
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

function isThisMonth(dateText) {
  const parsedDate = parseTransactionDate(dateText);

  if (!parsedDate) {
    return false;
  }

  const { month, year } = getCurrentMonthYearWIB();

  return parsedDate.month === month && parsedDate.year === year;
}

function normalizeTransaction(row) {
  return {
    timestampInput: row[1] || "-",
    tanggal: row[2] || "-",
    waktu: row[3] || "-",
    userInput: row[4] || "-",
    account: row[6] || "-",
    jenis: row[7] || "-",
    nominal: parseSheetNumber(row[8]),
    nominalInput: row[9] || "-",
    kategori: row[10] || "-",
    dompetSumber: row[11] || "",
    dompetTujuan: row[12] || "",
    keterangan: row[15] || "-",
    status: (row[19] || "").toString().trim().toLowerCase(),
  };
}

function buildRiwayatMessage(transactions) {
  const { month, year } = getCurrentMonthYearWIB();

  if (!transactions.length) {
    return (
      `📜 Riwayat Transaksi\n\n` +
      `Periode : ${getMonthName(month)} ${year}\n\n` +
      `⚠️ Belum ada transaksi aktif pada bulan ini.`
    );
  }

  let message =
    `📜 Riwayat Transaksi\n\n` +
    `Periode : ${getMonthName(month)} ${year}\n` +
    `Jumlah  : ${transactions.length} transaksi terakhir\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n`;

  transactions.forEach((trx, index) => {
    const icon = getJenisIcon(trx.jenis);
    const dompetText = getDompetText(
      trx.jenis,
      trx.dompetSumber,
      trx.dompetTujuan
    );

    message +=
      `${index + 1}. ${icon} ${trx.jenis}\n` +
      `🏷 Account : ${trx.account}\n` +
      `💰 Nominal : ${formatRupiah(trx.nominal)}\n` +
      `📂 Kategori: ${trx.kategori}\n` +
      `🏦 Dompet  : ${dompetText}\n` +
      `📅 Tanggal : ${trx.tanggal}\n` +
      `📝 Ket     : ${trx.keterangan}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n`;
  });

  return message.trim();
}

async function buildRiwayatBulananMessage() {
  const rows = await getAllTransactions();

  if (!rows || !rows.length) {
    return "⚠️ Belum ada data transaksi.";
  }

  const transactions = rows
    .map(normalizeTransaction)
    .filter((trx) => {
      return trx.status === "aktif" && isThisMonth(trx.tanggal);
    })
    .slice(-10)
    .reverse();

  return buildRiwayatMessage(transactions);
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
      "📊 Pilih jenis rekap:",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("📊 Ringkasan", "menu_recap"),
          Markup.button.callback("📂 Kategori", "menu_category"),
        ],
        [Markup.button.callback("❌ Batal", "rekap_cancel")],
      ])
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

    return ctx.reply(
      "📜 Pilih periode riwayat:",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("📅 Hari Ini", "history_period:today"),
          Markup.button.callback("🗓 Minggu Ini", "history_period:week"),
        ],
        [Markup.button.callback("📆 Bulan Ini", "history_period:month")],
        [Markup.button.callback("❌ Batal", "history_cancel")],
      ])
    );
  });

  // ==============================
  // ✅ Bantuan
  // ==============================

  bot.hears("❓ Bantuan", async (ctx) => {
  const guarded = await guardActiveFlow(ctx);
  if (guarded) return;

  return ctx.reply(buildHelpMessage());
  });
}

module.exports = {
  menuHandler,
  mainMenuKeyboard,
};