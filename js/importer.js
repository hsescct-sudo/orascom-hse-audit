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

// ===========================================================================
// Any other sheet: find the columns by their headings (English or Arabic), read every row
// that has an observation, and attach the pictures sitting on that row — floating pictures,
// pictures placed inside cells (Excel 365) and WPS "DISPIMG" pictures. Cell notes are kept.
export const FIELDS = [
  ["obs", "Observation / finding", /observ|finding|description|issue|comment|remark|hazard|non.?conform|deviation|details|unsafe|condition|violation desc|ملاحظ|وصف|المخالف|الملاحظة/i],
  ["rc", "Root cause", /root|cause|السبب|سبب/i],
  ["action", "Action / corrective action", /action|corrective|recommend|measure|mitigat|rectif|control|الإجراء|الاجراء|إجراء|اجراء/i],
  ["risk", "Risk level", /risk|severity|priority|rating|level|class|الخطور|الخطر/i],
  ["area", "Area / location", /area|location|zone|place|building|block|المنطقة|الموقع|مكان/i],
  ["owner", "Owner / responsible", /owner|responsib|action by|assigned|person in charge|المسئول|المسؤول/i],
  ["target", "Target date", /target|due|deadline|close.?date|completion|التاريخ المستهدف|موعد/i],
  ["status", "Status", /status|state|open.?\/.?closed|closed|الحالة|حالة/i],
  ["topic", "Topic / category", /topic|category|type|element|discipline|aspect|التصنيف|النوع|البند/i],
  ["num", "Number", /^(#|no\.?|n\.?|s\/?n|s\.n\.?|sr\.?|serial|item|م|رقم)$/i],
];
const PHOTO_HEAD = /photo|picture|image|pic|before|after|evidence|صور|صورة/i;
const CLOSURE_HEAD = /after|closure|close|evidence of|rectif|corrected|correction|بعد|الإغلاق|الاغلاق/i;

export function normRisk(t) {
  const s = low(t);
  if (!s) return "Med";
  if (/high|^h$|critical|major|severe|red|^3$|عال|مرتفع/.test(s)) return "High";
  if (/low|^l$|minor|green|^1$|منخفض/.test(s)) return "Low";
  return "Med";
}
export const isClosedText = t => /closed|done|complete|rectified|fixed|^yes$|^y$|✓|✔|^ok$|تم|مغلق|مقفول/i.test(norm(t));
function noteText(c) {
  const n = c && c.note; if (!n) return "";
  if (typeof n === "string") return norm(n);
  if (n.texts) return norm(n.texts.map(t => t.text).join(""));
  return "";
}

// Find the heading row and guess which column holds which field.
export function analyzeSheet(ws, images = []) {
  const maxRow = Math.min(ws.rowCount || 0, 3000), maxCol = Math.min(Math.max(ws.columnCount || 0, 1), 40);
  const txt = (r, c) => norm(cellText(ws.getCell(r, c)));
  let best = { row: 0, score: 0 };
  for (let r = 1; r <= Math.min(maxRow, 40); r++) {
    const hits = new Set(); let photo = 0, filled = 0, long = 0;
    for (let c = 1; c <= maxCol; c++) {
      const t = txt(r, c); if (!t) continue; filled++;
      if (t.length > 35) { long++; continue; }
      FIELDS.forEach(([key, , re]) => { if (re.test(t)) hits.add(key); });
      if (PHOTO_HEAD.test(t)) photo++;
    }
    // a heading row has short labels naming at least two different fields
    const score = hits.size + (photo ? 0.5 : 0) - long;
    if (filled >= 2 && hits.size >= 2 && score > best.score) best = { row: r, score };
  }
  const headerRow = best.score >= 1.5 ? best.row : 0;
  const cols = [];
  for (let c = 1; c <= maxCol; c++) cols.push({ c, label: headerRow ? txt(headerRow, c) : "" });
  const mapping = {};
  if (headerRow) {
    const used = new Set();
    for (const [key, , re] of FIELDS) {
      const photoOnly = l => PHOTO_HEAD.test(l) && !re.test(l.replace(new RegExp(PHOTO_HEAD.source, "gi"), " "));
      const hit = cols.find(x => x.label && !used.has(x.c) && re.test(x.label) && !photoOnly(x.label));
      if (hit) { mapping[key] = hit.c; used.add(hit.c); }
    }
  }
  const start = headerRow + 1;
  if (!mapping.obs) {
    // no heading for the observation: take the column with the longest text
    let bestC = 0, bestLen = 0;
    for (let c = 1; c <= maxCol; c++) {
      if (Object.values(mapping).includes(c)) continue;
      let sum = 0; for (let r = start; r <= Math.min(maxRow, start + 60); r++) sum += txt(r, c).length;
      if (sum > bestLen) { bestLen = sum; bestC = c; }
    }
    if (bestC) mapping.obs = bestC;
  }
  // columns that hold pictures, and whether they look like "before" or "after"
  const imgCols = [...new Set(images.filter(im => im.row > headerRow).map(im => im.col))].sort((a, b) => a - b);
  const photoKinds = {};
  imgCols.forEach((c, i) => {
    const head = headerRow ? txt(headerRow, c) : "";
    // unlabeled picture columns count as violation photos, except the last of several under a heading row ("before | after")
    photoKinds[c] = CLOSURE_HEAD.test(head) ? "closure" : PHOTO_HEAD.test(head) ? "violation" : (headerRow && imgCols.length > 1 && i === imgCols.length - 1 && !imgCols.some(x => PHOTO_HEAD.test(txt(headerRow, x))) ? "closure" : "violation");
  });
  return { headerRow, cols, mapping, photoKinds, maxRow, maxCol };
}

// Read the rows with the chosen mapping. `images` = [{row, col, buffer, ext}] for this sheet.
export function extractRows(ws, an, images = [], baseDate = null, notesMap = {}) {
  const { headerRow, mapping, photoKinds, maxRow, maxCol } = an;
  const get = (r, key) => (mapping[key] ? ws.getCell(r, mapping[key]) : null);
  const text = (r, key) => { const c = get(r, key); return c ? cellText(c).trim() : ""; };
  const starts = [];
  for (let r = headerRow + 1; r <= maxRow; r++) {
    const oc = get(r, "obs");
    if (!oc) break;
    if (oc.isMerged && oc.master && oc.master.address !== oc.address) continue; // continuation of a merged cell
    let obs = norm(cellText(oc));
    const notes = []; for (let c = 1; c <= maxCol; c++) { const cell = ws.getCell(r, c); const n = noteText(cell) || norm(notesMap[cell.address] || ""); if (n && !notes.includes(n)) notes.push(n); }
    if (!obs && !notes.length) continue;
    if (FIELDS[0][2].test(obs) && obs.length < 40 && r <= headerRow + 1 && !headerRow) continue;
    starts.push({ r, notes });
  }
  const findings = starts.map(({ r, notes }, i) => {
    const obsRaw = text(r, "obs");
    const noteStr = notes.filter(n => !obsRaw.includes(n)).join("\n");
    const status = mapping.status ? (isClosedText(text(r, "status")) ? "closed" : "open") : null;
    const tCell = get(r, "target");
    const dueTxt = tCell ? norm(cellText(tCell)) : "";
    let target = tCell ? cellDate(tCell) : null;
    const base = baseDate || new Date().toISOString().slice(0, 10);
    if (!target && dueTxt) { const m = dueTxt.match(/(\d+|one|two|three|four)\s*(day|week|month)/i); if (m) { const k = { one: 1, two: 2, three: 3, four: 4 }[m[1].toLowerCase()] || parseInt(m[1], 10); target = addDaysISO(base, k * (/week/i.test(m[2]) ? 7 : /month/i.test(m[2]) ? 30 : 1)); } }
    const num = parseInt(text(r, "num"), 10);
    return {
      seq: isNaN(num) ? i + 1 : num, row: r, rowEnd: (starts[i + 1] ? starts[i + 1].r : maxRow + 1) - 1,
      area: text(r, "area").replace(/\s*\n\s*/g, " "), observation: obsRaw || noteStr, note: obsRaw ? noteStr : "",
      risk: normRisk(text(r, "risk")), root_cause: text(r, "rc").split(/\n+/).map(norm).filter(Boolean).join("\n"),
      action: text(r, "action"), owner: text(r, "owner"), category: text(r, "topic"),
      status, due: dueTxt, target_date: target, fixed_on_spot: /^immediate|on.?the.?spot|فور/i.test(dueTxt),
      needs_support: false, support_title: "", photos: { violation: [], closure: [] },
    };
  });
  let imgCount = 0;
  images.filter(im => im.row > headerRow).sort((a, b) => a.row - b.row || a.col - b.col || (a.off || 0) - (b.off || 0)).forEach(im => {
    const kind = photoKinds[im.col]; if (kind === "ignore") return;
    const f = findings.find(x => im.row >= x.row && im.row <= x.rowEnd); if (!f) return;
    f.photos[kind || "violation"].push({ buffer: im.buffer, ext: im.ext }); imgCount++;
  });
  findings.forEach(f => {
    if (!f.status) f.status = f.photos.closure.length ? "closed" : "open";
    if (f.note) f.observation = f.observation + "\nNote: " + f.note;
    if (f.status === "closed" && !f.target_date) f.fixed_on_spot = true;
    if (f.fixed_on_spot && !f.target_date) f.target_date = baseDate || null;
  });
  return { findings, imageCount: imgCount };
}

// Header details written above the table (date, auditor, PM, P.O.C., manpower), if any.
export function readHeaderInfo(ws, upToRow) {
  const out = { date: null, auditors: "", pm: "", poc: null, manpower: null, project: "" };
  const maxCol = Math.min(ws.columnCount || 10, 20), last = Math.max(1, Math.min(upToRow || 15, 25));
  const find = (re, kind) => {
    for (let r = 1; r <= last; r++) for (let c = 1; c <= maxCol; c++) {
      const t = norm(cellText(ws.getCell(r, c)));
      if (!t || t.length > 40 || !re.test(t)) continue;
      const inline = t.split(/:\s*/)[1];
      if (inline) return kind === "date" ? cellDate({ value: inline }) : inline;
      for (let k = c + 1; k <= Math.min(maxCol, c + 4); k++) { const cell = ws.getCell(r, k); const v = norm(cellText(cell)); if (v) return kind === "date" ? cellDate(cell) : v; }
    }
    return kind === "date" ? null : "";
  };
  out.date = find(/date of (audit|inspection|visit)|audit date|inspection date|^date:?$|التاريخ/i, "date");
  out.auditors = find(/auditors?|inspected by|prepared by|conducted by|المراجع|بواسطة/i);
  out.pm = find(/project manager|^pm:?$|مدير المشروع/i);
  const poc = find(/p\.?\s?o\.?\s?c|progress|نسبة الإنجاز/i); const pn = parseFloat(String(poc).replace(/[^\d.]/g, "")); out.poc = isNaN(pn) ? null : pn <= 1 ? Math.round(pn * 100) : Math.round(pn);
  const mp = find(/manpower|workers|العمالة/i); const mn = parseInt(String(mp).replace(/[^\d]/g, ""), 10); out.manpower = isNaN(mn) ? null : mn;
  out.project = find(/^project( name)?:?$|اسم المشروع/i);
  return out;
}

// Pictures in a workbook: floating ones from ExcelJS, plus in-cell ones read from the file itself.
export async function collectImages(wb, zip) {
  const bySheet = {};
  wb.worksheets.forEach(ws => {
    bySheet[ws.name] = (ws.getImages ? ws.getImages() : []).map(im => {
      const media = wb.getImage(im.imageId);
      return media && media.buffer ? { row: im.range.tl.nativeRow + 1, col: im.range.tl.nativeCol + 1, off: im.range.tl.nativeRowOff || 0, buffer: media.buffer, ext: media.extension || "jpeg", where: "floating" } : null;
    }).filter(Boolean);
  });
  if (zip) { try { const inCell = await inCellImages(zip); Object.entries(inCell).forEach(([sheet, list]) => { (bySheet[sheet] = bySheet[sheet] || []).push(...list); }); } catch (e) { console.warn("In-cell pictures not read:", e); } }
  return bySheet;
}

const els = (doc, name) => Array.from(doc.getElementsByTagName("*")).filter(e => e.localName === name);
const attr = (e, name) => { if (!e) return null; for (const a of Array.from(e.attributes)) if (a.localName === name) return a.value; return null; };
const refToRC = ref => { const m = /^([A-Z]+)(\d+)$/.exec(ref); if (!m) return null; let c = 0; for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64); return { row: +m[2], col: c }; };
const resolvePath = (base, target) => { if (target.startsWith("/")) return target.slice(1); const parts = base.split("/").slice(0, -1); target.split("/").forEach(p => { if (p === "..") parts.pop(); else if (p !== ".") parts.push(p); }); return parts.join("/"); };
async function xml(zip, path) { const f = zip.file(path); if (!f) return null; return new DOMParser().parseFromString(await f.async("string"), "application/xml"); }
async function rels(zip, partPath) {
  const dir = partPath.split("/").slice(0, -1).join("/"), name = partPath.split("/").pop();
  const doc = await xml(zip, `${dir}/_rels/${name}.rels`); const out = {};
  if (doc) els(doc, "Relationship").forEach(r => { out[attr(r, "Id")] = { target: resolvePath(partPath, attr(r, "Target")), type: attr(r, "Type") || "" }; });
  return out;
}
async function inCellImages(zip) {
  const out = {};
  const wbDoc = await xml(zip, "xl/workbook.xml"); if (!wbDoc) return out;
  const wbRels = await rels(zip, "xl/workbook.xml");
  const sheets = els(wbDoc, "sheet").map(s => ({ name: attr(s, "name"), path: (wbRels[attr(s, "id")] || {}).target })).filter(s => s.path);
  const media = async path => { const f = zip.file(path); if (!f) return null; const buffer = await f.async("arraybuffer"); return { buffer, ext: /png$/i.test(path) ? "png" : "jpeg" }; };

  // Excel 365 "Place in cell": cell vm → valueMetadata → futureMetadata → rich value → richValueRel → media
  let excelRich = null;
  const meta = await xml(zip, "xl/metadata.xml");
  const rv = await xml(zip, "xl/richData/rdrichvalue.xml");
  if (meta && rv) {
    const types = els(meta, "metadataType").map(t => attr(t, "name"));
    const fut = els(meta, "futureMetadata").find(f => attr(f, "name") === "XLRICHVALUE");
    const futIdx = fut ? els(fut, "bk").map(bk => { const rvb = els(bk, "rvb")[0]; return rvb ? +attr(rvb, "i") : null; }) : [];
    const vmBks = (els(meta, "valueMetadata")[0] ? els(els(meta, "valueMetadata")[0], "bk") : []).map(bk => { const rc = els(bk, "rc")[0]; return rc ? { t: +attr(rc, "t"), v: +attr(rc, "v") } : null; });
    const struct = await xml(zip, "xl/richData/rdrichvaluestructure.xml");
    const structs = struct ? els(struct, "s").map(s => els(s, "k").map(k => attr(k, "n"))) : [];
    const values = els(rv, "rv").map(r => ({ s: +attr(r, "s"), v: els(r, "v").map(v => v.textContent) }));
    let relPath = "xl/richData/richValueRel.xml"; if (!zip.file(relPath)) relPath = Object.keys(zip.files).find(p => /richData\/richValueRel\.xml$/i.test(p)) || relPath;
    const relDoc = await xml(zip, relPath), relMap = await rels(zip, relPath);
    const relIds = relDoc ? els(relDoc, "rel").map(r => attr(r, "id")) : [];
    excelRich = vm => {
      const bk = vmBks[vm - 1]; if (!bk) return null;
      if (types[bk.t - 1] && types[bk.t - 1] !== "XLRICHVALUE") return null;
      const rvIndex = futIdx[bk.v]; if (rvIndex == null) return null;
      const val = values[rvIndex]; if (!val) return null;
      const keys = structs[val.s] || [];
      let k = keys.indexOf("_rvRel:LocalImageIdentifier"); if (k < 0) k = 0;
      const relId = relIds[+val.v[k]]; const rel = relId && relMap[relId];
      return rel ? rel.target : null;
    };
  }
  // WPS "DISPIMG": the cell formula names a picture kept in xl/cellimages.xml
  let wpsMap = null;
  const ci = await xml(zip, "xl/cellimages.xml");
  if (ci) {
    const ciRels = await rels(zip, "xl/cellimages.xml"); wpsMap = {};
    els(ci, "pic").forEach(pic => { const nv = els(pic, "cNvPr")[0], blip = els(pic, "blip")[0]; const name = attr(nv, "name"), rid = attr(blip, "embed"); if (name && rid && ciRels[rid]) wpsMap[name] = ciRels[rid].target; });
  }
  if (!excelRich && !wpsMap) return out;
  for (const s of sheets) {
    const doc = await xml(zip, s.path); if (!doc) continue;
    const list = [];
    for (const c of els(doc, "c")) {
      const ref = attr(c, "r"); const rc = ref && refToRC(ref); if (!rc) continue;
      let path = null;
      const vm = attr(c, "vm"); if (vm && excelRich) path = excelRich(+vm);
      if (!path && wpsMap) { const f = els(c, "f")[0], v = els(c, "v")[0]; const m = /DISPIMG\(\s*"([^"]+)"/i.exec((f && f.textContent) || (v && v.textContent) || ""); if (m && wpsMap[m[1]]) path = wpsMap[m[1]]; }
      if (!path) continue;
      const img = await media(path); if (img) list.push({ row: rc.row, col: rc.col, off: 0, ...img, where: "in-cell" });
    }
    if (list.length) out[s.name] = list;
  }
  return out;
}

// Some programs (Python tools, some online converters) write absolute paths inside the file's
// relationship parts. Excel accepts them; the Excel reader we use does not, so rewrite them first.
export async function normalizeXlsx(JSZip, buf) {
  const zip = await JSZip.loadAsync(buf);
  const rel = (fromDir, to) => {
    const a = fromDir ? fromDir.split("/") : [], b = to.split("/");
    let i = 0; while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
    return "../".repeat(a.length - i) + b.slice(i).join("/");
  };
  let changed = false;
  // drawings written without the usual "xdr:" prefix (openpyxl, pandas and similar tools)
  for (const path of Object.keys(zip.files).filter(p => /^xl\/drawings\/[^/]+\.xml$/i.test(p))) {
    const s = await zip.file(path).async("string");
    if (/<xdr:wsDr[\s>]/.test(s) || !/<wsDr[\s>]/.test(s)) continue;
    const fixed = prefixDrawing(s); if (fixed) { zip.file(path, fixed); changed = true; }
  }
  for (const path of Object.keys(zip.files).filter(p => p.endsWith(".rels"))) {
    const s = await zip.file(path).async("string");
    const dir = path.replace(/_rels\/[^/]+\.rels$/, "").replace(/\/$/, "");
    const fixed = s.replace(/Target="\/([^"]+)"/g, (m, abs) => `Target="${rel(dir, abs)}"`);
    if (fixed !== s) { zip.file(path, fixed); changed = true; }
  }
  return changed ? zip.generateAsync({ type: "arraybuffer" }) : buf;
}
// Load a workbook, repairing absolute paths when the first attempt fails.
export async function loadWorkbook(ExcelJS, JSZip, buf) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf); return { wb, buf }; }
  catch (e) {
    if (!JSZip) throw e;
    const fixed = await normalizeXlsx(JSZip, buf);
    try { const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(fixed); return { wb: wb2, buf: fixed }; }
    catch (e2) {
      // last try: leave out the cell comments (they are read separately) and load the rest
      const lean = await dropComments(JSZip, fixed);
      const wb3 = new ExcelJS.Workbook(); await wb3.xlsx.load(lean);
      return { wb: wb3, buf: fixed };
    }
  }
}
async function dropComments(JSZip, buf) {
  const zip = await JSZip.loadAsync(buf);
  for (const path of Object.keys(zip.files).filter(p => /^xl\/worksheets\/_rels\/[^/]+\.rels$/i.test(p))) {
    const s = await zip.file(path).async("string");
    zip.file(path, s.replace(/<Relationship\b[^>]*Type="[^"]*\/(comments|vmlDrawing)"[^>]*\/>/g, ""));
  }
  for (const path of Object.keys(zip.files).filter(p => /^xl\/worksheets\/[^/]+\.xml$/i.test(p))) {
    const s = await zip.file(path).async("string");
    zip.file(path, s.replace(/<legacyDrawing\b[^>]*\/>/g, ""));
  }
  return zip.generateAsync({ type: "arraybuffer" });
}
// Cell notes (comments) per sheet, read straight from the file: { sheetName: { "C7": "text" } }
export async function readNotes(zip) {
  const out = {};
  try {
    const wbDoc = await xml(zip, "xl/workbook.xml"); if (!wbDoc) return out;
    const wbRels = await rels(zip, "xl/workbook.xml");
    for (const sh of els(wbDoc, "sheet")) {
      const path = (wbRels[attr(sh, "id")] || {}).target; if (!path) continue;
      const sr = await rels(zip, path);
      const c = Object.values(sr).find(r => /\/comments$/.test(r.type)); if (!c) continue;
      const doc = await xml(zip, c.target); if (!doc) continue;
      const map = {};
      els(doc, "comment").forEach(cm => { const t = els(cm, "t").map(x => x.textContent).join(""); if (t.trim()) map[attr(cm, "ref")] = t.replace(/^[^:\n]{1,40}:\s*\n/, "").trim(); });
      out[attr(sh, "name")] = map;
    }
  } catch (e) { console.warn("Notes not read:", e); }
  return out;
}

const DRAW_NS = { "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing": "xdr", "http://schemas.openxmlformats.org/drawingml/2006/main": "a",
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships": "r", "http://schemas.openxmlformats.org/drawingml/2006/chart": "c", "http://schemas.openxmlformats.org/markup-compatibility/2006": "mc" };
function prefixDrawing(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return null;
  const extra = {};
  const escA = v => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const escT = v => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const ser = n => {
    if (n.nodeType === 3 || n.nodeType === 4) return escT(n.nodeValue);
    if (n.nodeType !== 1) return "";
    const p = DRAW_NS[n.namespaceURI] || n.prefix; if (n.prefix && !DRAW_NS[n.namespaceURI] && n.namespaceURI) extra[n.prefix] = n.namespaceURI;
    const name = (p ? p + ":" : "") + n.localName;
    let at = "";
    for (const a of Array.from(n.attributes)) {
      if (a.name === "xmlns" || a.name.startsWith("xmlns:")) { if (a.name.startsWith("xmlns:") && !Object.values(DRAW_NS).includes(a.localName)) extra[a.localName] = a.value; continue; }
      const ap = a.namespaceURI ? (DRAW_NS[a.namespaceURI] || a.prefix) : null;
      at += ` ${ap ? ap + ":" : ""}${a.localName}="${escA(a.value)}"`;
    }
    return `<${name}${at}>${Array.from(n.childNodes).map(ser).join("")}</${name}>`;
  };
  let body = ser(doc.documentElement);
  const decl = Object.entries(DRAW_NS).map(([u, p]) => ` xmlns:${p}="${u}"`).join("") + Object.entries(extra).map(([p, u]) => ` xmlns:${p}="${u}"`).join("");
  body = body.replace(/^<xdr:wsDr/, "<xdr:wsDr" + decl);
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + body;
}
