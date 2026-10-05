import { esc, fmtDate, todayISO, toast, ensureExcelJS, ensureJSZip, shrinkImage, riskChip } from "../ui.js";
import { TOPICS, guessTopic } from "../checklist.js";
import { parseFlashAudit, analyzeSheet, extractRows, readHeaderInfo, collectImages, loadWorkbook, readNotes, FIELDS } from "../importer.js";

// Category text from a sheet → one of our topics (by code, name or the first word of the name).
function matchTopic(cat) {
  const c = String(cat || "").trim().toLowerCase(); if (!c) return null;
  const t = TOPICS.find(t => t.code.toLowerCase() === c || t.name.toLowerCase() === c) || TOPICS.find(t => c.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(c))
    || TOPICS.find(t => c.includes(t.name.toLowerCase().split(/[\s(–-]/)[0]));
  return t ? t.code : null;
}

export async function render(root, ctx) {
  const { api, store, me, isAdmin, go } = ctx;
  await store.load();
  let parsed = null, fileName = "", thumbs = {};
  let generic = null; // { wb, images, sheetIndex, an } when the file isn't the F-HSE-0075 form
  const projects = store.projects.filter(p => p.active || isAdmin);

  function step1() {
    root.innerHTML = `
      <div class="page-head"><div><h1>Import Excel report</h1><p class="muted">Upload any Excel audit sheet with its photos. The corporate F-HSE-0075 form is read automatically; for other sheets you check which column is which before saving.</p></div></div>
      <div class="card narrow stack">
        ${isAdmin ? `<label class="fld"><span>Project</span><select id="i-project"><option value="">Choose the project…</option>${projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
          <label class="fld"><span>Audit type</span><select id="i-type"><option value="corporate">Corporate HSE audit</option><option value="project">Project self-audit</option></select></label>`
          : `<div class="fld"><span>Project</span><b>${esc(me.project_name)}</b></div>`}
        <label class="drop" id="drop"><input type="file" id="i-file" accept=".xlsx,.xlsm"><b>Choose the Excel file</b><span class="muted">or drop it here · .xlsx or .xlsm · photos on the sheet or inside cells are read</span></label>
        <ul class="muted small hints"><li>Each finding should be on its own row, with the observation in one column.</li><li>Photos are matched to the row they sit on. A column headed “After”, “Closure” or “Evidence” is read as closure photos.</li><li>Cell notes (comments) are added to the observation.</li><li>Old .xls files: open in Excel and “Save as” .xlsx first.</li></ul>
        <p class="dlg-err" id="i-err"></p>
      </div>`;
    const drop = root.querySelector("#drop");
    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove("over")));
    drop.addEventListener("drop", e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) readFile(f); });
    root.querySelector("#i-file").addEventListener("change", e => { const f = e.target.files[0]; if (f) readFile(f); });
  }

  async function readFile(file) {
    const err = root.querySelector("#i-err");
    const projectId = isAdmin ? root.querySelector("#i-project").value : me.project_id;
    const type = isAdmin ? root.querySelector("#i-type").value : "project";
    if (!projectId) { err.textContent = "Choose the project first."; return; }
    if (/\.xls$/i.test(file.name)) { err.textContent = "This is an old .xls file. Open it in Excel and use Save as → Excel Workbook (.xlsx), then upload that."; return; }
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
        parsed.findings.forEach(f => { f.topic = guessTopic(f.observation + " " + f.root_cause); f.include = true; });
      } else {
        const zip = JSZip ? await JSZip.loadAsync(buf) : null;
        const images = await collectImages(wb, zip);
        const notes = zip ? await readNotes(zip) : {};
        // pick the sheet with the most rows and photos
        const scored = wb.worksheets.map((ws, i) => { const an = analyzeSheet(ws, images[ws.name] || []); const ex = extractRows(ws, an, images[ws.name] || [], null, notes[ws.name] || {}); return { i, an, n: ex.findings.length, p: ex.imageCount }; });
        scored.sort((a, b) => (b.n * 10 + b.p) - (a.n * 10 + a.p));
        if (!scored.length || !scored[0].n) throw new Error("No rows with observations were found in this file. Each finding needs its own row with a text description.");
        generic = { wb, images, notes, sheetIndex: scored[0].i, an: scored[0].an };
        parsed = runGeneric();
      }
      parsed.projectId = projectId; parsed.type = type;
      step2();
    } catch (x) { console.error(x); err.textContent = x.message; }
  }

  function runGeneric() {
    const ws = generic.wb.worksheets[generic.sheetIndex];
    const head = readHeaderInfo(ws, generic.an.headerRow || 12);
    const ex = extractRows(ws, generic.an, generic.images[ws.name] || [], head.date, generic.notes[ws.name] || {});
    const warnings = [];
    if (!head.date) warnings.push("No audit date found in the sheet — today's date is used unless you change it below.");
    const p = { header: head, scope: "", conclusion: "", findings: ex.findings, warnings, imageCount: ex.imageCount, generic: true, projectId: parsed?.projectId, type: parsed?.type };
    p.findings.forEach(f => { f.topic = matchTopic(f.category) || guessTopic(`${f.category} ${f.observation} ${f.root_cause}`); f.include = !!f.observation; });
    return p;
  }

  function makeThumbs() {
    Object.values(thumbs).forEach(u => URL.revokeObjectURL(u)); thumbs = {};
    parsed.findings.forEach((f, fi) => { ["violation", "closure"].forEach(k => f.photos[k].forEach((p, i) => { thumbs[`${fi}-${k}-${i}`] = URL.createObjectURL(new Blob([p.buffer], { type: "image/" + (p.ext === "png" ? "png" : "jpeg") })); })); });
  }

  function mappingPanel() {
    if (!generic) return "";
    const ws = generic.wb.worksheets[generic.sheetIndex], an = generic.an;
    const colName = c => { let s = "", n = c; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
    const colOpts = sel => `<option value="">— not in this sheet —</option>` + an.cols.map(x => `<option value="${x.c}" ${+sel === x.c ? "selected" : ""}>${colName(x.c)}${x.label ? " · " + esc(x.label.slice(0, 40)) : ""}</option>`).join("");
    const imgCols = Object.keys(an.photoKinds).map(Number).sort((a, b) => a - b);
    return `<section class="card stack mapping">
      <div><h2 class="h2">Which column is which</h2><p class="muted small">This file isn't the F-HSE-0075 form, so the columns were matched by their headings. Correct anything that's wrong — the table below updates straight away.</p></div>
      <div class="form-grid three">
        ${generic.wb.worksheets.length > 1 ? `<label class="fld"><span>Sheet</span><select id="m-sheet">${generic.wb.worksheets.map((w, i) => `<option value="${i}" ${i === generic.sheetIndex ? "selected" : ""}>${esc(w.name)}</option>`).join("")}</select></label>` : `<div class="fld"><span>Sheet</span><b>${esc(ws.name)}</b></div>`}
        <label class="fld"><span>Headings are in row</span><select id="m-head"><option value="0" ${!an.headerRow ? "selected" : ""}>No heading row</option>${Array.from({ length: 30 }, (_, i) => i + 1).map(r => `<option value="${r}" ${an.headerRow === r ? "selected" : ""}>Row ${r}</option>`).join("")}</select></label>
        ${FIELDS.filter(([k]) => k !== "num").map(([k, label]) => `<label class="fld"><span>${esc(label)}${k === "obs" ? " *" : ""}</span><select data-map="${k}">${colOpts(an.mapping[k])}</select></label>`).join("")}
      </div>
      ${imgCols.length ? `<div><h3 class="h3s">Photos found in ${imgCols.length === 1 ? "column" : "columns"}</h3><div class="form-grid three">${imgCols.map(c => `<label class="fld"><span>Column ${colName(c)}${an.cols[c - 1]?.label ? " · " + esc(an.cols[c - 1].label.slice(0, 30)) : ""}</span><select data-photo="${c}">${[["violation", "Photo of violation"], ["closure", "Closure evidence"], ["ignore", "Ignore these pictures"]].map(([v, l]) => `<option value="${v}" ${an.photoKinds[c] === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>`).join("")}</div></div>` : `<p class="muted small">No pictures were found in this sheet.</p>`}
    </section>`;
  }

  function step2() {
    makeThumbs();
    const h = parsed.header, proj = store.project(parsed.projectId);
    const mismatch = h.project && proj && !proj.name.toLowerCase().includes(h.project.toLowerCase().slice(0, 6)) && !h.project.toLowerCase().includes(proj.code.replace(/-/g, " ").slice(0, 6));
    const nInc = parsed.findings.filter(x => x.include).length;
    root.innerHTML = `
      <div class="page-head"><div><a class="back" href="#/import">‹ Choose another file</a><h1>Check before importing</h1><p class="muted">${esc(fileName)} → ${esc(proj?.name || "")}${parsed.generic ? " · general sheet" : " · F-HSE-0075 form"}</p></div>
        <div class="actions"><button class="btn primary" id="do-import" ${nInc ? "" : "disabled"}>Import ${nInc} findings</button></div></div>
      ${mismatch ? `<div class="panel warn">The file says the project is <b>${esc(h.project)}</b>. Make sure you chose the right project.</div>` : ""}
      ${parsed.warnings.map(w => `<div class="panel warn">${esc(w)}</div>`).join("")}
      ${mappingPanel()}
      <div class="card form-grid">
        <label class="fld"><span>Date of audit</span><input type="date" id="h-date" value="${esc(h.date || todayISO())}"></label>
        <label class="fld"><span>Auditor(s)</span><input id="h-aud" value="${esc(h.auditors)}"></label>
        <label class="fld"><span>Project Manager</span><input id="h-pm" value="${esc(h.pm || proj?.pm || "")}"></label>
        <label class="fld"><span>P.O.C. %</span><input id="h-poc" value="${h.poc ?? ""}"></label>
        <label class="fld"><span>Manpower</span><input id="h-mp" value="${h.manpower ?? ""}"></label>
        <div class="fld"><span>Photos found</span><b id="n-photos">${parsed.imageCount}</b></div>
      </div>
      <div class="card table-card"><div class="tscroll"><table class="tbl imp"><thead><tr><th></th><th>#</th><th>Area</th><th>Observation</th><th>Topic</th><th>Risk</th><th>Status</th><th>Due</th><th>Photos</th></tr></thead><tbody id="imp-rows">
      ${rowsHtml()}
      </tbody></table></div></div>
      ${parsed.scope ? `<section class="card"><h2 class="h2">Purpose &amp; scope</h2><p class="pre">${esc(parsed.scope)}</p></section>` : ""}
      ${parsed.conclusion ? `<section class="card"><h2 class="h2">Conclusion</h2><p class="pre">${esc(parsed.conclusion)}</p></section>` : ""}
      <p class="muted small">${isAdmin ? "Findings marked Done are imported as closed." : "Findings marked Done are imported as “pending review” until the administration approves them."}</p>`;
    root.querySelector("#imp-rows").addEventListener("change", e => {
      const tr = e.target.closest("tr[data-i]"); const f = parsed.findings[+tr.dataset.i];
      if (e.target.matches("[data-inc]")) f.include = e.target.checked;
      if (e.target.matches("[data-topic]")) f.topic = e.target.value;
      if (e.target.matches("[data-status]")) f.status = e.target.value;
      if (e.target.matches("[data-risk]")) f.risk = e.target.value;
      const n = parsed.findings.filter(x => x.include).length, b = root.querySelector("#do-import");
      b.textContent = `Import ${n} findings`; b.disabled = !n;
    });
    const mp = root.querySelector(".mapping");
    if (mp) mp.addEventListener("change", e => {
      if (e.target.id === "m-sheet") { generic.sheetIndex = +e.target.value; const ws = generic.wb.worksheets[generic.sheetIndex]; generic.an = analyzeSheet(ws, generic.images[ws.name] || []); }
      else if (e.target.id === "m-head") { const ws = generic.wb.worksheets[generic.sheetIndex]; const r = +e.target.value; const old = generic.an; const an = analyzeSheet(ws, generic.images[ws.name] || []); if (r !== an.headerRow) { an.headerRow = r; an.cols = an.cols.map(x => ({ c: x.c, label: r ? String(ws.getCell(r, x.c).text || "").trim() : "" })); an.mapping = { ...old.mapping }; } generic.an = an; }
      else if (e.target.dataset.map) { const v = e.target.value; generic.an.mapping[e.target.dataset.map] = v ? +v : undefined; if (!v) delete generic.an.mapping[e.target.dataset.map]; }
      else if (e.target.dataset.photo) generic.an.photoKinds[+e.target.dataset.photo] = e.target.value;
      else return;
      const keep = { projectId: parsed.projectId, type: parsed.type };
      parsed = runGeneric(); Object.assign(parsed, keep);
      step2();
    });
    root.querySelector("#do-import").addEventListener("click", doImport);
  }

  function rowsHtml() {
    return parsed.findings.map((f, i) => `<tr data-i="${i}">
        <td><input type="checkbox" data-inc ${f.include ? "checked" : ""} aria-label="Import finding ${f.seq}"></td><td>${f.seq}</td><td>${esc(f.area)}</td>
        <td class="obs">${esc(f.observation) || `<span class="muted">(no text)</span>`}${f.needs_support ? `<div><span class="chip st-overdue">Management support: ${esc(f.support_title)}</span></div>` : ""}${f.category ? `<div class="muted small">Category in sheet: ${esc(f.category)}</div>` : ""}</td>
        <td><select data-topic>${TOPICS.map(t => `<option value="${t.code}" ${t.code === f.topic ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></td>
        <td>${parsed.generic ? `<select data-risk>${[["High", "High"], ["Med", "Medium"], ["Low", "Low"]].map(([v, l]) => `<option value="${v}" ${f.risk === v ? "selected" : ""}>${l}</option>`).join("")}</select>` : riskChip(f.risk)}</td>
        <td><select data-status><option value="closed" ${f.status === "closed" ? "selected" : ""}>Done</option><option value="open" ${f.status === "open" ? "selected" : ""}>On going</option></select></td>
        <td class="nowrap">${f.fixed_on_spot ? "Immediately" : fmtDate(f.target_date) || esc(f.due) || "—"}</td>
        <td><div class="mini-shots">${["violation", "closure"].map(k => f.photos[k].map((p, j) => `<img src="${thumbs[`${i}-${k}-${j}`]}" alt="" class="${k}">`).join("")).join("")}</div></td></tr>`).join("") || `<tr><td colspan="9" class="empty-row">No rows with an observation in this column. Choose the right column above.</td></tr>`;
  }

  async function doImport() {
    const btn = root.querySelector("#do-import"); btn.disabled = true;
    const num = s => { const n = parseFloat(String(s).replace(/[^\d.]/g, "")); return isNaN(n) ? null : n; };
    const list = parsed.findings.filter(f => f.include);
    const totalPhotos = list.reduce((n, f) => n + f.photos.violation.length + f.photos.closure.length, 0);
    let done = 0, photoFail = 0, audit = null;
    const progress = t => { btn.textContent = t; };
    try {
      progress("Creating the audit…");
      const auditDate = root.querySelector("#h-date").value || todayISO();
      audit = await api.createAudit({ project_id: parsed.projectId, audit_type: parsed.type, source: "excel", status: "draft", file_name: fileName,
        audit_date: auditDate, auditor: root.querySelector("#h-aud").value.trim(), pm: root.querySelector("#h-pm").value.trim(),
        poc: num(root.querySelector("#h-poc").value), manpower: num(root.querySelector("#h-mp").value), scope: parsed.scope, conclusion: parsed.conclusion, created_by_name: me.name || "" });
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        progress(`Finding ${i + 1} of ${list.length}…`);
        const closed = f.status === "closed";
        const onSpot = f.fixed_on_spot || (closed && !f.target_date);
        const row = await api.createFinding({ audit_id: audit.id, project_id: parsed.projectId, seq: i + 1, item_id: "", topic: f.topic, area: f.area, observation: f.observation || "(no description in the report)",
          risk: f.risk, root_cause: f.root_cause, immediate_action: f.action, owner: f.owner || "", fixed_on_spot: onSpot, target_date: f.target_date || (onSpot ? auditDate : null),
          needs_support: f.needs_support, support_title: f.support_title, status: closed ? "closed" : "open", closure_note: closed ? f.action : "", created_by_name: me.name || "" });
        for (const kind of ["violation", "closure"]) {
          for (const p of f.photos[kind]) {
            try {
              const blob = await shrinkImage(new Blob([p.buffer], { type: "image/" + (p.ext === "png" ? "png" : "jpeg") }));
              await api.uploadPhoto({ projectId: parsed.projectId, findingId: row.id, kind, blob, by: me.name || "" });
            } catch (e) { photoFail++; }
            done++; progress(`Uploading photos ${done} of ${totalPhotos}…`);
          }
        }
      }
      await api.updateAudit(audit.id, { status: "submitted" });
      store.markStale();
      Object.values(thumbs).forEach(u => URL.revokeObjectURL(u));
      toast(photoFail ? `Imported. ${photoFail} photo(s) couldn't be uploaded.` : `Imported ${list.length} findings and ${totalPhotos} photos.`);
      go("#/audit/" + audit.id);
    } catch (x) {
      toast(x.message + (audit ? " The partly imported audit was kept as a draft — open it from Audits to finish or delete it." : ""), "error");
      btn.disabled = false; btn.textContent = "Try again";
    }
  }

  step1();
}
