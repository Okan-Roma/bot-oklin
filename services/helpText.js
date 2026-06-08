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
    `/detail T2 - detail transaksi berdasarkan ID\n` +
    `/edit T2 - edit transaksi berdasarkan ID\n` +
    `/hapus T2 - hapus transaksi berdasarkan ID\n` +
    `/restore T2 - aktifkan kembali transaksi yang dihapus\n` +
    `/riwayat - riwayat transaksi bulan ini\n` +
    `/saldo - saldo dompet\n` +
    `/rekap - rekap bulan ini\n` +
    `/kategori - rekap kategori bulan ini\n` +
    `/budget - laporan budget bulanan\n` +
    `/copybudget - copy budget bulan sebelumnya ke bulan ini\n` +
    `/copybudget next - copy budget bulan ini ke bulan depan\n` +
    `/editbudget B2 - edit limit/status/catatan budget\n` +
    `/budgetkategori - laporan budget per kategori bulan ini\n` +
    `/batal - batalkan input berjalan\n` +
    `/ver - versi bot\n\n` +

    `💰 Format nominal yang didukung:\n` +
    `- 20000\n` +
    `- 20k\n` +
    `- 100rb\n` +
    `- 100ribu\n` +
    `- 1,5jt\n` +
    `- 2juta\n\n` +

    `⚡ Fast input:\n` +
    `out 25k makan cash beli nasi\n` +
    `out 02-06-2026 25k makan cash beli nasi\n` +
    `in 3jt payroll bca gaji bulan mei\n` +
    `in 01-06-2026 3jt payroll bca gaji bulan juni\n` +
    `tf 100k bca cash tarik tunai\n` +
    `tf 03-06-2026 100k bca cash tarik tunai\n\n` +
    `Account opsional:\n` +
    `m = Mamah, i = Isal\n` +
    `Contoh:\n` +
    `out m 02-06-2026 50k makan cash belanja sayur\n\n` +

    `📅 Format tanggal manual:\n` +
    `DD-MM-YYYY\n` +
    `Contoh: 27-05-2026\n\n` +

    `Contoh detail transaksi:\n` +
    `/detail T2\n` +
    `/detail T-0002\n\n` +

    `Contoh edit transaksi:\n` +
    `/edit T2\n` +
    `/edit T-0002\n\n` +

    `Contoh hapus transaksi:\n` +
    `/hapus T2\n` +
    `/hapus T-0002\n\n` +

    `Contoh restore transaksi:\n` +
    `/restore T2\n` +
    `/restore T-0002\n\n` +

    `⚠️ Catatan:\n` +
    `Jika sedang mengisi transaksi, selesaikan dulu atau tekan ❌ Batal sebelum membuka menu lain.`
  );
}

module.exports = {
  buildHelpMessage,
};