import { esc, fmtDate, aRef, fRef, findingState, stateChip, riskChip, toast, dialog, confirmBox, saveBlob, pct, busyOverlay, ICON } from "../ui.js";
import { ALL_TOPICS, ITEM, topicName } from "../checklist.js";
import { buildAuditReport, defaultScope, defaultConclusion } from "../report.js";
import { formRef, formLabel } from "../settings.js";

export async function render(root, ctx) {
  const { api, store, isAdmin, params, go } = ctx;
  const id = params[0];
  let a, findings, photos, urls = {};
  async function load() {
    [a, findings] = await Promise.all([api.getAudit(id), api.findingsOfAudit(id)]);
    photos = findings.length ? await api.photosOf(findings.map(f => f.id)) : [];
    const firstViolation = {}; photos.forEach(p => { if (p.kind === "violation" && !firstViolation[p.finding_id]) firstViolation[p.finding_id] = p.path; });
    urls = Object.keys(firstViolation).length ? await api.urls(Object.values(firstViolation)) : {};
    a._thumb = firstViolation;
  }
  await load();
  const canEdit = () => isAdmin || a.status === "draft";

  function draw() {
    const checks = a.checks || {};
    const vals = Object.values(checks), ok = vals.filter(v => v === "ok").length, nc = vals.filter(v => v === "nc").length;
    const byTopic = ALL_TOPICS.filter(t => t.active || t.items.some(i => checks[i.id])).map(t => { const ids = t.items.map(i => i.id); const o = ids.filter(i => checks[i] === "ok").length, n = ids.filter(i => checks[i] === "nc").length, na = ids.filter(i => checks[i] === "na").length; return { t, o, n, na, c: pct(o, o + n) }; });
    const proj = { name: a.projects?.name, pm: a.projects?.pm };
    root.innerHTML = `
      <div class="page-head"><div><a class="back" href="#/audits">‹ Audits</a>
        <h1>Audit ${aRef(a.ref)} ${a.status === "draft" ? `<span class="chip st-open">Draft</span>` : `<span class="chip st-closed">Submitted</span>`}</h1>
        <p class="muted">${esc(proj.name || "")} · ${fmtDate(a.audit_date)} · ${a.audit_type === "corporate" ? "Corporate audit" : "Project audit"} · ${a.source === "excel" ? "Imported from Excel" + (a.file_name ? " (" + esc(a.file_name) + ")" : "") : "Checklist"}</p></div>
        <div class="actions">
          <button class="btn ghost" data-act="xlsx" title="Download the ${esc(formLabel())} as Excel">${ICON.xls} Excel ${esc(formRef() || "report")}</button>
          <button class="btn ghost" data-act="pptx" title="Download the report as a PowerPoint deck">${ICON.ppt} PowerPoint</button>
          ${a.status === "draft" && a.source === "form" ? `<a class="btn ghost" href="#/form/${a.id}">Continue checklist</a>` : ""}
          ${canEdit() ? `<button class="btn ghost" data-act="edit">Edit details</button>` : ""}
          ${a.status === "draft" ? `<button class="btn primary" data-act="submit">Submit audit</button>` : isAdmin ? `<button class="btn ghost" data-act="reopen">Return to draft</button>` : ""}
          ${canEdit() ? `<button class="btn ghost danger" data-act="delete">Delete</button>` : ""}
        </div></div>
      <div class="kpis small">
        <div class="kpi"><span>Auditor</span><b>${esc(a.auditor || "—")}</b></div>
        <div class="kpi"><span>Project Manager</span><b>${esc(a.pm || proj.pm || "—")}</b></div>
        <div class="kpi"><span>P.O.C.</span><b>${a.poc != null ? Math.round(a.poc) + "%" : "—"}</b></div>
        <div class="kpi"><span>Manpower</span><b>${a.manpower != null ? Number(a.manpower).toLocaleString() : "—"}</b></div>
        <div class="kpi"><span>Findings</span><b>${findings.length}</b></div>
        <div class="kpi"><span>Compliance</span><b>${vals.length ? (pct(ok, ok + nc) ?? "—") + "%" : "—"}</b></div>
      </div>
      ${a.areas ? `<p><b>Areas visited:</b> ${esc(a.areas)}</p>` : ""}
      <section class="card"><h2 class="h2">Purpose &amp; scope</h2><p class="pre">${esc(a.scope || defaultScope(a, proj.name))}</p>${!a.scope ? `<p class="muted small">Standard wording — edit the audit details to change it.</p>` : ""}</section>
      ${vals.length ? `<section class="card"><h2 class="h2">Checklist results · ${vals.length} of ${Object.keys(ITEM).length} checks</h2>
        <div class="tscroll"><table class="tbl compact"><thead><tr><th>Topic</th><th class="num">OK</th><th class="num">NC</th><th class="num">N/A</th><th class="num">Compliance</th><th></th></tr></thead><tbody>
        ${byTopic.map(r => `<tr><td>${esc(r.t.name)}</td><td class="num">${r.o}</td><td class="num">${r.n ? `<b class="t-over">${r.n}</b>` : 0}</td><td class="num">${r.na}</td><td class="num">${r.c == null ? "—" : r.c + "%"}</td><td class="barcell"><span class="hbar"><i style="width:${r.c ?? 0}%"></i></span></td></tr>`).join("")}
        </tbody></table></div></section>` : ""}
      <section class="card"><h2 class="h2">Findings (${findings.length})</h2>
        ${findings.length ? `<div class="flist">${findings.map((f, i) => `<a class="fitem" href="#/finding/${f.id}">
          <span class="thumb">${a._thumb[f.id] && urls[a._thumb[f.id]] ? `<img src="${esc(urls[a._thumb[f.id]])}" alt="" loading="lazy">` : ""}</span>
          <span class="fbody"><span class="fhead"><b>${i + 1}. ${fRef(f.ref)}</b> ${riskChip(f.risk)} ${stateChip(f)}</span>
          <span class="muted small">${esc(f.area || "")}${f.area ? " · " : ""}${esc(topicName(f.topic))}</span>
          <span>${esc(f.observation)}</span></span></a>`).join("")}</div>` : `<p class="muted">No findings were raised.</p>`}
      </section>
      <section class="card"><h2 class="h2">Conclusion</h2><p class="pre">${esc(a.conclusion || defaultConclusion(a, findings))}</p></section>`;
  }
  draw();

  root.addEventListener("click", async e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act;
    try {
      if (act === "xlsx") {
        b.disabled = true; const label = b.innerHTML; b.textContent = "Preparing…";
        try {
          const pb = {}; photos.forEach(p => { (pb[p.finding_id] = pb[p.finding_id] || []).push(p); });
          const allUrls = photos.length ? await api.urls(photos.map(p => p.path)) : {};
          const { blob, failed } = await buildAuditReport({ audit: a, project: { name: a.projects?.name, pm: a.projects?.pm }, findings, photosByFinding: pb, urls: allUrls, onProgress: (d, n) => { b.textContent = `Adding photos ${d}/${n}…`; } });
          const slug = String(a.projects?.name || "Project").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
          saveBlob(blob, `HSE_Flash_Audit-_${slug}_${a.audit_date}.xlsx`);
          toast(failed ? `Report downloaded. ${failed} photo(s) couldn't be added.` : "Report downloaded.");
        } finally { b.disabled = false; b.innerHTML = label; }
      }
      if (act === "pptx") {
        b.disabled = true;
        const busy = busyOverlay("Building the PowerPoint…");
        try {
          const pb = {}; photos.forEach(p => { (pb[p.finding_id] = pb[p.finding_id] || []).push(p); });
          const allUrls = photos.length ? await api.urls(photos.map(p => p.path)) : {};
          const { buildAuditPptx } = await import("../pptx.js");
          const { blob, failed } = await buildAuditPptx({ audit: a, project: { name: a.projects?.name, pm: a.projects?.pm }, findings, photosByFinding: pb, urls: allUrls, onProgress: (d, n) => busy.set(`Adding photos ${d} of ${n}…`) });
          const slug = String(a.projects?.name || "Project").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
          saveBlob(blob, `HSE_Flash_Audit-_${slug}_${a.audit_date}.pptx`);
          toast(failed ? `PowerPoint downloaded. ${failed} photo(s) couldn't be added.` : "PowerPoint downloaded.");
        } finally { busy.done(); b.disabled = false; }
      }
      if (act === "submit") {
        if (!(await confirmBox(isAdmin ? "Submit this audit? The project can then only submit closures for its findings." : "Submit this audit to the administration? After submitting, findings can't be edited — only closed through “Submit closure”.", { ok: "Submit audit" }))) return;
        await api.updateAudit(a.id, { status: "submitted" }); store.markStale(); toast("Audit submitted."); await load(); draw();
      }
      if (act === "reopen") { await api.updateAudit(a.id, { status: "draft" }); store.markStale(); toast("Audit returned to draft. The project can edit it again."); await load(); draw(); }
      if (act === "delete") {
        if (!(await confirmBox(`Delete audit ${aRef(a.ref)} with its ${findings.length} findings and all photos? This can't be undone.`, { ok: "Delete audit", danger: true }))) return;
        await api.deleteAudit(a.id); store.markStale(); toast("Audit deleted."); go("#/audits");
      }
      if (act === "edit") {
        const v = await dialog({
          title: "Audit details", wide: true,
          body: `<div class="form-grid">
            ${isAdmin ? `<label class="fld"><span>Project</span><select id="d-project">${store.projects.map(p => `<option value="${p.id}" ${p.id === a.project_id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
            <label class="fld"><span>Audit type</span><select id="d-type"><option value="corporate" ${a.audit_type === "corporate" ? "selected" : ""}>Corporate</option><option value="project" ${a.audit_type === "project" ? "selected" : ""}>Project</option></select></label>` : ""}
            <label class="fld"><span>Date</span><input type="date" id="d-date" value="${esc(a.audit_date)}"></label>
            <label class="fld"><span>Auditor(s)</span><input id="d-aud" value="${esc(a.auditor)}"></label>
            <label class="fld"><span>Project Manager</span><input id="d-pm" value="${esc(a.pm)}"></label>
            <label class="fld"><span>P.O.C. %</span><input id="d-poc" inputmode="decimal" value="${a.poc ?? ""}"></label>
            <label class="fld"><span>Manpower</span><input id="d-mp" inputmode="numeric" value="${a.manpower ?? ""}"></label>
            <label class="fld span2"><span>Areas visited</span><input id="d-areas" value="${esc(a.areas)}"></label>
            <label class="fld span2"><span>Purpose &amp; scope</span><textarea id="d-scope" rows="4">${esc(a.scope || defaultScope(a, a.projects?.name))}</textarea></label>
            <label class="fld span2"><span>Conclusion</span><textarea id="d-concl" rows="4">${esc(a.conclusion || defaultConclusion(a, findings))}</textarea></label>
          </div>`,
          actions: [{ label: "Cancel", value: null }, { label: "Save", value: w => {
            const num = s => { const n = parseFloat(String(s).replace(/[^\d.]/g, "")); return isNaN(n) ? null : n; };
            const out = { audit_date: w.querySelector("#d-date").value || a.audit_date, auditor: w.querySelector("#d-aud").value.trim(), pm: w.querySelector("#d-pm").value.trim(), poc: num(w.querySelector("#d-poc").value), manpower: num(w.querySelector("#d-mp").value), areas: w.querySelector("#d-areas").value.trim(), scope: w.querySelector("#d-scope").value.trim(), conclusion: w.querySelector("#d-concl").value.trim() };
            if (isAdmin) { out.project_id = w.querySelector("#d-project").value; out.audit_type = w.querySelector("#d-type").value; }
            return out;
          } }]
        });
        if (!v) return;
        if (v.project_id && v.project_id !== a.project_id && findings.length) { toast("Audits with findings can't move to another project.", "error"); delete v.project_id; }
        await api.updateAudit(a.id, v); store.markStale(); toast("Audit saved."); await load(); draw();
      }
    } catch (x) { toast(x.message, "error"); }
  });
}
