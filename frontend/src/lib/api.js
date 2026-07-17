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
    screenshots: [
      { src: "/help/orders/step1.png", caption: "Step 1 — Open Fulfilment Reports and click 'All Orders' under Most Popular Reports." },
      { src: "/help/orders/step2.png", caption: "Step 2 — Under Event Date, choose 'Exact dates' from the dropdown." },
      { src: "/help/orders/step3.png", caption: "Step 3 — Pick your target month (e.g. 01/06/2026 → 30/06/2026), click Request Download, then Download once ready." },
    ],
  },
  payment: {
    label: "Payments → Reports Repository → Transaction",
    url: "https://sellercentral.amazon.in/payments/reports-repository",
    help: "Under 'Reports Repository', request a Transaction report and download as CSV.",
    range: "1.5 months",
    range_hint: "Include the target month PLUS the first 7 days of the next month (Amazon posts storage fees on the 7th).",
    screenshots: [
      { src: "/help/payment/step1.png", caption: "Step 1 — Open Reports Repository. Set Account Type = 'All (Unified Reports)', Report Type = 'Transaction', pick a Custom Date Range covering ~1.5 months, then click Request Report." },
      { src: "/help/payment/step2.png", caption: "Step 2 — Once the row shows Status = Ready in the Payments Reports table, click 'Download CSV' on that row." },
    ],
  },
  fba_returns: {
    label: "Reports → Fulfilment → FBA Customer Returns",
    url: "https://sellercentral.amazon.in/reportcentral/CUSTOMER_RETURNS/0",
    help: "Under FBA → 'Customer Concessions', request the FBA Customer Returns report as CSV.",
    range: "1.5 months",
    range_hint: "Cover the target month + 2 weeks after (some returns arrive late).",
    screenshots: [
      { src: "/help/fba_returns/step1.png", caption: "Step 1 — On the FBA Customer Returns page, click the 'Download' tab, then under Event Date pick 'Exact dates' from the dropdown." },
      { src: "/help/fba_returns/step2.png", caption: "Step 2 — Set a 1.5-month range (e.g. 01/06/2026 → 15/07/2026), click 'Request .csv Download', then click Download once Report Status = Ready." },
    ],
  },
  easyship_returns: {
    label: "Manage Returns (Easy Ship / Self Ship)",
    url: "https://sellercentral.amazon.in/returns/report",
    help: "Set the date range, click 'Request' → then download the TSV once ready.",
    range: "1.5 months",
    range_hint: "Cover the target month + 2 weeks after to catch late returns.",
    screenshots: [
      { src: "/help/easyship_returns/step1.png", caption: "Step 1 — On Return Reports, set the type to 'All Returns' and choose 'Exact dates' from the dropdown." },
      { src: "/help/easyship_returns/step2.png", caption: "Step 2 — Enter a 1.5-month From→To range (e.g. 06/01/2026 → 07/15/2026), click Request, then click Download under the TSV column once the row appears." },
    ],
  },
  fba_removal: {
    label: "Reports → Fulfilment → FBA Removal Order Detail",
    url: "https://sellercentral.amazon.in/reportcentral/REMOVAL_ORDER_DETAIL/1",
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
