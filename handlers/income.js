const { Markup } = require("telegraf");
const {
  getActiveWalletsByAccount,
  appendTransactionRow,
} = require("../services/googleSheets");

const {
  setActiveFlow,
  registerSessionClearer,
  clearUserSession,
} = require("../services/sessionManager")

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

function getTimestampInputWIB() {
  const now = new Date();

  const datePart = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
    .format(now)
    .replace(/\//g, "-");

  const timePart = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  return `${datePart} ${timePart}`;
}

function getTimeWIB() {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
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

function buildConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Simpan", "income_save"),
      Markup.button.callback("✏️ Edit Ulang", "income_edit_restart"),
    ],
    [Markup.button.callback("❌ Batal", "income_cancel")],
  ]);
}

// ==============================
// ✅ HELPER SUMMARY
// ==============================

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

function buildDescriptionPrompt(session) {
  return (
    `✅ Tanggal transaksi diterima: ${session.transactionDate}\n\n` +
    `${buildIncomeSummary(session)}\n\n` +
    `Masukkan keterangan transaksi.\n\n` +
    `Contoh:\n` +
    `Gaji bulan Mei\n\n` +
    `Jika tidak ada keterangan, ketik:\n` +
    `-`
  );
}

function buildFinalIncomeSummary(session) {
  return (
    `🧾 Konfirmasi Pemasukan\n\n` +
    `Account    : ${session.account}\n` +
    `Jenis      : Pemasukan\n` +
    `Nominal    : ${formatRupiah(session.nominal)}\n` +
    `Kategori   : ${session.category}\n` +
    `Dompet     : ${session.wallet}\n` +
    `Tanggal    : ${session.transactionDate}\n` +
    `Keterangan : ${session.description || "-"}\n\n` +
    `Apakah data sudah benar?`
  );
}

// ==============================
// ✅ HANDLER PEMASUKAN
// ==============================

module.exports = (bot) => {
  registerSessionClearer("income", (userId) => {
    incomeSessions.delete(String(userId));
  });

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
    
    setActiveFlow(ctx.from.id, "income");

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
        `Masukkan keterangan transaksi.\n\n` +
        `Contoh:\n` +
        `Gaji bulan Mei\n\n` +
        `Jika tidak ada keterangan, ketik:\n` +
        `-`
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
  // ✅ Konfirmasi Simpan
  // ==============================

  bot.action("income_save", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = getUserSessionKey(ctx);
    const session = incomeSessions.get(userKey);

    if (!session || session.flow !== "income" || session.step !== "confirm") {
      return ctx.reply(
        "⚠️ Sesi konfirmasi pemasukan tidak ditemukan.\nSilakan mulai lagi dari menu ➕ Pemasukan."
      );
    }

    try {
      const timestampInput = getTimestampInputWIB();
      const tanggal = session.transactionDate;
      const waktu = getTimeWIB();

      const bulan = Number(tanggal.split("-")[1]);
      const tahun = Number(tanggal.split("-")[2]);

      const rowData = [
        "", // ID Transaksi
        timestampInput,
        tanggal,
        waktu,
        ctx.from.first_name || "User",
        ctx.from.id,
        session.account,
        "Pemasukan",
        session.nominal,
        session.nominalInput,
        session.category,
        "", // Dompet Sumber
        session.wallet,
        "", // Biaya Admin
        "", // Dompet Biaya Admin
        session.description || "-",
        "", // Periode Minggu
        bulan,
        tahun,
        "Aktif",
        "", // Referensi ID
        "", // Referensi Tagihan
        "", // Periode Tagihan
        "Telegram Bot",
        "", // Link Bukti
        "Input manual via bot",
      ];

      await appendTransactionRow(rowData);

      clearUserSession(ctx.from.id);

      return ctx.reply(
        "✅ Pemasukan berhasil disimpan ke Google Sheet.\n\n" +
          `💰 ${formatRupiah(session.nominal)} masuk ke ${session.wallet}`
      );
    } catch (error) {
      console.error("Error simpan transaksi:", error);

      return ctx.reply(
        "⚠️ Gagal menyimpan transaksi ke Google Sheet.\nSilakan coba lagi."
      );
    }
  });

  // ==============================
  // ✅ Edit Ulang
  // ==============================

  bot.action("income_edit_restart", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = getUserSessionKey(ctx);
    clearUserSession(ctx.from.id);

    return ctx.reply(
      "✏️ Input pemasukan diulang.\n\n" +
        "Silakan mulai lagi dari menu ➕ Pemasukan."
    );
  });

  // ==============================
  // ✅ Batal Pemasukan
  // ==============================

  bot.action("income_cancel", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = getUserSessionKey(ctx);
    clearUserSession(ctx.from.id);

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

      return ctx.reply(buildDescriptionPrompt(session));
    }

    // ==============================
    // ✅ Input Keterangan
    // ==============================

    if (session.step === "description") {
      const descriptionInput = ctx.message.text.trim();

      session.description = descriptionInput || "-";
      session.step = "confirm";

      incomeSessions.set(userKey, session);

      return ctx.reply(
        buildFinalIncomeSummary(session),
        buildConfirmKeyboard()
      );
    }

    return next();
  });
};