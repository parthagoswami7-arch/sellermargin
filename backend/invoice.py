"""GST invoice: calculation + PDF rendering."""
from __future__ import annotations
import io
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

EMERALD = "#044535"
GOLD    = "#F4B223"
MUTED   = "#5C5F5A"
BORDER  = "#D8DAD5"

GST_PCT = 18.0  # single national rate for digital SaaS

# Placeholder seller — the owner overwrites via the Admin > Business settings UI.
SELLER_DEFAULTS = {
    "business_name":   "Seller Margin (Update in Admin > Business Settings)",
    "gstin":           "XXAAAAA0000A1Z5",
    "pan":             "AAAAA0000A",
    "address_line1":   "Registered office address",
    "address_line2":   "City, PIN",
    "state":           "Maharashtra",
    "state_code":      "27",
    "contact_email":   "billing@sellermargin.example",
    "phone":           "",
    "website":         "sellermargin.example",
    "sac_code":        "998314",  # IT design & development services (SaaS)
    "hsn_description": "Software as a Service — Amazon P&L reconciliation platform",
}


# Mapping of Indian states to GSTIN state code (first 2 digits).
STATE_CODES = {
    "Andaman and Nicobar Islands": "35", "Andhra Pradesh": "37", "Arunachal Pradesh": "12",
    "Assam": "18", "Bihar": "10", "Chandigarh": "04", "Chhattisgarh": "22",
    "Dadra and Nagar Haveli and Daman and Diu": "26", "Delhi": "07", "Goa": "30",
    "Gujarat": "24", "Haryana": "06", "Himachal Pradesh": "02", "Jammu and Kashmir": "01",
    "Jharkhand": "20", "Karnataka": "29", "Kerala": "32", "Ladakh": "38",
    "Lakshadweep": "31", "Madhya Pradesh": "23", "Maharashtra": "27", "Manipur": "14",
    "Meghalaya": "17", "Mizoram": "15", "Nagaland": "13", "Odisha": "21",
    "Puducherry": "34", "Punjab": "03", "Rajasthan": "08", "Sikkim": "11",
    "Tamil Nadu": "33", "Telangana": "36", "Tripura": "16", "Uttar Pradesh": "09",
    "Uttarakhand": "05", "West Bengal": "19",
}


def compute_gst(base_amount: float, buyer_state: str | None, seller_state: str) -> dict:
    """Compute CGST/SGST vs IGST split. GST is always charged (18%). Returns rupee amounts
    rounded to 2 decimals. If buyer_state is empty or matches seller_state, treat as intra-state."""
    base = round(float(base_amount), 2)
    intra_state = (not buyer_state) or (buyer_state.strip().lower() == seller_state.strip().lower())
    if intra_state:
        cgst = round(base * 0.09, 2)
        sgst = round(base * 0.09, 2)
        igst = 0.0
        total_tax = round(cgst + sgst, 2)
    else:
        cgst = 0.0
        sgst = 0.0
        igst = round(base * 0.18, 2)
        total_tax = igst
    total = round(base + total_tax, 2)
    return {
        "base": base,
        "cgst_pct": 9.0 if intra_state else 0.0,
        "sgst_pct": 9.0 if intra_state else 0.0,
        "igst_pct": 18.0 if not intra_state else 0.0,
        "cgst": cgst, "sgst": sgst, "igst": igst,
        "total_tax": total_tax,
        "total": total,
        "intra_state": intra_state,
    }


def _fy_label(dt: datetime) -> str:
    """Financial year (April-March) label like 'FY26-27' (starts Apr 1 = same year, else prev year)."""
    year = dt.year
    if dt.month < 4:  # Jan-Mar belongs to FY starting previous April
        start = year - 1
    else:
        start = year
    return f"FY{start % 100:02d}-{(start + 1) % 100:02d}"


def build_invoice_number(seq: int, dt: datetime) -> str:
    return f"SM/{_fy_label(dt)}/{seq:04d}"


def money(v: float) -> str:
    return f"Rs. {float(v):,.2f}"


def render_invoice_pdf(*, invoice_no: str, invoice_date: datetime,
                       order_id: str, cf_payment_id: str | None,
                       seller: dict, buyer: dict,
                       plan_label: str, plan_days: int,
                       gst: dict) -> bytes:
    """Render a compliant Indian tax invoice PDF."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=16*mm, rightMargin=16*mm,
                            topMargin=14*mm, bottomMargin=14*mm)
    styles = getSampleStyleSheet()
    h_serif = ParagraphStyle("h", parent=styles["Heading1"], fontName="Helvetica-Bold",
                             fontSize=22, textColor=colors.HexColor(EMERALD), spaceAfter=2, leading=24)
    caps = ParagraphStyle("caps", parent=styles["Normal"], fontSize=8,
                          textColor=colors.HexColor(MUTED), spaceAfter=0, leading=10)
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=9, leading=12)
    small = ParagraphStyle("sm", parent=styles["Normal"], fontSize=8,
                           textColor=colors.HexColor(MUTED), leading=10)
    label_val = ParagraphStyle("lv", parent=styles["Normal"], fontSize=9, leading=12)

    story = []

    # Header row: Brand (left) | Invoice meta (right)
    seller_html = (
        f"<b>{seller.get('business_name','')}</b><br/>"
        f"{seller.get('address_line1','')}<br/>"
        f"{seller.get('address_line2','')}<br/>"
        f"State: {seller.get('state','')} &nbsp; Code: {seller.get('state_code','')}<br/>"
        f"GSTIN: <b>{seller.get('gstin','')}</b>"
    )
    if seller.get("pan"):
        seller_html += f"<br/>PAN: {seller.get('pan')}"
    if seller.get("contact_email"):
        seller_html += f"<br/>Email: {seller.get('contact_email')}"

    meta_html = (
        f"<b>TAX INVOICE</b><br/>"
        f"Invoice No: <b>{invoice_no}</b><br/>"
        f"Invoice Date: {invoice_date.strftime('%d %b %Y')}<br/>"
        f"Place of Supply: {buyer.get('state') or seller.get('state','')}<br/>"
        f"Reverse Charge: No<br/>"
        f"Order ID: {order_id}"
    )
    if cf_payment_id:
        meta_html += f"<br/>Payment ID: {cf_payment_id}"

    head = Table([[Paragraph("Seller Margin", h_serif),
                   Paragraph(meta_html, body)],
                  [Paragraph(seller_html, body), ""]],
                 colWidths=[100*mm, 78*mm])
    head.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 0),
        ("RIGHTPADDING", (0,0), (-1,-1), 0),
        ("BOTTOMPADDING", (0,0), (-1,0), 4),
        ("LINEBELOW", (0,1), (-1,1), 0.5, colors.HexColor(BORDER)),
        ("BOTTOMPADDING", (0,1), (-1,1), 12),
    ]))
    story.append(head)
    story.append(Spacer(1, 8))

    # Bill To
    buyer_html = (
        f"<b>{buyer.get('name','') or '—'}</b><br/>"
        f"{buyer.get('address') or 'Address not provided'}<br/>"
        f"State: {buyer.get('state') or '—'}<br/>"
        f"GSTIN: <b>{buyer.get('gstin') or 'Unregistered'}</b><br/>"
        f"Email: {buyer.get('email','')}"
    )
    bill = Table([[Paragraph("BILL TO", caps)], [Paragraph(buyer_html, body)]],
                 colWidths=[178*mm])
    bill.setStyle(TableStyle([
        ("BOX", (0,0), (-1,-1), 0.5, colors.HexColor(BORDER)),
        ("BACKGROUND", (0,0), (0,0), colors.HexColor("#F8F9FA")),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    story.append(bill)
    story.append(Spacer(1, 10))

    # Line items
    sac = seller.get("sac_code", "998314")
    desc = f"{plan_label} — {plan_days} days access to Seller Margin (Amazon P&amp;L Reconciliation SaaS)"
    line_head = ["#", "Description", "SAC", "Qty", "Rate (Rs.)", "Amount (Rs.)"]
    line_row  = ["1", Paragraph(desc, body), sac, "1", f"{gst['base']:,.2f}", f"{gst['base']:,.2f}"]
    lt = Table([line_head, line_row], colWidths=[8*mm, 92*mm, 18*mm, 12*mm, 22*mm, 26*mm])
    lt.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor(EMERALD)),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("GRID", (0,0), (-1,-1), 0.25, colors.HexColor(BORDER)),
        ("ALIGN", (2,0), (-1,-1), "RIGHT"),
        ("ALIGN", (0,0), (0,-1), "CENTER"),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    story.append(lt)
    story.append(Spacer(1, 6))

    # Tax breakdown (right-aligned totals block)
    totals_rows = [
        ["Taxable value", money(gst["base"])],
    ]
    if gst["intra_state"]:
        totals_rows += [
            [f"CGST @ {gst['cgst_pct']:.0f}%", money(gst["cgst"])],
            [f"SGST @ {gst['sgst_pct']:.0f}%", money(gst["sgst"])],
        ]
    else:
        totals_rows += [
            [f"IGST @ {gst['igst_pct']:.0f}%", money(gst["igst"])],
        ]
    totals_rows += [
        ["Total tax", money(gst["total_tax"])],
        ["GRAND TOTAL", money(gst["total"])],
    ]
    tt = Table(totals_rows, colWidths=[110*mm, 68*mm])
    tt.setStyle(TableStyle([
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("ALIGN", (1,0), (1,-1), "RIGHT"),
        ("ALIGN", (0,0), (0,-1), "RIGHT"),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LINEABOVE", (0,-1), (-1,-1), 0.5, colors.HexColor(BORDER)),
        ("FONTNAME", (0,-1), (-1,-1), "Helvetica-Bold"),
        ("BACKGROUND", (0,-1), (-1,-1), colors.HexColor("#FFF9EB")),
        ("TEXTCOLOR", (0,-1), (-1,-1), colors.HexColor(EMERALD)),
    ]))
    story.append(tt)
    story.append(Spacer(1, 14))

    # Amount in words + notes
    words = _amount_in_words_inr(gst["total"])
    story.append(Paragraph(f"<b>Amount in words:</b> {words}", body))
    story.append(Spacer(1, 12))

    notes = (
        "1. This is a digitally generated tax invoice and does not require a signature.<br/>"
        "2. Payment received via online payment gateway (Cashfree). No refund of GST on cancellation of digital subscription once activated.<br/>"
        "3. All disputes subject to jurisdiction of the courts in the state of the seller (as stated above)."
    )
    story.append(Paragraph(notes, small))
    story.append(Spacer(1, 20))
    story.append(Paragraph(
        f"For {seller.get('business_name','')} &nbsp;&nbsp;·&nbsp;&nbsp; Authorised signatory (digitally issued)",
        small))

    doc.build(story)
    return buf.getvalue()


# ---- amount in words (Indian numbering system) ----
_ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
         "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
         "seventeen", "eighteen", "nineteen"]
_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]


def _two_digit(n: int) -> str:
    if n < 20: return _ONES[n]
    t, o = divmod(n, 10)
    return _TENS[t] + ("" if o == 0 else " " + _ONES[o])


def _three_digit(n: int) -> str:
    h, r = divmod(n, 100)
    out = []
    if h: out.append(_ONES[h] + " hundred")
    if r: out.append(_two_digit(r))
    return " ".join(out).strip()


def _int_in_words_inr(n: int) -> str:
    if n == 0: return "zero"
    parts = []
    crore, n = divmod(n, 10_000_000)
    lakh,  n = divmod(n, 100_000)
    thou,  n = divmod(n, 1_000)
    if crore: parts.append(_two_digit(crore) + " crore")
    if lakh:  parts.append(_two_digit(lakh) + " lakh")
    if thou:  parts.append(_two_digit(thou) + " thousand")
    if n:     parts.append(_three_digit(n))
    return " ".join(parts).strip()


def _amount_in_words_inr(amount: float) -> str:
    rupees = int(amount)
    paise = int(round((amount - rupees) * 100))
    words = _int_in_words_inr(rupees).capitalize() + " rupees"
    if paise:
        words += f" and {_int_in_words_inr(paise)} paise"
    return words + " only"
