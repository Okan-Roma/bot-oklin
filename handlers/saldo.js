const {
  getAllTransactions,
  getActiveInitialBalances,
} = require("../services/googleSheets");

// ==============================
// ✅ HELPER
// ==============================

function parseSheetNumber(value) {
  if (value === undefined || value === null || value === "") {
    return 0;
  }

  // Aman untuk format:
  // 100000
  // 100.000
  // Rp 100.000
  return Number(String(value).replace(/[^\d-]/g, "")) || 0;
}

function formatRupiah(value) {
  return "Rp " + Number(value || 0).toLocaleString("id-ID");
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

// ==============================
// ✅ HANDLER SALDO
// ==============================

module.exports = (bot) => {
  bot.command("saldo", async (ctx) => {
    try {
      const saldoMap = {};

      // ==============================
      // ✅ 1. Ambil Saldo Awal
      // ==============================

      const initialBalances = await getActiveInitialBalances();

      initialBalances.forEach((item) => {
        const account = item["Account"] || "-";
        const wallet = item["Nama Dompet"] || "-";
        const saldoAwal = parseSheetNumber(item["Saldo Awal"]);

        addSaldo(saldoMap, account, wallet, saldoAwal);
      });

      // ==============================
      // ✅ 2. Ambil Transaksi Aktif
      // ==============================

      const rows = await getAllTransactions();

      rows.forEach((row) => {
        const account = row[6] || "-";
        const jenis = row[7] || "";
        const nominal = parseSheetNumber(row[8]);
        const sumber = row[11] || "";
        const tujuan = row[12] || "";
        const status = (row[19] || "").toString().trim().toLowerCase();

        // Rekap saldo hanya hitung transaksi Aktif
        if (status && status !== "aktif") {
          return;
        }

        // ======================
        // Pemasukan
        // ======================
        if (jenis === "Pemasukan" && tujuan) {
          addSaldo(saldoMap, account, tujuan, nominal);
        }

        // ======================
        // Pengeluaran
        // ======================
        if (jenis === "Pengeluaran" && sumber) {
          addSaldo(saldoMap, account, sumber, -nominal);
        }

        // ======================
        // Transfer
        // ======================
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
        return ctx.reply("⚠️ Belum ada saldo yang bisa dihitung.");
      }

      // ==============================
      // ✅ 3. Group by Account
      // ==============================

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

      return ctx.reply(message.trim());
    } catch (error) {
      console.error("Error /saldo:", error);

      return ctx.reply(
        "⚠️ Gagal mengambil saldo.\nSilakan coba lagi beberapa saat."
      );
    }
  });
};