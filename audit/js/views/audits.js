// List of audits for one audit type.
import * as M from "../model.js";
import { setTitle, setActions, go, link } from "../app.js";
import { esc, ICON, fmtDate } from "../ui.js";
import { mtag, auditChip, projectOptions } from "../components.js";
import { startAudit } from "../widgets.js";

export async function render(ctx) {
  const { module: mod, def, view, query } = ctx;
  setTitle("Audits", `${def.name}, ${def.formRef}`);
  if (M.canEdit()) {
    const bar = setActions(`${def.binary ? `<a class="btn" href="${link("import")}" id="upxl">${ICON.xls}<span>Upload Excel</span></a>` : ""}<button class="btn primary" type="button" id="new">${ICON.plus}<span>${esc(def.startLabel)}</span></button>`);
    bar.querySelector("#new").onclick = () => startAudit(mod);
  }
  const all = M.audits(mod);
  const years = [...new Set(all.map(a => a.date.slice(0, 4)))].sort().reverse();
  let f = { project: query.project || "", status: query.status || "", year: query.year || "", q: "" };
  view.innerHTML = `
    <div class="filters" style="margin-bottom:14px">
      <input type="search" id="q" placeholder="Search ref or project" aria-label="Search">
      <select id="fp" aria-label="Project">${projectOptions(f.project)}</select>
      <select id="fs" aria-label="Status"><option value="">All statuses</option><option value="draft">In progress</option><option value="submitted">Waiting approval</option><option value="approved">Approved</option></select>
      <select id="fy" aria-label="Year"><option value="">All years</option>${years.map(y => `<option>${y}</option>`).join("")}</select>
      <span class="muted small" id="cnt"></span>
    </div>
    <div class="panel" style="padding:0"><div class="tscroll"><table class="tbl"><thead><tr><th>Ref</th><th>Project</th><th>Date</th><th>Lead auditor</th><th>Status</th><th>NCRs</th><th style="text-align:right">Score</th></tr></thead><tbody id="rows"></tbody></table></div></div>`;
  view.querySelector("#fs").value = f.status;
  const draw = () => {
    const q = f.q.toLowerCase();
    const list = all.filter(a => (!f.project || a.project_id === f.project) && (!f.status || a.status === f.status) && (!f.year || a.date.startsWith(f.year)) &&
      (!q || a.ref.toLowerCase().includes(q) || M.project(a.project_id).name.toLowerCase().includes(q)));
    view.querySelector("#cnt").textContent = `${list.length} audit${list.length === 1 ? "" : "s"}`;
    view.querySelector("#rows").innerHTML = list.length ? list.map(a => {
      const p = M.project(a.project_id); const ns = M.auditNCRs(a); const open = ns.filter(n => n.status === "Open").length;
      const lead = M.member(a.lead_id);
      return `<tr class="click" data-a="${esc(a.id)}"><td class="ref c-ref">${esc(a.ref)}</td><td class="wrap c-wide"><b style="font-weight:600">${esc(p.name)}</b><br><span class="muted small">${esc(p.code)}, ${esc(p.city)}</span></td><td class="nowrap">${esc(fmtDate(a.date))}</td><td>${esc(lead ? lead.name : (a.auditors[0] || {}).name || "")}</td><td>${auditChip(a)}</td><td class="num nowrap">${ns.length}${open ? ` <span class="muted small">(${open} open)</span>` : ""}</td><td class="c-end" style="text-align:right">${mtag(M.score(a).total)}</td></tr>`;
    }).join("") : `<tr><td colspan="7"><div class="empty"><h3>No audits match</h3><p>${all.length ? "Change the filters." : `Start the first ${esc(def.short)} audit.`}</p></div></td></tr>`;
  };
  view.querySelector("#q").addEventListener("input", e => { f.q = e.target.value; draw(); });
  view.querySelector("#fp").addEventListener("change", e => { f.project = e.target.value; draw(); });
  view.querySelector("#fs").addEventListener("change", e => { f.status = e.target.value; draw(); });
  view.querySelector("#fy").addEventListener("change", e => { f.year = e.target.value; draw(); });
  view.querySelector("#rows").addEventListener("click", e => { const r = e.target.closest("[data-a]"); if (r) go(link("audit", r.dataset.a)); });
  draw();
}
