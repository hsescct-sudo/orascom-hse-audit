// NCR register for one audit type. HSE Audit NCRs and Lifting NCRs are separate registers.
import * as M from "../model.js";
import { setTitle, setActions, go, link } from "../app.js";
import { esc, ICON, fmtDate, todayISO, daysBetween } from "../ui.js";
import { sevChip, ncrChip, repChip, projectOptions, optionList } from "../components.js";

export async function render(ctx) {
  const { module: mod, def, view, query } = ctx;
  setTitle("NCR register", `${def.name} · NCR form ${def.ncrFormRef}`);
  const today = todayISO();
  const all = M.ncrs(mod).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (a.ref || "").localeCompare(b.ref || ""));
  const years = [...new Set(all.map(n => String(n.date).slice(0, 4)))].sort().reverse();
  const classes = [...new Set(all.map(n => n.classification).filter(Boolean))].sort();
  let f = { q: "", project: query.project || "", state: query.state || "", sev: "", cls: "", year: "" };
  setActions(`<button class="btn" type="button" id="xl">${ICON.xls}<span>Export to Excel</span></button>`).querySelector("#xl").onclick = async () => {
    const m = await import("../report/export.js"); m.registerExcel(mod, filtered());
  };
  const counts = st => all.filter(n => M.ncrState(n, today) === st).length;
  view.innerHTML = `
    <div class="row" style="margin-bottom:12px;gap:8px" id="states">
      ${[["", "All", all.length], ["open", "Open", counts("open")], ["overdue", "Past deadline", counts("overdue")], ["closed", "Closed", counts("closed")], ["carried", "Repeated in next audit", counts("carried")]]
        .map(([k, l, c]) => `<button class="btn sm ${f.state === k ? "primary" : ""}" data-st="${k}" type="button">${l} <span class="num" style="opacity:.75">${c}</span></button>`).join("")}
    </div>
    <div class="filters" style="margin-bottom:14px">
      <input type="search" id="q" placeholder="Search finding, ref, location" aria-label="Search">
      <select id="fp" aria-label="Project">${projectOptions(f.project)}</select>
      <select id="fv" aria-label="NCR type"><option value="">All types</option>${["Serious", "Major", "Minor"].map(s => `<option>${s}</option>`).join("")}<option value="rep">Repeated only</option></select>
      <select id="fc" aria-label="Classification">${optionList(classes, "", "All classifications")}</select>
      <select id="fy" aria-label="Year"><option value="">All years</option>${years.map(y => `<option>${y}</option>`).join("")}</select>
      <span class="muted small" id="cnt"></span>
    </div>
    <div class="panel" style="padding:0"><div class="tscroll" style="max-height:calc(100vh - 260px)"><table class="tbl"><thead><tr><th>Ref</th><th>Project</th><th>Date</th><th>Type</th><th>Finding</th><th>Classification</th><th>Responsible</th><th>Deadline</th><th>Status</th></tr></thead><tbody id="rows"></tbody></table></div></div>`;
  function filtered() {
    const q = f.q.toLowerCase();
    return all.filter(n => (!f.project || n.project_id === f.project) && (!f.state || M.ncrState(n, today) === f.state) &&
      (!f.sev || (f.sev === "rep" ? n.repeated : n.severity === f.sev)) && (!f.cls || n.classification === f.cls) && (!f.year || String(n.date).startsWith(f.year)) &&
      (!q || [n.ref, n.description, n.location, n.classification, M.project(n.project_id).name].join(" ").toLowerCase().includes(q)));
  }
  function draw() {
    const list = filtered();
    view.querySelector("#cnt").textContent = `${list.length} NCR${list.length === 1 ? "" : "s"}`;
    const shown = list.slice(0, 400);
    view.querySelector("#rows").innerHTML = shown.length ? shown.map(n => {
      const p = M.project(n.project_id); const st = M.ncrState(n, today);
      const late = st === "overdue" ? `<br><span class="small" style="color:var(--g-red);font-weight:600">${daysBetween(n.due_date, today)} days late</span>` : "";
      return `<tr class="click" data-n="${esc(n.id)}"><td class="ref">${esc(n.ref)}</td><td style="min-width:160px"><b style="font-weight:600">${esc(p.code)}</b> <span class="muted small">${esc(p.name)}</span></td><td class="nowrap">${esc(fmtDate(n.date))}</td>
        <td class="nowrap">${sevChip(n.severity)} ${repChip(n)}</td><td class="wrap" style="min-width:260px">${esc(n.description)}${n.location ? `<br><span class="muted small">${esc(n.location)}</span>` : ""}</td>
        <td style="min-width:150px">${esc(n.classification)}</td><td style="min-width:130px">${esc(n.responsible_name || "")}${n.responsible_position ? `<br><span class="muted small">${esc(n.responsible_position)}</span>` : ""}</td>
        <td class="nowrap">${esc(fmtDate(n.due_date))}${late}</td><td>${ncrChip(n)}</td></tr>`;
    }).join("") + (list.length > shown.length ? `<tr><td colspan="9" class="muted small">Showing the first ${shown.length}. Use the filters or export to Excel to see all.</td></tr>` : "")
      : `<tr><td colspan="9"><div class="empty"><h3>No NCRs match</h3><p>${all.length ? "Change the filters." : "NCRs raised in audits appear here."}</p></div></td></tr>`;
  }
  view.querySelector("#states").addEventListener("click", e => { const b = e.target.closest("[data-st]"); if (!b) return; f.state = b.dataset.st; view.querySelectorAll("#states .btn").forEach(x => x.classList.toggle("primary", x === b)); draw(); });
  view.querySelector("#q").addEventListener("input", e => { f.q = e.target.value; draw(); });
  view.querySelector("#fp").addEventListener("change", e => { f.project = e.target.value; draw(); });
  view.querySelector("#fv").addEventListener("change", e => { f.sev = e.target.value; draw(); });
  view.querySelector("#fc").addEventListener("change", e => { f.cls = e.target.value; draw(); });
  view.querySelector("#fy").addEventListener("change", e => { f.year = e.target.value; draw(); });
  view.querySelector("#rows").addEventListener("click", e => { const r = e.target.closest("[data-n]"); if (r) go(link("ncr", r.dataset.n)); });
  draw();
}
