// Auditors and users: who can sign in and what they can do.
import * as S from "../store.js";
import * as M from "../model.js";
import * as Sync from "../sync.js";
import { setTitle, setActions, rerender } from "../app.js";
import { esc, ICON, dialog, toast, fmtDate } from "../ui.js";

const ROLE = { admin: "Administrator", auditor: "Auditor", viewer: "Viewer (read only)" };
const ROLE_TXT = { admin: "Plans the year, approves audits, edits projects, users and settings.", auditor: "Runs audits, raises NCRs, follows up NCRs.", viewer: "Sees dashboards, audits and registers. Changes nothing." };
const APP_URL = () => (window.HSE_AUDIT_CONFIG || {}).publicUrl || location.href.split("#")[0];

export async function render(ctx) {
  const { view } = ctx;
  setTitle("Auditors and users", "Who can use the system");
  const admin = M.isAdmin();
  if (admin) setActions(`<button class="btn primary" type="button" id="add">${ICON.plus}<span>Add person</span></button>`).querySelector("#add").onclick = () => edit();
  const list = M.members();
  const cloud = (await S.meta("mode")) === "cloud";
  view.className = "view narrow";
  view.innerHTML = `<div class="stack">
    <div class="panel" style="padding:0"><div class="tscroll"><table class="tbl"><thead><tr><th>Name</th><th>Position</th><th>E-mail</th><th>Role</th>${admin && cloud ? "<th>Sign-in</th>" : ""}<th></th></tr></thead><tbody>
      ${list.map(m => `<tr class="${admin ? "click" : ""}" data-m="${esc(m.id)}"><td class="c-ref"><b style="font-weight:600">${esc(m.name)}</b></td><td>${esc(m.position || "")}</td><td>${esc(m.email || "")}</td><td class="c-end"><span class="chip">${esc(ROLE[m.role] || m.role)}</span></td>${admin && cloud ? `<td class="small" data-login="${esc((m.email || "").toLowerCase())}"><span class="muted">…</span></td>` : ""}<td>${m.active === false ? '<span class="chip">Off</span>' : ""}</td></tr>`).join("")}
    </tbody></table></div></div>
    <section class="panel"><div class="panel-h"><h2>Roles</h2></div>${Object.keys(ROLE).map(r => `<p><b>${ROLE[r]}.</b> ${ROLE_TXT[r]}</p>`).join("")}
      ${cloud && admin ? `<p class="muted small">To let someone sign in: add them here with their work e-mail, open their row and choose <b>Make sign-in</b>. The system gives a temporary password. They set their own at the first sign-in.</p>` : ""}</section></div>`;
  view.querySelector("tbody").addEventListener("click", e => { const r = e.target.closest("[data-m]"); if (r && admin) edit(S.get(r.dataset.m)); });
  if (admin && cloud) loadStatus(view);
}

let lastStatus = {};
async function loadStatus(view) {
  try {
    const rows = await Sync.call("ha_login_status");
    lastStatus = Object.fromEntries((rows || []).map(r => [String(r.email || "").toLowerCase(), r]));
  } catch (e) {
    const short = /update/i.test(e.message) ? "Needs the server update" : /internet/i.test(e.message) ? "Not known (offline)" : "Not known";
    view.querySelectorAll("[data-login]").forEach(td => { td.innerHTML = `<span class="muted" title="${esc(e.message)}">${short}</span>`; });
    return;
  }
  view.querySelectorAll("[data-login]").forEach(td => { td.innerHTML = statusHTML(lastStatus[td.dataset.login]); });
}
function statusHTML(s) {
  if (!s) return `<span class="muted">Not sent to the server yet</span>`;
  if (!s.has_login) return `<span class="chip">No sign-in yet</span>`;
  if (s.must_change) return `<span class="chip pl-due">Waiting for first sign-in</span>`;
  return `<span class="chip pl-done">Ready</span>${s.last_sign_in_at ? `<br><span class="muted">Last ${esc(fmtDate(String(s.last_sign_in_at).slice(0, 10)))}</span>` : ""}`;
}

async function edit(m = null) {
  const x = m || { id: S.uid("mem"), kind: "member", name: "", position: "Corporate HSE Auditor", email: "", role: "auditor", active: true };
  const cloud = (await S.meta("mode")) === "cloud";
  const r = await dialog({
    title: m ? "Edit person" : "Add person",
    body: `<div class="grid2"><label class="fld"><span>Name</span><input id="m-n" value="${esc(x.name)}"></label><label class="fld"><span>Position</span><input id="m-p" value="${esc(x.position || "")}"></label></div>
      <label class="fld"><span>Work e-mail (used to sign in)</span><input id="m-e" type="email" value="${esc(x.email || "")}"></label>
      <label class="fld"><span>Role</span><select id="m-r">${Object.keys(ROLE).map(k => `<option value="${k}" ${k === x.role ? "selected" : ""}>${ROLE[k]}</option>`).join("")}</select></label>
      <label class="tick"><input type="checkbox" id="m-a" ${x.active !== false ? "checked" : ""}>Can use the system</label>`,
    actions: [{ label: "Cancel", value: null },
      ...(m && cloud && m.email ? [{ label: "Make sign-in", kind: "ghost", value: () => ({ login: true }) }] : []),
      { label: "Save", kind: "primary", validate: w => (!w.querySelector("#m-n").value.trim() ? "Enter the name." : w.querySelector("#m-e").value.trim() && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(w.querySelector("#m-e").value.trim()) ? "Check the e-mail." : null),
        value: w => ({ name: w.querySelector("#m-n").value.trim(), position: w.querySelector("#m-p").value.trim(), email: w.querySelector("#m-e").value.trim().toLowerCase(), role: w.querySelector("#m-r").value, active: w.querySelector("#m-a").checked }) }],
  });
  if (!r) return;
  if (r.login) return makeLogin(m);
  if (m && m.id === M.me().id && r.role !== "admin") { toast("You can't remove your own administrator role.", "error"); return; }
  await S.put({ ...x, ...r }); toast("Saved.", "ok");
  if (!m && cloud && r.email && r.active) { rerender(); return makeLogin({ ...x, ...r }); }
  rerender();
}

// Readable temporary password, e.g. Kd7q-4m2x-Pz9a (no 0/O or 1/l/I to mix up)
function tempPassword() {
  const L = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const a = new Uint32Array(12); crypto.getRandomValues(a);
  const ch = [...a].map(x => L[x % L.length]);
  return [ch.slice(0, 4), ch.slice(4, 8), ch.slice(8, 12)].map(g => g.join("")).join("-");
}

async function makeLogin(m) {
  const st = lastStatus[(m.email || "").toLowerCase()];
  const again = st && st.has_login && st.made_here;
  const pw = tempPassword();
  const r = await dialog({
    title: again ? `New password for ${m.name}` : `Sign-in for ${m.name}`,
    body: `<p class="small">${again ? "This gives a new temporary password. The old one stops working." : "This makes a sign-in for this e-mail with a temporary password."} ${esc(m.name)} must set their own password at the first sign-in.</p>
      <label class="fld"><span>E-mail</span><input value="${esc(m.email)}" disabled></label>
      <label class="fld"><span>Temporary password</span><input id="tp" value="${esc(pw)}" autocomplete="off" spellcheck="false"></label>`,
    actions: [{ label: "Cancel", value: null }, { label: again ? "Set new password" : "Make sign-in", kind: "primary",
      validate: w => (w.querySelector("#tp").value.trim().length < 8 ? "Use at least 8 characters." : null), value: w => w.querySelector("#tp").value.trim() }],
  });
  if (!r) return;
  let res;
  try { res = await Sync.adminSetLogin(m.email, r); }
  catch (e) { return dialog({ title: "Sign-in not made", body: `<p>${esc(e.message)}</p><p class="muted small">You can also make it in Supabase: Authentication, Users, Add user, Create new user, with "Auto confirm" ticked.</p>` }); }
  if (res === "exists") {
    await dialog({ title: "Already has a sign-in", body: `<p>${esc(m.email)} already has a sign-in on this server, for example from the Flash Audit system.</p><p>${esc(m.name)} signs in to the audit system with that same e-mail and password. Nothing was changed.</p><p class="muted small">If they forgot the password, reset it in Supabase: Authentication, Users.</p>` });
    return rerender();
  }
  const msg = `Hello ${m.name},\n\nYour sign-in for the Corporate HSE Audit system is ready.\n\nLink: ${APP_URL()}\nE-mail: ${m.email}\nTemporary password: ${r}\n\nAt the first sign-in the system asks you to set your own password. On a phone, add the page to the home screen so it works offline.`;
  await dialog({
    title: "Sign-in ready", wide: true,
    body: `<p>Send these details to ${esc(m.name)} in a private message (WhatsApp, Teams or a direct e-mail). Don't post the password in a group.</p>
      <textarea id="msg" rows="9" readonly style="width:100%;font-family:inherit">${esc(msg)}</textarea>`,
    onMount: w => { const b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.textContent = "Copy message"; b.onclick = async () => { try { await navigator.clipboard.writeText(msg); toast("Copied.", "ok"); } catch (e) { w.querySelector("#msg").select(); document.execCommand("copy"); toast("Copied.", "ok"); } }; w.querySelector("#msg").after(b); },
    actions: [{ label: "Done", kind: "primary", value: null }],
  });
  rerender();
}
