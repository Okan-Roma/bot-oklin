const { Markup } = require("telegraf");
const {
  getActiveWalletsByAccount,
  appendTransactionRow,
} = require("../services/googleSheets");

// ==============================
// ✅ SESSION SEMENTARA
// ==============================

const expenseSessions = new Map();

// ==============================
// ✅ DATA MASTER
// ==============================

const ACCOUNTS = ["Oklin", "Mamah", "Isal"];

const EXPENSE_CATEGORIES = [
  "Makan",
  "Transport",
  "Belanja",
  "Tagihan",
  "Hiburan",
  "Kesehatan",
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

function buildExpenseCategoryKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("Makan", "expense_category:Makan"),
      Markup.button.callback("Transport", "expense_category:Transport"),
    ],
    [
      Markup.button.callback("Belanja", "expense_category:Belanja"),
      Markup.button.callback("Tagihan", "expense_category:Tagihan"),
    ],
    [
      Markup.button.callback("Hiburan", "expense_category:Hiburan"),
      Markup.button.callback("Kesehatan", "expense_category:Kesehatan"),
    ],
    [
      Markup.button.callback("Lainnya", "expense_category:Lainnya"),
    ],
    [Markup.button.callback("❌ Batal", "expense_cancel")],
  ]);
}

function buildWalletKeyboard(wallets) {
  const rows = [];

  for (let i = 0; i < wallets.length; i += 2) {
    const row = wallets.slice(i, i + 2).map((wallet) => {
      return Markup.button.callback(wallet, `expense_wallet:${wallet}`);
    });

    rows.push(row);
  }

  rows.push([Markup.button.callback("❌ Batal", "expense_cancel")]);

  return Markup.inlineKeyboard(rows);
}

function buildDateKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📅 Hari Ini", "expense_date_today")],
    [Markup.button.callback("✏️ Input Tanggal Manual", "expense_date_manual")],
    [Markup.button.callback("❌ Batal", "expense_cancel")],
  ]);
}

function buildConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Simpan", "expense_save"),
      Markup.button.callback("✏️ Edit Ulang", "expense_edit_restart"),
    ],
    [Markup.button.callback("❌ Batal", "expense_cancel")],
  ]);
}

// ==============================
// ✅ HELPER SUMMARY
// ==============================

function buildExpenseSummary(session) {
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
    `${buildExpenseSummary(session)}\n\n` +
    `Masukkan keterangan transaksi.\n\n` +
    `Contoh:\n` +
    `Makan siang\n\n` +
    `Bayar listrik\n\n` +
    `Beli bensin\n\n` +
    `Jika tidak ada keterangan, ketik:\n` +
    `-`
  );
}

function buildFinalExpenseSummary(session) {
  return (
    `🧾 Konfirmasi Pengeluaran\n\n` +
    `Account    : ${session.account}\n` +
    `Jenis      : Pengeluaran\n` +
    `Nominal    : ${formatRupiah(session.nominal)}\n` +
    `Kategori   : ${session.category}\n` +
    `Dompet     : ${session.wallet}\n` +
    `Tanggal    : ${session.transactionDate}\n` +
    `Keterangan : ${session.description || "-"}\n\n` +
    `Apakah data sudah benar?`
  );
}

// ==============================
// ✅ HANDLER Pengeluaran
// ==============================

module.exports = (bot) => {
  // ==============================
  // ✅ Klik tombol ➕ Pengeluaran
  // ==============================

  bot.action("menu_expense", async (ctx) => {
    await ctx.answerCbQuery();

    const buttons = ACCOUNTS.map((account) => [
      Markup.button.callback(account, `expense_account:${account}`),
    ]);

    return ctx.reply(
      "➖ Pengeluaran\n\nPilih Account keuangan:",
      Markup.inlineKeyboard([
        ...buttons,
        [Markup.button.callback("❌ Batal", "expense_cancel")],
      ])
    );
  });

  // ==============================
  // ✅ Pilih Account
  // ==============================

  bot.action(/^expense_account:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const account = ctx.match[1];
    const userKey = getUserSessionKey(ctx);

    expenseSessions.set(userKey, {
      flow: "expense",
      step: "amount",
      account,
      sourceInput: "Menu",
    });

    return ctx.reply(
      `✅ Account dipilih: ${account}\n\n` +
        `Masukkan nominal pengeluaran.\n\n` +
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

  bot.action(/^expense_category:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const category = ctx.match[1];
    const userKey = getUserSessionKey(ctx);
    const session = expenseSessions.get(userKey);

    if (!session || session.flow !== "expense") {
      return ctx.reply(
        "⚠️ Sesi Pengeluaran tidak ditemukan.\nSilakan mulai lagi dari menu ➕ Pengeluaran."
      );
    }

    session.category = category;
    session.step = "wallet";

    expenseSessions.set(userKey, session);

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
          `Pilih sumber dompet untuk Pengeluaran:`,
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

  bot.action(/^expense_wallet:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const wallet = ctx.match[1];
    const userKey = getUserSessionKey(ctx);
    const session = expenseSessions.get(userKey);

    if (!session || session.flow !== "expense") {
      return ctx.reply(
        "⚠️ Sesi Pengeluaran tidak ditemukan.\nSilakan mulai lagi dari menu ➕ Pengeluaran."
      );
    }

    session.wallet = wallet;
    session.step = "date";

    expenseSessions.set(userKey, session);

    return ctx.reply(
      `✅ Dompet sumber dipilih: ${wallet}\n\n` +
        `Pilih tanggal transaksi:`,
      buildDateKeyboard()
    );
  });

  // ==============================
  // ✅ Pilih Tanggal Hari Ini
  // ==============================

  bot.action("expense_date_today", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = getUserSessionKey(ctx);
    const session = expenseSessions.get(userKey);

    if (!session || session.flow !== "expense") {
      return ctx.reply(
        "⚠️ Sesi Pengeluaran tidak ditemukan.\nSilakan mulai lagi dari menu ➕ Pengeluaran."
      );
    }

    const today = getTodayWIBDateOnly();

    session.transactionDate = formatDateToDDMMYYYY(today);
    session.step = "description";

    expenseSessions.set(userKey, session);

    return ctx.reply(
      `✅ Tanggal transaksi dipilih: ${session.transactionDate}\n\n` +
        `${buildExpenseSummary(session)}\n\n` +
        `Masukkan keterangan transaksi.\n\n` +
        `Contoh:\n` +
        `Makan siang\n\n` +
        `Bayar listrik\n\n` +
        `Beli bensin\n\n` +
        `Jika tidak ada keterangan, ketik:\n` +
        `-`
    );
  });

  // ==============================
  // ✅ Pilih Input Tanggal Manual
  // ==============================

  bot.action("expense_date_manual", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = getUserSessionKey(ctx);
    const session = expenseSessions.get(userKey);

    if (!session || session.flow !== "expense") {
      return ctx.reply(
        "⚠️ Sesi Pengeluaran tidak ditemukan.\nSilakan mulai lagi dari menu ➕ Pengeluaran."
      );
    }

    session.step = "date_manual";
    expenseSessions.set(userKey, session);

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

  bot.action("expense_save", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = getUserSessionKey(ctx);
    const session = expenseSessions.get(userKey);

    if (!session || session.flow !== "expense" || session.step !== "confirm") {
      return ctx.reply(
        "⚠️ Sesi konfirmasi Pengeluaran tidak ditemukan.\nSilakan mulai lagi dari menu ➕ Pengeluaran."
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
        "Pengeluaran",
        session.nominal,
        session.nominalInput,
        session.category,
        session.wallet, // Dompet Sumber
        "", // Dompet Tujuan
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

      expenseSessions.delete(userKey);

      return ctx.reply(
        "✅ Pengeluaran berhasil disimpan ke Google Sheet.\n\n" +
          `💰 ${formatRupiah(session.nominal)} keluar dari ${session.wallet}`
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

  bot.action("expense_edit_restart", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = getUserSessionKey(ctx);
    expenseSessions.delete(userKey);

    return ctx.reply(
      "✏️ Input Pengeluaran diulang.\n\n" +
        "Silakan mulai lagi dari menu ➕ Pengeluaran."
    );
  });

  // ==============================
  // ✅ Batal Pengeluaran
  // ==============================

  bot.action("expense_cancel", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = getUserSessionKey(ctx);
    expenseSessions.delete(userKey);

    return ctx.reply("❌ Input Pengeluaran dibatalkan.");
  });

  // ==============================
  // ✅ Tangkap Input Text
  // ==============================

  bot.on("text", async (ctx, next) => {
    const userKey = getUserSessionKey(ctx);
    const session = expenseSessions.get(userKey);

    if (!session || session.flow !== "expense") {
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

      expenseSessions.set(userKey, session);

      return ctx.reply(
        `✅ Nominal diterima: ${formatRupiah(nominal)}\n\n` +
          `Pilih kategori pengeluaran:`,
        buildExpenseCategoryKeyboard()
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

      expenseSessions.set(userKey, session);

      return ctx.reply(buildDescriptionPrompt(session));
    }

    // ==============================
    // ✅ Input Keterangan
    // ==============================

    if (session.step === "description") {
      const descriptionInput = ctx.message.text.trim();

      session.description = descriptionInput || "-";
      session.step = "confirm";

      expenseSessions.set(userKey, session);

      return ctx.reply(
        buildFinalExpenseSummary(session),
        buildConfirmKeyboard()
      );
    }

    return next();
  });
};