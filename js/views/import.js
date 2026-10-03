import { esc, fmtDate, todayISO, toast, ensureExcelJS, shrinkImage, riskChip } from "../ui.js";
import { TOPICS, guessTopic } from "../checklist.js";
import { parseFlashAudit } from "../importer.js";

export async function render(root, ctx) {
  const { api, store, me, isAdmin, go } = ctx;
  await store.load();
  let parsed = null, fileName = "", thumbs = {};
  const projects = store.projects.filter(p => p.active || isAdmin);

  function step1() {
    root.innerHTML = `
      <div class="page-head"><div><h1>Import Excel report</h1><p class="muted">Upload a completed HSE Flash Audit Report (form F-HSE-0075). Findings, statuses and photos are read from the file and added to the register and dashboard.</p></div></div>
      <div class="card narrow stack">
        ${isAdmin ? `<label class="fld"><span>Project</span><select id="i-project"><option value="">Choose the project…</option>${projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
          <label class="fld"><span>Audit type</span><select id="i-type"><option value="corporate">Corporate HSE audit</option><option value="project">Project self-audit</option></select></label>`
          : `<div class="fld"><span>Project</span><b>${esc(me.project_name)}</b></div>`}
        <label class="drop" id="drop"><input type="file" id="i-file" accept=".xlsx"><b>Choose the Excel file</b><span class="muted">or drop it here · .xlsx only</span></label>
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
    if (!/\.xlsx$/i.test(file.name)) { err.textContent = "Use an .xlsx file. Older .xls files need to be saved as .xlsx first."; return; }
    err.textContent = "Reading the file…";
    try {
      const ExcelJS = await ensureExcelJS();
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
      parsed = parseFlashAudit(wb);
      parsed.projectId = projectId; parsed.type = type;
      parsed.findings.forEach(f => { f.topic = guessTopic(f.observation + " " + f.root_cause); f.include = true; });
      fileName = file.name;
      thumbs = {};
      parsed.findings.forEach(f => { ["violation", "closure"].forEach(k => f.photos[k].forEach((p, i) => { thumbs[`${f.seq}-${k}-${i}`] = URL.createObjectURL(new Blob([p.buffer], { type: "image/" + (p.ext === "png" ? "png" : "jpeg") })); })); });
      step2();
    } catch (x) { err.textContent = x.message; }
  }

  function step2() {
    const h = parsed.header, proj = store.project(parsed.projectId);
    const mismatch = h.project && proj && !proj.name.toLowerCase().includes(h.project.toLowerCase().slice(0, 6)) && !h.project.toLowerCase().includes(proj.code.replace(/-/g, " ").slice(0, 6));
    root.innerHTML = `
      <div class="page-head"><div><a class="back" href="#/import">‹ Choose another file</a><h1>Check before importing</h1><p class="muted">${esc(fileName)} → ${esc(proj?.name || "")}</p></div>
        <div class="actions"><button class="btn primary" id="do-import">Import ${parsed.findings.length} findings</button></div></div>
      ${mismatch ? `<div class="panel warn">The file says the project is <b>${esc(h.project)}</b>. Make sure you chose the right project.</div>` : ""}
      ${parsed.warnings.map(w => `<div class="panel warn">${esc(w)}</div>`).join("")}
      <div class="card form-grid">
        <label class="fld"><span>Date of audit</span><input type="date" id="h-date" value="${esc(h.date || todayISO())}"></label>
        <label class="fld"><span>Auditor(s)</span><input id="h-aud" value="${esc(h.auditors)}"></label>
        <label class="fld"><span>Project Manager</span><input id="h-pm" value="${esc(h.pm || proj?.pm || "")}"></label>
        <label class="fld"><span>P.O.C. %</span><input id="h-poc" value="${h.poc ?? ""}"></label>
        <label class="fld"><span>Manpower</span><input id="h-mp" value="${h.manpower ?? ""}"></label>
        <div class="fld"><span>Photos found</span><b>${parsed.imageCount}</b></div>
      </div>
      <div class="card table-card"><div class="tscroll"><table class="tbl imp"><thead><tr><th></th><th>#</th><th>Area</th><th>Observation</th><th>Topic</th><th>Risk</th><th>Status</th><th>Due</th><th>Photos</th></tr></thead><tbody>
      ${parsed.findings.map((f, i) => `<tr data-i="${i}">
        <td><input type="checkbox" data-inc ${f.include ? "checked" : ""} aria-label="Import finding ${f.seq}"></td><td>${f.seq}</td><td>${esc(f.area)}</td>
        <td class="obs">${esc(f.observation)}${f.needs_support ? `<div><span class="chip st-overdue">Management support: ${esc(f.support_title)}</span></div>` : ""}</td>
        <td><select data-topic>${TOPICS.map(t => `<option value="${t.code}" ${t.code === f.topic ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></td>
        <td>${riskChip(f.risk)}</td>
        <td><select data-status><option value="closed" ${f.status === "closed" ? "selected" : ""}>Done</option><option value="open" ${f.status === "open" ? "selected" : ""}>On going</option></select></td>
        <td class="nowrap">${f.fixed_on_spot ? "Immediately" : fmtDate(f.target_date) || esc(f.due) || "—"}</td>
        <td><div class="mini-shots">${["violation", "closure"].map(k => f.photos[k].map((p, j) => `<img src="${thumbs[`${f.seq}-${k}-${j}`]}" alt="" class="${k}">`).join("")).join("")}</div></td></tr>`).join("")}
      </tbody></table></div></div>
      ${parsed.scope ? `<section class="card"><h2 class="h2">Purpose &amp; scope</h2><p class="pre">${esc(parsed.scope)}</p></section>` : ""}
      ${parsed.conclusion ? `<section class="card"><h2 class="h2">Conclusion</h2><p class="pre">${esc(parsed.conclusion)}</p></section>` : ""}
      <p class="muted small">${isAdmin ? "Findings marked Done are imported as closed." : "Findings marked Done are imported as “pending review” until the administration approves them."}</p>`;
    root.querySelector("tbody").addEventListener("change", e => {
      const tr = e.target.closest("tr[data-i]"); const f = parsed.findings[+tr.dataset.i];
      if (e.target.matches("[data-inc]")) f.include = e.target.checked;
      if (e.target.matches("[data-topic]")) f.topic = e.target.value;
      if (e.target.matches("[data-status]")) f.status = e.target.value;
      root.querySelector("#do-import").textContent = `Import ${parsed.findings.filter(x => x.include).length} findings`;
    });
    root.querySelector("#do-import").addEventListener("click", doImport);
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
      audit = await api.createAudit({ project_id: parsed.projectId, audit_type: parsed.type, source: "excel", status: "draft", file_name: fileName,
        audit_date: root.querySelector("#h-date").value || todayISO(), auditor: root.querySelector("#h-aud").value.trim(), pm: root.querySelector("#h-pm").value.trim(),
        poc: num(root.querySelector("#h-poc").value), manpower: num(root.querySelector("#h-mp").value), scope: parsed.scope, conclusion: parsed.conclusion, created_by_name: me.name || "" });
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        progress(`Finding ${i + 1} of ${list.length}…`);
        const closed = f.status === "closed";
        const row = await api.createFinding({ audit_id: audit.id, project_id: parsed.projectId, seq: i + 1, item_id: "", topic: f.topic, area: f.area, observation: f.observation || "(no description in the report)",
          risk: f.risk, root_cause: f.root_cause, immediate_action: f.action, fixed_on_spot: f.fixed_on_spot, target_date: f.target_date || null,
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
