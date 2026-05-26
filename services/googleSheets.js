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

async function getSheetRows(sheetName, range = "A:Z") {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEET_ID,
    range: `${sheetName}!${range}`,
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

async function getTransactionRows() {
  return getSheetRows("Transaksi", "A:Z");
}

async function getLastActiveTransactions(limit = 5) {
  const rows = await getTransactionRows();

  const activeRows = rows.filter((item) => {
    const status = (item["Status"] || "").toString().trim().toLowerCase();
    return status === "aktif";
  });

  return activeRows.slice(-limit).reverse();
}

async function getActiveWalletsByAccount(account) {
  const rows = await getSheetRows("Dompet", "A:G");

  return rows
    .filter((item) => {
      const itemAccount = (item["Account"] || "").toString().trim().toLowerCase();
      const status = (item["Status"] || "").toString().trim().toLowerCase();

      return itemAccount === account.toLowerCase() && status === "aktif";
    })
    .sort((a, b) => {
      const urutanA = Number(a["Urutan"] || 999);
      const urutanB = Number(b["Urutan"] || 999);
      return urutanA - urutanB;
    })
    .map((item) => item["Nama Dompet"]);
}

module.exports = {
  getLastActiveTransactions,
  getActiveWalletsByAccount,
};