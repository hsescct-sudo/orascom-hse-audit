import { esc, fmtDate, aRef, findingState, confirmBox, busyOverlay, toast, ICON } from "../ui.js";

export async function render(root, ctx) {
  const { api, store, isAdmin, query } = ctx;
  await store.load();
  const q = { project: query.project || "", type: query.type || "", status: query.status || "", source: "" };
  const picked = new Set();
  let stats = {}, list = [];
  const restat = () => { stats = {}; store.findings.forEach(f => { const s = stats[f.audit_id] = stats[f.audit_id] || { n: 0, open: 0, high: 0 }; s.n++; if (findingState(f) !== "closed") s.open++; if (f.risk === "High") s.high++; }); };
  restat();
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
    ${isAdmin ? `<div class="selbar" id="selbar" hidden><span><b id="sel-n">0</b> selected</span><button class="linkish" id="sel-clear">Clear selection</button><span class="grow"></span><button class="btn sm danger" id="sel-del">${ICON.trash} Delete selected</button></div>` : ""}
    <div class="card table-card"><div class="tscroll"><table class="tbl"><thead><tr>${isAdmin ? `<th class="selcol"><input type="checkbox" id="sel-all" aria-label="Select every audit in the list"></th>` : ""}<th>Ref</th><th>Date</th>${isAdmin ? "<th>Project</th>" : ""}<th>Type</th><th>Source</th><th>Auditor</th><th class="num">Findings</th><th class="num">High</th><th class="num">Not closed</th><th>Status</th></tr></thead><tbody id="rows"></tbody></table></div></div>`;
  function draw() {
    list = store.audits.filter(a => (!q.project || a.project_id === q.project) && (!q.type || a.audit_type === q.type) && (!q.source || a.source === q.source) && (!q.status || a.status === q.status));
    root.querySelector("#sum").textContent = `${list.length} audits · ${list.filter(a => a.status === "draft").length} drafts`;
    root.querySelector("#rows").innerHTML = list.map(a => { const s = stats[a.id] || { n: 0, open: 0, high: 0 }; return `<tr class="click" data-id="${a.id}">${isAdmin ? `<td class="selcol"><input type="checkbox" class="rsel" data-id="${a.id}" aria-label="Select ${aRef(a.ref)}"></td>` : ""}
      <td><a href="#/audit/${a.id}"><b>${aRef(a.ref)}</b></a></td><td class="nowrap">${fmtDate(a.audit_date)}</td>${isAdmin ? `<td>${esc(a.projects?.name || "")}</td>` : ""}
      <td>${a.audit_type === "corporate" ? "Corporate" : "Project"}</td><td>${a.source === "excel" ? "Excel import" : "Checklist"}</td><td>${esc(a.auditor)}</td>
      <td class="num">${s.n}</td><td class="num">${s.high || ""}</td><td class="num">${s.open || ""}</td>
      <td>${a.status === "draft" ? `<span class="chip st-open">Draft</span>` : `<span class="chip st-closed">Submitted</span>`}</td></tr>`; }).join("") || `<tr><td colspan="11" class="empty-row">No audits yet. Start one with “New audit”, or import an Excel report.</td></tr>`;
    if (isAdmin) { const vis = new Set(list.map(a => a.id)); [...picked].forEach(id => { if (!vis.has(id)) picked.delete(id); }); selUi(); }
  }
  function selUi() {
    const bar = root.querySelector("#selbar"); if (!bar) return;
    bar.hidden = !picked.size; root.querySelector("#sel-n").textContent = picked.size;
    root.querySelectorAll(".rsel").forEach(cb => { cb.checked = picked.has(cb.dataset.id); cb.closest("tr").classList.toggle("picked", cb.checked); });
    const all = root.querySelector("#sel-all");
    all.checked = list.length > 0 && picked.size === list.length; all.indeterminate = picked.size > 0 && picked.size < list.length;
  }
  root.addEventListener("change", e => {
    if (e.target.id === "sel-all") { picked.clear(); if (e.target.checked) list.forEach(a => picked.add(a.id)); selUi(); }
    else if (e.target.classList.contains("rsel")) { e.target.checked ? picked.add(e.target.dataset.id) : picked.delete(e.target.dataset.id); selUi(); }
  });
  root.querySelector(".filters").addEventListener("input", e => { const k = { "a-project": "project", "a-type": "type", "a-source": "source", "a-status": "status" }[e.target.id]; if (k) { q[k] = e.target.value; draw(); } });
  root.addEventListener("click", async e => {
    if (e.target.closest(".selcol")) return;
    if (e.target.id === "sel-clear") { picked.clear(); selUi(); return; }
    if (e.target.closest("#sel-del")) {
      const ids = [...picked], n = ids.length;
      const nf = ids.reduce((s, id) => s + (stats[id]?.n || 0), 0);
      const np = store.findings.filter(f => picked.has(f.audit_id)).reduce((s, f) => { const c = store.photoCount?.[f.id]; return s + (c ? c.violation + c.closure : 0); }, 0);
      const ok = await confirmBox(`Delete ${n} audit${n > 1 ? "s" : ""} with ${nf} finding${nf === 1 ? "" : "s"} and ${np} photo${np === 1 ? "" : "s"}? This can't be undone.`, { title: "Delete audits", ok: `Delete ${n}`, danger: true, typeToConfirm: n > 3 || nf > 10 ? "DELETE" : "" });
      if (!ok) return;
      const b = busyOverlay(`Deleting ${n} audits…`);
      try { await api.deleteAudits(ids, (d, t) => b.set(`Deleting audits ${d} of ${t}…`)); toast(`${n} audit${n > 1 ? "s" : ""} deleted.`); }
      catch (x) { toast(x.message, "error"); }
      finally { b.done(); picked.clear(); await store.load(true); restat(); draw(); }
      return;
    }
    const tr = e.target.closest("tr[data-id]"); if (tr && !e.target.closest("a")) location.hash = "#/audit/" + tr.dataset.id;
  });
  draw();
}
