const { Markup } = require("telegraf");
const { getActiveWalletsByAccount } = require("../services/googleSheets");

// ==============================
// ✅ SESSION SEMENTARA
// ==============================

const incomeSessions = new Map();

// ==============================
// ✅ DATA MASTER
// ==============================

const ACCOUNTS = ["Oklin", "Mamah", "Isal"];

const INCOME_CATEGORIES = [
  "Gaji",
  "Bonus",
  "Komisi",
  "Penjualan",
  "Transfer Masuk",
  "Refund",
  "Lainnya",
];

// ==============================
// ✅ HELPER NOMINAL
// ==============================

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

function formatRupiah(value) {
  return "Rp " + Number(value || 0).toLocaleString("id-ID");
}

// ==============================
// ✅ HELPER TANGGAL WIB
// ==============================

function pad2(value) {
  return String(value).padStart(2, "0");
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

function formatDateToDDMMYYYY(date) {
  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
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

  const isValidDate =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  if (!isValidDate) {
    return null;
  }

  return date;
}

function validateTransactionDate(date) {
  const today = getTodayWIBDateOnly();

  if (date > today) {
    return {
      valid: false,
      message:
        "⚠️ Tanggal transaksi tidak boleh tanggal masa depan.\n\n" +
        "Silakan masukkan tanggal lagi dengan format DD-MM-YYYY.",
    };
  }

  const diffMs = today.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 30) {
    return {
      valid: false,
      message:
        "⚠️ Tanggal transaksi maksimal 30 hari ke belakang.\n\n" +
        "Silakan masukkan tanggal lagi dengan format DD-MM-YYYY.",
    };
  }

  return {
    valid: true,
  };
}

// ==============================
// ✅ HELPER SESSION & KEYBOARD
// ==============================

function getUserSessionKey(ctx) {
  return String(ctx.from.id);
}

function buildCategoryKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Gaji", "income_category:Gaji"),
      Markup.button.callback("Bonus", "income_category:Bonus"),
    ],
    [
      Markup.button.callback("Komisi", "income_category:Komisi"),
      Markup.button.callback("Penjualan", "income_category:Penjualan"),
    ],
    [
      Markup.button.callback("Transfer Masuk", "income_category:Transfer Masuk"),
    ],
    [
      Markup.button.callback("Refund", "income_category:Refund"),
      Markup.button.callback("Lainnya", "income_category:Lainnya"),
    ],
    [Markup.button.callback("❌ Batal", "income_cancel")],
  ]);
}

function buildWalletKeyboard(wallets) {
  const rows = [];

  for (let i = 0; i < wallets.length; i += 2) {
    const row = wallets.slice(i, i + 2).map((wallet) => {
      return Markup.button.callback(wallet, `income_wallet:${wallet}`);
    });

    rows.push(row);
  }

  rows.push([Markup.button.callback("❌ Batal", "income_cancel")]);

  return Markup.inlineKeyboard(rows);
}

function buildDateKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📅 Hari Ini", "income_date_today")],
    [Markup.button.callback("✏️ Input Tanggal Manual", "income_date_manual")],
    [Markup.button.callback("❌ Batal", "income_cancel")],
  ]);
}

function buildIncomeSummary(session) {
  return (
    `Ringkasan sementara:\n` +
    `Account  : ${session.account}\n` +
    `Nominal  : ${formatRupiah(session.nominal)}\n` +
    `Kategori : ${session.category}\n` +
    `Dompet   : ${session.wallet}\n` +
    `Tanggal  : ${session.transactionDate}`
  );
}

// ==============================
// ✅ HANDLER PEMASUKAN
// ==============================

module.exports = (bot) => {
  // ==============================
  // ✅ Klik tombol ➕ Pemasukan
  // ==============================

  bot.action("menu_income", async (ctx) => {
    await ctx.answerCbQuery();

    const buttons = ACCOUNTS.map((account) => [
      Markup.button.callback(account, `income_account:${account}`),
    ]);

    return ctx.reply(
      "➕ Pemasukan\n\nPilih Account keuangan:",
      Markup.inlineKeyboard([
        ...buttons,
        [Markup.button.callback("❌ Batal", "income_cancel")],
      ])
    );
  });

  // ==============================
  // ✅ Pilih Account
  // ==============================

  bot.action(/^income_account:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const account = ctx.match[1];
    const userKey = getUserSessionKey(ctx);

    incomeSessions.set(userKey, {
      flow: "income",
      step: "amount",
      account,
      sourceInput: "Menu",
    });

    return ctx.reply(
      `✅ Account dipilih: ${account}\n\n` +
        `Masukkan nominal pemasukan.\n\n` +
        `Contoh:\n` +
        `- 20000\n` +
        `- 20k\n` +
        `- 100rb\n` +
        `- 1,5jt`
    );
  });

  // ==============================
  // ✅ Pilih Kategori
  // ==============================

  bot.action(/^income_category:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const category = ctx.match[1];
    const userKey = getUserSessionKey(ctx);
    const session = incomeSessions.get(userKey);

    if (!session || session.flow !== "income") {
      return ctx.reply(
        "⚠️ Sesi pemasukan tidak ditemukan.\nSilakan mulai lagi dari menu ➕ Pemasukan."
      );
    }

    session.category = category;
    session.step = "wallet";

    incomeSessions.set(userKey, session);

    try {
      const wallets = await getActiveWalletsByAccount(session.account);

      if (!wallets.length) {
        return ctx.reply(
          `⚠️ Tidak ada dompet aktif untuk account ${session.account}.\n` +
            `Silakan cek tab Dompet di Google Sheet.`
        );
      }

      return ctx.reply(
        `✅ Kategori dipilih: ${category}\n\n` +
          `Pilih dompet tujuan untuk pemasukan:`,
        buildWalletKeyboard(wallets)
      );
    } catch (error) {
      console.error("Error ambil dompet:", error);

      return ctx.reply(
        "⚠️ Bot sedang kesulitan membaca daftar dompet.\nSilakan coba lagi beberapa detik."
      );
    }
  });

  // ==============================
  // ✅ Pilih Dompet Tujuan
  // ==============================

  bot.action(/^income_wallet:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const wallet = ctx.match[1];
    const userKey = getUserSessionKey(ctx);
    const session = incomeSessions.get(userKey);

    if (!session || session.flow !== "income") {
      return ctx.reply(
        "⚠️ Sesi pemasukan tidak ditemukan.\nSilakan mulai lagi dari menu ➕ Pemasukan."
      );
    }

    session.wallet = wallet;
    session.step = "date";

    incomeSessions.set(userKey, session);

    return ctx.reply(
      `✅ Dompet tujuan dipilih: ${wallet}\n\n` +
        `Pilih tanggal transaksi:`,
      buildDateKeyboard()
    );
  });

  // ==============================
  // ✅ Pilih Tanggal Hari Ini
  // ==============================

  bot.action("income_date_today", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = getUserSessionKey(ctx);
    const session = incomeSessions.get(userKey);

    if (!session || session.flow !== "income") {
      return ctx.reply(
        "⚠️ Sesi pemasukan tidak ditemukan.\nSilakan mulai lagi dari menu ➕ Pemasukan."
      );
    }

    const today = getTodayWIBDateOnly();

    session.transactionDate = formatDateToDDMMYYYY(today);
    session.step = "description";

    incomeSessions.set(userKey, session);

    return ctx.reply(
      `✅ Tanggal transaksi dipilih: ${session.transactionDate}\n\n` +
        `${buildIncomeSummary(session)}\n\n` +
        `Tahap berikutnya: input keterangan transaksi.\n\n` +
        `Untuk tahap ini flow berhenti dulu di sini.`
    );
  });

  // ==============================
  // ✅ Pilih Input Tanggal Manual
  // ==============================

  bot.action("income_date_manual", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = getUserSessionKey(ctx);
    const session = incomeSessions.get(userKey);

    if (!session || session.flow !== "income") {
      return ctx.reply(
        "⚠️ Sesi pemasukan tidak ditemukan.\nSilakan mulai lagi dari menu ➕ Pemasukan."
      );
    }

    session.step = "date_manual";
    incomeSessions.set(userKey, session);

    return ctx.reply(
      `✏️ Masukkan tanggal transaksi.\n\n` +
        `Format wajib:\n` +
        `DD-MM-YYYY\n\n` +
        `Contoh:\n` +
        `16-05-2026\n\n` +
        `Catatan:\n` +
        `- Tidak boleh tanggal masa depan\n` +
        `- Maksimal 30 hari ke belakang`
    );
  });

  // ==============================
  // ✅ Batal Pemasukan
  // ==============================

  bot.action("income_cancel", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = getUserSessionKey(ctx);
    incomeSessions.delete(userKey);

    return ctx.reply("❌ Input pemasukan dibatalkan.");
  });

  // ==============================
  // ✅ Tangkap Input Text
  // ==============================

  bot.on("text", async (ctx, next) => {
    const userKey = getUserSessionKey(ctx);
    const session = incomeSessions.get(userKey);

    if (!session || session.flow !== "income") {
      return next();
    }

    if (ctx.message.text.startsWith("/")) {
      return next();
    }

    // ==============================
    // ✅ Input Nominal
    // ==============================

    if (session.step === "amount") {
      const nominalInput = ctx.message.text;
      const nominal = parseNominal(nominalInput);

      if (!nominal) {
        return ctx.reply(
          "⚠️ Nominal belum dikenali.\n\n" +
            "Gunakan format:\n" +
            "- 20000\n" +
            "- 20k\n" +
            "- 100rb\n" +
            "- 5jt\n" +
            "- 1,5jt\n\n" +
            "Silakan masukkan nominal lagi."
        );
      }

      session.nominal = nominal;
      session.nominalInput = nominalInput;
      session.step = "category";

      incomeSessions.set(userKey, session);

      return ctx.reply(
        `✅ Nominal diterima: ${formatRupiah(nominal)}\n\n` +
          `Pilih kategori pemasukan:`,
        buildCategoryKeyboard()
      );
    }

    // ==============================
    // ✅ Input Tanggal Manual
    // ==============================

    if (session.step === "date_manual") {
      const dateInput = ctx.message.text;
      const parsedDate = parseManualDate(dateInput);

      if (!parsedDate) {
        return ctx.reply(
          "⚠️ Format tanggal belum dikenali.\n\n" +
            "Gunakan format:\n" +
            "DD-MM-YYYY\n\n" +
            "Contoh:\n" +
            "16-05-2026\n\n" +
            "Silakan masukkan tanggal lagi."
        );
      }

      const validation = validateTransactionDate(parsedDate);

      if (!validation.valid) {
        return ctx.reply(validation.message);
      }

      session.transactionDate = formatDateToDDMMYYYY(parsedDate);
      session.step = "description";

      incomeSessions.set(userKey, session);

      return ctx.reply(
        `✅ Tanggal transaksi diterima: ${session.transactionDate}\n\n` +
          `${buildIncomeSummary(session)}\n\n` +
          `Tahap berikutnya: input keterangan transaksi.\n\n` +
          `Untuk tahap ini flow berhenti dulu di sini.`
      );
    }

    return next();
  });
};