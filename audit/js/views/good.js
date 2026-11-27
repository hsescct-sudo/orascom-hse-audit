// Good practice register for one audit type.
import * as S from "../store.js";
import * as M from "../model.js";
import { setTitle, setActions, go, link } from "../app.js";
import { esc, ICON, fmtDate, lightbox } from "../ui.js";
import { projectOptions, optionList } from "../components.js";

export async function render(ctx) {
  const { module: mod, def, view } = ctx;
  setTitle("Good practice", `${def.name}`);
  const all = M.goods(mod).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  setActions(`<button class="btn" type="button" id="xl">${ICON.xls}<span>Export to Excel</span></button>`).querySelector("#xl").onclick = async () => { const m = await import("../report/export.js"); m.goodExcel(mod, filtered()); };
  const classes = [...new Set(all.map(g => g.classification).filter(Boolean))].sort();
  let f = { project: "", cls: "", q: "" };
  view.innerHTML = `<div class="filters" style="margin-bottom:14px"><input type="search" id="q" placeholder="Search" aria-label="Search"><select id="fp" aria-label="Project">${projectOptions("")}</select><select id="fc" aria-label="Classification">${optionList(classes, "", "All classifications")}</select><span class="muted small" id="cnt"></span></div>
    <div class="panel" style="padding:0"><div class="tscroll"><table class="tbl"><thead><tr><th>Project</th><th>Audit</th><th>Date</th><th>Subject</th><th>Classification</th><th>Example</th><th>Photos</th></tr></thead><tbody id="rows"></tbody></table></div></div>`;
  function filtered() { const q = f.q.toLowerCase(); return all.filter(g => (!f.project || g.project_id === f.project) && (!f.cls || g.classification === f.cls) && (!q || [g.subject, g.example, M.project(g.project_id).name].join(" ").toLowerCase().includes(q))); }
  function draw() {
    const list = filtered();
    view.querySelector("#cnt").textContent = `${list.length} record${list.length === 1 ? "" : "s"}`;
    view.querySelector("#rows").innerHTML = list.length ? list.slice(0, 400).map(g => { const p = M.project(g.project_id); const a = S.get(g.audit_id); return `<tr><td style="min-width:170px"><b style="font-weight:600">${esc(p.code)}</b> <span class="muted small">${esc(p.name)}</span></td><td class="c-ref">${a ? `<a class="ref" href="${link("audit", a.id)}">${esc(a.ref)}</a>` : ""}</td><td class="nowrap c-end">${esc(fmtDate(g.date))}</td><td class="c-wide" style="min-width:160px"><b style="font-weight:600">${esc(g.subject)}</b></td><td>${esc(g.classification || "")}</td><td class="wrap c-full">${esc(g.example || "")}</td><td>${(g.photos || []).length ? `<button class="btn sm" data-ph="${esc(g.id)}" type="button">${ICON.img}<span>${g.photos.length}</span></button>` : ""}</td></tr>`; }).join("")
      : `<tr><td colspan="7"><div class="empty"><h3>No good practice recorded</h3><p>Good practice added in audits appears here.</p></div></td></tr>`;
  }
  view.querySelector("#q").addEventListener("input", e => { f.q = e.target.value; draw(); });
  view.querySelector("#fp").addEventListener("change", e => { f.project = e.target.value; draw(); });
  view.querySelector("#fc").addEventListener("change", e => { f.cls = e.target.value; draw(); });
  view.querySelector("#rows").addEventListener("click", async e => { const b = e.target.closest("[data-ph]"); if (!b) return; const g = S.get(b.dataset.ph); const urls = (await Promise.all(g.photos.map(id => S.photoURL(id)))).filter(Boolean); lightbox(urls); });
  draw();
}
