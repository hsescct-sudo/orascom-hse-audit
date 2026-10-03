// Reads an F-HSE-0075 "HSE Flash Audit Report" workbook (the corporate format) into plain data.
// Works with ExcelJS in the browser and in Node. Finds sections by their labels, not fixed cells,
// so small layout differences between projects still import.

const norm = s => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
const low = s => norm(s).toLowerCase();
function cellText(c) {
  if (!c) return "";
  const v = c.value;
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if (v.richText) return v.richText.map(t => t.text).join("");
    if ("result" in v) return v.result == null ? "" : String(v.result);
    if (v.text) return String(v.text);
  }
  return String(v);
}
function cellDate(c) {
  const v = c && c.value;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = norm(cellText(c));
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}
const isPlaceholder = s => /^a quick visual summary|^provide overall hse performance/i.test(norm(s));
function addDaysISO(iso, n) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

export function parseFlashAudit(wb) {
  const ws = wb.worksheets.find(w => /flash audit/i.test(w.name)) || wb.worksheets[0];
  if (!ws) throw new Error("The file has no worksheet.");
  const warnings = [];
  const maxRow = ws.rowCount, maxCol = Math.min(ws.columnCount || 10, 12);
  const rowTexts = r => { const out = []; for (let c = 1; c <= maxCol; c++) out.push(norm(cellText(ws.getCell(r, c)))); return out; };
  const findRow = (re, from = 1, to = maxRow) => { for (let r = from; r <= to; r++) { if (rowTexts(r).some(t => re.test(t))) return r; } return 0; };

  // header block
  const header = { project: "", pm: "", date: null, auditors: "", poc: null, manpower: null };
  const labelValue = (re, kind) => {
    for (let r = 1; r <= Math.min(maxRow, 20); r++) {
      for (let c = 1; c <= maxCol; c++) {
        const labelCell = ws.getCell(r, c);
        if (!re.test(norm(cellText(labelCell)))) continue;
        const labelMaster = (labelCell.isMerged && labelCell.master) ? labelCell.master.address : labelCell.address;
        for (let k = c + 1; k <= maxCol; k++) {
          const raw = ws.getCell(r, k);
          const cell = raw.isMerged && raw.master ? raw.master : raw;
          if (cell.address === labelMaster) continue;
          const t = norm(cellText(cell));
          if (t && !/^(project manager|p\. ?o\. ?c\.?|manpower|date of audit:?|auditors?:?|project)$/i.test(t)) return kind === "date" ? cellDate(cell) : kind === "num" ? cell.value : t;
        }
      }
    }
    return kind === "date" ? null : "";
  };
  header.project = labelValue(/^project$/i);
  header.pm = labelValue(/^project manager$/i);
  header.date = labelValue(/^date of audit:?$/i, "date");
  header.auditors = labelValue(/^auditors?:?$/i);
  const poc = labelValue(/^p\. ?o\. ?c\.?$/i, "num");
  const pocN = typeof poc === "number" ? poc : parseFloat(String(poc?.result ?? poc ?? "").replace(/[^\d.]/g, ""));
  header.poc = isNaN(pocN) ? null : pocN <= 1 ? Math.round(pocN * 100) : Math.round(pocN);
  const mp = labelValue(/^manpower$/i, "num");
  const mpN = typeof mp === "number" ? mp : parseInt(String(mp?.result ?? mp ?? "").replace(/[^\d]/g, ""), 10);
  header.manpower = isNaN(mpN) ? null : mpN;
  if (!header.date) warnings.push("No audit date found — today's date will be used unless you change it.");

  // scope
  let scope = "";
  const rScope = findRow(/^purpose & scope/i);
  if (rScope) { const t = norm(cellText(ws.getCell(rScope + 1, 1))); if (!isPlaceholder(t)) scope = cellText(ws.getCell(rScope + 1, 1)).trim(); }

  // observations table
  const rHead = (() => { for (let r = 1; r <= maxRow; r++) { const t = rowTexts(r).map(x => x.toLowerCase()); if (t.includes("observation") && t.some(x => x === "area")) return r; } return 0; })();
  if (!rHead) throw new Error("This doesn't look like an F-HSE-0075 Flash Audit report: the 'Audit Observations' table wasn't found.");
  const hcols = {}; rowTexts(rHead).forEach((t, i) => {
    const l = t.toLowerCase(); const c = i + 1;
    if (l === "#" || l === "no" || l === "no.") hcols.num = c; else if (l === "area") hcols.area = c; else if (l === "observation") hcols.obs = c;
    else if (l.startsWith("risk")) hcols.risk = c; else if (l.startsWith("root cause")) hcols.rc = c; else if (l.startsWith("immediate action")) hcols.act = c;
  });
  const findings = [];
  for (let r = rHead + 1; r <= maxRow; r++) {
    const t = rowTexts(r);
    if (t.some(x => /^summary of key findings/i.test(x))) break;
    const obs = hcols.obs ? norm(cellText(ws.getCell(r, hcols.obs))) : "";
    const numRaw = hcols.num ? cellText(ws.getCell(r, hcols.num)) : "";
    if (!obs) { if (findings.length && !norm(numRaw)) continue; if (!norm(numRaw)) continue; }
    const num = parseInt(numRaw, 10);
    const riskT = hcols.risk ? low(cellText(ws.getCell(r, hcols.risk))) : "";
    const actCell = hcols.act ? ws.getCell(r, hcols.act) : null;
    const fill = actCell && actCell.fill && actCell.fill.fgColor && (actCell.fill.fgColor.argb || "");
    findings.push({
      seq: isNaN(num) ? findings.length + 1 : num,
      row: r,
      area: hcols.area ? cellText(ws.getCell(r, hcols.area)).replace(/\n{2,}/g, " / ").replace(/\s*\n\s*/g, " ").trim() : "",
      observation: hcols.obs ? cellText(ws.getCell(r, hcols.obs)).trim() : "",
      risk: /high/.test(riskT) ? "High" : /low/.test(riskT) ? "Low" : "Med",
      root_cause: hcols.rc ? cellText(ws.getCell(r, hcols.rc)).split(/\n+/).map(norm).filter(Boolean).join("\n") : "",
      action: actCell ? cellText(actCell).trim() : "",
      greenAction: /00B050$/i.test(fill || ""),
      status: null, due: "", target_date: null, fixed_on_spot: false,
      needs_support: false, support_title: "",
      photos: { violation: [], closure: [] },
    });
  }
  if (!findings.length) warnings.push("No observations were found in the table.");

  // issues for management
  const rSup = findRow(/^issues need high level support/i);
  if (rSup) {
    for (let r = rSup + 1; r <= Math.min(maxRow, rSup + 40); r++) {
      const t = rowTexts(r);
      if (t.some(x => /^conclusion$/i.test(x))) break;
      const n = parseInt(t[0], 10);
      const title = t.slice(1).find(Boolean) || "";
      if (!isNaN(n)) { const f = findings.find(x => x.seq === n); if (f) { f.needs_support = true; f.support_title = title; } }
    }
  }
  // conclusion
  let conclusion = "";
  const rCon = findRow(/^conclusion$/i, rHead);
  if (rCon) { const t = cellText(ws.getCell(rCon + 1, 1)).trim(); if (t && !isPlaceholder(t)) conclusion = t; }

  // photo table
  const rPh = (() => { for (let r = rHead + 1; r <= maxRow; r++) if (rowTexts(r).some(x => /^photo of violation$/i.test(x))) return r; return 0; })();
  const pcols = {};
  const photoRows = [];
  if (rPh) {
    rowTexts(rPh).forEach((t, i) => { const l = t.toLowerCase(), c = i + 1; if (/^no\.?$|^#$/.test(l)) pcols.num = c; else if (/photo of violation/.test(l)) pcols.vio = c; else if (/due/.test(l)) pcols.due = c; else if (/status/.test(l)) pcols.status = c; else if (/closure/.test(l)) pcols.clo = c; });
    for (let r = rPh + 1; r <= maxRow; r++) {
      const n = parseInt(cellText(ws.getCell(r, pcols.num || 1)), 10);
      if (isNaN(n)) continue;
      photoRows.push({ r, n });
      const f = findings.find(x => x.seq === n); if (!f) continue;
      const due = pcols.due ? norm(cellText(ws.getCell(r, pcols.due))) : "";
      const dueDate = pcols.due ? cellDate(ws.getCell(r, pcols.due)) : null;
      const st = pcols.status ? low(cellText(ws.getCell(r, pcols.status))) : "";
      f.due = due;
      f.status = /done|closed|complete/.test(st) ? "closed" : st ? "open" : null;
      const base = header.date || new Date().toISOString().slice(0, 10);
      if (/^immediate/i.test(due)) { f.fixed_on_spot = true; f.target_date = base; }
      else if (dueDate) f.target_date = dueDate;
      else { const m = due.match(/(\d+|one|two|three|four)\s*(day|week|month)/i); if (m) { const k = { one: 1, two: 2, three: 3, four: 4 }[m[1].toLowerCase()] || parseInt(m[1], 10); f.target_date = addDaysISO(base, k * (/week/i.test(m[2]) ? 7 : /month/i.test(m[2]) ? 30 : 1)); } }
    }
  } else warnings.push("No photo table was found, so no photos will be imported.");
  findings.forEach(f => { if (!f.status) f.status = f.greenAction ? "closed" : "open"; });

  // images
  let imgCount = 0;
  if (rPh && ws.getImages) {
    const rowToSeq = r => { let best = null; for (const pr of photoRows) if (pr.r <= r) best = pr.n; return best; };
    const imgs = ws.getImages().map(im => ({ im, row: im.range.tl.nativeRow + 1, col: im.range.tl.nativeCol + 1 }))
      .filter(x => x.row > rPh)
      .sort((a, b) => a.row - b.row || (a.im.range.tl.nativeRowOff || 0) - (b.im.range.tl.nativeRowOff || 0));
    for (const { im, row, col } of imgs) {
      const seq = rowToSeq(row); const f = findings.find(x => x.seq === seq); if (!f) continue;
      const kind = col === pcols.vio ? "violation" : col === pcols.clo ? "closure" : (pcols.clo && Math.abs(col - pcols.clo) < Math.abs(col - (pcols.vio || 3)) ? "closure" : "violation");
      const media = wb.getImage(im.imageId);
      if (!media || !media.buffer) continue;
      f.photos[kind].push({ buffer: media.buffer, ext: media.extension || "jpeg" });
      imgCount++;
    }
  }
  return { header, scope, conclusion, findings, warnings, imageCount: imgCount };
}
