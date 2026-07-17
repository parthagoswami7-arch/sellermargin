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
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
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

export const FILE_TYPE_ORDER = [
  "orders",
  "payment",
  "fba_returns",
  "easyship_returns",
  "fba_removal",
  "ad_spend",
];
