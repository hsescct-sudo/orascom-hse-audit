import { esc, toast, dialog, confirmBox, fmtDateTime } from "../ui.js";

export async function render(root, ctx) {
  const { api } = ctx;
  let admins = [];
  const draw = () => {
    root.innerHTML = `<div class="page-head"><div><h1>Administrators</h1><p class="muted">Administrators see every project, review closures, and can edit or delete anything.</p></div>
      <div class="actions"><button class="btn primary" data-act="add">Add administrator</button></div></div>
      <div class="card table-card"><div class="tscroll"><table class="tbl"><thead><tr><th>Name</th><th>E-mail</th><th>Last sign-in</th><th></th></tr></thead>
      <tbody>${admins.map(a => `<tr><td><b>${esc(a.name || "—")}</b>${a.is_me ? ` <span class="chip st-pending">You</span>` : ""}</td><td>${esc(a.email)}</td><td>${a.last_sign_in_at ? fmtDateTime(a.last_sign_in_at) : `<span class="muted">Never</span>`}</td>
      <td class="row-actions"><button class="btn sm ghost" data-act="pw" data-id="${a.user_id}">Change password</button>${a.is_me ? "" : `<button class="btn sm ghost danger" data-act="del" data-id="${a.user_id}">Remove</button>`}</td></tr>`).join("")}</tbody></table></div></div>`;
  };
  const load = async () => { admins = await api.listAdmins(); draw(); };
  await load();
  root.addEventListener("click", async e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = admins.find(x => x.user_id === b.dataset.id);
    try {
      if (b.dataset.act === "add") {
        const v = await dialog({
          title: "Add administrator",
          body: `<label class="fld"><span>Name</span><input id="an"></label><label class="fld"><span>E-mail</span><input id="ae" type="email"></label><label class="fld"><span>Password (at least 8 characters)</span><input id="ap" autocomplete="new-password"></label>`,
          actions: [{ label: "Cancel", value: null }, { label: "Add", value: w => ({ name: w.querySelector("#an").value.trim(), email: w.querySelector("#ae").value.trim(), pw: w.querySelector("#ap").value }), validate: w => (!w.querySelector("#an").value.trim() ? "Enter a name." : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(w.querySelector("#ae").value.trim()) ? "Enter a valid e-mail." : w.querySelector("#ap").value.length < 8 ? "The password needs at least 8 characters." : null) }]
        });
        if (!v) return;
        await api.createAdmin(v.email, v.name, v.pw); toast("Administrator added."); await load();
      } else if (b.dataset.act === "pw") {
        const v = await dialog({ title: "Change password · " + (a.name || a.email), body: `<label class="fld"><span>New password (at least 8 characters)</span><input id="np" autocomplete="new-password"></label>`, actions: [{ label: "Cancel", value: null }, { label: "Save", value: w => w.querySelector("#np").value, validate: w => (w.querySelector("#np").value.length < 8 ? "The password needs at least 8 characters." : null) }] });
        if (!v) return;
        await api.setAdminPassword(a.user_id, v); toast("Password changed.");
      } else if (b.dataset.act === "del") {
        if (!(await confirmBox(`Remove ${a.name || a.email} as administrator? They won't be able to sign in any more.`, { ok: "Remove", danger: true }))) return;
        await api.deleteAdmin(a.user_id); toast("Administrator removed."); await load();
      }
    } catch (x) { toast(x.message, "error"); }
  });
}
