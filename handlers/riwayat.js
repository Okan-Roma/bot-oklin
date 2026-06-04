const { Markup } = require("telegraf");
const { getAllTransactions } = require("../services/googleSheets");

// ==============================
// ✅ HELPER FORMAT
// ==============================

function parseSheetNumber(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  return Number(String(value).replace(/[^\d-]/g, "")) || 0;
}

function formatRupiah(value) {
  return "Rp " + Number(value || 0).toLocaleString("id-ID");
}

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

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateShort(dateText) {
  if (!dateText) return "-";

  const text = String(dateText).trim();

  // DD-MM-YYYY
  let match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (match) {
    return `${match[1]}/${match[2]}`;
  }

  // YYYY-MM-DD
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    return `${match[3]}/${match[2]}`;
  }

  // DD/MM/YYYY
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (match) {
    return `${pad2(match[1])}/${pad2(match[2])}`;
  }

  return text;
}

function formatDateToDDMMYYYY(date) {
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`;
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

// ==============================
// ✅ HELPER DATE WIB
// ==============================

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

function getCurrentMonthYearWIB() {
  const today = getTodayWIBDateOnly();

  return {
    month: today.getMonth() + 1,
    year: today.getFullYear(),
  };
}

function getWeekRangeWIB() {
  const today = getTodayWIBDateOnly();

  // Minggu di JS = 0, Senin = 1
  // Kita pakai Senin - Minggu
  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const start = new Date(today);
  start.setDate(today.getDate() + diffToMonday);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return { start, end };
}

function parseTransactionDate(dateText) {
  if (!dateText) return null;

  const text = String(dateText).trim();

  // DD-MM-YYYY
  let match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (match) {
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }

  // YYYY-MM-DD
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  // DD/MM/YYYY
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (match) {
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }

  return null;
}

function isDateInPeriod(date, period) {
  if (!date) return false;

  const today = getTodayWIBDateOnly();

  if (period === "today") {
    return date.getTime() === today.getTime();
  }

  if (period === "week") {
    const { start, end } = getWeekRangeWIB();
    return date >= start && date <= end;
  }

  if (period === "month") {
    const { month, year } = getCurrentMonthYearWIB();

    return date.getMonth() + 1 === month && date.getFullYear() === year;
  }

  return false;
}

function getPeriodTitle(period) {
  const today = getTodayWIBDateOnly();

  if (period === "today") {
    return `Hari Ini (${formatDateToDDMMYYYY(today)})`;
  }

  if (period === "week") {
    const { start, end } = getWeekRangeWIB();

    return `Minggu Ini (${formatDateToDDMMYYYY(start)} s/d ${formatDateToDDMMYYYY(end)})`;
  }

  if (period === "month") {
    const { month, year } = getCurrentMonthYearWIB();

    return `${getMonthName(month)} ${year}`;
  }

  return "-";
}

// ==============================
// ✅ KEYBOARD
// ==============================

function buildRiwayatPeriodKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📅 Hari Ini", "history_period:today"),
      Markup.button.callback("🗓 Minggu Ini", "history_period:week"),
    ],
    [Markup.button.callback("📆 Bulan Ini", "history_period:month")],
    [Markup.button.callback("❌ Batal", "history_cancel")],
  ]);
}

function buildRiwayatAccountKeyboard(period) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Semua Account", `history_account:${period}:ALL`)],
    [
      Markup.button.callback("Oklin", `history_account:${period}:Oklin`),
      Markup.button.callback("Mamah", `history_account:${period}:Mamah`),
    ],
    [Markup.button.callback("Isal", `history_account:${period}:Isal`)],
    [
      Markup.button.callback("⬅️ Kembali", "menu_history"),
      Markup.button.callback("❌ Batal", "history_cancel"),
    ],
  ]);
}

// ==============================
// ✅ NORMALIZE DATA
// ==============================

function normalizeTransaction(row) {
  return {
    id: row[0] || "-",
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

// ==============================
// ✅ BUILD MESSAGE
// ==============================

function buildCompactLine(trx, index) {
  const id = trx.id || "-";
  const tanggal = formatDateShort(trx.tanggal);
  const icon = getJenisIcon(trx.jenis);
  const nominal = formatRupiah(trx.nominal);
  const dompetText = getDompetText(trx.jenis, trx.dompetSumber, trx.dompetTujuan);

  if (String(trx.jenis).toLowerCase().includes("transfer")) {
    return `${index + 1}. ${id} | ${tanggal} | ${icon} ${nominal} | ${dompetText}`;
  }

  return `${index + 1}. ${id} | ${tanggal} | ${icon} ${nominal} | ${trx.kategori} | ${dompetText}`;
}

function buildRiwayatMessage(transactions, period, selectedAccount) {
  const accountText = selectedAccount === "ALL" ? "Semua Account" : selectedAccount;

  if (!transactions.length) {
    return (
      `📜 Riwayat Transaksi\n\n` +
      `Periode : ${getPeriodTitle(period)}\n` +
      `Account : ${accountText}\n\n` +
      `⚠️ Belum ada transaksi aktif pada periode ini.`
    );
  }

  let message =
    `📜 Riwayat Transaksi\n\n` +
    `Periode : ${getPeriodTitle(period)}\n` +
    `Account : ${accountText}\n` +
    `Jumlah  : ${transactions.length} transaksi terakhir\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n`;

  transactions.forEach((trx, index) => {
    message += buildCompactLine(trx, index) + "\n";
  });

  message += `\nDetail:\nKetik /detail T2`;

  return message.trim();
}

async function buildRiwayatFilteredMessage(period = "month", selectedAccount = "ALL") {
  const rows = await getAllTransactions();

  if (!rows || !rows.length) {
    return "⚠️ Belum ada data transaksi.";
  }

  const transactions = rows
    .map(normalizeTransaction)
    .filter((trx) => {
      if (trx.status !== "aktif") {
        return false;
      }

      if (selectedAccount !== "ALL" && trx.account !== selectedAccount) {
        return false;
      }

      const parsedDate = parseTransactionDate(trx.tanggal);

      return isDateInPeriod(parsedDate, period);
    })
    .slice(-10)
    .reverse();

  return buildRiwayatMessage(transactions, period, selectedAccount);
}

// ==============================
// ✅ HANDLER
// ==============================

module.exports = (bot) => {
  // /riwayat = Bulan Ini + Semua Account
  bot.command("riwayat", async (ctx) => {
    try {
      const message = await buildRiwayatFilteredMessage("month", "ALL");
      return ctx.reply(message);
    } catch (error) {
      console.error("Error /riwayat:", error);

      return ctx.reply(
        "⚠️ Gagal mengambil riwayat transaksi.\nSilakan coba lagi beberapa saat."
      );
    }
  });

  // Inline menu_history
  bot.action("menu_history", async (ctx) => {
    await ctx.answerCbQuery();

    return ctx.reply("📜 Pilih periode riwayat:", buildRiwayatPeriodKeyboard());
  });

  // Pilih periode
  bot.action(/^history_period:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const period = ctx.match[1];

    return ctx.reply("Pilih account:", buildRiwayatAccountKeyboard(period));
  });

  // Pilih account
  bot.action(/^history_account:(.+):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const period = ctx.match[1];
    const account = ctx.match[2];

    try {
      const message = await buildRiwayatFilteredMessage(period, account);
      return ctx.reply(message);
    } catch (error) {
      console.error("Error history_account:", error);

      return ctx.reply(
        "⚠️ Gagal mengambil riwayat transaksi.\nSilakan coba lagi beberapa saat."
      );
    }
  });

  bot.action("history_cancel", async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply("❌ Riwayat dibatalkan.");
  });
};