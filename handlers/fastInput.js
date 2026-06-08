const { Markup } = require("telegraf");
const {
  getActiveWalletsByAccount,
  appendTransactionRow,
  generateNextTransactionId,
} = require("../services/googleSheets");

const {
  getBudgetWarningMessageForAccount,
} = require("../services/budgetChecker");

// ==============================
// ✅ SESSION FAST INPUT
// ==============================

const fastInputSessions = new Map();

// ==============================
// ✅ HELPERS FORMAT
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

function pad2(value) {
  return String(value).padStart(2, "0");
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

function getTodayDateWIB() {
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());

  const day = parts.find((p) => p.type === "day").value;
  const month = parts.find((p) => p.type === "month").value;
  const year = parts.find((p) => p.type === "year").value;

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

function formatDateToDDMMYYYY(date) {
  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
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

function validateTransactionDate(date) {
  const today = getTodayWIBDateOnly();

  if (date > today) {
    return {
      valid: false,
      message: "Tanggal transaksi tidak boleh tanggal masa depan.",
    };
  }

  const diffMs = today.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 30) {
    return {
      valid: false,
      message: "Tanggal transaksi maksimal 30 hari ke belakang.",
    };
  }

  return {
    valid: true,
  };
}

function parseOptionalFastDate(token) {
  if (!token) {
    return null;
  }

  const text = String(token).trim();

  // Format valid fast input: DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(text)) {
    const parsedDate = parseManualDate(text);

    if (!parsedDate) {
      throw new Error(
        "Tanggal tidak valid.\nGunakan format DD-MM-YYYY.\nContoh: 02-06-2026"
      );
    }

    const validation = validateTransactionDate(parsedDate);

    if (!validation.valid) {
      throw new Error(validation.message);
    }

    return formatDateToDDMMYYYY(parsedDate);
  }

  // Kalau user input format tanggal lain, kasih arahan
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(text) ||
    /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)
  ) {
    throw new Error(
      "Format tanggal belum didukung untuk fast input.\nGunakan DD-MM-YYYY.\nContoh: 02-06-2026"
    );
  }

  return null;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

// ==============================
// ✅ ACCOUNT ALIAS
// ==============================

function parseAccountAlias(token) {
  const text = normalizeText(token);

  if (["o", "ok", "oklin"].includes(text)) return "Oklin";
  if (["m", "mam", "mamah"].includes(text)) return "Mamah";
  if (["i", "isal"].includes(text)) return "Isal";

  return null;
}

// ==============================
// ✅ CATEGORY ALIAS
// ==============================

function parseIncomeCategory(token) {
  const text = normalizeText(token);

  const map = {
    gaji: "Gaji",
    payroll: "Gaji",
    salary: "Gaji",
    gajian: "Gaji",
    upah: "Gaji",

    bonus: "Bonus",
    thr: "Bonus",

    komisi: "Komisi",
    fee: "Komisi",
    closing: "Komisi",

    jual: "Penjualan",
    penjualan: "Penjualan",
    sales: "Penjualan",

    refund: "Refund",
    balik: "Refund",

    lainnya: "Lainnya",
    lain: "Lainnya",
  };

  return map[text] || capitalizeFirst(token);
}

function parseExpenseCategory(token) {
  const text = normalizeText(token);

  const map = {
    makan: "Makan",
    nasi: "Makan",
    jajan: "Makan",
    resto: "Makan",
    kopi: "Makan",

    transport: "Transport",
    bensin: "Transport",
    parkir: "Transport",
    grab: "Transport",
    gojek: "Transport",
    ongkos: "Transport",

    belanja: "Belanja",
    beli: "Belanja",
    shopping: "Belanja",

    tagihan: "Tagihan",
    listrik: "Tagihan",
    air: "Tagihan",
    internet: "Tagihan",
    wifi: "Tagihan",

    hiburan: "Hiburan",
    nonton: "Hiburan",

    kesehatan: "Kesehatan",
    obat: "Kesehatan",
    dokter: "Kesehatan",

    lainnya: "Lainnya",
    lain: "Lainnya",
  };

  return map[text] || capitalizeFirst(token);
}

function capitalizeFirst(value) {
  const text = String(value || "").trim();

  if (!text) return "-";

  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

// ==============================
// ✅ WALLET MATCH
// ==============================

async function matchWallet(account, inputWallet) {
  const wallets = await getActiveWalletsByAccount(account);
  const target = normalizeText(inputWallet);

  const found = wallets.find((wallet) => {
    return normalizeText(wallet) === target;
  });

  return found || null;
}

// ==============================
// ✅ PARSER
// ==============================

async function parseFastInput(text) {
  const raw = String(text || "").trim();

  if (!raw) return null;

  const tokens = raw.split(/\s+/);

  const command = normalizeText(tokens[0]);

  if (!["in", "out", "tf"].includes(command)) {
    return null;
  }

  let index = 1;
  let account = "Oklin";

  const maybeAccount = parseAccountAlias(tokens[index]);

  if (maybeAccount) {
    account = maybeAccount;
    index += 1;
  }

  // ==============================
  // ✅ TANGGAL MANUAL OPSIONAL
  // Format:
  // out 02-06-2026 100rb makan bni ket
  // out m 02-06-2026 100rb makan cash ket
  // ==============================

  let transactionDate = getTodayDateWIB();

  const maybeDate = parseOptionalFastDate(tokens[index]);

  if (maybeDate) {
    transactionDate = maybeDate;
    index += 1;
  }

  // ==============================
  // ✅ IN / OUT
  // ==============================

  if (command === "in" || command === "out") {
    const nominalInput = tokens[index];
    const categoryInput = tokens[index + 1];
    const walletInput = tokens[index + 2];

    if (!nominalInput || !categoryInput || !walletInput) {
      throw new Error(
        "Format belum lengkap.\n\nContoh:\nout 25k makan cash beli nasi\nin 3jt payroll bca gaji bulan mei"
      );
    }

    const nominal = parseNominal(nominalInput);

    if (!nominal) {
      throw new Error("Nominal tidak dikenali.");
    }

    const wallet = await matchWallet(account, walletInput);

    if (!wallet) {
      throw new Error(
        `Dompet "${walletInput}" tidak ditemukan untuk account ${account}.`
      );
    }

    const description = tokens.slice(index + 3).join(" ").trim() || "-";

    const jenis = command === "in" ? "Pemasukan" : "Pengeluaran";

    const category =
      command === "in"
        ? parseIncomeCategory(categoryInput)
        : parseExpenseCategory(categoryInput);

    return {
      source: "fast_input",
      account,
      jenis,
      nominal,
      nominalInput,
      category,
      wallet,
      description,
      transactionDate,
    };
  }

  // ==============================
  // ✅ TRANSFER
  // ==============================

  if (command === "tf") {
    const nominalInput = tokens[index];
    const sourceWalletInput = tokens[index + 1];
    const targetWalletInput = tokens[index + 2];

    if (!nominalInput || !sourceWalletInput || !targetWalletInput) {
      throw new Error(
        "Format transfer belum lengkap.\n\nContoh:\ntf 100k bca cash tarik tunai"
      );
    }

    const nominal = parseNominal(nominalInput);

    if (!nominal) {
      throw new Error("Nominal tidak dikenali.");
    }

    const sourceWallet = await matchWallet(account, sourceWalletInput);
    const targetWallet = await matchWallet(account, targetWalletInput);

    if (!sourceWallet) {
      throw new Error(
        `Dompet sumber "${sourceWalletInput}" tidak ditemukan untuk account ${account}.`
      );
    }

    if (!targetWallet) {
      throw new Error(
        `Dompet tujuan "${targetWalletInput}" tidak ditemukan untuk account ${account}.`
      );
    }

    if (sourceWallet === targetWallet) {
      throw new Error("Dompet sumber dan tujuan tidak boleh sama.");
    }

    const description = tokens.slice(index + 3).join(" ").trim() || "-";

    return {
      source: "fast_input",
      account,
      jenis: "Transfer",
      nominal,
      nominalInput,
      category: "Transfer",
      sourceWallet,
      targetWallet,
      description,
      transactionDate,
    };
  }

  return null;
}

// ==============================
// ✅ SUMMARY
// ==============================

function buildFastInputSummary(session) {
  if (session.jenis === "Transfer") {
    return (
      `⚡ Konfirmasi Fast Input\n\n` +
      `Jenis     : 🔁 Transfer\n` +
      `Account   : ${session.account}\n` +
      `Nominal   : ${formatRupiah(session.nominal)}\n` +
      `Dari      : ${session.sourceWallet}\n` +
      `Ke        : ${session.targetWallet}\n` +
      `Tanggal   : ${session.transactionDate}\n` +
      `Ket       : ${session.description}\n\n` +
      `Simpan transaksi ini?`
    );
  }

  const icon = session.jenis === "Pemasukan" ? "➕" : "➖";
  const dompetLabel = session.jenis === "Pemasukan" ? "Dompet Tujuan" : "Dompet Sumber";

  return (
    `⚡ Konfirmasi Fast Input\n\n` +
    `Jenis     : ${icon} ${session.jenis}\n` +
    `Account   : ${session.account}\n` +
    `Nominal   : ${formatRupiah(session.nominal)}\n` +
    `Kategori  : ${session.category}\n` +
    `${dompetLabel}: ${session.wallet}\n` +
    `Tanggal   : ${session.transactionDate}\n` +
    `Ket       : ${session.description}\n\n` +
    `Simpan transaksi ini?`
  );
}

function buildConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Simpan", "fast_save"),
      Markup.button.callback("❌ Batal", "fast_cancel"),
    ],
  ]);
}

// ==============================
// ✅ SAVE
// ==============================

async function saveFastInput(ctx, session) {
  const transactionId = await generateNextTransactionId();

  const timestampInput = getTimestampInputWIB();
  const tanggal = session.transactionDate;
  const waktu = getTimeWIB();

  const bulan = Number(tanggal.split("-")[1]);
  const tahun = Number(tanggal.split("-")[2]);

  let rowData;

  if (session.jenis === "Pemasukan") {
    rowData = [
      transactionId,
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
      "",
      session.wallet,
      "",
      "",
      session.description || "-",
      "",
      bulan,
      tahun,
      "Aktif",
      "",
      "",
      "",
      "Telegram Bot",
      "",
      "Input cepat via teks - Pemasukan",
    ];
  }

  if (session.jenis === "Pengeluaran") {
    rowData = [
      transactionId,
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
      session.wallet,
      "",
      "",
      "",
      session.description || "-",
      "",
      bulan,
      tahun,
      "Aktif",
      "",
      "",
      "",
      "Telegram Bot",
      "",
      "Input cepat via teks - Pengeluaran",
    ];
  }

  if (session.jenis === "Transfer") {
    rowData = [
      transactionId,
      timestampInput,
      tanggal,
      waktu,
      ctx.from.first_name || "User",
      ctx.from.id,
      session.account,
      "Transfer",
      session.nominal,
      session.nominalInput,
      "Transfer",
      session.sourceWallet,
      session.targetWallet,
      "",
      "",
      session.description || "-",
      "",
      bulan,
      tahun,
      "Aktif",
      "",
      "",
      "",
      "Telegram Bot",
      "",
      "Input cepat via teks - Transfer",
    ];
  }

  await appendTransactionRow(rowData);

  return transactionId;
}

// ==============================
// ✅ HANDLER
// ==============================

module.exports = (bot) => {
  bot.on("text", async (ctx, next) => {
    const text = ctx.message.text || "";

    if (text.startsWith("/")) {
      return next();
    }

    try {
      const parsed = await parseFastInput(text);

      if (!parsed) {
        return next();
      }

      const userKey = String(ctx.from.id);

      fastInputSessions.set(userKey, parsed);

      return ctx.reply(buildFastInputSummary(parsed), buildConfirmKeyboard());
    } catch (error) {
      return ctx.reply(
        `⚠️ Fast input belum bisa diproses.\n\n${error.message}\n\n` +
          `Contoh:\n` +
          `out 25k makan cash beli nasi\n` +
          `out 02-06-2026 25k makan cash beli nasi\n` +
          `in 3jt payroll bca gaji bulan mei\n` +
          `in 01-06-2026 3jt payroll bca gaji bulan mei\n` +
          `tf 100k bca cash tarik tunai\n\n` +
          `tf 03-06-2026 100k bca cash tarik tunai\n\n` +
          `Account opsional:\n` +
          `m = Mamah, i = Isal\n` +
          `Contoh: out m 50k makan cash belanja sayur`
          `Contoh: out m 02-06-2026 50k makan cash belanja sayur`
      );
    }
  });

  bot.action("fast_save", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = String(ctx.from.id);
    const session = fastInputSessions.get(userKey);

    if (!session) {
      return ctx.reply("⚠️ Sesi fast input tidak ditemukan.");
    }

    try {
      const transactionId = await saveFastInput(ctx, session);

      let budgetWarning = null;

      if (session.jenis === "Pengeluaran") {
        budgetWarning = await getBudgetWarningMessageForAccount(session.account);
      }

      fastInputSessions.delete(userKey);

      let message =
        `✅ Fast input berhasil disimpan.\n\n` +
        `ID: ${transactionId}\n` +
        `${session.jenis} ${formatRupiah(session.nominal)}`;

      if (budgetWarning) {
        message += `\n\n${budgetWarning}`;
      }

      return ctx.reply(message);

    } catch (error) {
      console.error("Error fast_save:", error);

      return ctx.reply(
        "⚠️ Gagal menyimpan fast input.\nSilakan coba lagi."
      );
    }
  });

  bot.action("fast_cancel", async (ctx) => {
    await ctx.answerCbQuery();

    const userKey = String(ctx.from.id);
    fastInputSessions.delete(userKey);

    return ctx.reply("❌ Fast input dibatalkan.");
  });
};