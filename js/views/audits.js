import { esc, fmtDate, aRef, findingState } from "../ui.js";

export async function render(root, ctx) {
  const { store, isAdmin, query } = ctx;
  await store.load();
  const q = { project: query.project || "", type: query.type || "", status: query.status || "", source: "" };
  const stats = {};
  store.findings.forEach(f => { const s = stats[f.audit_id] = stats[f.audit_id] || { n: 0, open: 0, high: 0 }; s.n++; if (findingState(f) !== "closed") s.open++; if (f.risk === "High") s.high++; });
  const sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  root.innerHTML = `
    <div class="page-head"><div><h1>Audits</h1><p class="muted" id="sum"></p></div>
      <div class="actions"><a class="btn ghost" href="#/import">Import Excel report</a><a class="btn primary" href="#/new">New audit</a></div></div>
    <div class="filters card">
      ${isAdmin ? `<label class="fld"><span>Project</span>${sel("a-project", [["", "All projects"], ...store.projects.map(p => [p.id, p.name])], q.project)}</label>` : ""}
      <label class="fld"><span>Type</span>${sel("a-type", [["", "All"], ["corporate", "Corporate"], ["project", "Project"]], q.type)}</label>
      <label class="fld"><span>Source</span>${sel("a-source", [["", "All"], ["form", "Checklist"], ["excel", "Excel import"]], q.source)}</label>
      <label class="fld"><span>Status</span>${sel("a-status", [["", "All"], ["draft", "Draft"], ["submitted", "Submitted"]], q.status)}</label>
    </div>
    <div class="card table-card"><div class="tscroll"><table class="tbl"><thead><tr><th>Ref</th><th>Date</th>${isAdmin ? "<th>Project</th>" : ""}<th>Type</th><th>Source</th><th>Auditor</th><th class="num">Findings</th><th class="num">High</th><th class="num">Not closed</th><th>Status</th></tr></thead><tbody id="rows"></tbody></table></div></div>`;
  function draw() {
    const list = store.audits.filter(a => (!q.project || a.project_id === q.project) && (!q.type || a.audit_type === q.type) && (!q.source || a.source === q.source) && (!q.status || a.status === q.status));
    root.querySelector("#sum").textContent = `${list.length} audits · ${list.filter(a => a.status === "draft").length} drafts`;
    root.querySelector("#rows").innerHTML = list.map(a => { const s = stats[a.id] || { n: 0, open: 0, high: 0 }; return `<tr class="click" data-id="${a.id}">
      <td><a href="#/audit/${a.id}"><b>${aRef(a.ref)}</b></a></td><td class="nowrap">${fmtDate(a.audit_date)}</td>${isAdmin ? `<td>${esc(a.projects?.name || "")}</td>` : ""}
      <td>${a.audit_type === "corporate" ? "Corporate" : "Project"}</td><td>${a.source === "excel" ? "Excel import" : "Checklist"}</td><td>${esc(a.auditor)}</td>
      <td class="num">${s.n}</td><td class="num">${s.high || ""}</td><td class="num">${s.open || ""}</td>
      <td>${a.status === "draft" ? `<span class="chip st-open">Draft</span>` : `<span class="chip st-closed">Submitted</span>`}</td></tr>`; }).join("") || `<tr><td colspan="10" class="empty-row">No audits yet. Start one with “New audit”, or import an Excel report.</td></tr>`;
  }
  root.querySelector(".filters").addEventListener("input", e => { const k = { "a-project": "project", "a-type": "type", "a-source": "source", "a-status": "status" }[e.target.id]; if (k) { q[k] = e.target.value; draw(); } });
  root.addEventListener("click", e => { const tr = e.target.closest("tr[data-id]"); if (tr && !e.target.closest("a")) location.hash = "#/audit/" + tr.dataset.id; });
  draw();
}
