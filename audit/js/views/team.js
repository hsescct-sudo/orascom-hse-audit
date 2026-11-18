// Auditors and users: who can sign in and what they can do.
import * as S from "../store.js";
import * as M from "../model.js";
import { setTitle, setActions, rerender } from "../app.js";
import { esc, ICON, dialog, toast } from "../ui.js";

const ROLE = { admin: "Administrator", auditor: "Auditor", viewer: "Viewer (read only)" };
const ROLE_TXT = { admin: "Plans the year, approves audits, edits projects, users and settings.", auditor: "Runs audits, raises NCRs, follows up NCRs.", viewer: "Sees dashboards, audits and registers. Changes nothing." };
export async function render(ctx) {
  const { view } = ctx;
  setTitle("Auditors and users", "Who can use the system");
  const admin = M.isAdmin();
  if (admin) setActions(`<button class="btn primary" type="button" id="add">${ICON.plus}<span>Add person</span></button>`).querySelector("#add").onclick = () => edit();
  const list = M.members();
  const cloud = (await S.meta("mode")) === "cloud";
  view.className = "view narrow";
  view.innerHTML = `<div class="stack">
    <div class="panel" style="padding:0"><div class="tscroll"><table class="tbl"><thead><tr><th>Name</th><th>Position</th><th>E-mail</th><th>Role</th><th></th></tr></thead><tbody>
      ${list.map(m => `<tr class="${admin ? "click" : ""}" data-m="${esc(m.id)}"><td><b style="font-weight:600">${esc(m.name)}</b></td><td>${esc(m.position || "")}</td><td>${esc(m.email || "")}</td><td><span class="chip">${esc(ROLE[m.role] || m.role)}</span></td><td>${m.active === false ? '<span class="chip">Off</span>' : ""}</td></tr>`).join("")}
    </tbody></table></div></div>
    <section class="panel"><div class="panel-h"><h2>Roles</h2></div>${Object.keys(ROLE).map(r => `<p><b>${ROLE[r]}.</b> ${ROLE_TXT[r]}</p>`).join("")}
      ${cloud ? `<p class="muted small">To let someone sign in, add them here with their e-mail, then create their sign-in (same e-mail and a password) in the Supabase dashboard under Authentication, Users.</p>` : ""}</section></div>`;
  view.querySelector("tbody").addEventListener("click", e => { const r = e.target.closest("[data-m]"); if (r && admin) edit(S.get(r.dataset.m)); });
}

async function edit(m = null) {
  const x = m || { id: S.uid("mem"), kind: "member", name: "", position: "Corporate HSE Auditor", email: "", role: "auditor", active: true };
  const r = await dialog({
    title: m ? "Edit person" : "Add person",
    body: `<div class="grid2"><label class="fld"><span>Name</span><input id="m-n" value="${esc(x.name)}"></label><label class="fld"><span>Position</span><input id="m-p" value="${esc(x.position || "")}"></label></div>
      <label class="fld"><span>E-mail (used to sign in)</span><input id="m-e" type="email" value="${esc(x.email || "")}"></label>
      <label class="fld"><span>Role</span><select id="m-r">${Object.keys(ROLE).map(k => `<option value="${k}" ${k === x.role ? "selected" : ""}>${ROLE[k]}</option>`).join("")}</select></label>
      <label class="tick"><input type="checkbox" id="m-a" ${x.active !== false ? "checked" : ""}>Can use the system</label>`,
    actions: [{ label: "Cancel", value: null }, { label: "Save", kind: "primary", validate: w => (!w.querySelector("#m-n").value.trim() ? "Enter the name." : null),
      value: w => ({ name: w.querySelector("#m-n").value.trim(), position: w.querySelector("#m-p").value.trim(), email: w.querySelector("#m-e").value.trim().toLowerCase(), role: w.querySelector("#m-r").value, active: w.querySelector("#m-a").checked }) }],
  });
  if (!r) return;
  if (m && m.id === M.me().id && r.role !== "admin") { toast("You can't remove your own administrator role.", "error"); return; }
  await S.put({ ...x, ...r }); toast("Saved.", "ok"); rerender();
}
