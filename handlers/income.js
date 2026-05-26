const { Markup } = require("telegraf");

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
// ✅ HELPER
// ==============================

function parseNominal(input) {
  if (!input) return null;

  let text = String(input)
    .trim()
    .toLowerCase()
    .replace(/\s/g, "");

  // ubah koma ke titik untuk desimal: 1,5jt => 1.5jt
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

  // hapus titik ribuan untuk angka biasa: 20.000 => 20000
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
    [
      Markup.button.callback("❌ Batal", "income_cancel"),
    ],
  ]);
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

    return ctx.reply(
      `✅ Kategori dipilih: ${category}\n\n` +
      `Ringkasan sementara:\n` +
      `Account  : ${session.account}\n` +
      `Nominal  : ${formatRupiah(session.nominal)}\n` +
      `Kategori : ${session.category}\n\n` +
      `Tahap berikutnya: pilih dompet tujuan.\n\n` +
      `Untuk tahap ini flow berhenti dulu di sini.`
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
  // ✅ Tangkap Input Text Nominal
  // ==============================

  bot.on("text", async (ctx, next) => {
    const userKey = getUserSessionKey(ctx);
    const session = incomeSessions.get(userKey);

    // Kalau user tidak sedang di flow pemasukan, lanjutkan ke handler lain
    if (!session || session.flow !== "income") {
      return next();
    }

    // Jika user mengetik command saat flow aktif
    if (ctx.message.text.startsWith("/")) {
      return next();
    }

    // Kalau sedang menunggu nominal
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

    return next();
  });
};