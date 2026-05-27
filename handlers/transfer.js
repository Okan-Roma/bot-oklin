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

  let text = String(input).trim().toLowerCase().replace(/\s/g, "");
  text = text.replace(",", ".");

  let multiplier = 1;

  if (text.endsWith("rb") || text.endsWith("k")) {
    multiplier = 1000;
    text = text.replace(/rb|k/, "");
  } else if (text.endsWith("jt")) {
    multiplier = 1000000;
    text = text.replace("jt", "");
  }

  const number = Number(text);

  if (!number || number <= 0) return null;

  return Math.round(number * multiplier);
}

function formatRupiah(value) {
  return "Rp " + Number(value).toLocaleString("id-ID");
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
    const session = transferSessions.get(String(ctx.from.id));

    const row = [
      "",
      new Date().toISOString(),
      "",
      "",
      ctx.from.first_name,
      ctx.from.id,
      session.account,
      "Transfer",
      session.nominal,
      session.nominal,
      "Transfer",
      session.sourceWallet,
      session.targetWallet,
      "",
      "",
      "",
      "",
      "",
      "",
      "Aktif",
    ];

    await appendTransactionRow(row);

    transferSessions.delete(String(ctx.from.id));

    return ctx.reply(
      `✅ Transfer berhasil\n\n${session.sourceWallet} ➜ ${session.targetWallet}\n${formatRupiah(session.nominal)}`
    );
  });

  // ==============================
  // ✅ CANCEL
  // ==============================

  bot.action("transfer_cancel", async (ctx) => {
    transferSessions.delete(String(ctx.from.id));
    return ctx.reply("❌ Transfer dibatalkan.");
  });

};