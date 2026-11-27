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
  if (admin) {
    const act = setActions(`<button class="btn" type="button" id="pe-get" title="Download the project e-mails template" aria-label="E-mails template">${ICON.xls}<span>E-mails template</span></button><button class="btn" type="button" id="pe-put" title="Import the filled e-mails template" aria-label="Import e-mails">${ICON.upload}<span>Import e-mails</span></button><input type="file" id="pe-file" accept=".xlsx" hidden><button class="btn primary" type="button" id="add">${ICON.plus}<span>Add project</span></button>`);
    act.querySelector("#add").onclick = () => edit();
    act.querySelector("#pe-get").onclick = async () => { const m = await import("../report/export.js"); m.projectEmailsTemplate(); };
    const fi = act.querySelector("#pe-file");
    act.querySelector("#pe-put").onclick = () => fi.click();
    fi.onchange = async () => { const f = fi.files[0]; fi.value = ""; if (f) importEmails(f); };
  }
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

// "a@x.com; b@y.com" -> "a@x.com, b@y.com"
export const emailList = v => String(v || "").split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
const cleanEmails = v => emailList(v).join(", ");
const badEmails = v => emailList(v).find(x => !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(x)) || "";

async function edit(p = null) {
  const x = p || { id: S.uid("prj"), kind: "project", name: "", code: "", city: "", country: "", bu: "", director: "", manager: "", active: true };
  const r = await dialog({
    title: p ? "Edit project" : "Add project", wide: true,
    body: `<div class="grid2"><label class="fld"><span>Project name</span><input id="p-n" value="${esc(x.name)}"></label><label class="fld"><span>Code</span><input id="p-c" value="${esc(x.code)}" placeholder="e.g. EG-42"></label></div>
      <div class="grid2"><label class="fld"><span>City / area</span><input id="p-ci" value="${esc(x.city)}"></label><label class="fld"><span>Country</span><input id="p-co" value="${esc(x.country)}" list="cl"><datalist id="cl"><option>Egypt</option><option>KSA</option><option>UAE</option><option>Jordan</option></datalist></label></div>
      <div class="grid3"><label class="fld"><span>Business unit</span><input id="p-b" value="${esc(x.bu || "")}"></label><label class="fld"><span>Project director</span><input id="p-d" value="${esc(x.director || "")}"></label><label class="fld"><span>Project manager</span><input id="p-m" value="${esc(x.manager || "")}"></label></div>
      <label class="fld"><span>E-mails for audit reports and NCR reminders (project HSE manager, PM). Separate with commas.</span><input id="p-e" type="text" inputmode="email" value="${esc(x.contact_emails || "")}" placeholder="name@orascom.com, name2@orascom.com"></label>
      <div class="row" style="gap:18px"><label class="tick"><input type="checkbox" id="p-a" ${x.active !== false ? "checked" : ""}>Active project</label>
        <label class="tick"><input type="checkbox" id="p-jv" ${x.jv ? "checked" : ""}>Joint venture (JV)</label></div>
      <p class="muted small">JV projects and projects outside Egypt can have fewer HSE audits a year (P-20 §7.2). The plan builder asks how many.</p>`,
    actions: [{ label: "Cancel", value: null }, {
      label: "Save", kind: "primary",
      validate: w => (!w.querySelector("#p-n").value.trim() ? "Enter the project name." : badEmails(w.querySelector("#p-e").value) ? `Check this e-mail: ${badEmails(w.querySelector("#p-e").value)}` : !w.querySelector("#p-c").value.trim() ? "Enter a short code." : M.projects().some(o => o.id !== x.id && o.code.toLowerCase() === w.querySelector("#p-c").value.trim().toLowerCase()) ? "Another project already uses this code." : null),
      value: w => ({ name: w.querySelector("#p-n").value.trim(), code: w.querySelector("#p-c").value.trim().toUpperCase(), city: w.querySelector("#p-ci").value.trim(), country: w.querySelector("#p-co").value.trim(), bu: w.querySelector("#p-b").value.trim(), director: w.querySelector("#p-d").value.trim(), manager: w.querySelector("#p-m").value.trim(), active: w.querySelector("#p-a").checked, jv: w.querySelector("#p-jv").checked, contact_emails: cleanEmails(w.querySelector("#p-e").value) }),
    }],
  });
  if (!r) return;
  await S.put({ ...x, ...r }); toast("Project saved.", "ok"); rerender();
}

// Read the filled e-mails template, show what changes, then save.
async function importEmails(file) {
  let res;
  try { const m = await import("../report/export.js"); res = await m.readProjectEmails(file); }
  catch (e) { toast(e.message || "This file couldn't be read.", "error"); return; }
  const { changes, bad, unknown } = res;
  const n = changes.reduce((s, c) => s + (c.emails ? c.emails.split(", ").length : 0), 0);
  const ok = await dialog({
    title: "Import project e-mails", wide: true,
    body: (changes.length ? `<p><b>${changes.length}</b> project${changes.length === 1 ? "" : "s"} will change, with <b>${n}</b> e-mail${n === 1 ? "" : "s"} in total.</p>
      <div class="tscroll" style="max-height:300px"><table class="tbl"><thead><tr><th>Project</th><th>E-mails</th><th>JV</th></tr></thead><tbody>
      ${changes.map(c => `<tr><td>${esc(c.p.name)}</td><td class="small">${esc(c.emails || "(none)")}</td><td>${c.jv ? "Yes" : "No"}</td></tr>`).join("")}</tbody></table></div>`
      : `<p>Nothing to change. The e-mails in the file are the same as in the system.</p>`)
      + (bad.length ? `<p style="color:var(--g-red);margin-top:10px"><b>Not saved, check these e-mails:</b><br>${bad.map(esc).join("<br>")}</p>` : "")
      + (unknown.length ? `<p class="muted small" style="margin-top:8px">Rows not found in the projects list: ${unknown.map(esc).join(", ")}</p>` : ""),
    actions: changes.length ? [{ label: "Cancel", value: false }, { label: "Save e-mails", kind: "primary", value: true }] : [{ label: "Close", kind: "primary", value: false }],
  });
  if (!ok) return;
  await S.putMany(changes.map(c => ({ ...c.p, contact_emails: c.emails, jv: c.jv })));
  toast(`E-mails saved for ${changes.length} project${changes.length === 1 ? "" : "s"}.`, "ok");
  rerender();
}
