// Settings: this device, scoring rules, lists. Also the "More" page on phones.
import * as S from "../store.js";
import * as M from "../model.js";
import * as Sync from "../sync.js";
import { setTitle, link, leaveDemo, rerender } from "../app.js";
import { esc, ICON, toast, confirmBox } from "../ui.js";
import { MODULES, MODULE_IDS } from "../templates.js";

export const VERSION = "1.0.0";
export async function render(ctx) {
  const { view, module: mod } = ctx;
  setTitle("Settings", "System and this device");
  const admin = M.isAdmin();
  const mode = await S.meta("mode");
  const st = S.settings();
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
        <div class="row" style="justify-content:space-between"><span>Signed in as</span><b>${esc(M.me().name)} · ${esc(M.me().role)}</b></div>
        <div class="row" style="justify-content:space-between"><span>Mode</span><b>${mode === "demo" ? "Sample data, this device only" : "Connected to the server"}</b></div>
        ${mode === "cloud" ? `<div class="row" style="justify-content:space-between"><span>Waiting to send</span><b>${sync.pending} change${sync.pending === 1 ? "" : "s"}</b></div>` : ""}
        <div class="row" style="justify-content:space-between"><span>Photos saved on this device</span><b>${photos}</b></div>
        ${sync.error ? `<p class="small" style="color:var(--g-red)">${esc(sync.error)}</p>` : ""}
        <div class="row" style="margin-top:6px">
          ${mode === "cloud" ? `<button class="btn" type="button" id="sendnow">${ICON.cloud}<span>Send and refresh now</span></button><button class="btn ghost" type="button" id="out">${ICON.out}<span>Sign out</span></button>` : `<button class="btn" type="button" id="leave">${ICON.out}<span>Leave sample mode</span></button>`}
        </div>
        ${mode === "demo" ? `<label class="fld" style="margin-top:10px"><span>See the system as</span><select id="viewas">${M.members().map(m => `<option value="${esc(m.id)}" ${m.id === M.me().id ? "selected" : ""}>${esc(m.name)} (${esc(m.role)})</option>`).join("")}</select></label>` : ""}
        <p class="muted small" style="margin-top:6px">On iPhone, add the system to the home screen (Share, Add to Home Screen) so the device keeps its saved audits. On Android, install the app or add it from Chrome.</p>
      </div></section>
    ${admin ? `
    <section class="panel"><div class="panel-h"><h2>Scoring rules</h2></div>
      <label class="tick" style="margin-bottom:12px"><input type="checkbox" id="zero" ${st.zeroIsNA ? "checked" : ""}>Treat 0% like N/A (the old Excel behaviour)</label>
      <p class="muted small">Leave this off. With it on, an item rated 0% drops out of the score instead of counting as zero, so a very bad item can raise the score.</p>
      <div class="tscroll"><table class="tbl"><thead><tr><th>Audit type</th><th>Serious NCR deduction (once)</th><th>Each repeated NCR</th><th>Form ref</th><th>Rev</th></tr></thead><tbody>
      ${MODULE_IDS.map(id => { const d = M.def(id); return `<tr data-mod="${id}"><td><b style="font-weight:600">${esc(MODULES[id].short)}</b></td><td><input class="inp" type="number" min="0" max="100" data-k="serious" value="${d.deductions.serious}" style="max-width:90px"> %</td><td><input class="inp" type="number" min="0" max="100" data-k="repeated" value="${d.deductions.repeated}" style="max-width:90px"> %</td><td><input class="inp" data-k="formRef" value="${esc(d.formRef)}" style="max-width:130px"></td><td><input class="inp" data-k="formRev" value="${esc(d.formRev)}" style="max-width:70px"></td></tr>`; }).join("")}
      </tbody></table></div>
      <div class="row" style="margin-top:10px"><button class="btn primary" type="button" id="saverules">Save scoring rules</button></div>
    </section>
    <section class="panel"><div class="panel-h"><h2>Lists</h2><span class="muted">One item per line</span></div>
      ${MODULE_IDS.map(id => { const d = M.def(id); return `<div class="grid2" style="margin-bottom:14px" data-lmod="${id}">
        <label class="fld"><span>${esc(MODULES[id].short)}: NCR classifications (${d.ncrClasses.length})</span><textarea rows="8" data-l="ncrClasses">${esc(d.ncrClasses.join("\n"))}</textarea></label>
        <label class="fld"><span>${esc(MODULES[id].short)}: good practice classifications (${d.goodClasses.length})</span><textarea rows="8" data-l="goodClasses">${esc(d.goodClasses.join("\n"))}</textarea></label></div>`; }).join("")}
      <div class="row"><button class="btn primary" type="button" id="savelists">Save lists</button></div>
    </section>` : ""}
    <p class="muted small">OC HSE Audit ${VERSION} · ${esc(MODULES.full.formRef)} and ${esc(MODULES.lifting.formRef)} · NCR form ${esc(MODULES.full.ncrFormRef)}</p>
  </div>`;
  const $ = s => view.querySelector(s);
  if ($("#leave")) $("#leave").onclick = leaveDemo;
  if ($("#out")) $("#out").onclick = async () => {
    if (Sync.status().pending && !(await confirmBox(`${Sync.status().pending} changes are not on the server yet. Signing out removes them from this device.`, { title: "Sign out?", ok: "Sign out anyway", danger: true }))) return;
    await Sync.signOut(); location.hash = ""; location.reload();
  };
  if ($("#sendnow")) $("#sendnow").onclick = async () => { await Sync.syncNow(true); toast("Done."); rerender(); };
  if ($("#viewas")) $("#viewas").onchange = async e => { await S.meta("demoUser", e.target.value); location.hash = ""; location.reload(); };
  if ($("#saverules")) $("#saverules").onclick = async () => {
    const s = S.settings(); const modules = { ...(s.modules || {}) };
    view.querySelectorAll("tr[data-mod]").forEach(tr => {
      const id = tr.dataset.mod; const v = k => tr.querySelector(`[data-k=${k}]`).value;
      modules[id] = { ...(modules[id] || {}), deductions: { serious: +v("serious"), repeated: +v("repeated") }, formRef: v("formRef").trim(), formRev: v("formRev").trim() };
    });
    await S.saveSettings({ modules, zeroIsNA: $("#zero").checked }); toast("Scoring rules saved.", "ok");
  };
  if ($("#savelists")) $("#savelists").onclick = async () => {
    const s = S.settings(); const modules = { ...(s.modules || {}) };
    view.querySelectorAll("[data-lmod]").forEach(box => {
      const id = box.dataset.lmod; modules[id] = { ...(modules[id] || {}) };
      box.querySelectorAll("[data-l]").forEach(t => { const l = t.value.split("\n").map(x => x.trim()).filter(Boolean); modules[id][t.dataset.l] = [...new Set(l)]; });
    });
    await S.saveSettings({ modules }); toast("Lists saved.", "ok"); rerender();
  };
}
