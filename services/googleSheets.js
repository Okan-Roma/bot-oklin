const { google } = require("googleapis");
const env = require("../config/env");

function getGoogleAuth() {
  if (!env.GOOGLE_CLIENT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
    throw new Error("Google credentials belum lengkap.");
  }

  return new google.auth.JWT({
    email: env.GOOGLE_CLIENT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

async function getSheetsClient() {
  if (!env.GOOGLE_SHEET_ID) {
    throw new Error("GOOGLE_SHEET_ID belum tersedia.");
  }

  const auth = getGoogleAuth();
  await auth.authorize();

  return google.sheets({
    version: "v4",
    auth,
  });
}

async function getTransactionRows() {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: "Transaksi!A:Z",
  });

  const values = response.data.values || [];

  if (values.length === 0) {
    return [];
  }

  const headers = values[0];
  const rows = values.slice(1);

  return rows.map((row) => {
    const item = {};

    headers.forEach((header, index) => {
      item[header] = row[index] || "";
    });

    return item;
  });
}

async function getLastActiveTransactions(limit = 5) {
  const rows = await getTransactionRows();

  const activeRows = rows.filter((item) => {
    const status = (item["Status"] || "").toString().trim().toLowerCase();
    return status === "aktif";
  });

  // Ambil 5 terakhir dari urutan sheet, lalu dibalik supaya paling baru tampil di atas
  return activeRows.slice(-limit).reverse();
}

module.exports = {
  getLastActiveTransactions,
};
