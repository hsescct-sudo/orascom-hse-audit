// PowerPoint outputs: one audit as a report deck, and the dashboard as a summary deck.
// Charts are native PowerPoint charts, so they stay editable after download.
import { ensurePptx, fmtDate, fRef, aRef, findingState, STATE_LABEL, RISK_LABEL, todayISO } from "./ui.js";
import { TOPICS, ALL_TOPICS, ITEM, topicName } from "./checklist.js";
import { logoData, imageData, defaultScope, defaultConclusion, actionText } from "./report.js";
import { SETTINGS } from "./settings.js";

const W = 13.333, H = 7.5, FONT = "Segoe UI";
const C = {
  navy: "003876", navy2: "0B4D96", ink: "1B2430", ink2: "3D4654", muted: "5B6575", line: "DCE1E8", canvas: "F4F6F9", white: "FFFFFF", amber: "F2B705",
  risk: { High: "D03B3B", Med: "EDA100", Low: "1D7F4F" },
  riskBg: { High: "FBE4E4", Med: "FFF1CC", Low: "DDF1E6" }, riskInk: { High: "9D2222", Med: "7A5300", Low: "15603B" },
  state: { closed: "0CA30C", pending: "2A78D6", open: "EB6834", overdue: "A52A2A" },
  stateBg: { closed: "E3F5E3", pending: "E3EEFB", open: "FDECE3", overdue: "A52A2A" }, stateInk: { closed: "0A6E0A", pending: "1F5FAE", open: "A3441C", overdue: "FFFFFF" },
};
const b64 = dataUrl => String(dataUrl).replace(/^data:/, "");
const PPTX_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

async function newDeck(title) {
  const Pptx = await ensurePptx();
  const pptx = new Pptx();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "HSE Flash Audit System"; pptx.company = "Orascom Construction"; pptx.title = title;
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };
  let logo = null; try { logo = b64(await logoData()); } catch (e) { /* the deck works without it */ }
  pptx.defineSlideMaster({
    title: "BODY", background: { color: C.white },
    objects: [
      { rect: { x: 0, y: 0, w: W, h: 0.08, fill: { color: C.navy } } },
      ...(logo ? [{ image: { x: W - 1.88, y: 0.3, w: 1.38, h: 0.31, data: logo } }] : []),
      { line: { x: 0.5, y: 6.98, w: W - 1, h: 0, line: { color: C.line, width: 0.75 } } },
      { text: { text: SETTINGS.report.footer || "", options: { x: 0.5, y: 7.02, w: 8, h: 0.3, fontFace: FONT, fontSize: 9, color: C.muted } } },
    ],
    slideNumber: { x: W - 1.0, y: 7.02, w: 0.5, h: 0.3, fontFace: FONT, fontSize: 9, color: C.muted, align: "right" },
  });
  return { pptx, logo };
}
function heading(slide, title, sub) {
  slide.addText(title, { x: 0.5, y: 0.3, w: W - 2.6, h: 0.55, fontFace: FONT, fontSize: 24, bold: true, color: C.navy, margin: 0 });
  if (sub) slide.addText(sub, { x: 0.5, y: 0.86, w: W - 2.6, h: 0.32, fontFace: FONT, fontSize: 12, color: C.muted, margin: 0 });
}
function cover(pptx, logo, { eyebrow, title, sub, rows, foot }) {
  const s = pptx.addSlide();
  s.background = { color: C.navy };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 0.5, w: W, h: 0.5, fill: { color: "0A2F63" }, line: { type: "none" } });
  if (logo) { s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: 0.55, w: 2.2, h: 0.7, fill: { color: C.white }, line: { type: "none" }, rectRadius: 0.06 }); s.addImage({ data: logo, x: 0.75, y: 0.73, w: 1.9, h: 0.425 }); }
  s.addText(eyebrow.toUpperCase(), { x: 0.6, y: 1.9, w: 11, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: C.amber, charSpacing: 2, margin: 0 });
  s.addText(title, { x: 0.6, y: 2.3, w: 12, h: 1.3, fontFace: FONT, fontSize: title.length > 60 ? 28 : 36, bold: true, color: C.white, valign: "top", margin: 0, fit: "shrink" });
  if (sub) s.addText(sub, { x: 0.6, y: 3.6, w: 12, h: 0.5, fontFace: FONT, fontSize: 18, color: "C9D6E8", margin: 0 });
  (rows || []).forEach(([k, v], i) => {
    const x = 0.6 + (i % 4) * 3.05, y = 4.45 + Math.floor(i / 4) * 0.95;
    s.addText(String(k).toUpperCase(), { x, y, w: 2.9, h: 0.3, fontFace: FONT, fontSize: 10, bold: true, color: "9FB4D1", charSpacing: 1, margin: 0 });
    s.addText(String(v || "—"), { x, y: y + 0.3, w: 2.9, h: 0.45, fontFace: FONT, fontSize: 15, color: C.white, margin: 0, fit: "shrink" });
  });
  if (foot) s.addText(foot, { x: 0.6, y: H - 0.45, w: 12, h: 0.4, fontFace: FONT, fontSize: 10, color: "C9D6E8", margin: 0 });
  return s;
}
// A KPI tile: coloured edge, label, big value, small note.
function tile(pptx, s, x, y, w, h, label, value, note, tone) {
  const edge = tone === "bad" ? C.state.overdue : tone === "warn" ? C.state.open : tone === "good" ? C.state.closed : C.navy;
  s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: C.white }, line: { color: C.line, width: 0.75 } });
  s.addShape(pptx.ShapeType.rect, { x, y, w: 0.07, h, fill: { color: edge }, line: { type: "none" } });
  s.addText(label, { x: x + 0.2, y: y + 0.1, w: w - 0.3, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: C.muted, margin: 0 });
  s.addText(String(value), { x: x + 0.2, y: y + 0.4, w: w - 0.3, h: 0.6, fontFace: FONT, fontSize: 28, bold: true, color: tone === "bad" ? C.state.overdue : C.ink, margin: 0 });
  if (note) s.addText(note, { x: x + 0.2, y: y + h - 0.42, w: w - 0.3, h: 0.32, fontFace: FONT, fontSize: 10, color: C.muted, margin: 0, fit: "shrink" });
}
function chip(pptx, s, x, y, text, bg, ink) {
  const w = Math.max(0.9, 0.24 + text.length * 0.098);
  s.addText(text, { shape: pptx.ShapeType.roundRect, rectRadius: 0.12, x, y, w, h: 0.32, fill: { color: bg }, line: { type: "none" }, fontFace: FONT, fontSize: 11, bold: true, color: ink, align: "center", valign: "middle", margin: 0 });
  return w;
}
const axisOpts = {
  catAxisLabelFontFace: FONT, valAxisLabelFontFace: FONT, catAxisLabelFontSize: 10, valAxisLabelFontSize: 10,
  catAxisLabelColor: C.ink2, valAxisLabelColor: C.muted, valGridLine: { color: "E6E8EC", style: "solid", size: 0.5 }, catGridLine: { style: "none" },
  catAxisLineShow: true, valAxisLineShow: false, legendFontFace: FONT, legendFontSize: 10, legendColor: C.ink2,
};
function table(s, rows, opts) {
  s.addTable(rows, { fontFace: FONT, fontSize: 10, color: C.ink, border: { type: "solid", pt: 0.5, color: C.line }, valign: "middle", margin: [3, 5, 3, 5], ...opts });
}
const th = t => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.navy }, fontSize: 10 } });
const chunk = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
const short = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
async function toBlob(pptx) {
  const out = await pptx.write({ outputType: "blob" });
  return out instanceof Blob ? new Blob([out], { type: PPTX_TYPE }) : new Blob([out], { type: PPTX_TYPE });
}
// Place an image inside a box without stretching it.
function fitImage(s, img, x, y, w, h) {
  const k = Math.min(w / img.w, h / img.h), iw = img.w * k, ih = img.h * k;
  s.addImage({ data: b64(img.data), x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih });
}

// ======================================================================
// One audit → report deck (cover, summary, checklist, one slide per finding, support, conclusion)
export async function buildAuditPptx({ audit, project, findings, photosByFinding, urls, onProgress }) {
  const { pptx, logo } = await newDeck(`HSE Flash Audit – ${project.name || ""} – ${audit.audit_date}`);
  const typeLabel = audit.audit_type === "corporate" ? "Corporate audit" : "Project audit";
  cover(pptx, logo, {
    eyebrow: SETTINGS.report.title || "HSE Flash Audit Report", title: project.name || "Project", sub: `${typeLabel} · ${fmtDate(audit.audit_date)} · ${aRef(audit.ref)}`,
    rows: [["Auditor(s)", audit.auditor], ["Project Manager", audit.pm || project.pm], ["P.O.C.", audit.poc != null ? Math.round(audit.poc) + "%" : ""], ["Manpower", audit.manpower != null ? Number(audit.manpower).toLocaleString() : ""]],
    foot: `Form ${SETTINGS.report.formRef || ""} · Rev. ${SETTINGS.report.formRev || ""} · generated ${fmtDate(todayISO())} by the ${SETTINGS.general.appName || "HSE Flash Audit"} system`,
  });

  // summary
  const by = r => findings.filter(f => f.risk === r).length;
  const closed = findings.filter(f => f.status === "closed").length;
  const checks = Object.values(audit.checks || {}), ok = checks.filter(v => v === "ok").length, nc = checks.filter(v => v === "nc").length;
  let s = pptx.addSlide({ masterName: "BODY" });
  heading(s, "Summary", `${project.name || ""} · ${fmtDate(audit.audit_date)}`);
  const tiles = [["Observations", findings.length, "", ""], ["High risk", by("High"), "", by("High") ? "bad" : ""], ["Medium risk", by("Med"), "", ""], ["Low risk", by("Low"), "", ""], ["Closed", closed, findings.length ? Math.round(100 * closed / findings.length) + "% closed" : "", "good"], ["Still open", findings.length - closed, "", findings.length - closed ? "warn" : ""]];
  if (ok + nc) tiles.push(["Compliance", Math.round(100 * ok / (ok + nc)) + "%", `${checks.length} checks`, ""]);
  const tw = (W - 1 - (tiles.length - 1) * 0.15) / tiles.length;
  tiles.forEach((t, i) => tile(pptx, s, 0.5 + i * (tw + 0.15), 1.4, tw, 1.3, t[0], t[1], t[2], t[3]));
  s.addText([{ text: "PURPOSE & SCOPE", options: { fontSize: 10, bold: true, color: C.muted, breakLine: true } }, { text: audit.scope || defaultScope(audit, project.name), options: { fontSize: 12, color: C.ink } }],
    { x: 0.5, y: 3.0, w: 5.6, h: 3.8, fontFace: FONT, valign: "top", margin: 0, paraSpaceAfter: 6, fit: "shrink" });
  const topics = ALL_TOPICS.map(t => ({ t, r: ["High", "Med", "Low"].map(r => findings.filter(f => f.topic === t.code && f.risk === r).length) })).filter(x => x.r.some(Boolean));
  if (topics.length) {
    s.addChart(pptx.ChartType.bar, ["High", "Med", "Low"].map((r, i) => ({ name: RISK_LABEL[r], labels: topics.map(x => x.t.name), values: topics.map(x => x.r[i]) })), {
      x: 6.5, y: 3.0, w: 6.33, h: 3.85, barDir: "bar", barGrouping: "stacked", chartColors: [C.risk.High, C.risk.Med, C.risk.Low], barGapWidthPct: 55,
      showLegend: true, legendPos: "t", showTitle: true, title: "Observations by topic and risk", titleFontFace: FONT, titleFontSize: 12, titleColor: C.ink, catAxisOrientation: "maxMin", valAxisMajorUnit: 1, ...axisOpts,
    });
  }

  // checklist results
  if (checks.length) {
    s = pptx.addSlide({ masterName: "BODY" });
    heading(s, "Checklist results", `${checks.length} checks rated · compliance ${ok + nc ? Math.round(100 * ok / (ok + nc)) + "%" : "—"}`);
    const rows = [[th("Topic"), th("OK"), th("Not compliant"), th("N/A"), th("Compliance")]];
    ALL_TOPICS.forEach(t => { const ids = t.items.map(i => i.id); const o = ids.filter(i => audit.checks[i] === "ok").length, n = ids.filter(i => audit.checks[i] === "nc").length, na = ids.filter(i => audit.checks[i] === "na").length; if (o + n + na) rows.push([t.name, String(o), { text: String(n), options: n ? { bold: true, color: C.state.overdue } : {} }, String(na), o + n ? Math.round(100 * o / (o + n)) + "%" : "—"]); });
    table(s, rows, { x: 0.5, y: 1.4, w: W - 1, colW: [5.6, 1.5, 1.9, 1.5, 1.833], fontSize: 12, rowH: 0.36, align: "left" });
  }

  // one slide per finding with its photos
  const allPhotos = findings.flatMap(f => (photosByFinding[f.id] || []));
  let done = 0; const total = allPhotos.length; let failed = 0;
  const imgCache = {};
  const load = async p => { if (imgCache[p.path] !== undefined) return imgCache[p.path]; try { imgCache[p.path] = urls[p.path] ? await imageData(urls[p.path]) : null; } catch (e) { imgCache[p.path] = null; failed++; } done++; if (onProgress) onProgress(done, total); return imgCache[p.path]; };
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i], st = findingState(f);
    s = pptx.addSlide({ masterName: "BODY" });
    heading(s, `Observation ${i + 1} of ${findings.length}`, [fRef(f.ref), f.area, topicName(f.topic)].filter(Boolean).join(" · "));
    let cx = 0.5; cx += chip(pptx, s, cx, 1.32, `${RISK_LABEL[f.risk] || f.risk} risk`, C.riskBg[f.risk] || C.canvas, C.riskInk[f.risk] || C.ink) + 0.12;
    cx += chip(pptx, s, cx, 1.32, STATE_LABEL[st], C.stateBg[st], C.stateInk[st]) + 0.12;
    if (f.needs_support) chip(pptx, s, cx, 1.32, "Needs management support", "A52A2A", C.white);
    const act = actionText(f);
    const len = (f.observation + f.root_cause + act).length;
    const fs = len > 900 ? 10 : len > 600 ? 11 : len > 380 ? 12 : 13;
    const lab = t => ({ text: t.toUpperCase(), options: { fontSize: 9.5, bold: true, color: C.muted, breakLine: true, paraSpaceBefore: 8 } });
    const val = (t, o = {}) => ({ text: t || "—", options: { fontSize: fs, color: C.ink, breakLine: true, ...o } });
    s.addText([lab("What was found"), val(f.observation, { fontSize: fs + 1, bold: true }), lab("Root cause"), val((f.root_cause || "").split("\n").join(" · ")),
      lab(f.fixed_on_spot ? "Corrected on the spot" : "Action"), val(act), lab("Owner · target date"), val(`${f.owner || "—"} · ${f.fixed_on_spot ? "Immediately" : fmtDate(f.target_date) || "—"}`),
      ...(f.status === "closed" ? [lab("Closed"), val(f.fixed_on_spot ? `${fmtDate(audit.audit_date)} · corrected during the audit` : `${fmtDate(f.closed_at)}${f.closed_by ? " · " + f.closed_by : ""}`)] : [])],
      { x: 0.5, y: 1.8, w: 5.9, h: 5.05, fontFace: FONT, valign: "top", margin: 0 });
    const ph = photosByFinding[f.id] || [];
    const cols = [["Photo of violation", ph.filter(p => p.kind === "violation"), C.risk.High, 6.7], ["Closure evidence", ph.filter(p => p.kind === "closure"), C.state.closed, 9.85]];
    for (const [label, list, edge, x] of cols) {
      s.addShape(pptx.ShapeType.rect, { x, y: 1.32, w: 0.06, h: 0.3, fill: { color: edge }, line: { type: "none" } });
      s.addText(label + (list.length > 2 ? `  (2 of ${list.length})` : ""), { x: x + 0.14, y: 1.32, w: 2.8, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: C.ink, margin: 0 });
      const show = list.slice(0, 2), bw = 2.98, top = 1.8, area = 5.05, gap = 0.12;
      if (!show.length) {
        s.addText("No photo", { x, y: top, w: bw, h: 1.5, fontFace: FONT, fontSize: 11, color: C.muted, align: "center", valign: "middle", fill: { color: C.canvas }, line: { color: C.line, width: 0.75, dashType: "dash" } });
        continue;
      }
      const bh = show.length === 1 ? area : (area - gap) / 2;
      for (let k = 0; k < show.length; k++) {
        const y = top + k * (bh + gap);
        s.addShape(pptx.ShapeType.rect, { x, y, w: bw, h: bh, fill: { color: C.canvas }, line: { color: C.line, width: 0.75 } });
        const img = await load(show[k]);
        if (img) fitImage(s, img, x + 0.04, y + 0.04, bw - 0.08, bh - 0.08);
        else s.addText("Photo couldn't be loaded", { x, y, w: bw, h: bh, fontFace: FONT, fontSize: 10, color: C.muted, align: "center", valign: "middle" });
      }
    }
  }

  // issues needing management support
  const sup = findings.map((f, i) => ({ n: i + 1, f })).filter(x => x.f.needs_support);
  if (sup.length) {
    s = pptx.addSlide({ masterName: "BODY" });
    heading(s, "Issues needing high-level support", `${sup.length} of ${findings.length} observations`);
    const rows = [[th("#"), th("Issue"), th("Observation"), th("Risk"), th("Status")]];
    sup.forEach(({ n, f }) => rows.push([String(n), { text: f.support_title || topicName(f.topic), options: { bold: true, color: C.risk.High } }, short(f.observation, 160), RISK_LABEL[f.risk] || f.risk, STATE_LABEL[findingState(f)]]));
    table(s, rows, { x: 0.5, y: 1.4, w: W - 1, colW: [0.5, 2.6, 6.633, 1.2, 1.4], fontSize: 11 });
  }

  // conclusion
  s = pptx.addSlide({ masterName: "BODY" });
  heading(s, "Conclusion");
  s.addText([{ text: audit.conclusion || defaultConclusion(audit, findings), options: { fontSize: 16, color: C.ink, breakLine: true } },
    ...(audit.areas ? [{ text: "AREAS VISITED", options: { fontSize: 10, bold: true, color: C.muted, breakLine: true, paraSpaceBefore: 18 } }, { text: audit.areas, options: { fontSize: 13, color: C.ink } }] : [])],
    { x: 0.5, y: 1.4, w: W - 1, h: 4.5, fontFace: FONT, valign: "top", margin: 0, fit: "shrink" });
  return { blob: await toBlob(pptx), failed };
}

// ======================================================================
// Dashboard → summary deck. `m` is the model the dashboard computed for the current filters.
export async function buildSummaryPptx(m) {
  const { pptx, logo } = await newDeck(m.title);
  cover(pptx, logo, { eyebrow: "HSE Flash Audit · Dashboard summary", title: m.title, sub: m.scope, rows: m.coverRows, foot: `Data as of ${m.asOf} · generated by the HSE Flash Audit System` });

  // key figures
  let s = pptx.addSlide({ masterName: "BODY" });
  heading(s, "Key figures", m.scope);
  const tw = (W - 1 - 3 * 0.2) / 4;
  m.kpis.slice(0, 8).forEach((k, i) => tile(pptx, s, 0.5 + (i % 4) * (tw + 0.2), 1.45 + Math.floor(i / 4) * 1.75, tw, 1.5, k.label, k.value, k.note, k.tone));
  if (m.headline) s.addText(m.headline, { x: 0.5, y: 5.15, w: W - 1, h: 1.6, fontFace: FONT, fontSize: 14, color: C.ink2, valign: "top", margin: 0, fit: "shrink" });

  const STATES = ["closed", "pending", "open", "overdue"];
  // findings by project (or area) and status
  if (m.byGroup.labels.length) {
    for (const part of chunk(m.byGroup.labels.map((l, i) => i), 16)) {
      s = pptx.addSlide({ masterName: "BODY" });
      heading(s, m.byGroup.title, "Number of findings by close-out status" + (m.byGroup.labels.length > 16 ? ` · ${part[0] + 1}–${part[part.length - 1] + 1} of ${m.byGroup.labels.length}` : ""));
      s.addChart(pptx.ChartType.bar, STATES.map(k => ({ name: STATE_LABEL[k], labels: part.map(i => short(m.byGroup.labels[i], 60)), values: part.map(i => m.byGroup[k][i]) })), {
        x: 0.5, y: 1.35, w: W - 1, h: 5.5, barDir: "bar", barGrouping: "stacked", chartColors: STATES.map(k => C.state[k]), barGapWidthPct: 45,
        showLegend: true, legendPos: "t", catAxisOrientation: "maxMin", ...axisOpts, catAxisLabelFontSize: part.length > 10 ? 9 : 10,
      });
    }
  }
  // status, age of open findings
  s = pptx.addSlide({ masterName: "BODY" });
  heading(s, "Close-out status", "Where the findings stand, and how long the open ones have been waiting");
  s.addChart(pptx.ChartType.bar, [{ name: "Findings", labels: STATES.map(k => STATE_LABEL[k]), values: STATES.map(k => m.status[k]) }], {
    x: 0.5, y: 1.35, w: 6.0, h: 5.5, barDir: "col", chartColors: STATES.map(k => C.state[k]), barGapWidthPct: 60, showValue: true, dataLabelFontFace: FONT, dataLabelFontSize: 11, dataLabelColor: C.ink, dataLabelPosition: "outEnd",
    showTitle: true, title: "Findings by status", titleFontFace: FONT, titleFontSize: 12, titleColor: C.ink, ...axisOpts,
  });
  s.addChart(pptx.ChartType.bar, [{ name: "Open findings", labels: m.aging.labels, values: m.aging.values }], {
    x: 6.83, y: 1.35, w: 6.0, h: 5.5, barDir: "col", chartColors: ["86B6EF", "5598E7", "2A78D6", "1C5CAB", "104281"], barGapWidthPct: 60, showValue: true, dataLabelFontFace: FONT, dataLabelFontSize: 11, dataLabelColor: C.ink, dataLabelPosition: "outEnd",
    showTitle: true, title: "Not closed, by days since the audit", titleFontFace: FONT, titleFontSize: 12, titleColor: C.ink, ...axisOpts,
  });
  // topics and trend
  if (m.byTopic.labels.length) {
    s = pptx.addSlide({ masterName: "BODY" });
    heading(s, "Findings by topic and risk", "Which life-saving controls fail most often");
    s.addChart(pptx.ChartType.bar, ["High", "Med", "Low"].map(r => ({ name: RISK_LABEL[r], labels: m.byTopic.labels, values: m.byTopic[r] })), {
      x: 0.5, y: 1.35, w: W - 1, h: 5.5, barDir: "bar", barGrouping: "stacked", chartColors: [C.risk.High, C.risk.Med, C.risk.Low], barGapWidthPct: 45, showLegend: true, legendPos: "t", catAxisOrientation: "maxMin", ...axisOpts,
    });
  }
  if (m.monthly.labels.length) {
    s = pptx.addSlide({ masterName: "BODY" });
    heading(s, "Raised and closed per month", "Findings raised by audit month, and findings closed in each month");
    s.addChart(pptx.ChartType.bar, [{ name: "Raised", labels: m.monthly.labels, values: m.monthly.raised }, { name: "Closed", labels: m.monthly.labels, values: m.monthly.closed }], {
      x: 0.5, y: 1.35, w: W - 1, h: 5.5, barDir: "col", barGrouping: "clustered", chartColors: ["2A78D6", "1BAF7A"], barGapWidthPct: 70, showLegend: true, legendPos: "t", ...axisOpts,
    });
  }
  if (m.rootCauses.labels.length) {
    s = pptx.addSlide({ masterName: "BODY" });
    heading(s, "Top root causes", "How often each root cause was recorded");
    s.addChart(pptx.ChartType.bar, [{ name: "Findings", labels: m.rootCauses.labels, values: m.rootCauses.values }], {
      x: 0.5, y: 1.35, w: W - 1, h: 5.5, barDir: "bar", chartColors: ["2A78D6"], barGapWidthPct: 55, showValue: true, dataLabelFontFace: FONT, dataLabelFontSize: 10, dataLabelColor: C.ink, catAxisOrientation: "maxMin", ...axisOpts,
    });
  }
  // project performance (all rows)
  if (m.league.length) {
    const pages = chunk(m.league, 13);
    pages.forEach((rows, pi) => {
      s = pptx.addSlide({ masterName: "BODY" });
      heading(s, "Project performance", `Sorted by overdue findings${pages.length > 1 ? ` · page ${pi + 1} of ${pages.length}` : ""}`);
      const t = [[th("Project"), th("Location"), th("Audits"), th("Last audit"), th("Findings"), th("High"), th("Not closed"), th("Overdue"), th("Closure"), th("Compliance")]];
      rows.forEach(r => t.push([{ text: short(r.name, 58), options: { bold: true } }, r.location || "", String(r.audits), r.last ? fmtDate(r.last) : "—", String(r.n), String(r.high), String(r.open), { text: String(r.overdue), options: r.overdue ? { bold: true, color: C.state.overdue } : {} }, r.closure == null ? "—" : r.closure + "%", r.comp == null ? "—" : r.comp + "%"]));
      table(s, t, { x: 0.5, y: 1.35, w: W - 1, colW: [3.95, 1.3, 0.75, 1.15, 0.85, 0.7, 0.95, 0.85, 0.85, 0.983], fontSize: 10, rowH: 0.36, align: "left" });
    });
  }
  // coverage
  if (m.coverage) {
    s = pptx.addSlide({ masterName: "BODY" });
    heading(s, "Audit coverage", `${m.coverage.audited.length} of ${m.coverage.audited.length + m.coverage.missing.length} active projects audited in this period`);
    const col = (title, list, color, x) => {
      s.addText(title, { x, y: 1.35, w: 6.0, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color, margin: 0 });
      const lines = list.length ? list.map(n => ({ text: short(n, 70), options: { breakLine: true } })) : [{ text: "None", options: { color: C.muted } }];
      s.addText(lines, { x, y: 1.8, w: 6.0, h: 5.0, fontFace: FONT, fontSize: list.length > 22 ? 9 : 11, color: C.ink, valign: "top", margin: 0, paraSpaceAfter: 2, fit: "shrink" });
    };
    col(`Audited (${m.coverage.audited.length})`, m.coverage.audited, C.state.closed, 0.5);
    col(`Not audited yet (${m.coverage.missing.length})`, m.coverage.missing, C.state.overdue, 6.83);
  }
  // overdue findings (all)
  if (m.overdue.length) {
    const pages = chunk(m.overdue, 11);
    pages.forEach((rows, pi) => {
      s = pptx.addSlide({ masterName: "BODY" });
      heading(s, "Overdue findings", `${m.overdue.length} past their target date${pages.length > 1 ? ` · page ${pi + 1} of ${pages.length}` : ""}`);
      const t = [[th("Ref"), th("Project"), th("Observation"), th("Risk"), th("Owner"), th("Target"), th("Days late")]];
      rows.forEach(r => t.push([r.ref, short(r.project, 40), short(r.observation, 120), r.risk, short(r.owner, 26), r.target, { text: String(r.days), options: { bold: true, color: C.state.overdue } }]));
      table(s, t, { x: 0.5, y: 1.35, w: W - 1, colW: [0.95, 2.3, 4.9, 0.8, 1.6, 1.0, 0.783], fontSize: 9.5 });
    });
  }
  // management support
  if (m.support.length) {
    const pages = chunk(m.support, 11);
    pages.forEach((rows, pi) => {
      s = pptx.addSlide({ masterName: "BODY" });
      heading(s, "Needs management support", `${m.support.length} not closed${pages.length > 1 ? ` · page ${pi + 1} of ${pages.length}` : ""}`);
      const t = [[th("Ref"), th("Project"), th("Issue"), th("Observation"), th("Risk"), th("Status")]];
      rows.forEach(r => t.push([r.ref, short(r.project, 40), { text: short(r.title, 40), options: { bold: true } }, short(r.observation, 110), r.risk, r.status]));
      table(s, t, { x: 0.5, y: 1.35, w: W - 1, colW: [0.95, 2.4, 2.2, 4.5, 0.85, 1.433], fontSize: 9.5 });
    });
  }
  return toBlob(pptx);
}
export { PPTX_TYPE };
