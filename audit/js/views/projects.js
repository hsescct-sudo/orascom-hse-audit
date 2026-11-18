// Company projects (shared by both audit types).
import * as S from "../store.js";
import * as M from "../model.js";
import { setTitle, setActions, go, link, rerender } from "../app.js";
import { esc, ICON, dialog, toast } from "../ui.js";
import { mtag } from "../components.js";

export async function render(ctx) {
  const { view } = ctx;
  setTitle("Projects", "Shared by HSE Audit and Lifting");
  const admin = M.isAdmin();
  if (admin) setActions(`<button class="btn primary" type="button" id="add">${ICON.plus}<span>Add project</span></button>`).querySelector("#add").onclick = () => edit();
  const list = M.projects();
  const countries = [...new Set(list.map(p => p.country))].sort();
  let f = { q: "", country: "", active: "1" };
  view.innerHTML = `<div class="filters" style="margin-bottom:14px"><input type="search" id="q" placeholder="Search project, city, code" aria-label="Search">
    <select id="fc" aria-label="Country"><option value="">All countries</option>${countries.map(c => `<option>${esc(c)}</option>`).join("")}</select>
    <select id="fa" aria-label="Active"><option value="1">Active projects</option><option value="0">Closed projects</option><option value="">All</option></select><span class="muted small" id="cnt"></span></div>
    <div class="panel" style="padding:0"><div class="tscroll"><table class="tbl"><thead><tr><th>Code</th><th>Project</th><th>City</th><th>Country</th><th>Business unit</th><th>Project director</th><th style="text-align:right">HSE Audit</th><th style="text-align:right">Lifting</th></tr></thead><tbody id="rows"></tbody></table></div></div>`;
  const draw = () => {
    const q = f.q.toLowerCase();
    const rows = list.filter(p => (!f.country || p.country === f.country) && (f.active === "" || String(p.active !== false ? 1 : 0) === f.active) && (!q || [p.code, p.name, p.city, p.bu].join(" ").toLowerCase().includes(q)));
    view.querySelector("#cnt").textContent = `${rows.length} project${rows.length === 1 ? "" : "s"}`;
    view.querySelector("#rows").innerHTML = rows.map(p => {
      const lf = M.lastAuditOf("full", p.id), ll = M.lastAuditOf("lifting", p.id);
      return `<tr class="${admin ? "click" : ""}" data-p="${esc(p.id)}"><td class="ref">${esc(p.code)}</td><td class="wrap"><b style="font-weight:600">${esc(p.name)}</b>${p.active === false ? ' <span class="chip">Closed</span>' : ""}</td><td>${esc(p.city)}</td><td>${esc(p.country)}</td><td>${esc(p.bu || "")}</td><td>${esc(p.director || "")}</td>
        <td style="text-align:right">${lf ? `<a href="${link("audit", lf.id, "full")}" title="${esc(lf.ref)}">${mtag(M.score(lf).total)}</a>` : '<span class="muted small">–</span>'}</td>
        <td style="text-align:right">${ll ? `<a href="${link("audit", ll.id, "lifting")}" title="${esc(ll.ref)}">${mtag(M.score(ll).total)}</a>` : '<span class="muted small">–</span>'}</td></tr>`;
    }).join("");
  };
  view.querySelector("#q").addEventListener("input", e => { f.q = e.target.value; draw(); });
  view.querySelector("#fc").addEventListener("change", e => { f.country = e.target.value; draw(); });
  view.querySelector("#fa").addEventListener("change", e => { f.active = e.target.value; draw(); });
  view.querySelector("#rows").addEventListener("click", e => { if (e.target.closest("a")) return; const r = e.target.closest("[data-p]"); if (r && admin) edit(S.get(r.dataset.p)); });
  draw();
}

async function edit(p = null) {
  const x = p || { id: S.uid("prj"), kind: "project", name: "", code: "", city: "", country: "", bu: "", director: "", manager: "", active: true };
  const r = await dialog({
    title: p ? "Edit project" : "Add project", wide: true,
    body: `<div class="grid2"><label class="fld"><span>Project name</span><input id="p-n" value="${esc(x.name)}"></label><label class="fld"><span>Code</span><input id="p-c" value="${esc(x.code)}" placeholder="e.g. EG-42"></label></div>
      <div class="grid2"><label class="fld"><span>City / area</span><input id="p-ci" value="${esc(x.city)}"></label><label class="fld"><span>Country</span><input id="p-co" value="${esc(x.country)}" list="cl"><datalist id="cl"><option>Egypt</option><option>KSA</option><option>UAE</option><option>Jordan</option></datalist></label></div>
      <div class="grid3"><label class="fld"><span>Business unit</span><input id="p-b" value="${esc(x.bu || "")}"></label><label class="fld"><span>Project director</span><input id="p-d" value="${esc(x.director || "")}"></label><label class="fld"><span>Project manager</span><input id="p-m" value="${esc(x.manager || "")}"></label></div>
      <label class="tick"><input type="checkbox" id="p-a" ${x.active !== false ? "checked" : ""}>Active project</label>`,
    actions: [{ label: "Cancel", value: null }, {
      label: "Save", kind: "primary",
      validate: w => (!w.querySelector("#p-n").value.trim() ? "Enter the project name." : !w.querySelector("#p-c").value.trim() ? "Enter a short code." : M.projects().some(o => o.id !== x.id && o.code.toLowerCase() === w.querySelector("#p-c").value.trim().toLowerCase()) ? "Another project already uses this code." : null),
      value: w => ({ name: w.querySelector("#p-n").value.trim(), code: w.querySelector("#p-c").value.trim().toUpperCase(), city: w.querySelector("#p-ci").value.trim(), country: w.querySelector("#p-co").value.trim(), bu: w.querySelector("#p-b").value.trim(), director: w.querySelector("#p-d").value.trim(), manager: w.querySelector("#p-m").value.trim(), active: w.querySelector("#p-a").checked }),
    }],
  });
  if (!r) return;
  await S.put({ ...x, ...r }); toast("Project saved.", "ok"); rerender();
}
