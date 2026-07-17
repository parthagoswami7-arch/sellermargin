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
export const FILE_TYPE_LINKS = {
  orders: {
    label: "Seller Central → Reports → Fulfillment → All Orders",
    url: "https://sellercentral.amazon.in/reportcentral/ORDER_REPORT/1",
    help: "Choose 'By Last Update' or 'By Order Date', pick your target month, download as .txt (tab-separated).",
  },
  payment: {
    label: "Payments → Reports Repository → Transaction",
    url: "https://sellercentral.amazon.in/payments/reports-repository",
    help: "Under 'Reports Repository', request a Transaction report for the target month, download as CSV.",
  },
  fba_returns: {
    label: "Reports → Fulfilment → FBA Customer Returns",
    url: "https://sellercentral.amazon.in/gp/ssof/reports/browse-reports.html?ie=UTF8&reportsGroupID=200989440",
    help: "Under FBA → 'Customer Concessions', request the FBA Customer Returns report, download as CSV.",
  },
  easyship_returns: {
    label: "Manage Returns (Easy Ship)",
    url: "https://sellercentral.amazon.in/orders-v3/mfn/returns",
    help: "Filter by month, click 'Export' → downloads a .tsv file.",
  },
  fba_removal: {
    label: "Reports → Fulfilment → FBA Removal Order Detail",
    url: "https://sellercentral.amazon.in/gp/ssof/reports/browse-reports.html?ie=UTF8&reportsGroupID=200989440",
    help: "Under FBA → 'Removals', request the Removal Order Detail report, download as CSV.",
  },
  ad_spend: {
    label: "Ads Console → Reports → Sponsored Products (Campaign)",
    url: "https://advertising.amazon.in/reports",
    help: "Create a Campaign report for the target month, download as CSV.",
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
