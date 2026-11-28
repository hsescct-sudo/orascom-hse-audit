// Upload an Excel Flash report (F-HSE-0075, or any sheet with one finding per row) as a Flash audit.
// The findings become NCRs with their photos. The audit stays a draft: the auditor answers the
// checklist in the app and sends it for approval as usual.
import * as S from "../store.js";
import * as M from "../model.js";
import { setTitle, setActions, go, link } from "../app.js";
import { esc, toast, todayISO, addDays, fmtDate, shrinkImage, ensureExcelJS, ensureJSZip } from "../ui.js";
import { projectOptions } from "../components.js";
import { parseFlashAudit, analyzeSheet, extractRows, readHeaderInfo, collectImages, loadWorkbook, readNotes, FIELDS } from "../importer.js";
import { guessFlashTopic } from "../flash.js";

const RISKS = [["High", "High"], ["Med", "Medium"], ["Low", "Low"]];

export async function render(ctx) {
  const { module: mod, def: d, view } = ctx;
  setTitle("Upload an Excel report", d.name);
  setActions("");
  if (!d.binary) { view.innerHTML = `<div class="panel"><p>Excel upload is for Flash audits. <a href="${link("import", null, "flash")}">Open it for Flash Audit</a>.</p></div>`; return; }
  if (!M.canEdit()) { view.innerHTML = `<div class="panel"><p>Your account can't add audits.</p></div>`; return; }
  const me = M.me();
  let parsed = null, fileName = "", thumbs = {}, generic = null, choice = { project_id: "", lead_id: me.id };

  function step1() {
    view.innerHTML = `
      <section class="panel" style="max-width:760px">
        <p class="muted" style="margin-top:0">Upload the ${esc(d.formRef)} Flash report, or any Excel sheet with one finding per row. Photos on the sheet or inside cells come with their finding. Each finding becomes an NCR. You then answer the checklist and send the audit for approval as usual.</p>
        <div class="grid2">
          <label class="fld"><span>Project</span><select id="i-p">${projectOptions(choice.project_id, { all: "Choose the project", list: M.activeProjects() })}</select></label>
          <label class="fld"><span>Lead auditor</span><select id="i-l">${M.auditors().map(m => `<option value="${esc(m.id)}" ${m.id === choice.lead_id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label>
        </div>
        <label class="drop" id="drop"><input type="file" id="i-file" accept=".xlsx,.xlsm"><b>Choose the Excel file</b><span class="muted small">or drop it here. .xlsx or .xlsm.</span></label>
        <ul class="muted small" style="margin:10px 0 0;padding-left:18px"><li>Each finding on its own row, with the observation in one column.</li><li>Photos are matched to the row they sit on. A column headed After, Closure or Evidence is read as closure photos.</li><li>Old .xls files: open in Excel and save as .xlsx first.</li></ul>
        <p class="err" id="i-err" role="alert"></p>
      </section>`;
    const drop = view.querySelector("#drop");
    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove("over")));
    drop.addEventListener("drop", e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) readFile(f); });
    view.querySelector("#i-file").addEventListener("change", e => { const f = e.target.files[0]; if (f) readFile(f); });
  }

  async function readFile(file) {
    const err = view.querySelector("#i-err");
    choice = { project_id: view.querySelector("#i-p").value, lead_id: view.querySelector("#i-l").value };
    if (!choice.project_id) { err.textContent = "Choose the project first."; return; }
    if (/\.xls$/i.test(file.name)) { err.textContent = "This is an old .xls file. Open it in Excel, Save as, Excel Workbook (.xlsx), then upload that."; return; }
    if (!/\.xls[xm]$/i.test(file.name)) { err.textContent = "Use an Excel file (.xlsx or .xlsm)."; return; }
    err.textContent = "Reading the file…";
    try {
      const ExcelJS = await ensureExcelJS(), JSZip = await ensureJSZip();
      const { wb, buf } = await loadWorkbook(ExcelJS, JSZip, await file.arrayBuffer());
      fileName = file.name; generic = null;
      let form = null;
      try { form = parseFlashAudit(wb); if (!form.findings.length) form = null; } catch (e) { form = null; }
      if (form) {
        parsed = form;
        parsed.findings.forEach(f => { f.topic = guessFlashTopic(`${f.observation} ${f.root_cause}`, d.parts); f.include = true; });
      } else {
        const zip = JSZip ? await JSZip.loadAsync(buf) : null;
        const images = await collectImages(wb, zip);
        const notes = zip ? await readNotes(zip) : {};
        const scored = wb.worksheets.map((ws, i) => { const an = analyzeSheet(ws, images[ws.name] || []); const ex = extractRows(ws, an, images[ws.name] || [], null, notes[ws.name] || {}); return { i, an, n: ex.findings.length, p: ex.imageCount }; });
        scored.sort((a, b) => (b.n * 10 + b.p) - (a.n * 10 + a.p));
        if (!scored.length || !scored[0].n) throw new Error("No rows with findings were found in this file. Each finding needs its own row with a text description.");
        generic = { wb, images, notes, sheetIndex: scored[0].i, an: scored[0].an };
        parsed = runGeneric();
      }
      parsed.findings.forEach(f => { f.severity = (d.riskSeverity || {})[f.risk] || "Minor"; });
      step2();
    } catch (x) { console.warn(x); err.textContent = x.message; }
  }

  function runGeneric() {
    const ws = generic.wb.worksheets[generic.sheetIndex];
    const head = readHeaderInfo(ws, generic.an.headerRow || 12);
    const ex = extractRows(ws, generic.an, generic.images[ws.name] || [], head.date, generic.notes[ws.name] || {});
    const warnings = [];
    if (!head.date) warnings.push("No audit date found in the sheet. Today's date is used unless you change it below.");
    const p = { header: head, scope: "", conclusion: "", findings: ex.findings, warnings, imageCount: ex.imageCount, generic: true };
    p.findings.forEach(f => {
      const fromCat = f.category ? guessFlashTopic(f.category, d.parts) : null;
      f.topic = fromCat && (fromCat !== "GEN" || /ppe|general|supervis/i.test(f.category)) ? fromCat : guessFlashTopic(`${f.observation} ${f.root_cause}`, d.parts);
      f.include = !!f.observation; f.severity = (d.riskSeverity || {})[f.risk] || "Minor";
    });
    return p;
  }

  function makeThumbs() {
    Object.values(thumbs).forEach(u => URL.revokeObjectURL(u)); thumbs = {};
    parsed.findings.forEach((f, fi) => ["violation", "closure"].forEach(k => f.photos[k].forEach((p, i) => { thumbs[`${fi}-${k}-${i}`] = URL.createObjectURL(new Blob([p.buffer], { type: "image/" + (p.ext === "png" ? "png" : "jpeg") })); })));
  }

  function mappingPanel() {
    if (!generic) return "";
    const an = generic.an;
    const colName = c => { let s = "", n = c; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
    const colOpts = sel => `<option value="">Not in this sheet</option>` + an.cols.map(x => `<option value="${x.c}" ${+sel === x.c ? "selected" : ""}>${colName(x.c)}${x.label ? ", " + esc(x.label.slice(0, 40)) : ""}</option>`).join("");
    const imgCols = Object.keys(an.photoKinds).map(Number).sort((a, b) => a - b);
    return `<section class="panel mapping"><div class="panel-h"><h2>Which column is which</h2><span class="muted">Not the ${esc(d.formRef)} form, so the columns were matched by their headings. Correct anything wrong.</span></div>
      <div class="grid3">
        ${generic.wb.worksheets.length > 1 ? `<label class="fld"><span>Sheet</span><select id="m-sheet">${generic.wb.worksheets.map((w, i) => `<option value="${i}" ${i === generic.sheetIndex ? "selected" : ""}>${esc(w.name)}</option>`).join("")}</select></label>` : ""}
        <label class="fld"><span>Headings are in row</span><select id="m-head"><option value="0" ${!an.headerRow ? "selected" : ""}>No heading row</option>${Array.from({ length: 30 }, (_, i) => i + 1).map(r => `<option value="${r}" ${an.headerRow === r ? "selected" : ""}>Row ${r}</option>`).join("")}</select></label>
        ${FIELDS.filter(([k]) => k !== "num").map(([k, label]) => `<label class="fld"><span>${esc(label)}${k === "obs" ? " (needed)" : ""}</span><select data-map="${k}">${colOpts(an.mapping[k])}</select></label>`).join("")}
      </div>
      ${imgCols.length ? `<div class="grid3" style="margin-top:12px">${imgCols.map(c => `<label class="fld"><span>Photos in column ${colName(c)}${an.cols[c - 1]?.label ? ", " + esc(an.cols[c - 1].label.slice(0, 30)) : ""}</span><select data-photo="${c}">${[["violation", "Photo of the finding"], ["closure", "Closure evidence"], ["ignore", "Ignore these pictures"]].map(([v, l]) => `<option value="${v}" ${an.photoKinds[c] === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>`).join("")}</div>` : `<p class="muted small">No pictures were found in this sheet.</p>`}
    </section>`;
  }

  function rowsHtml() {
    return parsed.findings.map((f, i) => `<tr data-i="${i}">
      <td><input type="checkbox" data-inc ${f.include ? "checked" : ""} aria-label="Upload finding ${f.seq}"></td><td>${f.seq}</td><td>${esc(f.area)}</td>
      <td class="wrap">${esc(f.observation) || `<span class="muted">(no text)</span>`}${f.needs_support ? `<div><span class="chip st-overdue">Management support: ${esc(f.support_title)}</span></div>` : ""}${f.category ? `<div class="muted small">Category in the sheet: ${esc(f.category)}</div>` : ""}</td>
      <td><select data-topic aria-label="Topic">${d.parts.map(p => `<option value="${esc(p.id)}" ${p.id === f.topic ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></td>
      <td><select data-risk aria-label="Risk">${RISKS.map(([v, l]) => `<option value="${v}" ${f.risk === v ? "selected" : ""}>${l}</option>`).join("")}</select><div class="muted small">${esc(f.severity)} NCR</div></td>
      <td><select data-status aria-label="Status"><option value="open" ${f.status !== "closed" ? "selected" : ""}>Open</option><option value="closed" ${f.status === "closed" ? "selected" : ""}>Closed</option></select></td>
      <td class="nowrap">${f.fixed_on_spot ? "Immediately" : fmtDate(f.target_date) || esc(f.due) || "–"}</td>
      <td><div class="row" style="gap:4px;flex-wrap:wrap">${["violation", "closure"].map(k => f.photos[k].map((p, j) => `<img src="${thumbs[`${i}-${k}-${j}`]}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:6px;${k === "closure" ? "outline:2px solid var(--g-green)" : ""}">`).join("")).join("")}</div></td></tr>`).join("")
      || `<tr><td colspan="9" class="muted">No rows with findings yet. Check the columns above.</td></tr>`;
  }

  function step2() {
    makeThumbs();
    const h = parsed.header, proj = M.project(choice.project_id);
    const mismatch = h.project && proj && !proj.name.toLowerCase().includes(h.project.toLowerCase().slice(0, 6)) && !h.project.toLowerCase().includes(String(proj.code || "").toLowerCase());
    const nInc = parsed.findings.filter(x => x.include).length;
    setActions(`<button class="btn" type="button" id="again">Choose another file</button><button class="btn primary" type="button" id="do-import" ${nInc ? "" : "disabled"}>Upload ${nInc} finding${nInc === 1 ? "" : "s"}</button>`);
    document.querySelector("#again").onclick = () => { setActions(""); step1(); };
    document.querySelector("#do-import").onclick = doImport;
    view.innerHTML = `
      <p class="muted" style="margin-top:0">${esc(fileName)} to ${esc(proj ? proj.name : "")}${parsed.generic ? ", general sheet" : ", " + esc(d.formRef) + " form"}. Photos found: <b>${parsed.imageCount}</b>.</p>
      ${mismatch ? `<div class="panel" style="border-color:#f1d27a;background:#fff8e1">The file says the project is <b>${esc(h.project)}</b>. Make sure you chose the right project.</div>` : ""}
      ${parsed.warnings.map(w => `<div class="panel" style="border-color:#f1d27a;background:#fff8e1">${esc(w)}</div>`).join("")}
      ${mappingPanel()}
      <section class="panel"><div class="grid3">
        <label class="fld"><span>Audit date</span><input type="date" id="h-date" value="${esc(h.date || todayISO())}"></label>
        <label class="fld"><span>Auditors in the file</span><input id="h-aud" value="${esc(h.auditors || "")}"></label>
        <label class="fld"><span>Manpower</span><input id="h-mp" inputmode="numeric" value="${h.manpower ?? ""}"></label>
        <label class="fld"><span>Completion %</span><input id="h-poc" inputmode="numeric" value="${h.poc ?? ""}"></label>
      </div></section>
      <section class="panel"><div class="tscroll"><table class="tbl"><thead><tr><th></th><th>#</th><th>Area</th><th>Finding</th><th>Topic</th><th>Risk</th><th>Status</th><th>Due</th><th>Photos</th></tr></thead><tbody id="imp-rows">${rowsHtml()}</tbody></table></div></section>
      ${parsed.scope ? `<section class="panel"><h2>Purpose and scope</h2><p style="white-space:pre-wrap">${esc(parsed.scope)}</p></section>` : ""}
      ${parsed.conclusion ? `<section class="panel"><h2>Conclusion</h2><p style="white-space:pre-wrap">${esc(parsed.conclusion)}</p></section>` : ""}
      <p class="muted small">Closed findings come in as closed NCRs, with the action as the corrective action. The risk sets the NCR type: High is Serious, Medium is Major, Low is Minor.</p>`;
    view.querySelector("#imp-rows").addEventListener("change", e => {
      const tr = e.target.closest("tr[data-i]"); if (!tr) return; const f = parsed.findings[+tr.dataset.i];
      if (e.target.matches("[data-inc]")) f.include = e.target.checked;
      if (e.target.matches("[data-topic]")) f.topic = e.target.value;
      if (e.target.matches("[data-status]")) f.status = e.target.value;
      if (e.target.matches("[data-risk]")) { f.risk = e.target.value; f.severity = (d.riskSeverity || {})[f.risk] || "Minor"; tr.querySelector("[data-risk] + div").textContent = f.severity + " NCR"; }
      const n = parsed.findings.filter(x => x.include).length, b = document.querySelector("#do-import");
      b.textContent = `Upload ${n} finding${n === 1 ? "" : "s"}`; b.disabled = !n;
    });
    const mp = view.querySelector(".mapping");
    if (mp) mp.addEventListener("change", e => {
      if (e.target.id === "m-sheet") { generic.sheetIndex = +e.target.value; const ws = generic.wb.worksheets[generic.sheetIndex]; generic.an = analyzeSheet(ws, generic.images[ws.name] || []); }
      else if (e.target.id === "m-head") { const ws = generic.wb.worksheets[generic.sheetIndex]; const r = +e.target.value; const old = generic.an; const an = analyzeSheet(ws, generic.images[ws.name] || []); if (r !== an.headerRow) { an.headerRow = r; an.cols = an.cols.map(x => ({ c: x.c, label: r ? String(ws.getCell(r, x.c).text || "").trim() : "" })); an.mapping = { ...old.mapping }; } generic.an = an; }
      else if (e.target.dataset.map) { const v = e.target.value; if (v) generic.an.mapping[e.target.dataset.map] = +v; else delete generic.an.mapping[e.target.dataset.map]; }
      else if (e.target.dataset.photo) generic.an.photoKinds[+e.target.dataset.photo] = e.target.value;
      else return;
      parsed = runGeneric();
      step2();
    });
  }

  async function doImport() {
    const btn = document.querySelector("#do-import"); btn.disabled = true;
    const num = s => { const n = parseFloat(String(s).replace(/[^\d.]/g, "")); return isNaN(n) ? "" : n; };
    const list = parsed.findings.filter(f => f.include);
    const total = list.reduce((n, f) => n + f.photos.violation.length + f.photos.closure.length, 0);
    let done = 0, photoFail = 0;
    try {
      btn.textContent = "Making the audit…";
      const date = view.querySelector("#h-date").value || todayISO();
      const proj = M.project(choice.project_id);
      const lead = M.member(choice.lead_id) || me;
      const names = String(view.querySelector("#h-aud").value || "").split(/[,;&\n/]+| and /i).map(x => x.trim()).filter(Boolean);
      const auditors = [{ name: lead.name, position: lead.position || "Corporate HSE Auditor" }, ...names.filter(n => n.toLowerCase() !== String(lead.name).toLowerCase()).map(n => ({ name: n, position: "Corporate HSE Auditor" }))];
      const number = M.nextAuditNumber(mod, proj.id);
      const year = +date.slice(0, 4), month = +date.slice(5, 7);
      const planItem = M.plans(mod).filter(p => p.project_id === proj.id && p.year === year && !p.audit_id).sort((a, b) => Math.abs(a.month - month) - Math.abs(b.month - month))[0] || null;
      const summary = [parsed.scope ? `Scope: ${parsed.scope}` : "", parsed.conclusion].filter(Boolean).join("\n\n");
      const audit = await S.put({
        id: S.uid("aud"), kind: "audit", module: mod, project_id: proj.id, plan_id: planItem ? planItem.id : "", ref: M.auditRef(d, proj, number), number, date,
        status: "draft", lead_id: lead.id, team_ids: [lead.id], created_by: me.id, auditors, attendees: [{ name: parsed.header.pm || "", position: "Project Manager" }, { name: "", position: "HSE Manager" }],
        manpower: num(view.querySelector("#h-mp").value), completion: num(view.querySelector("#h-poc").value), opening: "", siteTour: "", closeMeeting: "", summary,
        ratings: {}, notes: {}, photos: [], carry: [], equipment: [], source: "excel", file_name: fileName,
      });
      if (planItem) await S.put({ ...planItem, audit_id: audit.id });
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        btn.textContent = `Finding ${i + 1} of ${list.length}…`;
        const ids = { violation: [], closure: [] };
        for (const kind of ["violation", "closure"]) for (const p of f.photos[kind]) {
          try { ids[kind].push(await S.putPhoto(await shrinkImage(new Blob([p.buffer], { type: "image/" + (p.ext === "png" ? "png" : "jpeg") })))); }
          catch (e) { photoFail++; }
          done++; btn.textContent = `Photos ${done} of ${total}…`;
        }
        const closed = f.status === "closed";
        const seq = i + 1;
        const part = d.parts.find(p => p.id === f.topic);
        await S.put({
          id: S.uid("ncr"), kind: "ncr", module: mod, audit_id: audit.id, project_id: proj.id, seq, ref: `${audit.ref}-${String(seq).padStart(2, "0")}`, date,
          severity: f.severity, repeated: false, classification: part ? part.name : "", item_id: "", clause: d.ncrClause, requirement: d.ncrRequirement,
          description: f.observation || "(no description in the report)", location: f.area || "", root_causes: [], other_cause: f.root_cause || "",
          action_required: f.action || "Correct the condition, find the root cause and stop it happening again. Send evidence photos.",
          photos: ids.violation, responsible_name: f.owner || "", responsible_position: "", due_date: f.target_date || addDays(date, M.DUE_DAYS[f.severity] || 14),
          status: closed ? "Closed" : "Open", ca_text: closed ? (f.action || "Closed on site.") : "", ca_photos: ids.closure, ca_date: closed ? (f.target_date || date) : "",
          followup_name: closed ? me.name : "", followup_position: closed ? (me.position || "") : "", followup_date: closed ? todayISO() : "",
          comments: f.needs_support ? `Needs management support: ${f.support_title}` : "", source: "excel",
        });
      }
      Object.values(thumbs).forEach(u => URL.revokeObjectURL(u));
      toast(`${list.length} NCR${list.length === 1 ? "" : "s"} and ${total - photoFail} photo${total - photoFail === 1 ? "" : "s"} added${photoFail ? `. ${photoFail} photo${photoFail === 1 ? "" : "s"} couldn't be read` : ""}. Now answer the checklist.`, "ok");
      go(link("audit", audit.id) + "?step=score");
    } catch (x) {
      console.warn(x);
      toast(x.message, "error");
      btn.disabled = false; btn.textContent = "Try again";
    }
  }

  step1();
}
