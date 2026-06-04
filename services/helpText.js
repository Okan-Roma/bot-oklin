function buildHelpMessage() {
  return (
    `❓ Bantuan Bot Oklin\n\n` +

    `Bot ini digunakan untuk rekap keuangan pribadi/rumah tangga.\n\n` +

    `📌 Menu utama tersedia di keyboard bawah:\n` +
    `➕ Pemasukan - catat uang masuk\n` +
    `➖ Pengeluaran - catat uang keluar\n` +
    `🔁 Transfer - pindah saldo antar dompet\n` +
    `📊 Rekap - lihat ringkasan transaksi\n` +
    `💰 Saldo - lihat saldo dompet\n` +
    `📜 Riwayat - lihat riwayat transaksi\n` +
    `❌ Batal - batalkan input yang sedang berjalan\n\n` +

    `⌨️ Command yang tersedia:\n` +
    `/start - tampilkan menu utama\n` +
    `/help - bantuan penggunaan bot\n` +
    `/ping - cek status bot dan waktu WIB\n` +
    `/last - 5 transaksi terakhir\n` +
    `/riwayat - riwayat transaksi bulan ini\n` +
    `/saldo - saldo dompet\n` +
    `/rekap - rekap bulan ini\n` +
    `/batal - batalkan input berjalan\n` +
    `/ver - versi bot\n\n` +

    `💰 Format nominal yang didukung:\n` +
    `- 20000\n` +
    `- 20k\n` +
    `- 100rb\n` +
    `- 100ribu\n` +
    `- 1,5jt\n` +
    `- 2juta\n\n` +

    `📅 Format tanggal manual:\n` +
    `DD-MM-YYYY\n` +
    `Contoh: 27-05-2026\n\n` +

    `⚠️ Catatan:\n` +
    `Jika sedang mengisi transaksi, selesaikan dulu atau tekan ❌ Batal sebelum membuka menu lain.`
  );
}

module.exports = {
  buildHelpMessage,
};