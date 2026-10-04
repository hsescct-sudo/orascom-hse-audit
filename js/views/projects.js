import { esc, toast, dialog, confirmBox, ensureExcelJS, saveBlob, findingState, busyOverlay, fmtDate, ICON } from "../ui.js";

const slug = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const CODE_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
function genPassword() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ", a = "abcdefghijkmnpqrstuvwxyz", d = "23456789";
  const r = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const pick = s => s[r(s.length)];
  return pick(A) + pick(a) + pick(a) + pick(a) + "-" + pick(d) + pick(d) + pick(d) + pick(d) + "-" + pick(A) + pick(a) + pick(a);
}

export async function render(root, ctx) {
  const { api, store } = ctx;
  await store.load();
  const draw = () => {
    const counts = {};
    store.audits.forEach(a => { counts[a.project_id] = counts[a.project_id] || { audits: 0, open: 0, overdue: 0 }; counts[a.project_id].audits++; });
    store.findings.forEach(f => { const c = counts[f.project_id] = counts[f.project_id] || { audits: 0, open: 0, overdue: 0 }; const s = findingState(f); if (s !== "closed") c.open++; if (s === "overdue") c.overdue++; });
    const noLogin = store.projects.filter(p => !p.login_user_id && p.active).length;
    root.innerHTML = `
      <div class="page-head"><div><h1>Projects</h1><p class="muted">${store.projects.length} projects · each project signs in with its own password</p></div>
        <div class="actions">
          <button class="btn ghost danger" data-act="wipe">${ICON.trash} Delete data…</button>
          <button class="btn ghost" data-act="import">Import list from Excel</button>
          ${noLogin ? `<button class="btn ghost" data-act="bulk">Create logins for ${noLogin} project${noLogin > 1 ? "s" : ""}</button>` : ""}
          <button class="btn primary" data-act="add">Add project</button>
        </div></div>
      ${store.projects.length ? `<div class="card table-card"><div class="tscroll"><table class="tbl">
        <thead><tr><th>Project</th><th>Code</th><th>Location</th><th>Project Manager</th><th class="num">Audits</th><th class="num">Not closed</th><th class="num">Overdue</th><th>Login</th><th>Status</th><th></th></tr></thead>
        <tbody>${store.projects.map(p => { const c = counts[p.id] || { audits: 0, open: 0, overdue: 0 }; return `<tr>
          <td><b>${esc(p.name)}</b>${p.client ? `<div class="muted small">${esc(p.client)}</div>` : ""}</td>
          <td><code>${esc(p.code)}</code></td><td>${esc(p.location)}</td><td>${esc(p.pm)}</td>
          <td class="num">${c.audits}</td><td class="num">${c.open}</td><td class="num">${c.overdue ? `<b class="t-over">${c.overdue}</b>` : 0}</td>
          <td>${p.login_user_id ? `<span class="chip st-closed">Ready</span>` : `<span class="chip st-open">No password</span>`}</td>
          <td>${p.active ? "Active" : `<span class="muted">Inactive</span>`}</td>
          <td class="row-actions"><button class="btn sm ghost" data-act="edit" data-id="${p.id}">Edit</button><button class="btn sm ghost" data-act="pw" data-id="${p.id}">${p.login_user_id ? "Change password" : "Set password"}</button>${c.audits ? `<button class="btn sm ghost danger" data-act="clear" data-id="${p.id}" title="Delete this project's audits, findings and photos; keep the project and its login">Clear data</button>` : ""}<button class="btn sm ghost danger" data-act="del" data-id="${p.id}">Delete</button></td>
        </tr>`; }).join("")}</tbody></table></div></div>`
      : `<div class="empty"><h3>No projects yet</h3><p>Add projects one by one, or import the list from an Excel file with columns Project, Code, Location, Project Manager, Client.</p></div>`}`;
  };
  draw();

  async function editDialog(p) {
    const isNew = !p;
    p = p || { name: "", code: "", location: "", pm: "", client: "", active: true };
    const v = await dialog({
      title: isNew ? "Add project" : "Edit project",
      body: `<div class="form-grid">
        <label class="fld span2"><span>Project name</span><input id="pn" value="${esc(p.name)}" required></label>
        <label class="fld"><span>Code (used in links and reports)</span><input id="pc" value="${esc(p.code)}" placeholder="e.g. amiral-iwwtp"></label>
        <label class="fld"><span>Location</span><input id="pl" value="${esc(p.location)}"></label>
        <label class="fld"><span>Project Manager</span><input id="ppm" value="${esc(p.pm)}"></label>
        <label class="fld"><span>Client</span><input id="pcl" value="${esc(p.client)}"></label>
        ${isNew ? `<label class="fld span2"><span>Project password (optional, at least 8 characters)</span><div class="row"><input id="ppw" value="${genPassword()}" autocomplete="off"><button class="btn ghost sm" type="button" id="gen">New</button></div><small class="muted">Share it only with the project HSE team. You can change it any time.</small></label>` : ""}
        <label class="check span2"><input type="checkbox" id="pa" ${p.active ? "checked" : ""}> Active (shown on the sign-in screen)</label>
      </div>`,
      onMount: w => {
        const n = w.querySelector("#pn"), c = w.querySelector("#pc");
        let touched = !!p.code;
        c.addEventListener("input", () => { touched = true; });
        n.addEventListener("input", () => { if (!touched) c.value = slug(n.value); });
        const g = w.querySelector("#gen"); if (g) g.addEventListener("click", () => { w.querySelector("#ppw").value = genPassword(); });
      },
      actions: [{ label: "Cancel", value: null }, {
        label: isNew ? "Add project" : "Save", value: w => ({
          ...p, name: w.querySelector("#pn").value.trim(), code: slug(w.querySelector("#pc").value), location: w.querySelector("#pl").value.trim(),
          pm: w.querySelector("#ppm").value.trim(), client: w.querySelector("#pcl").value.trim(), active: w.querySelector("#pa").checked,
          password: isNew ? w.querySelector("#ppw").value.trim() : ""
        }),
        validate: w => {
          if (!w.querySelector("#pn").value.trim()) return "Enter the project name.";
          if (!CODE_RE.test(slug(w.querySelector("#pc").value))) return "The code needs 2–40 letters, numbers or hyphens.";
          const pw = isNew ? w.querySelector("#ppw").value.trim() : "";
          if (pw && pw.length < 8) return "The password needs at least 8 characters.";
          return null;
        }
      }]
    });
    if (!v) return;
    try {
      const { password, projects, ...row } = v;
      const saved = await api.saveProject(row);
      if (password) await api.setProjectPassword(saved.id, password);
      toast(isNew ? (password ? "Project added. Its password is ready to share." : "Project added.") : "Project saved.");
      await store.load(true); draw();
    } catch (e) { toast(e.message, "error"); }
  }

  async function pwDialog(p) {
    const v = await dialog({
      title: (p.login_user_id ? "Change password · " : "Set password · ") + p.name,
      body: `<label class="fld"><span>New password (at least 8 characters)</span><div class="row"><input id="np" value="${genPassword()}" autocomplete="off"><button class="btn ghost sm" type="button" id="gen">New</button></div></label>
        <p class="muted small">${p.login_user_id ? "The old password stops working immediately. Anyone signed in keeps working until they sign out." : "The project appears on the sign-in screen once it has a password."}</p>`,
      onMount: w => w.querySelector("#gen").addEventListener("click", () => { w.querySelector("#np").value = genPassword(); }),
      actions: [{ label: "Cancel", value: null }, { label: "Save password", value: w => w.querySelector("#np").value.trim(), validate: w => (w.querySelector("#np").value.trim().length < 8 ? "The password needs at least 8 characters." : null) }]
    });
    if (!v) return;
    try { await api.setProjectPassword(p.id, v); toast("Password saved. Share it with the project team."); await store.load(true); draw(); }
    catch (e) { toast(e.message, "error"); }
  }

  async function bulkLogins() {
    const list = store.projects.filter(p => !p.login_user_id && p.active);
    const ok = await confirmBox(`Create a password for ${list.length} project(s) and download the list as Excel?`, { ok: "Create passwords" });
    if (!ok) return;
    const rows = [];
    for (const p of list) {
      const pw = genPassword();
      try { await api.setProjectPassword(p.id, pw); rows.push([p.name, p.code, pw]); } catch (e) { rows.push([p.name, p.code, "FAILED: " + e.message]); }
    }
    try {
      const ExcelJS = await ensureExcelJS();
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Project logins");
      ws.columns = [{ header: "Project", width: 44 }, { header: "Code", width: 22 }, { header: "Password", width: 22 }];
      rows.forEach(r => ws.addRow(r)); ws.getRow(1).font = { bold: true };
      saveBlob(new Blob([await wb.xlsx.writeBuffer()]), "HSE_Audit_Project_Logins.xlsx");
      toast("Passwords created. Keep the downloaded file safe.");
    } catch (e) { toast("Passwords created, but the file couldn't be made: " + e.message, "error"); }
    await store.load(true); draw();
  }

  async function importList() {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".xlsx";
    input.onchange = async () => {
      const file = input.files[0]; if (!file) return;
      try {
        const ExcelJS = await ensureExcelJS();
        const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
        const ws = wb.worksheets[0];
        const head = {}; ws.getRow(1).eachCell((c, i) => { head[i] = String(c.text || "").trim().toLowerCase(); });
        const col = re => +Object.keys(head).find(k => re.test(head[k]));
        const cN = col(/project|name/), cC = col(/code/), cL = col(/location|site|city/), cP = col(/manager|\bpm\b/), cCl = col(/client|owner/);
        if (!cN) throw new Error("The first row needs a 'Project' column.");
        const items = [];
        ws.eachRow((row, i) => { if (i === 1) return; const t = c => (c ? String(row.getCell(c).text || "").trim() : ""); const name = t(cN); if (name) items.push({ name, code: slug(t(cC) || name), location: t(cL), pm: t(cP), client: t(cCl) }); });
        const fresh = items.filter(it => !store.projects.some(p => p.code === it.code));
        const v = await dialog({
          title: "Import projects", wide: true,
          body: `<p>${items.length} rows found, ${fresh.length} new (projects whose code already exists are skipped).</p>
            <div class="tscroll"><table class="tbl"><thead><tr><th>Project</th><th>Code</th><th>Location</th><th>PM</th><th>Client</th></tr></thead><tbody>${fresh.map(it => `<tr><td>${esc(it.name)}</td><td><code>${esc(it.code)}</code></td><td>${esc(it.location)}</td><td>${esc(it.pm)}</td><td>${esc(it.client)}</td></tr>`).join("")}</tbody></table></div>`,
          actions: [{ label: "Cancel", value: false }, { label: `Add ${fresh.length} projects`, value: true }]
        });
        if (!v) return;
        let n = 0; for (const it of fresh) { try { await api.saveProject(it); n++; } catch (e) { toast(it.name + ": " + e.message, "error"); } }
        toast(`${n} projects added. Use "Create logins" to give them passwords.`);
        await store.load(true); draw();
      } catch (e) { toast(e.message, "error"); }
    };
    input.click();
  }

  // Delete audit data in bulk: one project or all, optionally only audits dated inside a range.
  function scopeOf(projectId, from, to) {
    const audits = store.audits.filter(a => (!projectId || a.project_id === projectId) && (!from || a.audit_date >= from) && (!to || a.audit_date <= to));
    const ids = new Set(audits.map(a => a.id));
    const findings = store.findings.filter(f => ids.has(f.audit_id));
    const photos = findings.reduce((s, f) => { const c = store.photoCount?.[f.id]; return s + (c ? c.violation + c.closure : 0); }, 0);
    return { audits, findings, photos };
  }
  async function runWipe(audits, label) {
    const b = busyOverlay(`Deleting ${audits.length} audits…`);
    try { await api.deleteAudits(audits.map(a => a.id), (d, t) => b.set(`Deleting audits ${d} of ${t}…`)); toast(`${label}: ${audits.length} audit${audits.length === 1 ? "" : "s"} deleted with their findings and photos.`); }
    catch (x) { toast(x.message, "error"); }
    finally { b.done(); await store.load(true); draw(); }
  }
  async function wipeDialog(presetProject = "") {
    const count = w => {
      const s = scopeOf(w.querySelector("#w-project").value, w.querySelector("#w-from").value, w.querySelector("#w-to").value);
      w.querySelector("#w-sum").innerHTML = s.audits.length ? `This deletes <b>${s.audits.length}</b> audit${s.audits.length === 1 ? "" : "s"}, <b>${s.findings.length}</b> finding${s.findings.length === 1 ? "" : "s"} and <b>${s.photos}</b> photo${s.photos === 1 ? "" : "s"}, with all their comments. Projects, logins and administrators are kept.` : "Nothing matches — no audits in this selection.";
      return s;
    };
    const v = await dialog({
      title: "Delete data",
      body: `<p class="muted">Use this to clear test entries or old campaigns. Deleted data and photos can't be recovered — download the Excel register or reports first if you may need them.</p>
        <label class="fld"><span>Project</span><select id="w-project"><option value="">All projects</option>${store.projects.map(p => `<option value="${p.id}" ${p.id === presetProject ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
        <div class="form-grid"><label class="fld"><span>Audits dated from (optional)</span><input type="date" id="w-from"></label><label class="fld"><span>To (optional)</span><input type="date" id="w-to"></label></div>
        <p class="panel warn" id="w-sum"></p>
        <label class="fld"><span>Type <b>DELETE</b> to confirm</span><input id="w-type" autocomplete="off"></label>`,
      onMount: w => { count(w); w.addEventListener("input", e => { if (e.target.id !== "w-type") count(w); }); },
      actions: [{ label: "Cancel", value: null }, {
        label: "Delete data", kind: "danger",
        value: w => count(w),
        validate: w => { const s = count(w); if (!s.audits.length) return "There is nothing to delete in this selection."; return w.querySelector("#w-type").value.trim() === "DELETE" ? null : "Type DELETE to confirm."; }
      }]
    });
    if (!v) return;
    await runWipe(v.audits, "Data deleted");
  }

  root.addEventListener("click", async e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const p = b.dataset.id && store.project(b.dataset.id);
    if (b.dataset.act === "add") editDialog();
    else if (b.dataset.act === "edit") editDialog(p);
    else if (b.dataset.act === "pw") pwDialog(p);
    else if (b.dataset.act === "bulk") bulkLogins();
    else if (b.dataset.act === "import") importList();
    else if (b.dataset.act === "wipe") wipeDialog();
    else if (b.dataset.act === "clear") {
      const s = scopeOf(p.id);
      const ok = await confirmBox(`Delete all ${s.audits.length} audits, ${s.findings.length} findings and ${s.photos} photos of ${p.name}? The project and its login stay. This can't be undone.`, { title: "Clear project data", ok: "Clear data", danger: true, typeToConfirm: p.code });
      if (!ok) return;
      await runWipe(s.audits, p.name);
    }
    else if (b.dataset.act === "del") {
      const ok = await confirmBox(`Delete ${p.name}? This permanently removes its login, all its audits, findings, comments and photos.`, { title: "Delete project", ok: "Delete everything", danger: true, typeToConfirm: p.code });
      if (!ok) return;
      try { await api.deleteProject(p.id); toast("Project deleted."); await store.load(true); draw(); } catch (x) { toast(x.message, "error"); }
    }
  });
}
