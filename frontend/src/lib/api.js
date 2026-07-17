import axios from "axios";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND}/api`;

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

export default api;

export const money = (v, currency = "₹") => {
  if (v === null || v === undefined || v === "") return "—";
  let n = Number(v);
  if (Number.isNaN(n)) return "—";
  if (Object.is(n, -0) || (n > -0.005 && n < 0.005)) n = 0;
  return `${currency} ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const monthName = (m) =>
  ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][(m || 1) - 1];

export const FILE_TYPE_LABELS = {
  orders: "All Orders (.txt)",
  payment: "Settlement / Payment (.csv)",
  fba_returns: "FBA Customer Returns (.csv)",
  easyship_returns: "Easy Ship Returns (.tsv)",
  fba_removal: "FBA Removal Order (.csv)",
  ad_spend: "Sponsored Products Ads (.csv)",
};

// Direct download links inside Seller Central (India marketplace).
// Users can change region by swapping .in with .com / .co.uk etc.
// `screenshot` is a static asset in /public/help/<ftype>.png (drop in real captures anytime).
export const FILE_TYPE_LINKS = {
  orders: {
    label: "Seller Central → Reports → Fulfillment → All Orders",
    url: "https://sellercentral.amazon.in/reportcentral/ORDER_REPORT/1",
    help: "Choose 'By Last Update' or 'By Order Date', pick your target month, download as .txt (tab-separated).",
    range: "1 month",
    range_hint: "Set the date range to the full target month (1st → last day).",
    screenshot: "/help/orders.png",
  },
  payment: {
    label: "Payments → Reports Repository → Transaction",
    url: "https://sellercentral.amazon.in/payments/reports-repository",
    help: "Under 'Reports Repository', request a Transaction report and download as CSV.",
    range: "1.5 months",
    range_hint: "Include the target month PLUS the first 7 days of the next month (Amazon posts storage fees on the 7th).",
    screenshot: "/help/payment.png",
  },
  fba_returns: {
    label: "Reports → Fulfilment → FBA Customer Returns",
    url: "https://sellercentral.amazon.in/gp/ssof/reports/browse-reports.html?ie=UTF8&reportsGroupID=200989440",
    help: "Under FBA → 'Customer Concessions', request the FBA Customer Returns report as CSV.",
    range: "1.5 months",
    range_hint: "Cover the target month + 2 weeks after (some returns arrive late).",
    screenshot: "/help/fba_returns.png",
  },
  easyship_returns: {
    label: "Manage Returns (Easy Ship / Self Ship)",
    url: "https://sellercentral.amazon.in/returns/report",
    help: "Set the date range, click 'Download report' → saves a .tsv file.",
    range: "1.5 months",
    range_hint: "Cover the target month + 2 weeks after to catch late returns.",
    screenshot: "/help/easyship_returns.png",
  },
  fba_removal: {
    label: "Reports → Fulfilment → FBA Removal Order Detail",
    url: "https://sellercentral.amazon.in/gp/ssof/reports/browse-reports.html?ie=UTF8&reportsGroupID=200989440",
    help: "Under FBA → 'Removals', request the Removal Order Detail report as CSV.",
    range: "1 month",
    range_hint: "Just the target month is enough.",
    screenshot: "/help/fba_removal.png",
  },
  ad_spend: {
    label: "Ads Console → Reports → Sponsored Products (Campaign)",
    url: "https://advertising.amazon.in/reports",
    help: "Create a Campaign report and download as CSV.",
    range: "1 month",
    range_hint: "Set report date range to the full target month.",
    screenshot: "/help/ad_spend.png",
  },
};

export const FILE_TYPE_ORDER = [
  "orders",
  "payment",
  "fba_returns",
  "easyship_returns",
  "fba_removal",
  "ad_spend",
];
