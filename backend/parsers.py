"""File auto-detection and parsing for the 5 Amazon reports."""
from __future__ import annotations
import io
import re
import pandas as pd
from typing import Tuple

FILE_TYPES = ["orders", "payment", "fba_returns", "easyship_returns", "fba_removal", "ad_spend"]

DETECT_SIGNATURES = {
    "orders":            {"amazon-order-id", "item-price", "order-status", "sku"},
    "payment":           {"settlement id", "type", "total", "date/time"},
    "fba_returns":       {"return-date", "detailed-disposition", "fnsku"},
    "easyship_returns":  {"return request date", "merchant sku", "return reason"},
    "fba_removal":       {"removal-fee", "order-source", "shipped-quantity"},
    "ad_spend":          {"campaign name", "spend", "impressions"},
}


def _read_table(raw: bytes, filename: str) -> pd.DataFrame:
    """Read csv/tsv/txt into a DataFrame, auto-detecting delimiter."""
    text = raw.decode("utf-8", errors="replace").lstrip("\ufeff")
    lower = filename.lower()

    # Amazon Settlement/Transaction CSVs sometimes have info lines before header
    # Skip lines until we find one with many delimiters
    lines = text.splitlines()
    header_idx = 0
    for i, line in enumerate(lines[:15]):
        if "," in line and line.count(",") >= 5:
            header_idx = i
            break
        if "\t" in line and line.count("\t") >= 5:
            header_idx = i
            break
    text2 = "\n".join(lines[header_idx:])

    delims = []
    if lower.endswith(".tsv") or lower.endswith(".txt"):
        delims = ["\t", ","]
    elif lower.endswith(".csv"):
        delims = [",", "\t"]
    else:
        delims = [",", "\t"]

    last_err = None
    for delim in delims:
        try:
            df = pd.read_csv(io.StringIO(text2), sep=delim, dtype=str, keep_default_na=False, on_bad_lines="skip", engine="python")
            if len(df.columns) >= 3:
                return df
        except Exception as e:
            last_err = e
    if last_err:
        raise last_err
    return pd.read_csv(io.StringIO(text2), sep=None, dtype=str, engine="python", keep_default_na=False)


def detect_file_type(df: pd.DataFrame) -> str | None:
    cols = {c.strip().lower() for c in df.columns}
    best = None
    best_score = 0
    for ftype, sig in DETECT_SIGNATURES.items():
        matches = sum(1 for s in sig if any(s == c or s in c for c in cols))
        if matches >= max(2, len(sig) - 1) and matches > best_score:
            best = ftype
            best_score = matches
    return best


def parse_upload(raw: bytes, filename: str) -> Tuple[str, list[dict]]:
    """Parse an uploaded file → (detected_type, rows)."""
    df = _read_table(raw, filename)
    df.columns = [c.strip() for c in df.columns]
    ftype = detect_file_type(df)
    if not ftype:
        raise ValueError(f"Could not auto-detect file type for '{filename}'. Please ensure headers are present.")
    rows = df.to_dict(orient="records")
    return ftype, rows


def _num(v) -> float:
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        try:
            f = float(v)
            if f != f or f in (float("inf"), float("-inf")):  # NaN / inf
                return 0.0
            return f
        except Exception:
            return 0.0
    s = str(v).strip().replace(",", "").replace("₹", "").replace("$", "")
    if not s or s.lower() in ("nan", "none", "-"):
        return 0.0
    m = re.match(r"^-?\d+(\.\d+)?", s)
    return float(m.group(0)) if m else 0.0


def parse_date_any(v) -> pd.Timestamp | None:
    if not v:
        return None
    try:
        ts = pd.to_datetime(v, utc=True, errors="coerce")
        if pd.isna(ts):
            ts = pd.to_datetime(v, errors="coerce", dayfirst=True)
        if pd.isna(ts):
            return None
        return ts
    except Exception:
        return None


def col(row: dict, *names: str, default=""):
    """Case-insensitive get from row dict, trying multiple names."""
    lowered = {k.lower().strip(): v for k, v in row.items()}
    for n in names:
        v = lowered.get(n.lower().strip())
        if v is not None and v != "":
            return v
    return default
