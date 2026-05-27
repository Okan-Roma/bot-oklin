const { Markup } = require("telegraf");
const {
  getActiveWalletsByAccount,
  appendTransactionRow,
} = require("../services/googleSheets");

// ==============================
// ✅ SESSION
// ==============================

const transferSessions = new Map();

// ==============================
// ✅ DATA MASTER
// ==============================

const ACCOUNTS = ["Oklin", "Mamah", "Isal"];

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

  // kalau bukan format singkatan → hapus titik ribuan
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
  return "Rp " + Number(value).toLocaleString("id-ID");
}

// ==============================
// ✅ HELPER WIB
// ==============================

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

function formatDateToDDMMYYYY(date) {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

// ==============================
// ✅ KEYBOARD
// ==============================

function buildWalletKeyboard(wallets, type) {
  const rows = [];

  for (let i = 0; i < wallets.length; i += 2) {
    const row = wallets.slice(i, i + 2).map((w) =>
      Markup.button.callback(
        w,
        `${type}:${w}`
      )
    );
    rows.push(row);
  }

  rows.push([Markup.button.callback("❌ Batal", "transfer_cancel")]);

  return Markup.inlineKeyboard(rows);
}

// ==============================
// ✅ HANDLER
// ==============================

module.exports = (bot) => {

  // ==============================
  // ✅ MENU TRANSFER
  // ==============================

  bot.action("menu_transfer", async (ctx) => {
    await ctx.answerCbQuery();

    const buttons = ACCOUNTS.map((acc) => [
      Markup.button.callback(acc, `transfer_account:${acc}`),
    ]);

    return ctx.reply(
      "🔁 Transfer Dompet\n\nPilih Account:",
      Markup.inlineKeyboard([
        ...buttons,
        [Markup.button.callback("❌ Batal", "transfer_cancel")],
      ])
    );
  });

  // ==============================
  // ✅ PILIH ACCOUNT
  // ==============================

  bot.action(/^transfer_account:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const account = ctx.match[1];

    transferSessions.set(String(ctx.from.id), {
      flow: "transfer",
      step: "source",
      account,
    });

    const wallets = await getActiveWalletsByAccount(account);

    return ctx.reply(
      "Pilih dompet sumber:",
      buildWalletKeyboard(wallets, "transfer_source")
    );
  });

  // ==============================
  // ✅ PILIH SUMBER
  // ==============================

  bot.action(/^transfer_source:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = ctx.match[1];

    const session = transferSessions.get(String(ctx.from.id));
    session.sourceWallet = wallet;
    session.step = "target";

    const wallets = await getActiveWalletsByAccount(session.account);

    return ctx.reply(
      `Sumber: ${wallet}\n\nPilih dompet tujuan:`,
      buildWalletKeyboard(wallets, "transfer_target")
    );
  });

  // ==============================
  // ✅ PILIH TUJUAN
  // ==============================

  bot.action(/^transfer_target:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const wallet = ctx.match[1];

    const session = transferSessions.get(String(ctx.from.id));

    if (wallet === session.sourceWallet) {
      return ctx.reply("⚠️ Dompet tidak boleh sama");
    }

    session.targetWallet = wallet;
    session.step = "amount";

    return ctx.reply("Masukkan nominal transfer:");
  });

  // ==============================
  // ✅ INPUT NOMINAL
  // ==============================

  bot.on("text", async (ctx, next) => {
    const session = transferSessions.get(String(ctx.from.id));

    if (!session || session.flow !== "transfer") return next();

    if (session.step === "amount") {
      const nominal = parseNominal(ctx.message.text);

      if (!nominal) {
        return ctx.reply("⚠️ Nominal tidak valid.");
      }

      session.nominal = nominal;
      session.nominalInput = ctx.message.text;
      session.step = "confirm";


      return ctx.reply(
        `🔁 Transfer\n\n` +
        `${session.sourceWallet} ➜ ${session.targetWallet}\n` +
        `Nominal: ${formatRupiah(nominal)}\n\n` +
        `Simpan?`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ Simpan", "transfer_save"),
            Markup.button.callback("❌ Batal", "transfer_cancel"),
          ],
        ])
      );
    }

    return next();
  });

  // ==============================
  // ✅ SIMPAN
  // ==============================

bot.action("transfer_save", async (ctx) => {
  await ctx.answerCbQuery();

  const session = transferSessions.get(String(ctx.from.id));

  if (!session || session.flow !== "transfer" || session.step !== "confirm") {
    return ctx.reply(
      "⚠️ Sesi transfer tidak ditemukan.\nSilakan mulai lagi dari menu 🔁 Transfer Dompet."
    );
  }

  const timestampInput = getTimestampInputWIB();
  const waktu = getTimeWIB();
  const tanggal = formatDateToDDMMYYYY(new Date());

  const bulan = Number(tanggal.split("-")[1]);
  const tahun = Number(tanggal.split("-")[2]);

  const row = [
    "", // ID Transaksi
    timestampInput,
    tanggal,
    waktu,
    ctx.from.first_name || "User",
    ctx.from.id,
    session.account,
    "Transfer",
    session.nominal,
    session.nominalInput || session.nominal,
    "Transfer",
    session.sourceWallet,
    session.targetWallet,
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
    "Transfer antar dompet",
  ];

  await appendTransactionRow(row);

  transferSessions.delete(String(ctx.from.id));

  return ctx.reply(
    `✅ Transfer berhasil\n\n` +
      `${session.sourceWallet} ➜ ${session.targetWallet}\n` +
      `${formatRupiah(session.nominal)}`
  );
});

  // ==============================
  // ✅ CANCEL
  // ==============================

  bot.action("transfer_cancel", async (ctx) => {
    await ctx.answerCbQuery();
    transferSessions.delete(String(ctx.from.id));
    return ctx.reply("❌ Transfer dibatalkan.");
  });

};