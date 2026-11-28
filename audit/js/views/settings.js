// Settings: this device, scoring rules, lists. Also the "More" page on phones.
import * as S from "../store.js";
import * as M from "../model.js";
import * as Sync from "../sync.js";
import { setTitle, link, leaveDemo, rerender } from "../app.js";
import { esc, ICON, toast, confirmBox, dialog } from "../ui.js";
import { MODULES, MODULE_IDS } from "../templates.js";
import { voiceSupported, voiceLang, setVoiceLang, LANGS } from "../voice.js";

export const VERSION = "1.0.0";
export async function render(ctx) {
  const { view, module: mod } = ctx;
  setTitle("Settings", "System and this device");
  const admin = M.isAdmin();
  const mode = await S.meta("mode");
  const st = S.settings();
  const rem = st.reminders || {};
  const Demo = await import("../demo.js");
  const dc = Demo.demoCounts();
  const photos = await S.photoCount();
  const sync = Sync.status();
  view.className = "view narrow";
  view.innerHTML = `<div class="stack">
    <section class="panel modsw-top"><div class="panel-h"><h2>More</h2></div><div class="row">
      <a class="btn" href="${link("plan", null, mod)}">${ICON.cal}<span>Audit plan</span></a>
      <a class="btn" href="${link("good", null, mod)}">${ICON.star}<span>Good practice</span></a>
      <a class="btn" href="${link("projects")}">${ICON.building}<span>Projects</span></a>
      <a class="btn" href="${link("team")}">${ICON.users}<span>Auditors and users</span></a>
      ${(window.HSE_AUDIT_CONFIG || {}).flashAuditUrl ? `<a class="btn" href="${esc(window.HSE_AUDIT_CONFIG.flashAuditUrl)}" target="_blank" rel="noopener">${ICON.ext}<span>Flash Audit system</span></a>` : ""}
    </div></section>
    <section class="panel"><div class="panel-h"><h2>This device</h2></div>
      <div class="stack" style="gap:8px">
        <div class="row" style="justify-content:space-between"><span>Signed in as</span><b>${esc(M.me().name)} (${esc(M.me().role)})</b></div>
        <div class="row" style="justify-content:space-between"><span>Mode</span><b>${mode === "demo" ? "Sample data, this device only" : "Connected to the server"}</b></div>
        ${mode === "cloud" ? `<div class="row" style="justify-content:space-between"><span>Waiting to send</span><b>${sync.pending} change${sync.pending === 1 ? "" : "s"}</b></div>` : ""}
        <div class="row" style="justify-content:space-between"><span>Photos saved on this device</span><b>${photos}</b></div>
        ${sync.error ? `<p class="small" style="color:var(--g-red)">${esc(sync.error)}</p>` : ""}
        <div class="row" style="margin-top:6px">
          ${mode === "cloud" ? `<button class="btn" type="button" id="sendnow">${ICON.cloud}<span>Send and refresh now</span></button><button class="btn ghost" type="button" id="pw">Change my password</button><button class="btn ghost" type="button" id="out">${ICON.out}<span>Sign out</span></button>` : `<button class="btn" type="button" id="leave">${ICON.out}<span>Leave sample mode</span></button>`}
        </div>
        ${voiceSupported ? `<label class="fld" style="margin-top:10px"><span>Voice typing language (the microphone on text boxes)</span><select id="vlang">${LANGS.map(([v, l]) => `<option value="${v}" ${voiceLang() === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>`
          : `<p class="muted small" style="margin-top:10px">Voice typing works in Chrome, Edge and Safari. This browser doesn't have it.</p>`}
        ${mode === "demo" ? `<label class="fld" style="margin-top:10px"><span>See the system as</span><select id="viewas">${M.members().map(m => `<option value="${esc(m.id)}" ${m.id === M.me().id ? "selected" : ""}>${esc(m.name)} (${esc(m.role)})</option>`).join("")}</select></label>` : ""}
        <p class="muted small" style="margin-top:6px">On iPhone, add the system to the home screen (Share, Add to Home Screen) so the device keeps its saved audits. On Android, install the app or add it from Chrome.</p>
      </div></section>
    ${admin ? `
    <section class="panel"><div class="panel-h"><h2>Scoring rules</h2></div>
      <label class="tick" style="margin-bottom:12px"><input type="checkbox" id="zero" ${st.zeroIsNA ? "checked" : ""}>Treat 0% like N/A (the old Excel behaviour)</label>
      <p class="muted small">Leave this off. With it on, an item rated 0% drops out of the score instead of counting as zero, so a very bad item can raise the score.</p>
      <div class="grid3" style="margin:14px 0 6px">
        <label class="fld"><span>Serious NCR deduction</span><select id="ser-each"><option value="once">Once per audit</option><option value="each" ${st.seriousEach ? "selected" : ""}>For each Serious NCR</option></select></label>
        <label class="fld"><span>Deductions are</span><select id="ded-from"><option value="points">Points off (83 − 15 = 68%)</option><option value="percent" ${st.deductFrom === "percent" ? "selected" : ""}>Percent of the score (83 → 70.6%)</option></select></label>
        <label class="fld"><span>Grade colour uses</span><select id="grade-on"><option value="shown">Score as shown (84.9% is orange)</option><option value="whole" ${st.gradeOn === "whole" ? "selected" : ""}>Whole number (84.5% is green)</option></select></label>
      </div>
      <label class="fld" style="max-width:320px"><span>Findings register form number</span><input class="inp" id="find-ref" value="${esc(st.findingsFormRef || "")}" placeholder="F/HSE/028 or F/HSE/071"></label>
      <p class="muted small" style="margin:6px 0 14px">These are decisions for the HSE Director. The first choice in each list is how the system scored until now. A change applies to all audits, old and new, on every device after it syncs.</p>
      <div class="tscroll"><table class="tbl"><thead><tr><th>Audit type</th><th>Serious NCR deduction</th><th>Each repeated NCR</th><th>Form ref</th><th>Rev</th></tr></thead><tbody>
      ${MODULE_IDS.map(id => { const d = M.def(id); return `<tr data-mod="${id}"><td><b style="font-weight:600">${esc(MODULES[id].short)}</b></td><td><input class="inp" type="number" min="0" max="100" data-k="serious" value="${d.deductions.serious}" style="max-width:90px"> %</td><td><input class="inp" type="number" min="0" max="100" data-k="repeated" value="${d.deductions.repeated}" style="max-width:90px"> %</td><td><input class="inp" data-k="formRef" value="${esc(d.formRef)}" style="max-width:130px"></td><td><input class="inp" data-k="formRev" value="${esc(d.formRev)}" style="max-width:70px"></td></tr>`; }).join("")}
      </tbody></table></div>
      <div class="row" style="margin-top:10px"><button class="btn primary" type="button" id="saverules">Save scoring rules</button></div>
    </section>
    ${mode === "cloud" ? `<section class="panel"><div class="panel-h"><h2>Presentation data</h2><span class="muted">For a demo to management</span></div>
      ${dc.total ? `<p><b>Presentation data is on the server:</b> ${dc.audits} audits, ${dc.ncrs} NCRs${st.demo ? `, added ${esc(String(st.demo.loaded_at || "").slice(0, 10))} by ${esc(st.demo.by || "")}` : ""}. Every user sees it. E-mail reminders stay off until you remove it.</p>
        <div class="row" style="margin-top:10px"><button class="btn danger" type="button" id="demo-del">Remove presentation data</button></div>`
      : `<p class="small">Adds realistic audits, NCRs, good practices and plans on all company projects, so the dashboards and registers are full for a presentation. Your auditors are used as the auditors. E-mail reminders turn off. After the presentation, remove all of it with one button. Your real records are not changed.</p>
        <div class="row" style="margin-top:10px"><button class="btn" type="button" id="demo-add">Add presentation data</button></div>`}
    </section>` : ""}
    <section class="panel"><div class="panel-h"><h2>E-mail reminders</h2><span class="muted">Sent early morning on the days you pick</span></div>
      <label class="tick" style="margin-bottom:10px"><input type="checkbox" id="rm-on" ${rem.on ? "checked" : ""}>Send reminders by e-mail</label>
      <div class="row small" style="gap:12px;margin-bottom:10px" id="rm-days">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => `<label class="tick"><input type="checkbox" value="${i}" ${(rem.days || [0, 3]).includes(i) ? "checked" : ""}>${d}</label>`).join("")}</div>
      <div class="stack" style="gap:6px">
        <label class="tick"><input type="checkbox" id="rm-prj" ${rem.projects !== false ? "checked" : ""}>Projects: open NCRs past the deadline or due in the next 3 days, with the project link</label>
        <label class="tick" style="padding-left:26px"><input type="checkbox" id="rm-cc" ${rem.ccLead !== false ? "checked" : ""}>Copy the lead auditor</label>
        <label class="tick"><input type="checkbox" id="rm-aud" ${rem.auditors !== false ? "checked" : ""}>Auditors: reports not sent after 7 days, evidence waiting for review, planned audits this month not started</label>
        <label class="tick"><input type="checkbox" id="rm-adm" ${rem.admins !== false ? "checked" : ""}>Administrators and approvers: a weekly summary on the first day picked</label>
      </div>
      <p class="muted small" style="margin-top:8px">Projects get e-mails only if their e-mails are added under Projects. The sending account is set once in GitHub (see the setup steps in README). Until then nothing is sent.</p>
      <div class="row" style="margin-top:10px"><button class="btn primary" type="button" id="saverem">Save reminders</button>${mode === "cloud" ? `<button class="btn ghost" type="button" id="remkey">Make the GitHub key</button>` : ""}</div>
    </section>
    <section class="panel"><div class="panel-h"><h2>Flash checklist</h2><span class="muted">${M.def("flash").parts.reduce((n, p) => n + p.items.filter(it => !it.retired).length, 0)} checks</span></div>
      <p class="small" style="margin-top:0">Change the wording or risk of a check, add checks to a topic, or take a check off the list. Used for new Flash audits.</p>
      <div class="row"><a class="btn" href="#/checklist">Edit the Flash checklist</a></div>
    </section>
    <section class="panel"><div class="panel-h"><h2>Lists</h2><span class="muted">One item per line</span></div>
      ${MODULE_IDS.map(id => { const d = M.def(id); return `<div class="grid2" style="margin-bottom:14px" data-lmod="${id}">
        <label class="fld"><span>${esc(MODULES[id].short)}: NCR classifications (${d.ncrClasses.length})</span><textarea rows="8" data-l="ncrClasses">${esc(d.ncrClasses.join("\n"))}</textarea></label>
        <label class="fld"><span>${esc(MODULES[id].short)}: good practice classifications (${d.goodClasses.length})</span><textarea rows="8" data-l="goodClasses">${esc(d.goodClasses.join("\n"))}</textarea></label></div>`; }).join("")}
      <div class="row"><button class="btn primary" type="button" id="savelists">Save lists</button></div>
    </section>
    <section class="panel" id="deldata"><div class="panel-h"><h2>Delete data</h2><span class="muted">For test records or a fresh start</span></div>
      <p class="small" style="margin-top:0">Deleted audits take their NCRs and good practice with them. They leave every screen, report and dashboard, and you can bring them back under Deleted records.</p>
      <div class="grid3">
        <label class="fld"><span>Audit type</span><select id="dd-m"><option value="">All three</option>${MODULE_IDS.map(id => `<option value="${id}">${esc(MODULES[id].short)}</option>`).join("")}</select></label>
        <label class="fld"><span>Which audits</span><select id="dd-s"><option value="">All</option><option value="draft">In progress</option><option value="submitted">Waiting approval</option><option value="approved">Approved</option><option value="none">None, only the plan</option></select></label>
        <label class="fld"><span>Year</span><select id="dd-y"><option value="">All years</option>${[...new Set([...S.all("audit").map(a => String(a.date || "").slice(0, 4)), ...S.all("plan").map(p => String(p.year))])].filter(Boolean).sort().reverse().map(y => `<option>${esc(y)}</option>`).join("")}</select></label>
      </div>
      <label class="tick" style="margin-top:10px"><input type="checkbox" id="dd-plan">Also delete the audit plan for this type and year</label>
      <p class="small" id="dd-n" style="margin:10px 0"></p>
      <div class="row"><button class="btn danger" type="button" id="dd-go">Delete</button></div>
    </section>
    <section class="panel" id="deleted"><div class="panel-h"><h2>Deleted records</h2><span class="muted">Bring back anything deleted by mistake</span></div>
      ${(() => { const bs = M.deletedBatches(); return bs.length ? `<div class="stack" style="gap:10px">${bs.map(b => `<div class="row" style="justify-content:space-between;gap:12px;border-top:1px solid var(--line-soft);padding-top:10px">
        <div><b>${esc([b.audit && `${b.audit} audit${b.audit === 1 ? "" : "s"}`, b.ncr && `${b.ncr} NCR${b.ncr === 1 ? "" : "s"}`, b.good && `${b.good} good practice`, b.plan && `${b.plan} plan line${b.plan === 1 ? "" : "s"}`].filter(Boolean).join(", "))}</b>
          <div class="muted small">${esc([...b.modules].map(m => (MODULES[m] || {}).short || m).join(", "))}${b.at ? `, deleted ${esc(b.at.slice(0, 10))} ${esc(b.at.slice(11, 16))}` : ""}${b.by ? ` by ${esc(b.by)}` : ""}${b.refs.length ? `. ${esc(b.refs.slice(0, 4).join(", "))}${b.refs.length > 4 ? ` and ${b.refs.length - 4} more` : ""}` : ""}</div></div>
        <button class="btn sm" type="button" data-restore="${esc(b.batch)}">Bring back</button></div>`).join("")}</div>` : `<p class="muted small" style="margin:0">Nothing deleted.</p>`; })()}
    </section>` : ""}
    <p class="muted small">OC HSE Audit ${VERSION}. Forms ${esc(MODULES.full.formRef)} and ${esc(MODULES.lifting.formRef)}, NCR form ${esc(MODULES.full.ncrFormRef)}.</p>
  </div>`;
  const $ = s => view.querySelector(s);
  if ($("#leave")) $("#leave").onclick = leaveDemo;
  if ($("#out")) $("#out").onclick = async () => {
    if (Sync.status().pending && !(await confirmBox(`${Sync.status().pending} changes are not on the server yet. Signing out removes them from this device.`, { title: "Sign out?", ok: "Sign out anyway", danger: true }))) return;
    await Sync.signOut(); location.hash = ""; location.reload();
  };
  if ($("#pw")) $("#pw").onclick = async () => {
    const r = await dialog({
      title: "Change my password",
      body: `<label class="fld"><span>New password</span><input id="p1" type="password" autocomplete="new-password"></label><label class="fld"><span>New password again</span><input id="p2" type="password" autocomplete="new-password"></label><p class="muted small">At least 8 characters. Needs internet.</p>`,
      actions: [{ label: "Cancel", value: null }, { label: "Save password", kind: "primary",
        validate: w => { const a = w.querySelector("#p1").value, b = w.querySelector("#p2").value; return a.length < 8 ? "Use at least 8 characters." : a !== b ? "The two passwords are not the same." : null; },
        value: w => w.querySelector("#p1").value }],
    });
    if (!r) return;
    try { await Sync.setOwnPassword(r); toast("Password changed.", "ok"); } catch (e) { toast(e.message, "error"); }
  };
  if ($("#sendnow")) $("#sendnow").onclick = async () => { await Sync.syncNow(true); toast("Done."); rerender(); };
  if ($("#vlang")) $("#vlang").onchange = e => { setVoiceLang(e.target.value); toast(`Voice typing: ${e.target.selectedOptions[0].textContent}.`, "ok"); };
  if ($("#viewas")) $("#viewas").onchange = async e => { await S.meta("demoUser", e.target.value); location.hash = ""; location.reload(); };
  if ($("#saverules")) $("#saverules").onclick = async () => {
    const s = S.settings(); const modules = { ...(s.modules || {}) };
    view.querySelectorAll("tr[data-mod]").forEach(tr => {
      const id = tr.dataset.mod; const v = k => tr.querySelector(`[data-k=${k}]`).value;
      modules[id] = { ...(modules[id] || {}), deductions: { serious: +v("serious"), repeated: +v("repeated") }, formRef: v("formRef").trim(), formRev: v("formRev").trim() };
    });
    await S.saveSettings({ modules, zeroIsNA: $("#zero").checked, seriousEach: $("#ser-each").value === "each", deductFrom: $("#ded-from").value, gradeOn: $("#grade-on").value, findingsFormRef: $("#find-ref").value.trim() });
    toast("Scoring rules saved.", "ok");
  };
  if ($("#saverem")) $("#saverem").onclick = async () => {
    const days = [...view.querySelectorAll("#rm-days input:checked")].map(i => +i.value);
    if ($("#rm-on").checked && !days.length) { toast("Pick at least one day.", "error"); return; }
    if ($("#rm-on").checked && Demo.demoCounts().total) { toast("Remove the presentation data first. Otherwise the auditors get reminders about NCRs that are not real.", "error"); $("#rm-on").checked = false; return; }
    await S.saveSettings({ reminders: { on: $("#rm-on").checked, days, projects: $("#rm-prj").checked, ccLead: $("#rm-cc").checked, auditors: $("#rm-aud").checked, admins: $("#rm-adm").checked } });
    toast("Reminders saved.", "ok");
  };
  if ($("#demo-add")) $("#demo-add").onclick = async () => {
    if (!(await confirmBox("This adds about 80 audits and 240 NCRs on all company projects. All users see them. E-mail reminders turn off until you remove them.", { title: "Add presentation data?", ok: "Add data" }))) return;
    const b = $("#demo-add"); b.disabled = true; b.textContent = "Adding…";
    try { const n = await Demo.loadDemo(); await Sync.syncNow(true); toast(`${n} records added. Reminders are off.`, "ok"); }
    catch (e) { toast(e.message, "error"); }
    rerender();
  };
  if ($("#demo-del")) $("#demo-del").onclick = async () => {
    if (!(await confirmBox("All presentation audits, NCRs, good practices and plans are removed for every user. Real records stay.", { title: "Remove presentation data?", ok: "Remove", danger: true }))) return;
    const b = $("#demo-del"); b.disabled = true; b.textContent = "Removing…";
    try { const n = await Demo.removeDemo(); await Sync.syncNow(true); toast(`${n} records removed. Turn the reminders on again when you are ready.`, "ok"); }
    catch (e) { toast(e.message, "error"); }
    rerender();
  };
  if ($("#remkey")) $("#remkey").onclick = async () => {
    if (!(await confirmBox("This makes a new key for the reminder job in GitHub. An older key stops working.", { title: "Make the GitHub key?", ok: "Make key" }))) return;
    let k;
    try { k = await Sync.call("ha_new_reminder_key"); } catch (e) { toast(e.message, "error"); return; }
    await dialog({
      title: "Reminder key", wide: true,
      body: `<p>Copy this key now. It is shown only once.</p><input class="inp" id="rk" value="${esc(k)}" readonly style="font-family:monospace">
        <p class="small">In GitHub open the repository, Settings, Secrets and variables, Actions, New repository secret. Name: <b>REMINDER_KEY</b>. Paste the key as the value.</p>`,
      onMount: w => { const i = w.querySelector("#rk"); i.focus(); i.select(); },
      actions: [{ label: "Done", kind: "primary", value: null }],
    });
  };
  // ---------- delete data ----------
  const pickDel = () => {
    const m = $("#dd-m").value, st = $("#dd-s").value, y = $("#dd-y").value;
    const mods = m ? [m] : MODULE_IDS;
    const audits = st === "none" ? [] : mods.flatMap(id => M.audits(id)).filter(a => (!st || a.status === st) && (!y || String(a.date).startsWith(y)));
    const ncrs = audits.reduce((t, a) => t + M.auditNCRs(a).length, 0);
    const plans = $("#dd-plan").checked ? mods.flatMap(id => M.plans(id)).filter(p => !y || String(p.year) === y) : [];
    return { audits, ncrs, plans };
  };
  const showDel = () => {
    if (!$("#dd-n")) return;
    const r = pickDel();
    $("#dd-n").textContent = r.audits.length || r.plans.length ? `This deletes ${r.audits.length} audit${r.audits.length === 1 ? "" : "s"} with ${r.ncrs} NCR${r.ncrs === 1 ? "" : "s"}${r.plans.length ? ` and ${r.plans.length} plan line${r.plans.length === 1 ? "" : "s"}` : ""}.` : "Nothing matches.";
    $("#dd-go").disabled = !r.audits.length && !r.plans.length;
  };
  if ($("#deldata")) { $("#deldata").addEventListener("change", showDel); showDel(); }
  if ($("#dd-go")) $("#dd-go").onclick = async () => {
    const r = pickDel(); if (!r.audits.length && !r.plans.length) return;
    const ok = await dialog({
      title: "Delete these records?",
      body: `<p>${esc($("#dd-n").textContent)} Every user stops seeing them. You can bring them back under Deleted records.</p>
        <label class="fld"><span>Type DELETE to confirm</span><input id="dd-c" autocomplete="off" autocapitalize="characters"></label>`,
      onMount: w => w.querySelector("#dd-c").focus(),
      actions: [{ label: "Cancel", value: null }, { label: "Delete", kind: "danger", validate: w => (w.querySelector("#dd-c").value.trim().toUpperCase() === "DELETE" ? null : "Type DELETE to confirm."), value: () => true }],
    });
    if (!ok) return;
    const b = $("#dd-go"); b.disabled = true; b.textContent = "Deleting…";
    try {
      if (r.audits.length) await M.deleteAudits(r.audits);
      if (r.plans.length) await M.deletePlans(r.plans.map(p => S.get(p.id) || p));
      await Sync.syncNow(true);
      toast(`Deleted. ${r.audits.length} audit${r.audits.length === 1 ? "" : "s"}${r.plans.length ? `, ${r.plans.length} plan line${r.plans.length === 1 ? "" : "s"}` : ""}.`, "ok");
    } catch (e) { toast(e.message, "error"); }
    rerender();
  };
  view.querySelectorAll("[data-restore]").forEach(btn => btn.onclick = async () => {
    btn.disabled = true;
    const n = await M.restoreBatch(btn.dataset.restore);
    await Sync.syncNow(true);
    toast(`${n} record${n === 1 ? "" : "s"} brought back.`, "ok"); rerender();
  });
  if ($("#savelists")) $("#savelists").onclick = async () => {
    const s = S.settings(); const modules = { ...(s.modules || {}) };
    view.querySelectorAll("[data-lmod]").forEach(box => {
      const id = box.dataset.lmod; modules[id] = { ...(modules[id] || {}) };
      box.querySelectorAll("[data-l]").forEach(t => { const l = t.value.split("\n").map(x => x.trim()).filter(Boolean); modules[id][t.dataset.l] = [...new Set(l)]; });
    });
    await S.saveSettings({ modules }); toast("Lists saved.", "ok"); rerender();
  };
}
