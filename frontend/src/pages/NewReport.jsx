import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { FILE_TYPE_ORDER, FILE_TYPE_LABELS, FILE_TYPE_LINKS, monthName } from "../lib/api";
import { Upload, CheckCircle2, X, ArrowRight, FileText, ExternalLink, HelpCircle, Calendar, Image as ImageIcon, ChevronDown, ChevronRight, Package, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";

export default function NewReport() {
  const nav = useNavigate();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [name, setName] = useState("");
  const [reportId, setReportId] = useState(null);
  const [files, setFiles] = useState({}); // ftype → {filename, count}
  const [uploading, setUploading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [expanded, setExpanded] = useState({}); // ftype → bool
  const [existingReports, setExistingReports] = useState([]);
  const { user, refresh } = useAuth();
  const status = user?.status || {};

  useEffect(() => {
    api.get("/reports")
      .then(r => setExistingReports(r.data.reports || []))
      .catch(() => {});
  }, []);

  const isRegeneration = existingReports.some(
    r => Number(r.target_month) === Number(month) && Number(r.target_year) === Number(year)
  );
  const willConsumeSlot = !isRegeneration;
  const quotaRemaining = status.reports_unlimited ? 9999 : (status.reports_remaining ?? 0);
  const blocked = willConsumeSlot && quotaRemaining <= 0;

  const createReport = async () => {
    try {
      const r = await api.post("/reports", { name: name || undefined, target_month: Number(month), target_year: Number(year) });
      setReportId(r.data.report_id);
      toast.success("Report created — upload your files");
      await refresh();
    } catch (e) {
      const msg = e?.response?.data?.detail || "Failed to create report";
      if (e?.response?.status === 402) {
        toast.error(msg, { duration: 8000, action: { label: "Buy reports", onClick: () => nav("/upgrade") } });
      } else {
        toast.error(msg);
      }
    }
  };

  const handleFile = async (fileList) => {
    if (!reportId) { toast.error("Create the report first"); return; }
    setUploading(true);
    for (const f of Array.from(fileList)) {
      const fd = new FormData();
      fd.append("file", f);
      try {
        const res = await api.post(`/reports/${reportId}/upload`, fd, { headers: { "Content-Type": "multipart/form-data" }});
        setFiles(res.data.files);
        toast.success(`${f.name} → ${FILE_TYPE_LABELS[res.data.detected_type]} (${res.data.rows} rows)`);
      } catch (e) {
        toast.error(`${f.name}: ${e?.response?.data?.detail || "upload failed"}`);
      }
    }
    setUploading(false);
  };

  const removeFile = async (ftype) => {
    await api.delete(`/reports/${reportId}/files/${ftype}`);
    const nf = { ...files }; delete nf[ftype]; setFiles(nf);
  };

  const build = async () => {
    setBuilding(true);
    try {
      const r = await api.post(`/reports/${reportId}/build`);
      toast.success(`Built ${r.data.rows_count} rows`);
      nav(`/report/${reportId}/costs`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Build failed");
    } finally { setBuilding(false); }
  };

  const filesUploaded = Object.keys(files).length;
  const hasOrders = !!files.orders;

  return (
    <div className="p-10 max-w-[1200px]">
      <div className="label-caps mb-2">Step 1 of 4</div>
      <h1 className="font-serif text-5xl tracking-tight mb-2">New reconciliation</h1>
      <p className="text-muted-foreground mb-6">Set the month, then drop in your five Amazon reports. We auto-detect each file.</p>

      {/* Report-quota banner */}
      {!reportId && status.reports_quota !== undefined && !status.reports_unlimited && (
        <div className={`border p-4 mb-6 flex items-start gap-3 ${
          blocked ? "border-destructive bg-destructive/5" :
          isRegeneration ? "border-primary bg-primary/5" :
          quotaRemaining <= 2 ? "border-accent bg-accent/10" : "border-border bg-card"
        }`} data-testid="new-report-quota-banner">
          {blocked ? <AlertCircle size={18} className="text-destructive shrink-0 mt-0.5"/>
                  : <Package size={18} className="text-primary shrink-0 mt-0.5"/>}
          <div className="flex-1 text-sm">
            {isRegeneration ? (
              <>
                <b>Regenerating {monthName(Number(month))} {year}</b> — this is FREE and won't count against your quota.
                <div className="text-xs text-muted-foreground mt-1">
                  You already have a report for this month. Continuing will let you re-upload files or adjust cost prices without spending a report.
                </div>
              </>
            ) : blocked ? (
              <>
                <b>Report quota exhausted</b> — {status.reports_used} of {status.reports_quota} used.
                <div className="text-xs text-muted-foreground mt-1">
                  Buy a top-up or a plan below — or pick a month you've already reconciled (regeneration is free).
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button onClick={() => nav("/upgrade?highlight=topup")} className="bg-accent text-accent-foreground px-4 py-2 text-xs uppercase tracking-[0.15em] font-bold hover:brightness-95" data-testid="quota-topup-btn">
                    Buy 5 top-up reports · ₹249
                  </button>
                  <button onClick={() => nav("/upgrade")} className="btn-outline text-xs" data-testid="quota-upgrade-btn">
                    Buy annual · ₹499
                  </button>
                </div>
              </>
            ) : (
              <>
                <b>{status.reports_remaining} of {status.reports_quota} reports remaining.</b> This new month will consume 1 slot.
                <div className="text-xs text-muted-foreground mt-1">
                  1 report = one calendar month's P&amp;L. Regenerating an existing month is always free.
                  {status.reports_remaining <= 2 && <> · Running low? <button onClick={() => nav("/upgrade?highlight=topup")} className="text-primary underline font-medium" data-testid="quota-topup-inline-link">Top up with 5 reports for ₹249</button></>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Month/year */}
      <div className="border border-border bg-card p-8 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <label className="label-caps block mb-2">Target month</label>
            <select value={month} onChange={e => setMonth(e.target.value)} disabled={!!reportId}
              className="w-full border border-border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50" data-testid="month-select">
              {Array.from({length:12}, (_,i)=>i+1).map(m => <option key={m} value={m}>{m.toString().padStart(2,"0")} — {monthName(m)}</option>)}
            </select>
          </div>
          <div>
            <label className="label-caps block mb-2">Target year</label>
            <input type="number" value={year} onChange={e => setYear(e.target.value)} disabled={!!reportId}
              className="w-full border border-border bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              data-testid="year-input" />
          </div>
          <div className="md:col-span-2">
            <label className="label-caps block mb-2">Report name (optional)</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} disabled={!!reportId}
              placeholder={`P&L ${String(month).padStart(2,"0")}/${year}`}
              className="w-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              data-testid="name-input" />
          </div>
        </div>
        {!reportId && (
          <button onClick={createReport} disabled={blocked} className="btn-emerald mt-6 disabled:opacity-50 disabled:cursor-not-allowed" data-testid="create-report-btn">
            {blocked ? "Quota exhausted" : (isRegeneration ? "Regenerate this month (free)" : "Continue to uploads")}
            {!blocked && <ArrowRight size={14} className="inline ml-2" />}
          </button>
        )}
      </div>

      {reportId && (
        <>
          {/* Dropzone */}
          <div className="border-2 border-dashed border-border p-12 text-center mb-6 hover:border-primary transition-colors bg-card"
            onDragOver={(e)=>{e.preventDefault(); e.currentTarget.classList.add("border-primary");}}
            onDragLeave={(e)=>e.currentTarget.classList.remove("border-primary")}
            onDrop={(e)=>{e.preventDefault(); e.currentTarget.classList.remove("border-primary"); handleFile(e.dataTransfer.files);}}>
            <Upload size={32} strokeWidth={1.5} className="mx-auto mb-4 text-primary" />
            <div className="font-serif text-2xl mb-2">Drop your Amazon reports here</div>
            <div className="text-sm text-muted-foreground mb-6">.txt, .csv, .tsv — we auto-detect which report is which</div>
            <label className="btn-emerald cursor-pointer inline-block">
              {uploading ? "Uploading…" : "Choose files"}
              <input type="file" multiple onChange={e => handleFile(e.target.files)} className="hidden" accept=".txt,.csv,.tsv" data-testid="file-input" />
            </label>
          </div>

          {/* File slots */}
          <div className="border border-border bg-card">
            <div className="p-4 border-b border-border label-caps">Required reports ({filesUploaded}/5 detected)</div>
            {FILE_TYPE_ORDER.map((ft, i) => {
              const info = files[ft];
              const link = FILE_TYPE_LINKS[ft];
              const hasSteps = link && link.screenshots && link.screenshots.length > 0;
              const isOpen = !!expanded[ft];
              return (
                <div key={ft} className={i < FILE_TYPE_ORDER.length - 1 ? "border-b border-border" : ""}>
                  <div className="grid grid-cols-12 px-6 py-4 items-start gap-2">
                    <div className="col-span-1 pt-1">
                      {info ? <CheckCircle2 size={18} className="text-primary" /> : <div className="w-4 h-4 border border-border rounded-full" />}
                    </div>
                    <div className="col-span-5">
                      <div className="text-sm font-medium">{FILE_TYPE_LABELS[ft]}</div>
                      {ft === "orders" && <div className="text-xs text-destructive mt-0.5">Required</div>}
                      {link && (
                        <div className="mt-2 space-y-1.5">
                          <a href={link.url} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-primary hover:underline"
                            data-testid={`sc-link-${ft}`} title={link.help}>
                            <ExternalLink size={11} /> {link.label}
                          </a>
                          <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
                            <Calendar size={11} className="mt-0.5 shrink-0 text-accent"/>
                            <div>
                              <span className="font-mono text-foreground">Range: {link.range}</span>
                              <span className="mx-1.5">·</span>
                              <span>{link.range_hint}</span>
                            </div>
                          </div>
                          <button onClick={() => setExpanded(e => ({ ...e, [ft]: !e[ft] }))}
                            className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
                            data-testid={`help-${ft}`}>
                            {isOpen ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
                            {hasSteps ? `${isOpen ? "Hide" : "Show"} ${link.screenshots.length}-step guide` : (isOpen ? "Hide guide" : "Show guide")}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="col-span-4 text-sm text-muted-foreground truncate flex items-center gap-2 pt-1">
                      {info ? <><FileText size={12}/> <span className="truncate">{info.filename}</span> <span className="text-xs shrink-0">({info.count} rows)</span></> : "—"}
                    </div>
                    <div className="col-span-2 text-right pt-1">
                      {info && <button onClick={() => removeFile(ft)} className="text-muted-foreground hover:text-destructive" data-testid={`remove-${ft}`}><X size={14}/></button>}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="px-6 pb-6 pt-0 bg-muted/20 border-t border-border animate-fade-up" data-testid={`guide-${ft}`}>
                      {hasSteps ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                          {link.screenshots.map((sh, si) => (
                            <div key={si} className="border border-border bg-card overflow-hidden">
                              <div className="px-3 py-2 border-b border-border flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-mono flex items-center justify-center shrink-0">{si + 1}</div>
                                <div className="text-[11px] leading-snug">{sh.caption}</div>
                              </div>
                              <a href={sh.src} target="_blank" rel="noreferrer" className="block">
                                <img src={sh.src} alt={`Step ${si + 1}`}
                                  className="w-full h-auto block hover:opacity-90 transition-opacity"
                                  onError={(e) => { e.currentTarget.style.display = "none"; }} />
                              </a>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="pt-4 flex flex-col items-center gap-3 text-muted-foreground text-sm text-center p-8 border border-dashed border-border bg-card">
                          <ImageIcon size={32} strokeWidth={1.2} />
                          <div className="font-serif text-base text-foreground">Screenshot guide coming soon</div>
                          <div className="max-w-md text-xs">
                            For now, click <span className="font-medium text-primary">"{link.label}"</span> above to open the page directly in Seller Central.
                            <br/>Range: <span className="font-mono text-foreground">{link.range}</span> — {link.range_hint}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end mt-8">
            <button onClick={build} disabled={!hasOrders || building} className="btn-emerald" data-testid="build-btn">
              {building ? "Building…" : "Next: cost prices"} <ArrowRight size={14} className="inline ml-2" />
            </button>
          </div>
          {!hasOrders && filesUploaded > 0 && (
            <div className="text-xs text-destructive mt-2 text-right">All Orders report is required to proceed.</div>
          )}
        </>
      )}
    </div>
  );
}
