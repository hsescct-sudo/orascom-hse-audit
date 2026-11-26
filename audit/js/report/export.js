// Excel and PowerPoint files, made on the device (no internet needed once the
// system has been opened online). Excel follows the company form columns.
import * as S from "../store.js";
import * as M from "../model.js";
import { ensureExcelJS, ensurePptx, saveBlob, busyOverlay, toast, fmtDate, todayISO } from "../ui.js";
import { GRADES, ROOT_CAUSES } from "../templates.js";
import { fmtScore, gradeOf } from "../scoring.js";

const NAVY = "FF003876", HEAD = "FFE3E9F1", LINE = "FF7D8BA0";
const GC = { green: "FF1B9E5A", orange: "FFE9851F", yellow: "FFEDBE2C", red: "FFCF2F2B" };
const thin = { style: "thin", color: { argb: LINE } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const safe = s => String(s || "").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);

async function blobToB64(blob) { return new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(r.error); r.readAsDataURL(blob); }); }
async function photoData(id) { const p = await S.getPhoto(id); return p ? blobToB64(p.blob) : null; }
async function logoData() { try { const r = await fetch("assets/orascom-logo.png"); return blobToB64(await r.blob()); } catch (e) { return null; } }
function imgSize(dataUrl) { return new Promise(ok => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => ok({ w: 4, h: 3 }); i.src = dataUrl; }); }

function cellStyle(c, { bold = false, fill = null, color = null, wrap = true, size = 10, align = "left" } = {}) {
  c.font = { name: "Calibri", size, bold, color: color ? { argb: color } : undefined };
  c.alignment = { vertical: "top", horizontal: align, wrapText: wrap };
  c.border = border;
  if (fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
}
function headerRow(ws, r, values, widths) {
  values.forEach((v, i) => { const c = ws.getCell(r, i + 1); c.value = v; cellStyle(c, { bold: true, fill: HEAD }); });
  if (widths) widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}
function titleBlock(wb, ws, logoId, title, ref, rev, lastCol) {
  if (lastCol <= 5) {
    // narrow sheet: logo and form refs on row 1, title across row 2
    ws.mergeCells(1, 1, 1, 2); ws.mergeCells(1, 3, 1, lastCol); ws.mergeCells(2, 1, 2, lastCol);
    if (logoId != null) ws.addImage(logoId, { tl: { col: 0.1, row: 0.15 }, ext: { width: 150, height: 34 } });
    const rf = ws.getCell(1, 3); rf.value = `Form Ref.: ${ref}   Form Rev.: ${rev}`; rf.alignment = { vertical: "middle", horizontal: "right" }; rf.font = { size: 10 };
    const t = ws.getCell(2, 1); t.value = title; t.font = { name: "Calibri", size: 16, bold: true, color: { argb: NAVY } }; t.alignment = { vertical: "middle", horizontal: "center" };
    for (let r = 1; r <= 2; r++) for (let c = 1; c <= lastCol; c++) ws.getCell(r, c).border = border;
    ws.getRow(1).height = 32; ws.getRow(2).height = 26;
    return;
  }
  ws.mergeCells(1, 1, 2, 2); ws.mergeCells(1, 3, 2, lastCol - 2);
  if (logoId != null) ws.addImage(logoId, { tl: { col: 0.15, row: 0.25 }, ext: { width: 150, height: 34 } });
  const t = ws.getCell(1, 3); t.value = title; t.font = { name: "Calibri", size: 18, bold: true, color: { argb: NAVY } }; t.alignment = { vertical: "middle", horizontal: "center" };
  ws.mergeCells(1, lastCol - 1, 1, lastCol); ws.mergeCells(2, lastCol - 1, 2, lastCol);
  ws.getCell(1, lastCol - 1).value = `Form Ref.: ${ref}`; ws.getCell(2, lastCol - 1).value = `Form Rev.: ${rev}`;
  for (let r = 1; r <= 2; r++) for (let c = 1; c <= lastCol; c++) ws.getCell(r, c).border = border;
  ws.getRow(1).height = 24; ws.getRow(2).height = 24;
}

// ---------- audit report workbook ----------
export async function excelReport(a) {
  const busy = busyOverlay("Making the Excel report…");
  try {
    const ExcelJS = await ensureExcelJS();
    const d = M.def(a.module); const p = M.project(a.project_id); const sc = M.score(a); const ncrs = M.auditNCRs(a); const goods = M.auditGoods(a);
    const wb = new ExcelJS.Workbook(); wb.creator = "OC HSE Audit"; wb.created = new Date();
    const logo = await logoData(); const logoId = logo ? wb.addImage({ base64: logo, extension: "png" }) : null;
    // Sheet 1: report
    const ws = wb.addWorksheet(d.id === "full" ? "HSE Site Performance Report" : "Lifting Assessment Report", { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    [5, 34, 18, 16, 16, 24, 10, 18, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    titleBlock(wb, ws, logoId, d.reportTitle, d.formRef, d.formRev, 9);
    let r = 4;
    const line = (label, value, l2, v2) => {
      ws.mergeCells(r, 1, r, 2); ws.mergeCells(r, 3, r, 5); ws.mergeCells(r, 6, r, 7); ws.mergeCells(r, 8, r, 9);
      const c1 = ws.getCell(r, 1); c1.value = label; cellStyle(c1, { bold: true, fill: HEAD });
      const c2 = ws.getCell(r, 3); c2.value = value; cellStyle(c2);
      const c3 = ws.getCell(r, 6); c3.value = l2 || ""; cellStyle(c3, { bold: true, fill: HEAD });
      const c4 = ws.getCell(r, 8); c4.value = v2 == null ? "" : v2; cellStyle(c4);
      r++;
    };
    line("Project", `${p.name} (${p.code})`, d.id === "full" ? "Audit date" : "Assessment date", fmtDate(a.date));
    line("Ref", a.ref, d.scoreLabel, `${fmtScore(sc.total)} ${sc.grade ? "· " + sc.grade.label : ""}`);
    if (d.id === "full") {
      const prev = M.previousScore(a), corr = M.correctionPct(a);
      line("Current manpower", a.manpower || "", "Previous audit score", prev == null ? "First audit" : fmtScore(prev));
      line("Progress of completion", a.completion !== "" ? `${a.completion}%` : "", "Correcting last audit violations", corr == null ? "" : corr + "%");
      line("Audit number", a.number, "Status", { draft: "Draft", submitted: "Waiting approval", approved: "Approved" }[a.status]);
    } else {
      const lead = (a.auditors || [])[0] || {};
      line("Auditor's name", lead.name || "", "Auditor's title", lead.position || "");
    }
    r++;
    const people = (title, list) => {
      ws.mergeCells(r, 1, r, 9); const t = ws.getCell(r, 1); t.value = title; cellStyle(t, { bold: true, fill: NAVY, color: "FFFFFFFF" }); r++;
      for (const x of (list || []).filter(x => x.name || x.position)) { ws.mergeCells(r, 1, r, 4); ws.mergeCells(r, 5, r, 9); const a1 = ws.getCell(r, 1); a1.value = x.name; cellStyle(a1); const a2 = ws.getCell(r, 5); a2.value = x.position; cellStyle(a2); r++; }
      r++;
    };
    if (d.id === "full") people("Key people attended the meeting", a.attendees);
    people(d.id === "full" ? "Auditors" : "Assessors", a.auditors);
    const para = (title, text) => { ws.mergeCells(r, 1, r, 2); ws.mergeCells(r, 3, r, 9); const t = ws.getCell(r, 1); t.value = title; cellStyle(t, { bold: true, fill: HEAD }); const v = ws.getCell(r, 3); v.value = text || ""; cellStyle(v); ws.getRow(r).height = Math.max(20, Math.ceil(String(text || "").length / 95) * 14); r++; };
    if (d.id === "full") { para("Opening meeting", a.opening); para("Site tour", a.siteTour); para("Close meeting", a.closeMeeting); }
    else { para("Purpose", d.purpose); para("Summary", a.summary); }
    r++;
    // grade legend
    GRADES.forEach(g => { const c = ws.getCell(r, 1); c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GC[g.code] } }; c.border = border; ws.mergeCells(r, 2, r, 5); const t = ws.getCell(r, 2); t.value = `${g.min === 85 ? "From 85% and above" : g.min === 75 ? "From 75% to 84%" : g.min === 65 ? "From 65% to 74%" : "From 0% to 64%"}: ${g.label}.`; cellStyle(t); r++; });
    ws.mergeCells(r, 1, r, 9); ws.getCell(r, 1).value = `Serious NCR: ${M.ruleText(d).serious}. Repeated NCR: ${M.ruleText(d).repeated}.`; ws.getCell(r, 1).font = { italic: true, size: 9 }; r += 2;
    if (d.hasEquipment) {
      ws.mergeCells(r, 1, r, 9); const t = ws.getCell(r, 1); t.value = "Lifting equipment statistics"; cellStyle(t, { bold: true, fill: NAVY, color: "FFFFFFFF" }); r++;
      headerRow(ws, r, ["Ser.", "Lifting equipment description", "No.", "Owned / rental"]); r++;
      (a.equipment || []).forEach((e, i) => { [i + 1, e.desc, e.count === "" ? "" : e.count, e.owner].forEach((v, j) => { const c = ws.getCell(r, j + 1); c.value = v; cellStyle(c); }); r++; });
      r++;
    }
    // violations
    ws.mergeCells(r, 1, r, 9); const vt = ws.getCell(r, 1); vt.value = "The observed violations"; cellStyle(vt, { bold: true, fill: NAVY, color: "FFFFFFFF" }); r++;
    headerRow(ws, r, ["N°", "Remarks", "Classification", "Location", "Root cause", "Photo", "NCR type", "Responsibility", "Deadline"]); r++;
    for (const [i, n] of ncrs.entries()) {
      const vals = [i + 1, `${n.description}\n(${n.ref})`, n.classification, n.location || "", [...(n.root_causes || []), n.other_cause].filter(Boolean).join(", "), "", n.severity + (n.repeated ? " · Repeated" : ""), [n.responsible_name, n.responsible_position].filter(Boolean).join("\n"), fmtDate(n.due_date)];
      vals.forEach((v, j) => { const c = ws.getCell(r, j + 1); c.value = v; cellStyle(c, { fill: j === 6 && n.severity === "Serious" ? "FFFDE8E7" : null }); });
      ws.getRow(r).height = 96;
      const ph = n.photos && n.photos[0] ? await photoData(n.photos[0]) : null;
      if (ph) { const sz = await imgSize(ph); const h = 118, w = Math.min(165, Math.round(h * sz.w / sz.h)); ws.addImage(wb.addImage({ base64: ph, extension: "jpeg" }), { tl: { col: 5.05, row: r - 1 + 0.06 }, ext: { width: w, height: h } }); }
      r++;
    }
    if (!ncrs.length) { ws.mergeCells(r, 1, r, 9); ws.getCell(r, 1).value = "No violations recorded."; r++; }
    r++;
    ws.mergeCells(r, 1, r, 9); const gt = ws.getCell(r, 1); gt.value = "Good practice"; cellStyle(gt, { bold: true, fill: NAVY, color: "FFFFFFFF" }); r++;
    headerRow(ws, r, ["#", "Subject", "Classification", "Examples of good practice"]); ws.mergeCells(r, 4, r, 9); r++;
    for (const [i, g] of goods.entries()) { [i + 1, g.subject, g.classification || "", g.example || ""].forEach((v, j) => { const c = ws.getCell(r, j + 1); c.value = v; cellStyle(c); }); ws.mergeCells(r, 4, r, 9); r++; }
    // General view photos
    if ((a.photos || []).length) {
      r++; ws.mergeCells(r, 1, r, 9); const pv = ws.getCell(r, 1); pv.value = "General view"; cellStyle(pv, { bold: true, fill: NAVY, color: "FFFFFFFF" }); r++;
      let col = 0; for (const id of a.photos.slice(0, 6)) { const ph = await photoData(id); if (!ph) continue; ws.addImage(wb.addImage({ base64: ph, extension: "jpeg" }), { tl: { col: col === 0 ? 0 : col === 1 ? 3 : 6, row: r - 1 }, ext: { width: 230, height: 172 } }); col++; if (col === 3) { col = 0; r += 9; } }
      r += 10;
    }
    // Sheet 2: appraisal with live formulas
    const ap = wb.addWorksheet(d.id === "full" ? "HSE Performance Grading" : "Appraisal Sheet", { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    [7, 70, 9, 10, 10].forEach((w, i) => { ap.getColumn(i + 1).width = w; });
    titleBlock(wb, ap, logoId, d.id === "full" ? "HSE Performance Appraisal Form" : "Lifting Assessment Appraisal Checklist", d.formRef, d.formRev, 5);
    let q = 4; const partCells = [];
    ap.getCell(q, 1).value = "Project"; ap.getCell(q, 2).value = `${p.name} (${p.code}) · ${fmtDate(a.date)}`; ap.getCell(q, 1).font = { bold: true }; q += 2;
    ap.mergeCells(q, 1, q, 5); ap.getCell(q, 1).value = "Rating is 0-100%. N/A items are left out and their weight goes to the other items. 0% counts as zero."; ap.getCell(q, 1).font = { italic: true, size: 9 }; q += 2;
    sc.parts.forEach(part => {
      const pd = d.parts.find(x => x.id === part.id);
      ap.mergeCells(q, 1, q, 5); const ph = ap.getCell(q, 1); ph.value = d.id === "full" ? `${part.code}: ${part.name} (${part.share}%)` : `${part.code}- ${part.name} (${part.share}%)`; cellStyle(ph, { bold: true, fill: NAVY, color: "FFFFFFFF" }); q++;
      headerRow(ap, q, ["Ser", "Item", "Weight", "Rating %", "Points"]); q++;
      const first = q;
      part.items.forEach((it, k) => {
        const txt = pd.items.find(x => x.id === it.id).text;
        const rating = it.state === "rated" ? it.value : it.state === "na" ? "N/A" : "";
        const row = [d.id === "full" ? k + 1 : it.id, `${it.title}: ${txt}`, it.weight, rating, { formula: `IF(ISNUMBER(D${q}),C${q}*D${q}/100,"")`, result: it.state === "rated" ? it.weight * it.value / 100 : "" }];
        row.forEach((v, j) => { const c = ap.getCell(q, j + 1); c.value = v; cellStyle(c, { fill: j === 3 && rating === "N/A" ? "FFD9DEE5" : null, align: j >= 2 ? "center" : "left" }); });
        ap.getRow(q).height = Math.max(28, Math.ceil(txt.length / 80) * 13 + 14); q++;
      });
      const last = q - 1;
      ap.mergeCells(q, 1, q, 4); const tl = ap.getCell(q, 1); tl.value = `Total ${part.code} (%)`; cellStyle(tl, { bold: true, fill: HEAD });
      const tc = ap.getCell(q, 5); tc.value = { formula: `IFERROR(SUM(E${first}:E${last})/SUMPRODUCT(C${first}:C${last}*ISNUMBER(D${first}:D${last}))*100,"N/A")`, result: part.score == null ? "N/A" : Math.round(part.score * 1000) / 10 }; cellStyle(tc, { bold: true, fill: HEAD, align: "center" }); tc.numFmt = "0.0";
      partCells.push({ cell: `E${q}`, share: part.share }); q += 2;
    });
    const shareSum = partCells.map(pc => `IF(ISNUMBER(${pc.cell}),${pc.share},0)`).join("+");
    const weighted = partCells.map(pc => `IF(ISNUMBER(${pc.cell}),${pc.cell}*${pc.share},0)`).join("+");
    const concl = [["Before deductions (%)", { formula: `IFERROR((${weighted})/(${shareSum}),"")`, result: sc.base == null ? "" : Math.round(sc.base * 10) / 10 }],
      [`Serious violations (${sc.seriousCount}): ${M.ruleText(d).serious}`, sc.serious, sc.seriousPct], [`Repeated violations (${sc.repeatedCount}): ${M.ruleText(d).repeated}`, sc.repeated, sc.repeatedPct]];
    const baseRow = q, pctMode = M.scoreOpts().deductFrom === "percent";
    concl.forEach(([k, v, pct], i) => {
      ap.mergeCells(q, 1, q, 4); const c = ap.getCell(q, 1); c.value = k; cellStyle(c, { bold: true }); const e = ap.getCell(q, 5);
      // with "percent of the score" the deduction is a live formula on the score before deductions
      e.value = i > 0 && pctMode ? { formula: `IF(E${baseRow}="",0,E${baseRow}*${pct}/100)`, result: Math.round(v * 10) / 10 } : v;
      cellStyle(e, { align: "center" }); e.numFmt = "0.0"; q++;
    });
    ap.mergeCells(q, 1, q, 4); const tt = ap.getCell(q, 1); tt.value = `Total project score (%) · ${sc.grade ? sc.grade.label : ""}`; cellStyle(tt, { bold: true, fill: sc.grade ? GC[sc.grade.code] : HEAD, color: sc.grade && ["green", "red"].includes(sc.grade.code) ? "FFFFFFFF" : undefined });
    const tv = ap.getCell(q, 5); tv.value = { formula: `IF(E${q - 3}="","",MAX(0,MIN(100,E${q - 3}-E${q - 2}-E${q - 1})))`, result: sc.total == null ? "" : Math.round(sc.total * 10) / 10 }; cellStyle(tv, { bold: true, fill: sc.grade ? GC[sc.grade.code] : HEAD, align: "center", color: sc.grade && ["green", "red"].includes(sc.grade.code) ? "FFFFFFFF" : undefined }); tv.numFmt = "0.0";
    // Sheet 3/4: registers for this audit
    addRegisterSheet(wb, d, ncrs);
    addGoodSheet(wb, goods);
    // Sheet 5: project history
    const hs = wb.addWorksheet("Project History");
    headerRow(hs, 1, ["Audit", "Date", "Score %", "Grade", "NCRs", "Status"], [20, 14, 10, 22, 8, 16]);
    M.audits(a.module).filter(x => x.project_id === a.project_id).reverse().forEach((x, i) => { const s = M.score(x); [x.ref, fmtDate(x.date), s.total == null ? "" : Math.round(s.total * 10) / 10, s.grade ? s.grade.label : "", M.auditNCRs(x).length, { draft: "Draft", submitted: "Waiting approval", approved: "Approved" }[x.status]].forEach((v, j) => { const c = hs.getCell(i + 2, j + 1); c.value = v; cellStyle(c, { fill: j === 3 && s.grade ? GC[s.grade.code] : null }); }); });
    const buf = await wb.xlsx.writeBuffer();
    await saveBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${safe(a.ref)} ${safe(p.name)}.xlsx`);
    toast("Excel report ready.", "ok");
  } catch (e) { console.error(e); toast(e.message || "Couldn't make the Excel file.", "error"); }
  finally { busy.done(); }
}

const REG_COLS = ["Ser.", "Project", "Appraisal %", "Auditor", "Audit Date", "Due Date", "Finding", "Location", "Type of NCR", "Ref. NCR - report", "NCR classification", "Root Cause", "Corrective/ Preventive Action Responsible Name", "Corrective/ Preventive Action Responsible Position", "Corrective Action", "Corrective Action Date", "Corrective action Status", "Follow Up", "Final Action Status", "Comments", "Business Unit Director"];
function regRow(n, i) {
  const a = S.get(n.audit_id); const p = M.project(n.project_id); const s = a ? M.score(a).total : null;
  const st = M.ncrState(n);
  const onTime = M.onTime(n);
  return [i + 1, p.name, s == null ? "" : Math.round(s * 10) / 10, a ? ((a.auditors || [])[0] || {}).name || "" : "", fmtDate(n.date), fmtDate(n.due_date), n.description, n.location || "", n.severity + (n.repeated ? " (Repeated)" : ""), n.ref, n.classification, [...(n.root_causes || []), n.other_cause].filter(Boolean).join(", "),
    n.responsible_name || "", n.responsible_position || "", n.ca_text || "", fmtDate(n.ca_date), n.status === "Carried" ? "Repeated in next audit" : n.status, n.followup_name ? `${n.followup_name}${n.followup_date ? " · " + fmtDate(n.followup_date) : ""}` : "", M.NCR_STATE[st], onTime == null ? (st === "overdue" ? "Late" : "") : onTime ? "On time" : "Late", p.bu ? `${p.bu}${p.director ? " · " + p.director : ""}` : (p.director || "")];
}
function addRegisterSheet(wb, d, list, name = "Register") {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }], pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  headerRow(ws, 1, REG_COLS, [6, 30, 10, 18, 12, 12, 46, 20, 14, 18, 26, 20, 22, 20, 36, 14, 14, 22, 18, 10, 22]);
  ws.getRow(1).height = 42;
  list.forEach((n, i) => { regRow(n, i).forEach((v, j) => { const c = ws.getCell(i + 2, j + 1); c.value = v; cellStyle(c, { fill: j === 18 ? (v === "Closed" ? "FFDDF3E6" : v === "Overdue" ? "FFFDE8E7" : null) : null }); }); });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: REG_COLS.length } };
  const ref = S.settings().findingsFormRef;
  ws.headerFooter = { oddHeader: `&L${d.short} NCR register${ref ? `&RForm Ref.: ${ref}` : ""}`, oddFooter: "&LPrinted &D&RPage &P of &N" };
  return ws;
}
function addGoodSheet(wb, list) {
  const ws = wb.addWorksheet("Good Practice");
  headerRow(ws, 1, ["Ser.", "Project", "Appraisal %", "Auditor", "Audit Date", "Subject", "Classification", "Example", "Project Director"], [6, 30, 10, 18, 12, 26, 22, 50, 20]);
  list.forEach((g, i) => { const a = S.get(g.audit_id); const p = M.project(g.project_id); const s = a ? M.score(a).total : null; [i + 1, p.name, s == null ? "" : Math.round(s * 10) / 10, a ? ((a.auditors || [])[0] || {}).name || "" : "", fmtDate(g.date), g.subject, g.classification || "", g.example || "", p.director || ""].forEach((v, j) => { const c = ws.getCell(i + 2, j + 1); c.value = v; cellStyle(c); }); });
}

export async function registerExcel(mod, list) {
  const busy = busyOverlay("Making the Excel file…");
  try {
    const ExcelJS = await ensureExcelJS(); const d = M.def(mod);
    const wb = new ExcelJS.Workbook(); addRegisterSheet(wb, d, list, `${d.short} NCR Register`);
    const buf = await wb.xlsx.writeBuffer();
    await saveBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${d.short} NCR register ${todayISO()}.xlsx`);
  } catch (e) { toast(e.message, "error"); } finally { busy.done(); }
}
export async function goodExcel(mod, list) {
  const busy = busyOverlay("Making the Excel file…");
  try {
    const ExcelJS = await ensureExcelJS(); const d = M.def(mod);
    const wb = new ExcelJS.Workbook(); addGoodSheet(wb, list);
    const buf = await wb.xlsx.writeBuffer();
    await saveBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${d.short} good practice ${todayISO()}.xlsx`);
  } catch (e) { toast(e.message, "error"); } finally { busy.done(); }
}
export async function planExcel(mod, year) {
  const busy = busyOverlay("Making the Excel file…");
  try {
    const ExcelJS = await ensureExcelJS(); const d = M.def(mod);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(`Plan ${year}`, { views: [{ state: "frozen", xSplit: 3, ySplit: 1 }] });
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    headerRow(ws, 1, ["Code", "Project", "Location", ...months], [9, 46, 16, ...months.map(() => 14)]);
    const plans = M.plans(mod).filter(p => p.year === year);
    const fills = { done: "FFDDF3E6", progress: "FFE1ECFB", overdue: "FFFDE8E7", due: "FFFFF1E3", planned: null };
    M.activeProjects().filter(p => plans.some(x => x.project_id === p.id)).forEach((p, i) => {
      const r = i + 2; [p.code, p.name, p.city].forEach((v, j) => { const c = ws.getCell(r, j + 1); c.value = v; cellStyle(c); });
      months.forEach((m, k) => { const items = plans.filter(x => x.project_id === p.id && x.month === k + 1); const c = ws.getCell(r, k + 4); c.value = items.map(x => `${(M.member(x.lead_id) || {}).name || ""} (${M.PLAN_STATE[M.planStatus(x)]})`).join("\n"); cellStyle(c, { fill: items.length ? fills[M.planStatus(items[0])] : null, size: 9 }); });
    });
    const buf = await wb.xlsx.writeBuffer();
    await saveBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${d.short} audit plan ${year}.xlsx`);
  } catch (e) { toast(e.message, "error"); } finally { busy.done(); }
}

// ---------- PowerPoint summary ----------
export async function pptReport(a) {
  const busy = busyOverlay("Making the PowerPoint…");
  try {
    const PptxGenJS = await ensurePptx();
    const d = M.def(a.module); const p = M.project(a.project_id); const sc = M.score(a); const ncrs = M.auditNCRs(a); const goods = M.auditGoods(a);
    const pptx = new PptxGenJS(); pptx.layout = "LAYOUT_WIDE"; pptx.author = "OC HSE Audit"; pptx.title = `${d.reportTitle} ${a.ref}`;
    const F = "Calibri"; const NV = "003876"; const G = sc.grade ? { green: "1B9E5A", orange: "E9851F", yellow: "EDBE2C", red: "CF2F2B" }[sc.grade.code] : "C8D2DE";
    const dark = sc.grade && ["orange", "yellow"].includes(sc.grade.code) ? "2B1700" : "FFFFFF";
    const logo = await logoData();
    pptx.defineSlideMaster({ title: "M", background: { color: "FFFFFF" }, objects: [{ rect: { x: 0, y: 7.1, w: 13.33, h: 0.4, fill: { color: NV } } }, ...(logo ? [{ image: { data: logo, x: 11.35, y: 0.3, w: 1.6, h: 0.36 } }] : []), { text: { text: `${d.reportTitle} · ${a.ref} · ${p.name}`, options: { x: 0.4, y: 7.12, w: 12.5, h: 0.36, fontFace: F, fontSize: 10, color: "FFFFFF" } } }] });
    // cover
    let s = pptx.addSlide(); s.background = { color: "00264F" };
    if (logo) { s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: 0.55, w: 2.3, h: 0.7, fill: { color: "FFFFFF" }, rectRadius: 0.1 }); s.addImage({ data: logo, x: 0.75, y: 0.7, w: 2.0, h: 0.45 }); }
    s.addText(d.reportTitle, { x: 0.6, y: 2.0, w: 8, h: 0.8, fontFace: F, fontSize: 36, bold: true, color: "FFFFFF" });
    s.addText(p.name, { x: 0.6, y: 2.9, w: 8, h: 0.9, fontFace: F, fontSize: 22, color: "C9D6E8" });
    s.addText(`${fmtDate(a.date)} · ${a.ref} · ${d.formRef}`, { x: 0.6, y: 3.9, w: 8, h: 0.5, fontFace: F, fontSize: 16, color: "9FB4CF" });
    s.addShape(pptx.ShapeType.rect, { x: 9.5, y: 1.8, w: 2.9, h: 3.4, fill: { color: G } });
    s.addShape(pptx.ShapeType.ellipse, { x: 10.8, y: 2.05, w: 0.3, h: 0.3, fill: { color: "00264F" } });
    s.addText(fmtScore(sc.total), { x: 9.5, y: 2.6, w: 2.9, h: 1.2, fontFace: F, fontSize: 48, bold: true, color: dark, align: "center" });
    s.addText(sc.grade ? sc.grade.label : "Not scored", { x: 9.5, y: 3.8, w: 2.9, h: 0.5, fontFace: F, fontSize: 18, bold: true, color: dark, align: "center" });
    s.addText(d.scoreLabel, { x: 9.5, y: 4.3, w: 2.9, h: 0.4, fontFace: F, fontSize: 12, color: dark, align: "center" });
    // summary
    s = pptx.addSlide({ masterName: "M" });
    s.addText("Summary", { x: 0.5, y: 0.3, w: 9, h: 0.7, fontFace: F, fontSize: 28, bold: true, color: NV });
    const prev = M.previousScore(a), corr = M.correctionPct(a);
    const stats = [[fmtScore(sc.total), d.scoreLabel], [prev == null ? "–" : fmtScore(prev), "Previous score"], [String(ncrs.length), "NCRs raised"], [String(ncrs.filter(n => n.severity === "Serious").length), "Serious NCRs"], [String(sc.repeatedCount), "Repeated NCRs"], [corr == null ? "–" : corr + "%", "Last audit NCRs corrected"]];
    stats.forEach(([v, l], i) => { const x = 0.5 + (i % 3) * 4.1, y = 1.3 + Math.floor(i / 3) * 1.8; s.addShape(pptx.ShapeType.rect, { x, y, w: 3.8, h: 1.5, fill: { color: "F3F6FA" }, line: { color: "D5DEE8" } }); s.addText(v, { x: x + 0.2, y: y + 0.1, w: 3.4, h: 0.8, fontFace: F, fontSize: 32, bold: true, color: i === 3 && v !== "0" ? "CF2F2B" : NV }); s.addText(l, { x: x + 0.2, y: y + 0.9, w: 3.4, h: 0.4, fontFace: F, fontSize: 14, color: "5A6B82" }); });
    s.addText([{ text: d.id === "full" ? "Auditors: " : "Assessors: ", options: { bold: true } }, { text: (a.auditors || []).map(x => x.name).filter(Boolean).join(", ") || "–" }, ...(d.id === "full" ? [{ text: "     Manpower: ", options: { bold: true } }, { text: String(a.manpower || "–") }, { text: "     Completion: ", options: { bold: true } }, { text: a.completion !== "" ? a.completion + "%" : "–" }] : [])], { x: 0.5, y: 5.1, w: 12.3, h: 0.5, fontFace: F, fontSize: 14, color: "14233B" });
    if (d.id === "full" && a.closeMeeting) s.addText([{ text: "Close meeting: ", options: { bold: true } }, { text: a.closeMeeting }], { x: 0.5, y: 5.6, w: 12.3, h: 1.2, fontFace: F, fontSize: 13, color: "14233B", valign: "top" });
    // scores by part / item
    s = pptx.addSlide({ masterName: "M" });
    s.addText(d.id === "full" ? "Appraisal by element" : "Assessment by section", { x: 0.5, y: 0.3, w: 9, h: 0.7, fontFace: F, fontSize: 28, bold: true, color: NV });
    const rows = d.id === "full" ? sc.parts.flatMap(pp => pp.items.filter(it => it.state === "rated").map(it => ({ l: it.title, v: it.value }))) : sc.parts.filter(pp => pp.score != null).map(pp => ({ l: `${pp.code}. ${pp.name}`, v: Math.round(pp.score * 1000) / 10 }));
    if (rows.length) s.addChart(pptx.ChartType.bar, [{ name: "Rating %", labels: rows.map(x => x.l), values: rows.map(x => x.v) }], { x: 0.5, y: 1.1, w: 12.3, h: 5.8, barDir: "bar", valAxisMaxVal: 100, valAxisMinVal: 0, catAxisLabelFontSize: 10, catAxisLabelFontFace: F, valAxisLabelFontSize: 10, chartColors: rows.map(x => ({ green: "1B9E5A", orange: "E9851F", yellow: "EDBE2C", red: "CF2F2B" }[gradeOf(x.v).code])), showValue: true, dataLabelFontSize: 9, dataLabelFormatCode: "0", catAxisOrientation: "maxMin" });
    // NCRs: one slide each
    for (const n of ncrs.slice(0, 40)) {
      s = pptx.addSlide({ masterName: "M" });
      const sevColor = { Serious: "CF2F2B", Major: "E9851F", Minor: "5A6B82" }[n.severity];
      s.addShape(pptx.ShapeType.rect, { x: 0.5, y: 0.35, w: 1.4, h: 0.45, fill: { color: sevColor } });
      s.addText(n.severity + (n.repeated ? " · R" : ""), { x: 0.5, y: 0.35, w: 1.4, h: 0.45, fontFace: F, fontSize: 13, bold: true, color: n.severity === "Major" ? "2B1700" : "FFFFFF", align: "center" });
      s.addText(`${n.ref} · ${n.classification}`, { x: 2.05, y: 0.33, w: 9, h: 0.5, fontFace: F, fontSize: 16, bold: true, color: NV });
      const ph = n.photos && n.photos[0] ? await photoData(n.photos[0]) : null;
      if (ph) { const sz = await imgSize(ph); const maxW = 6.2, maxH = 5.6; let w = maxW, h = w * sz.h / sz.w; if (h > maxH) { h = maxH; w = h * sz.w / sz.h; } s.addImage({ data: ph, x: 0.5, y: 1.1, w, h }); }
      else s.addText("No photo", { x: 0.5, y: 1.1, w: 6.2, h: 4.6, fill: { color: "EEF2F6" }, fontFace: F, fontSize: 16, color: "8494AA", align: "center", valign: "middle" });
      s.addText([
        { text: "What was seen\n", options: { bold: true, color: "5A6B82", fontSize: 12 } }, { text: n.description + "\n\n", options: { fontSize: 18 } },
        { text: "Location: ", options: { bold: true } }, { text: (n.location || "–") + "\n" },
        { text: "Root cause: ", options: { bold: true } }, { text: ([...(n.root_causes || []), n.other_cause].filter(Boolean).join(", ") || "–") + "\n" },
        { text: "Action required: ", options: { bold: true } }, { text: (n.action_required || "–") + "\n" },
        { text: "Responsible: ", options: { bold: true } }, { text: ([n.responsible_name, n.responsible_position].filter(Boolean).join(", ") || "–") + "\n" },
        { text: "Deadline: ", options: { bold: true } }, { text: fmtDate(n.due_date) || "–" },
      ], { x: 7.0, y: 1.1, w: 5.9, h: 5.7, fontFace: F, fontSize: 14, color: "14233B", valign: "top" });
    }
    if (goods.length) {
      s = pptx.addSlide({ masterName: "M" });
      s.addText("Good practice", { x: 0.5, y: 0.3, w: 9, h: 0.7, fontFace: F, fontSize: 28, bold: true, color: NV });
      s.addTable([[{ text: "Subject", options: { bold: true, fill: { color: "E3E9F1" } } }, { text: "Classification", options: { bold: true, fill: { color: "E3E9F1" } } }, { text: "Example", options: { bold: true, fill: { color: "E3E9F1" } } }], ...goods.map(g => [g.subject, g.classification || "", g.example || ""])], { x: 0.5, y: 1.2, w: 12.3, colW: [3.2, 2.6, 6.5], fontFace: F, fontSize: 13, border: { type: "solid", color: "D5DEE8", pt: 1 } });
    }
    const name = `${safe(a.ref)} ${safe(p.name)}.pptx`;
    const blob = await pptx.write({ outputType: "blob" });
    await saveBlob(blob, name);
    toast("PowerPoint ready.", "ok");
  } catch (e) { console.error(e); toast(e.message || "Couldn't make the PowerPoint.", "error"); }
  finally { busy.done(); }
}
