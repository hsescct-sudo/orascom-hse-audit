// Excel outputs: F-HSE-0075 report for one audit, and the findings register.
import { ensureExcelJS, fmtDate, fRef, aRef, findingState, STATE_LABEL, RISK_LABEL } from "./ui.js";
import { TOPICS, TOTAL_CHECKS, topicName, ITEM } from "./checklist.js";
import { SETTINGS } from "./settings.js";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const nLines = (s, cpl) => String(s || "").split("\n").reduce((n, p) => n + Math.max(1, Math.ceil(p.length / cpl)), 0);
const isoToDate = s => { const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
let LOGO = null;
export async function logoData() {
  if (LOGO) return LOGO;
  const b = await (await fetch("assets/orascom-logo.png")).blob();
  LOGO = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
  return LOGO;
}
export async function imageData(url) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return { data: c.toDataURL("image/jpeg", 0.8), w: c.width, h: c.height };
}

export function defaultScope(audit, projectName) {
  return `Corporate HSE Flash Audit carried out at ${projectName || "the project"} on ${fmtDate(audit.audit_date)}. The audit focused on critical life-saving controls and high-risk activities: ${TOPICS.slice(0, 12).map(t => t.name).join(", ")}.${audit.areas ? " Areas visited: " + audit.areas + "." : ""}`;
}
export function defaultConclusion(audit, findings) {
  const checks = Object.values(audit.checks || {});
  const ok = checks.filter(v => v === "ok").length, nc = checks.filter(v => v === "nc").length;
  const comp = ok + nc ? Math.round((100 * ok) / (ok + nc)) : null;
  const by = r => findings.filter(f => f.risk === r).length;
  const closed = findings.filter(f => f.status === "closed").length;
  return (checks.length ? `${checks.length} of ${TOTAL_CHECKS} checks were completed${comp != null ? ` with an overall compliance of ${comp}%` : ""}. ` : "") +
    `${findings.length} observations were raised (${by("High")} high, ${by("Med")} medium, ${by("Low")} low risk); ${closed} are closed and ${findings.length - closed} remain open with agreed actions, owners and target dates.`;
}
export function actionText(f) {
  if (f.fixed_on_spot || f.status === "closed" && f.immediate_action && !f.interim_control) return [f.immediate_action, f.closure_note && f.closure_note !== f.immediate_action ? f.closure_note : ""].filter(Boolean).join("\n");
  const p = [];
  if (f.immediate_action) p.push(f.immediate_action);
  if (f.interim_control) p.push("Interim control: " + f.interim_control);
  if (f.action_plan) p.push("Action plan: " + f.action_plan);
  p.push(`Owner: ${f.owner || "TBC"} – Target: ${fmtDate(f.target_date) || "TBC"}`);
  if (f.status === "closed" && f.closure_note) p.push("Closed: " + f.closure_note);
  return p.join("\n");
}

// photosByFinding: {findingId: [{kind, path}]}, urls: {path: url}
export async function buildAuditReport({ audit, project, findings, photosByFinding, urls, onProgress }) {
  const ExcelJS = await ensureExcelJS();
  const wb = new ExcelJS.Workbook(); wb.creator = "HSE Flash Audit System"; wb.created = new Date();
  const ws = wb.addWorksheet("HSE Flash Audit Report", { views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } } });
  const COLW = [4.11, 17, 35.66, 15.44, 17.11, 38.55];
  COLW.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const colPx = w => Math.round(w * 7 + 5), EMU = 9525;
  const thin = { style: "thin", color: { argb: "FF000000" } }, box = { top: thin, left: thin, bottom: thin, right: thin };
  const F = o => Object.assign({ name: "Calibri", size: 11 }, o || {});
  const put = (addr, v, font, align, fill, border) => { const c = ws.getCell(addr); c.value = v; if (font) c.font = font; if (align) c.alignment = align; if (fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } }; if (border) c.border = border; return c; };

  ws.getRow(1).height = 22; ws.getRow(2).height = 22;
  ws.addImage(wb.addImage({ base64: await logoData(), extension: "png" }), { tl: { nativeCol: 0, nativeColOff: 3 * EMU, nativeRow: 0, nativeRowOff: 3 * EMU }, ext: { width: 150, height: 34 }, editAs: "oneCell" });
  ws.mergeCells("C1:E2");
  const R = SETTINGS.report;
  put("C1", R.title || "HSE Flash Audit Report", F({ size: 16, bold: true }), { horizontal: "center", vertical: "middle" });
  put("F1", "Form Ref.: " + (R.formRef || ""), F({ bold: true }), { vertical: "middle" });
  put("F2", "Form Rev.: " + (R.formRev || ""), F({ bold: true }), { vertical: "middle" });
  put("A2", (R.dept || "") + " ", F({ size: 9 }), { vertical: "bottom" });
  for (let c = 1; c <= 6; c++) { const cell = ws.getCell(2, c); cell.border = Object.assign({}, cell.border, { bottom: { style: "medium", color: { argb: "FF4F81BD" } } }); }

  const dt = isoToDate(audit.audit_date);
  const pocVal = audit.poc == null || audit.poc === "" ? "" : Number(audit.poc) / 100;
  const hdr = [[4, "Project ", project?.name || "", "Project Manager ", audit.pm || project?.pm || ""],
    [5, "Date of Audit:", dt || "", "P. O. C. ", pocVal], [6, "Auditors:", audit.auditor || "", "Manpower ", audit.manpower ?? ""]];
  hdr.forEach(([r, l1, v1, l2, v2]) => {
    ws.mergeCells(`A${r}:B${r}`); ws.mergeCells(`C${r}:D${r}`);
    put(`A${r}`, l1, F({ bold: true }), { vertical: "middle" });
    put(`C${r}`, v1, F(), { horizontal: "center", vertical: "middle", wrapText: true });
    put(`E${r}`, l2, F({ bold: true }), { vertical: "middle" });
    put(`F${r}`, v2, F(), { horizontal: "center", vertical: "middle", wrapText: true });
    for (let c = 1; c <= 6; c++) ws.getCell(r, c).border = box;
    ws.getRow(r).height = 18;
  });
  if (dt) ws.getCell("C5").numFmt = "dd/mm/yyyy";
  if (pocVal !== "") ws.getCell("F5").numFmt = "0%";
  if (audit.manpower != null) ws.getCell("F6").numFmt = "#,##0";

  const scope = audit.scope || defaultScope(audit, project?.name);
  put("A8", "Purpose & Scope of Flash Audit", F({ bold: true }));
  ws.mergeCells("A9:F10");
  put("A9", scope, F(), { wrapText: true, vertical: "top", horizontal: "left" });
  const sh = Math.max(15, nLines(scope, 120) * 15 / 2 + 3); ws.getRow(9).height = sh; ws.getRow(10).height = sh;

  put("A12", "Audit Observations", F({ bold: true }));
  ["#", "Area", "Observation", "Risk Level (High/Med/Low)", "Root Cause ", "Immediate Action Taken"].forEach((v, i) => {
    const c = ws.getCell(13, i + 1); c.value = v; c.font = F({ bold: true, color: { argb: "FFFFFFFF" } });
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F81BD" } }; c.border = box;
  });
  ws.getRow(13).height = 26.4;
  let r = 14;
  findings.forEach((f, i) => {
    const closed = f.status === "closed", act = actionText(f);
    put(`A${r}`, i + 1, F(), { horizontal: "center", vertical: "middle" }, null, box);
    put(`B${r}`, f.area || "", F({ name: "Candara", size: 14, bold: true }), { horizontal: "center", vertical: "middle", wrapText: true }, null, box);
    put(`C${r}`, f.observation, F(), { horizontal: "left", vertical: "middle", wrapText: true }, null, box);
    put(`D${r}`, f.risk, F(), { horizontal: "center", vertical: "middle" }, null, box);
    ws.getCell(`D${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"High,Med,Low"'] };
    put(`E${r}`, f.root_cause || "", F(), { horizontal: "left", vertical: "middle", wrapText: true }, null, box);
    put(`F${r}`, act, F(), { horizontal: "left", vertical: "middle", wrapText: true }, closed ? "FF00B050" : "FFFFFF00", box);
    const lines = Math.max(nLines(f.observation, 40), nLines(f.root_cause, 18), nLines(act, 43), nLines(f.area, 12) * 1.4);
    ws.getRow(r).height = Math.min(409, Math.max(60, lines * 15 + 16));
    r++;
  });
  if (!findings.length) { ws.mergeCells(`A${r}:F${r}`); put(`A${r}`, "No non-conformities were raised during this audit.", F({ italic: true }), { horizontal: "center", vertical: "middle" }, null, box); ws.getRow(r).height = 24; r++; }
  const o1 = 14, o2 = Math.max(14, r - 1);
  r++;
  put(`A${r}`, "Summary of Key Findings", F({ bold: true, size: 10 })); r++;
  const cnt = k => findings.filter(f => f.risk === k).length;
  [["Total Observations", `COUNTA(D${o1}:D${o2})`, findings.length], ["High Risk", `COUNTIF(D${o1}:D${o2},"High")`, cnt("High")], ["Medium Risk", `COUNTIF(D${o1}:D${o2},"Med")`, cnt("Med")], ["Low Risk", `COUNTIF(D${o1}:D${o2},"Low")`, cnt("Low")]].forEach(([l, f, v]) => {
    put(`B${r}`, l, F({ bold: true, size: 10 }), { vertical: "middle" }, null, box);
    put(`C${r}`, findings.length ? { formula: f, result: v } : 0, F(), { horizontal: "center", vertical: "middle" }, null, box); r++;
  });
  r++;
  const red = { argb: "FFFF0000" };
  put(`A${r}`, "Issues need high level support ", F({ bold: true, size: 16, color: red })); r++;
  const sup = findings.map((f, i) => ({ n: i + 1, f })).filter(x => x.f.needs_support);
  (sup.length ? sup : [{ n: "–", f: { support_title: "None" } }]).forEach(({ n, f }) => {
    ws.mergeCells(`B${r}:C${r}`);
    put(`A${r}`, n, F({ bold: true, color: red }), { horizontal: "center", vertical: "middle" }, null, box);
    put(`B${r}`, f.support_title || topicName(f.topic), F({ bold: true, color: red }), { vertical: "middle" }, null, box);
    ws.getCell(`C${r}`).border = box; r++;
  });
  r++;
  const concl = audit.conclusion || defaultConclusion(audit, findings);
  put(`A${r}`, "Conclusion", F({ bold: true })); r++;
  ws.mergeCells(`A${r}:F${r}`); put(`A${r}`, concl, F(), { wrapText: true, vertical: "top", horizontal: "left" });
  ws.getRow(r).height = Math.min(409, Math.max(18, nLines(concl, 120) * 15 + 4)); r += 2;

  ["No", "Location / Area", "Photo of Violation", "Due Date", "Status", "Closure Evidence"].forEach((v, i) => {
    const c = ws.getCell(r, i + 1); c.value = v; c.font = F({ name: "Candara", size: 12, bold: true });
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8EB4E3" } }; c.border = box;
  });
  ws.getRow(r).height = 27; r++;
  const cPx = colPx(COLW[2]), fPx = colPx(COLW[5]);
  const total = findings.reduce((n, f) => n + Math.min(3, (photosByFinding[f.id] || []).filter(p => p.kind === "violation").length) + Math.min(3, (photosByFinding[f.id] || []).filter(p => p.kind === "closure").length), 0);
  let done = 0, failed = 0;
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i], ph = photosByFinding[f.id] || [], closed = f.status === "closed";
    const before = ph.filter(p => p.kind === "violation").slice(0, 3), after = ph.filter(p => p.kind === "closure").slice(0, 3);
    const n = Math.max(1, before.length, after.length), slot = n === 1 ? 210 : n === 2 ? 190 : 175;
    ws.getRow(r).height = Math.min(409, Math.min(545, n * slot + 8) * 0.75);
    const big = F({ name: "Candara", size: 14, bold: true });
    put(`A${r}`, i + 1, big, { horizontal: "center", vertical: "middle" }, null, box);
    put(`B${r}`, f.area || "", big, { horizontal: "center", vertical: "middle", wrapText: true }, null, box);
    put(`C${r}`, before.length ? "" : "No photo", F({ italic: true, color: { argb: "FF808080" } }), { horizontal: "center", vertical: "middle" }, null, box);
    put(`D${r}`, f.fixed_on_spot ? "Immediately" : (fmtDate(f.target_date) || "TBC"), F({ name: "Candara", size: 12, bold: true }), { horizontal: "center", vertical: "middle", wrapText: true }, null, box);
    put(`E${r}`, closed ? "Done" : f.status === "pending" ? "Under Review" : "On Going", big, { horizontal: "center", vertical: "middle", wrapText: true }, closed ? "FF00B050" : "FFFFFF00", box);
    put(`F${r}`, after.length ? "" : closed ? "" : "Pending", F({ name: "Candara", size: 11 }), { horizontal: "center", vertical: "middle" }, null, box);
    const place = async (list, col, wPx) => {
      for (let k = 0; k < list.length; k++) {
        try {
          const im = await imageData(urls[list[k].path]);
          const s = Math.min((wPx - 12) / im.w, (slot - 10) / im.h), w = Math.round(im.w * s), h = Math.round(im.h * s);
          const x0 = Math.round((wPx - w) / 2), y0 = Math.round(4 + k * slot + (slot - h) / 2);
          ws.addImage(wb.addImage({ base64: im.data, extension: "jpeg" }), { tl: { nativeCol: col, nativeColOff: x0 * EMU, nativeRow: r - 1, nativeRowOff: y0 * EMU }, ext: { width: w, height: h }, editAs: "oneCell" });
        } catch (e) { failed++; }
        done++; if (onProgress) onProgress(done, total);
      }
    };
    await place(before, 2, cPx); await place(after, 5, fPx);
    r++;
  }
  ws.pageSetup.printArea = `A1:F${r - 1}`;
  return { blob: new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_TYPE }), failed };
}

export async function buildRegister(findings, { photoCount = {} } = {}) {
  const ExcelJS = await ensureExcelJS();
  const wb = new ExcelJS.Workbook(); wb.creator = "HSE Flash Audit System";
  const ws = wb.addWorksheet("Findings register", { views: [{ state: "frozen", ySplit: 1 }] });
  const cols = [["Ref", 10], ["Audit", 9], ["Audit date", 12], ["Audit type", 11], ["Project", 34], ["Area", 18], ["Topic", 22], ["Check item", 40], ["Observation", 50], ["Risk", 9], ["Status", 15], ["Root cause", 26], ["Immediate action", 40], ["Interim control", 34], ["Action plan", 34], ["Owner", 20], ["Target date", 12], ["Days open", 10], ["Closure note", 34], ["Closed by", 16], ["Closed on", 12], ["Needs management support", 14], ["Violation photos", 10], ["Closure photos", 10]];
  ws.columns = cols.map(([header, width]) => ({ header, width }));
  const today = new Date().toISOString().slice(0, 10);
  findings.forEach(f => {
    const st = findingState(f);
    const end = f.closed_at ? f.closed_at.slice(0, 10) : today;
    const start = (f.audits && f.audits.audit_date) || f.created_at.slice(0, 10);
    const row = ws.addRow([fRef(f.ref), f.audits ? aRef(f.audits.ref) : "", isoToDate(start), f.audits ? (f.audits.audit_type === "corporate" ? "Corporate" : "Project") : "", f.projects?.name || "", f.area, topicName(f.topic), ITEM[f.item_id]?.text || "", f.observation, RISK_LABEL[f.risk] || f.risk, STATE_LABEL[st], f.root_cause, f.immediate_action, f.interim_control, f.action_plan, f.owner, isoToDate(f.target_date), Math.max(0, Math.round((new Date(end) - new Date(start)) / 86400000)), f.closure_note, f.closed_by, f.closed_at ? isoToDate(f.closed_at) : null, f.needs_support ? "Yes" : "", photoCount[f.id]?.violation || 0, photoCount[f.id]?.closure || 0]);
    row.alignment = { vertical: "top", wrapText: true };
    const fill = { overdue: "FFF8D7D7", open: "FFFDE7D9", pending: "FFDDEBFA", closed: "FFDFF3DF" }[st];
    row.getCell(11).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  });
  [3, 17, 21].forEach(c => { ws.getColumn(c).numFmt = "dd/mm/yyyy"; });
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } }; head.height = 30;
  head.alignment = { vertical: "middle", wrapText: true };
  head.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF003876" } }; });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_TYPE });
}
