// Printable reports in the company form layout: the audit report (F-HSE-078 or
// F-HSE-0175) and the NCR forms (F-HSE-0003). Print or "Save as PDF" from the browser.
import * as S from "../store.js";
import * as M from "../model.js";
import { setTitle, setActions, link } from "../app.js";
import { esc, ICON, fmtDate, COLORS } from "../ui.js";
import { GRADES, ROOT_CAUSES } from "../templates.js";
import { fmtScore } from "../scoring.js";
import { sigCell, changeLogHTML } from "../sign.js";

export async function render(ctx) {
  const { view, query } = ctx;
  const a = S.get(ctx.id);
  if (!a) { setTitle("Report"); view.innerHTML = `<div class="empty"><h3>Audit not found</h3></div>`; return; }
  const d = M.def(a.module);
  const type = query.type === "ncr" ? "ncr" : "report";
  setTitle(type === "ncr" ? `NCR forms ${a.ref}` : `Report ${a.ref}`, `${d.formRef}, ${M.project(a.project_id).name}`);
  const act = setActions(`
    <a class="btn sm" href="${link("audit", a.id, a.module)}">${ICON.back}<span>Audit</span></a>
    <a class="btn sm" href="${link("report", a.id, a.module)}${type === "ncr" ? "" : "?type=ncr"}">${type === "ncr" ? ICON.clip : ICON.flag}<span>${type === "ncr" ? "Audit report" : "NCR forms"}</span></a>
    <button class="btn sm" type="button" data-x="xlsx">${ICON.xls}<span>Excel</span></button>
    <button class="btn sm" type="button" data-x="pptx">${ICON.ppt}<span>PowerPoint</span></button>
    <button class="btn sm primary" type="button" id="print">${ICON.print}<span>Print / PDF</span></button>`);
  act.querySelector("#print").onclick = () => window.print();
  act.addEventListener("click", async e => { const x = e.target.closest("[data-x]"); if (!x) return; const m = await import("../report/export.js"); x.dataset.x === "xlsx" ? m.excelReport(a) : m.pptReport(a); });
  view.innerHTML = `<div class="empty">Preparing…</div>`;
  const urls = {};
  const ids = [...(a.photos || []), ...M.auditNCRs(a).flatMap(n => [...(n.photos || []), ...(n.ca_photos || [])]), ...M.auditGoods(a).flatMap(g => g.photos || [])];
  await Promise.all(ids.map(async id => { urls[id] = await S.photoURL(id); }));
  view.innerHTML = type === "ncr" ? ncrPack(a, d, urls, query.ncr) : (d.id === "full" ? fullReport(a, d, urls) : liftReport(a, d, urls)) + changeLogHTML(a);
}

const head = (d, title, ref, rev) => `<div class="rep-head"><div><img src="assets/orascom-logo.png" alt="Orascom Construction" style="width:100%;max-width:130px"></div><div><h1>${esc(title)}</h1></div><div><span>Form Ref.: <b>${esc(ref)}</b></span><span>Form Rev.: <b>${esc(rev)}</b></span><span>HSE Dept.</span></div></div>`;
const ppl = (list, title) => `<table><thead><tr><th colspan="2">${esc(title)}</th></tr><tr><th style="width:50%">Name</th><th>Position</th></tr></thead><tbody>${(list || []).filter(p => p.name || p.position).map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.position)}</td></tr>`).join("") || `<tr><td colspan="2">–</td></tr>`}</tbody></table>`;
const bands = d => `<table class="bandtbl"><thead><tr><th colspan="2">Classification of project's grade</th><th>Audit criteria</th></tr></thead><tbody>
  ${GRADES.map((g, i) => `<tr><td style="background:${COLORS.grade[g.code]}"></td><td>${g.min === 85 ? "From 85% and above" : g.min === 75 ? "From 75% to 84%" : g.min === 65 ? "From 65% to 74%" : "From 0% to 64%"}: ${esc(g.label)}.</td><td>${i === 0 ? `One or more serious NCRs deduct ${d.deductions.serious}% from the overall score.` : i === 1 ? `Each repeated NCR deducts ${d.deductions.repeated}% from the overall score.` : ""}</td></tr>`).join("")}</tbody></table>`;
const photosBlock = (ids, urls) => (ids || []).length ? `<div class="gv">${ids.map(id => urls[id] ? `<img src="${urls[id]}" alt="Site photo">` : "").join("")}</div>` : `<p class="muted">No photos.</p>`;

function history(a) {
  const list = M.audits(a.module).filter(x => x.project_id === a.project_id && (M.finished(x) || x.id === a.id) && x.date <= a.date).reverse().slice(-10);
  const pts = list.map(x => ({ ref: x.ref, date: x.date, s: M.score(x).total })).filter(p => p.s != null);
  if (!pts.length) return "<p class='muted'>No history yet.</p>";
  const W = 700, H = 180, L = 40, B = 30;
  const x = i => L + (pts.length === 1 ? (W - L) / 2 : (i * (W - L - 20)) / (pts.length - 1));
  const y = v => 10 + (1 - v / 100) * (H - B - 10);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Project score history">
    ${[0, 25, 50, 65, 75, 85, 100].map(v => `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="${[65, 75, 85].includes(v) ? "#9fb0c4" : "#e3e9f1"}" ${[65, 75, 85].includes(v) ? 'stroke-dasharray="4 4"' : ""}/><text x="${L - 6}" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="#5a6b82">${v}%</text>`).join("")}
    <polyline fill="none" stroke="${COLORS.navy}" stroke-width="2.5" points="${pts.map((p, i) => `${x(i)},${y(p.s)}`).join(" ")}"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.s)}" r="5" fill="${COLORS.grade[M.grade(p.s).code]}"/><text x="${x(i)}" y="${y(p.s) - 9}" font-size="11" font-weight="700" text-anchor="middle">${Math.round(p.s * 10) / 10}%</text><text x="${x(i)}" y="${H - 8}" font-size="10" text-anchor="middle" fill="#5a6b82">${esc(fmtDate(p.date))}</text>`).join("")}
  </svg>`;
}
function violations(a, urls) {
  const list = M.auditNCRs(a);
  return `<table><thead><tr><th>N°</th><th>Remarks</th><th>Classification</th><th>Location</th><th>Root cause</th><th>Photo</th><th>NCR type</th><th>Responsibility</th><th>Deadline</th></tr></thead><tbody>
    ${list.length ? list.map((n, i) => `<tr><td>${i + 1}</td><td>${esc(n.description)}<br><small>${esc(n.ref)}</small></td><td>${esc(n.classification)}</td><td>${esc(n.location || "")}</td><td>${esc([...(n.root_causes || []), n.other_cause].filter(Boolean).join(", "))}</td>
      <td class="ph-cell">${(n.photos || []).slice(0, 2).map(id => urls[id] ? `<img src="${urls[id]}" alt="NCR photo">` : "").join("")}</td><td>${esc(n.severity)}${n.repeated ? "<br><b>Repeated</b>" : ""}</td><td>${esc(n.responsible_name || "")}${n.responsible_position ? `<br><small>${esc(n.responsible_position)}</small>` : ""}</td><td class="nowrap">${esc(fmtDate(n.due_date))}</td></tr>`).join("") : `<tr><td colspan="9">No violations recorded.</td></tr>`}</tbody></table>`;
}
function goodTable(a) {
  const list = M.auditGoods(a);
  return `<table><thead><tr><th>#</th><th>Subject</th><th>Classification</th><th>Examples of good practice</th></tr></thead><tbody>${list.length ? list.map((g, i) => `<tr><td>${i + 1}</td><td>${esc(g.subject)}</td><td>${esc(g.classification || "")}</td><td>${esc(g.example || "")}</td></tr>`).join("") : `<tr><td colspan="4">–</td></tr>`}</tbody></table>`;
}
function appraisal(a, d, sc) {
  let k = 0;
  return sc.parts.map(p => `<table><thead><tr><th style="width:40px">Ser</th><th>${esc(d.id === "full" ? `${p.code} ${p.name} (${p.share}%)` : `${p.code}- ${p.name} (${p.share}%)`)}</th><th style="width:60px">Weight</th><th style="width:70px">Rating</th><th style="width:80px">Points</th></tr></thead><tbody>
    ${p.items.map(it => { k++; const def = d.parts.find(x => x.id === p.id).items.find(x => x.id === it.id); return `<tr><td>${d.id === "full" ? k : esc(it.id)}</td><td><b>${esc(it.title)}</b>: ${esc(def.text)}${a.notes && a.notes[it.id] ? `<br><i>Note: ${esc(a.notes[it.id])}</i>` : ""}</td><td>${it.weight}</td><td style="${it.state === "na" ? "background:#d9dee5" : ""}">${it.state === "na" ? "N/A" : it.state === "open" ? "–" : it.value + "%"}</td><td>${it.state === "rated" ? (it.weight * it.value / 100).toFixed(1) : "–"}</td></tr>`; }).join("")}
    <tr><th colspan="4">Total ${esc(p.code)}</th><th>${fmtScore(p.score == null ? null : p.score * 100)}</th></tr></tbody></table>`).join("");
}
function conclusion(d, sc) {
  const rows = sc.parts.map(p => `<tr><td>${esc(d.id === "full" ? `${p.code} ${p.name} (${p.share}%)` : `${p.code}- ${p.name}`)}</td><td>${p.score == null ? "N/A" : ((p.score * 100) * p.share / 100).toFixed(1) + "%"}</td></tr>`).join("");
  return `<table><thead><tr><th>Conclusion</th><th style="width:140px">Result</th></tr></thead><tbody>${rows}
    <tr><td>Serious violations (${esc(M.ruleText(d).serious)}, ${sc.seriousCount} found)</td><td>${M.minus(sc.serious)}</td></tr>
    <tr><td>Repeated violations (${esc(M.ruleText(d).repeated)}, ${sc.repeatedCount} found)</td><td>${M.minus(sc.repeated)}</td></tr>
    <tr><th>Total project score</th><th style="background:${sc.grade ? COLORS.grade[sc.grade.code] : "#eee"};color:${sc.grade && ["orange", "yellow"].includes(sc.grade.code) ? "#2b1700" : "#fff"}">${fmtScore(sc.total)} (${esc(sc.grade ? sc.grade.label : "")})</th></tr></tbody></table>
    <p class="small">Items marked N/A are not part of this audit; their weight is shared by the other items.</p>`;
}

function fullReport(a, d, urls) {
  const p = M.project(a.project_id); const sc = M.score(a); const prev = M.previousScore(a); const corr = M.correctionPct(a);
  return `<div class="rep">
    ${head(d, d.reportTitle, d.formRef, d.formRev)}
    <table><tbody><tr><th style="width:110px">Project</th><td>${esc(p.name)} (${esc(p.code)})</td><th style="width:100px">Audit date</th><td style="width:130px">${esc(fmtDate(a.date))}</td><th style="width:80px">Ref</th><td style="width:130px">${esc(a.ref)}</td></tr></tbody></table>
    ${ppl(a.attendees, "Key people attended the meeting")}
    ${ppl(a.auditors, "Auditors")}
    <table><tbody>
      <tr><th>Current manpower</th><td>${esc(a.manpower || "–")}</td><th>Current audit score</th><td><b>${fmtScore(sc.total)}</b> (${esc(sc.grade ? sc.grade.label : "")})</td></tr>
      <tr><th>Progress of completion</th><td>${a.completion !== "" && a.completion != null ? esc(a.completion) + "%" : "–"}</td><th>Previous audit score</th><td>${prev == null ? "First audit" : fmtScore(prev)}</td></tr>
      <tr><th>Audit number</th><td>${a.number}</td><th>Percentage of correcting last audit violations</th><td>${corr == null ? "–" : corr + "%"}</td></tr></tbody></table>
    <table><tbody><tr><th style="width:140px">Opening meeting</th><td>${esc(a.opening || "–")}</td></tr><tr><th>Site tour</th><td>${esc(a.siteTour || "–")}</td></tr></tbody></table>
    ${bands(d)}
    <h2>Project history</h2>${history(a)}
    <table><tbody><tr><th style="width:140px">Close meeting</th><td>${esc(a.closeMeeting || "–")}</td></tr></tbody></table>
    <h2>General view</h2>${photosBlock(a.photos, urls)}
    <h2>The observed violations</h2>${violations(a, urls)}
    <h2>Good practice</h2>${goodTable(a)}
    <div style="break-before:page"></div>
    ${head(d, "HSE Performance Appraisal Form", d.formRef, d.formRev)}
    <table><tbody><tr><th style="width:150px">Project name</th><td>${esc(p.name)}</td></tr><tr><th>Project manager</th><td>${esc(p.manager || ((a.attendees || []).find(x => /project manager/i.test(x.position)) || {}).name || "–")}</td></tr><tr><th>Appraisal date</th><td>${esc(fmtDate(a.date))}</td></tr></tbody></table>
    <table class="bandtbl"><thead><tr><th colspan="2">Rating identification</th></tr></thead><tbody>${GRADES.map(g => `<tr><td style="background:${COLORS.grade[g.code]}"></td><td><b>${esc(g.code[0].toUpperCase() + g.code.slice(1))} code</b>: ${esc(g.appraisal)} (${g.min === 85 ? "85-100" : g.min === 75 ? "75-84" : g.min === 65 ? "65-74" : "0-64"}). Receives ${g.bonus}% of the profit share / bonus allocated to HSE evaluation.</td></tr>`).join("")}</tbody></table>
    ${appraisal(a, d, sc)}
    <table><tbody><tr><th>Part 3: Serious violations</th><td>${esc(d.seriousNote)}</td><td style="width:80px">${sc.seriousCount}</td></tr><tr><th>Part 4: Repeated violations</th><td>Open NCRs from the last audit found still open at this audit.</td><td>${sc.repeatedCount}</td></tr></tbody></table>
    ${conclusion(d, sc)}
    ${a.status === "approved" ? `<p class="small">Approved by ${esc(a.approved_by || "")} on ${esc(fmtDate((a.approved_at || "").slice(0, 10)))}.</p>` : `<p class="small"><b>${a.status === "submitted" ? "Waiting approval." : "Draft. Not approved yet."}</b></p>`}
  </div>`;
}

function liftReport(a, d, urls) {
  const p = M.project(a.project_id); const sc = M.score(a);
  const lead = (a.auditors || [])[0] || {};
  return `<div class="rep">
    ${head(d, d.reportTitle, d.formRef, d.formRev)}
    <table><tbody><tr><th style="width:110px">Project</th><td>${esc(p.name)} (${esc(p.code)})</td><th style="width:130px">Assessment date</th><td style="width:130px">${esc(fmtDate(a.date))}</td><th style="width:60px">Ref</th><td style="width:130px">${esc(a.ref)}</td></tr></tbody></table>
    <table><tbody><tr><th style="width:200px">Purpose of the lifting assessment</th><td>${esc(d.purpose)}</td></tr></tbody></table>
    <table><tbody><tr><th>Assessment score</th><td><b>${fmtScore(sc.total)}</b> (${esc(sc.grade ? sc.grade.label : "")})</td><th>Auditor's name</th><td>${esc(lead.name || "")}</td><th>Auditor's title</th><td>${esc(lead.position || "")}</td></tr></tbody></table>
    ${bands(d)}
    <h2>Lifting assessment summary</h2><p>${esc(a.summary || "–")}</p>
    <h2>Lifting equipment statistics</h2><table><thead><tr><th>Ser.</th><th>Lifting equipment description</th><th>No.</th><th>Owned / rental</th></tr></thead><tbody>${(a.equipment || []).map((e, i) => `<tr><td>${i + 1}</td><td>${esc(e.desc)}</td><td>${esc(e.count === "" ? "–" : e.count)}</td><td>${esc(e.owner)}</td></tr>`).join("")}</tbody></table>
    <h2>General view</h2>${photosBlock(a.photos, urls)}
    <h2>The observed violations</h2>${violations(a, urls)}
    <h2>Good practice</h2>${goodTable(a)}
    <div style="break-before:page"></div>
    ${head(d, "Lifting Assessment Appraisal Checklist", d.formRef, d.formRev)}
    ${appraisal(a, d, sc)}
    ${conclusion(d, sc)}
    ${a.status === "approved" ? `<p class="small">Approved by ${esc(a.approved_by || "")} on ${esc(fmtDate((a.approved_at || "").slice(0, 10)))}.</p>` : `<p class="small"><b>${a.status === "submitted" ? "Waiting approval." : "Draft. Not approved yet."}</b></p>`}
  </div>`;
}

function ncrPack(a, d, urls, only) {
  const p = M.project(a.project_id);
  const list = M.auditNCRs(a).filter(n => !only || n.id === only);
  const lead = (a.auditors || [])[0] || {};
  const box = on => `<span style="display:inline-block;width:13px;height:13px;border:1.5px solid #14233b;margin-right:4px;vertical-align:-2px;text-align:center;line-height:10px;font-size:11px;font-weight:700">${on ? "✓" : ""}</span>`;
  if (!list.length) return `<div class="empty"><h3>No NCRs in this audit</h3></div>`;
  return list.map(n => `<div class="rep ncrpage" style="margin-bottom:20px">
    ${head(d, "HSE Non-Conformity Report", d.ncrFormRef, d.ncrFormRev)}
    <table><tbody>
      <tr><th style="width:150px">No. of report</th><td>(${String(n.seq).padStart(2, "0")}) ${esc(n.ref)}</td><td>${["Minor", "Major", "Serious"].map(s => `${box(n.severity === s)}${s}`).join("&nbsp;&nbsp;&nbsp;")}${n.repeated ? "&nbsp;&nbsp;&nbsp;<b>Repeated</b>" : ""}</td><th style="width:60px">Date</th><td style="width:110px">${esc(fmtDate(n.date))}</td></tr>
      <tr><th>Project</th><td>${esc(p.name)}</td><td><b>Location:</b> ${esc(n.location || "")}</td><th>Due date</th><td>${esc(fmtDate(n.due_date))}</td></tr>
      <tr><th>NCR classification</th><td colspan="4">${esc(n.classification)}</td></tr>
      <tr><th>Description of non-conformity</th><td colspan="4"><b>(${esc(n.clause || d.ncrClause)})</b><br><i>${esc(n.requirement || d.ncrRequirement)}</i><br><br>${esc(n.description)}</td></tr>
      <tr><th>Prepared by</th><td colspan="2"><b>Name:</b> ${esc(((n.sigs || {}).prepared || {}).name || lead.name || "")}<br><b>Position:</b> ${esc(lead.position || "Corporate HSE Auditor")}</td><td colspan="2"><b>Signature:</b> ${sigCell(n, "prepared")}</td></tr>
      <tr><th>Root causes</th><td colspan="4">${ROOT_CAUSES.map(r => `${box((n.root_causes || []).includes(r))}${esc(r)}`).join("&nbsp;&nbsp;&nbsp;")}${n.other_cause ? ` (${esc(n.other_cause)})` : ""}</td></tr>
      <tr><th>Corrective / preventive action requirements</th><td colspan="2">${esc(n.action_required || "")}</td><td colspan="2" class="ph-cell"><b>Evidence photos</b><br>${(n.photos || []).slice(0, 2).map(id => urls[id] ? `<img src="${urls[id]}" alt="NCR photo">` : "").join("")}</td></tr>
      <tr><th>Corrective / preventive action responsible</th><td colspan="2"><b>Name:</b> ${esc(n.responsible_name || "")}<br><b>Position:</b> ${esc(n.responsible_position || "")}</td><td colspan="2"><b>Date:</b> ${esc(fmtDate(((n.sigs || {}).responsible || {}).date) || "")}<br><b>Signature:</b> ${sigCell(n, "responsible")}</td></tr>
      <tr><th>Corrective action taken</th><td colspan="2">${esc(n.ca_text || "")}${n.ca_date ? `<br><small>${esc(fmtDate(n.ca_date))}</small>` : ""}</td><td colspan="2" class="ph-cell">${(n.ca_photos || []).slice(0, 2).map(id => urls[id] ? `<img src="${urls[id]}" alt="Evidence photo">` : "").join("")}</td></tr>
      <tr><th>Follow up for complying by</th><td colspan="2"><b>Name:</b> ${esc(n.followup_name || "")}<br><b>Position:</b> ${esc(n.followup_position || "")}</td><td colspan="2"><b>Date:</b> ${esc(fmtDate(n.followup_date || ((n.sigs || {}).followup || {}).date) || "")}<br><b>Signature:</b> ${sigCell(n, "followup")}</td></tr>
      <tr><th>Closure approved by (Auditor)</th><td colspan="2"><b>Name:</b> ${esc(((n.sigs || {}).approver || {}).name || "")}<br><b>Position:</b> Corporate HSE Auditor</td><td colspan="2"><b>Date:</b> ${esc(fmtDate(((n.sigs || {}).approver || {}).date) || "")}<br><b>Signature:</b> ${sigCell(n, "approver")}</td></tr>
    </tbody></table>
    <p class="small">Status: <b>${esc(M.NCR_STATE[M.ncrState(n)])}</b></p>
  </div>`).join("");
}
