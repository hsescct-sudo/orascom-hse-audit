// Settings (administration only): change the checklist, lists, dashboard and report labels without code.
import { esc, toast, dialog, confirmBox, fmtDateTime, ICON } from "../ui.js";
import { ALL_TOPICS, DEFAULT_CHECKLIST, DEFAULT_RC, RC_LIST, currentChecklist } from "../checklist.js";
import { SETTINGS, DEFAULTS, DASH_PANELS, settingsState, saveSettings, SETTINGS_SQL } from "../settings.js";

const TABS = [["checklist", "Checklist"], ["lists", "Root causes"], ["dashboard", "Dashboard"], ["reports", "Reports & names"]];
const clone = o => JSON.parse(JSON.stringify(o));

export async function render(root, ctx) {
  const { api, store, me, query } = ctx;
  await store.load();
  let tab = TABS.some(t => t[0] === query.tab) ? query.tab : "checklist";
  let draft = clone(currentChecklist()), dirty = false, open = new Set();
  const usedItems = new Set(), usedTopics = new Set();
  store.audits.forEach(a => Object.keys(a.checks || {}).forEach(id => usedItems.add(id)));
  store.findings.forEach(f => { if (f.topic) usedTopics.add(f.topic); if (f.item_id) usedItems.add(f.item_id); });
  const saved = key => { const u = settingsState.updated[key]; return u ? `Last saved ${fmtDateTime(u.at)}${u.by ? " by " + esc(u.by) : ""}` : "Using the built-in default"; };

  function shell() {
    root.innerHTML = `
      <div class="page-head"><div><h1>Settings</h1><p class="muted">Change the checklist, lists, dashboard and report labels. Changes apply to everyone as soon as you save.</p></div></div>
      ${settingsState.missingTable ? `<div class="panel warn"><b>One database update is needed before settings can be saved.</b>
        <span>Open Supabase → SQL Editor → New query, paste this and press Run (it is safe to run more than once):</span>
        <pre class="sql" id="sql">${esc(SETTINGS_SQL)}</pre><div class="btnrow"><button class="btn sm" id="copy-sql">Copy SQL</button></div></div>` : ""}
      <div class="tabbar" role="tablist">${TABS.map(([k, l]) => `<button role="tab" class="tb ${k === tab ? "on" : ""}" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`).join("")}</div>
      <div id="pane"></div>`;
    root.querySelector(".tabbar").addEventListener("click", async e => {
      const b = e.target.closest("[data-tab]"); if (!b || b.dataset.tab === tab) return;
      if (dirty && !(await confirmBox("You have checklist changes that are not saved. Leave them?", { ok: "Leave without saving", danger: true }))) return;
      if (dirty) { draft = clone(currentChecklist()); dirty = false; }
      tab = b.dataset.tab; history.replaceState(null, "", "#/settings?tab=" + tab);
      root.querySelectorAll(".tb").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-selected", x === b); });
      pane();
    });
    const cs = root.querySelector("#copy-sql");
    if (cs) cs.addEventListener("click", async () => { try { await navigator.clipboard.writeText(SETTINGS_SQL); toast("SQL copied."); } catch (e) { toast("Select the text and copy it.", "error"); } });
    pane();
  }
  function pane() { ({ checklist: paneChecklist, lists: paneLists, dashboard: paneDashboard, reports: paneReports })[tab](); }
  async function save(key, value, okMsg) {
    try { await saveSettings(api, key, value, me.name || me.display_name || ""); toast(okMsg); return true; }
    catch (e) { toast(settingsState.missingTable || /app_settings|schema cache/i.test(e.message) ? "Settings can't be saved until the database update at the top of this page is run." : e.message, "error"); return false; }
  }

  // ------------------------------------------------------------- checklist
  function paneChecklist() {
    const p = root.querySelector("#pane");
    const active = draft.topics.filter(t => t.active), nActive = active.reduce((n, t) => n + t.items.filter(i => i.active).length, 0);
    p.innerHTML = `
      <div class="card set-head">
        <div><b>${active.length} topics · ${nActive} active checks</b><p class="muted small">${saved("checklist")}. Switched-off checks disappear from new audits; old audits keep them.</p></div>
        <div class="btnrow">
          <span class="pill ${dirty ? "warn" : "ok"}" id="dirty">${dirty ? "Changes not saved" : "All saved"}</span>
          <button class="btn ghost" data-act="add-topic">${ICON.plus} Add topic</button>
          <button class="btn ghost" data-act="undo" ${dirty ? "" : "disabled"}>Undo changes</button>
          <button class="btn primary" data-act="save" ${dirty ? "" : "disabled"}>Save checklist</button>
        </div>
      </div>
      <div class="tlist">${draft.topics.map((t, ti) => topicCard(t, ti)).join("")}</div>
      <div class="btnrow"><button class="btn ghost danger" data-act="restore">Restore the original 109 checks</button></div>`;
  }
  function topicCard(t, ti) {
    const on = open.has(t.code), n = t.items.filter(i => i.active).length;
    const canDelete = !usedTopics.has(t.code) && !t.items.some(i => usedItems.has(i.id)) && !DEFAULT_CHECKLIST.topics.some(d => d.code === t.code);
    return `<section class="tcard ${t.active ? "" : "off"}" data-ti="${ti}">
      <div class="tc-head">
        <button class="tc-toggle" data-act="toggle" aria-expanded="${on}"><span class="tc-code">${esc(t.code)}</span><span class="tc-title"><b>${esc(t.name)}</b><small class="muted">${n} active check${n === 1 ? "" : "s"}${t.active ? "" : " · switched off"}</small></span></button>
        <label class="switch" title="Show this topic in new audits"><input type="checkbox" data-f="active" ${t.active ? "checked" : ""}><span>${t.active ? "On" : "Off"}</span></label>
        <button class="icon-btn sm" data-act="up" title="Move up" aria-label="Move ${esc(t.name)} up" ${ti === 0 ? "disabled" : ""}>${ICON.up}</button>
        <button class="icon-btn sm" data-act="down" title="Move down" aria-label="Move ${esc(t.name)} down" ${ti === draft.topics.length - 1 ? "disabled" : ""}>${ICON.down}</button>
        ${canDelete ? `<button class="icon-btn sm danger" data-act="del-topic" title="Delete topic" aria-label="Delete ${esc(t.name)}">${ICON.trash}</button>` : ""}
      </div>
      ${on ? `<div class="tc-body">
        <div class="form-grid">
          <label class="fld"><span>Topic name</span><input data-f="name" value="${esc(t.name)}"></label>
          <label class="fld"><span>Words that point to this topic when importing Excel (comma separated)</span><input data-f="keywords" value="${esc(t.keywords || "")}" placeholder="e.g. scaffold, harness, ladder"></label>
          <label class="fld span2"><span>What to photograph (shown to the auditor)</span><textarea data-f="photo" rows="2">${esc(t.photo || "")}</textarea></label>
        </div>
        <table class="tbl compact items-tbl"><thead><tr><th>ID</th><th>Check</th><th>Risk if not compliant</th><th>Active</th><th></th></tr></thead><tbody>
        ${t.items.map((it, ii) => `<tr data-ii="${ii}" class="${it.active ? "" : "off"}"><td class="nowrap"><code>${esc(it.id)}</code></td>
          <td><textarea data-i="text" rows="2">${esc(it.text)}</textarea></td>
          <td><select data-i="risk">${[["High", "High"], ["Med", "Medium"], ["Low", "Low"]].map(([v, l]) => `<option value="${v}" ${it.risk === v ? "selected" : ""}>${l}</option>`).join("")}</select></td>
          <td class="center"><input type="checkbox" data-i="active" ${it.active ? "checked" : ""} aria-label="Active"></td>
          <td class="nowrap"><button class="icon-btn sm" data-act="iup" aria-label="Move up" ${ii === 0 ? "disabled" : ""}>${ICON.up}</button><button class="icon-btn sm" data-act="idown" aria-label="Move down" ${ii === t.items.length - 1 ? "disabled" : ""}>${ICON.down}</button>${usedItems.has(it.id) ? "" : `<button class="icon-btn sm danger" data-act="idel" aria-label="Delete check" title="Delete (never used)">${ICON.trash}</button>`}</td></tr>`).join("")}
        </tbody></table>
        <button class="btn ghost sm" data-act="add-item">${ICON.plus} Add check</button>
      </div>` : ""}
    </section>`;
  }
  const markDirty = () => { dirty = true; const d = root.querySelector("#dirty"); if (d) { d.textContent = "Changes not saved"; d.className = "pill warn"; } root.querySelectorAll('[data-act="save"],[data-act="undo"]').forEach(b => { b.disabled = false; }); };
  const nextId = t => { const nums = t.items.map(i => parseInt(String(i.id).split("-").pop(), 10)).filter(n => !isNaN(n)); return `${t.code}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, "0")}`; };
  function validate() {
    for (const t of draft.topics) {
      if (!t.name.trim()) return `Topic ${t.code} needs a name.`;
      for (const i of t.items) if (i.active && !i.text.trim()) return `Check ${i.id} has no text. Write it or switch it off.`;
      if (t.active && !t.items.some(i => i.active)) return `Topic ${t.name} is switched on but has no active checks.`;
    }
    if (!draft.topics.some(t => t.active)) return "At least one topic must be switched on.";
    return null;
  }

  root.addEventListener("input", e => {
    if (tab !== "checklist") return;
    const card = e.target.closest("[data-ti]"); if (!card) return;
    const t = draft.topics[+card.dataset.ti];
    if (e.target.dataset.f && e.target.type !== "checkbox") { t[e.target.dataset.f] = e.target.value; markDirty(); }
    const tr = e.target.closest("[data-ii]");
    if (tr && e.target.dataset.i && e.target.type !== "checkbox") { t.items[+tr.dataset.ii][e.target.dataset.i] = e.target.value; markDirty(); }
  });
  root.addEventListener("change", e => {
    if (tab !== "checklist") return;
    const card = e.target.closest("[data-ti]"); if (!card) return;
    const t = draft.topics[+card.dataset.ti];
    if (e.target.dataset.f === "active") { t.active = e.target.checked; markDirty(); paneChecklist(); }
    const tr = e.target.closest("[data-ii]");
    if (tr && e.target.dataset.i === "active") { t.items[+tr.dataset.ii].active = e.target.checked; markDirty(); tr.classList.toggle("off", !e.target.checked); }
  });
  root.addEventListener("click", async e => {
    if (tab !== "checklist") return;
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act, card = b.closest("[data-ti]"), ti = card ? +card.dataset.ti : -1, t = ti >= 0 ? draft.topics[ti] : null;
    const tr = b.closest("[data-ii]"), ii = tr ? +tr.dataset.ii : -1;
    const swap = (arr, i, j) => { [arr[i], arr[j]] = [arr[j], arr[i]]; };
    if (act === "toggle") { open.has(t.code) ? open.delete(t.code) : open.add(t.code); paneChecklist(); return; }
    if (act === "up" && ti > 0) { swap(draft.topics, ti, ti - 1); markDirty(); paneChecklist(); return; }
    if (act === "down" && ti < draft.topics.length - 1) { swap(draft.topics, ti, ti + 1); markDirty(); paneChecklist(); return; }
    if (act === "iup" && ii > 0) { swap(t.items, ii, ii - 1); markDirty(); paneChecklist(); return; }
    if (act === "idown" && ii < t.items.length - 1) { swap(t.items, ii, ii + 1); markDirty(); paneChecklist(); return; }
    if (act === "idel") { if (await confirmBox(`Delete check ${t.items[ii].id}? It has never been used in an audit.`, { ok: "Delete", danger: true })) { t.items.splice(ii, 1); markDirty(); paneChecklist(); } return; }
    if (act === "add-item") { t.items.push({ id: nextId(t), text: "", risk: "Med", active: true }); markDirty(); paneChecklist(); const ta = root.querySelectorAll(`[data-ti="${ti}"] textarea[data-i="text"]`); if (ta.length) ta[ta.length - 1].focus(); return; }
    if (act === "del-topic") { if (await confirmBox(`Delete topic ${t.name}? It has never been used.`, { ok: "Delete topic", danger: true })) { draft.topics.splice(ti, 1); markDirty(); paneChecklist(); } return; }
    if (act === "add-topic") {
      const v = await dialog({
        title: "Add topic",
        body: `<div class="form-grid"><label class="fld"><span>Short code (2–5 letters)</span><input id="nt-code" maxlength="5" placeholder="e.g. ENV"></label><label class="fld"><span>Topic name</span><input id="nt-name" placeholder="e.g. Environment"></label>
          <label class="fld span2"><span>What to photograph (optional)</span><textarea id="nt-photo" rows="2"></textarea></label></div>`,
        actions: [{ label: "Cancel", value: null }, { label: "Add topic", value: w => ({ code: w.querySelector("#nt-code").value.trim().toUpperCase(), name: w.querySelector("#nt-name").value.trim(), photo: w.querySelector("#nt-photo").value.trim() }),
          validate: w => { const c = w.querySelector("#nt-code").value.trim().toUpperCase(); if (!/^[A-Z]{2,5}$/.test(c)) return "The code needs 2 to 5 letters."; if (draft.topics.some(x => x.code === c) || ALL_TOPICS.some(x => x.code === c)) return "That code is already used."; if (!w.querySelector("#nt-name").value.trim()) return "Write the topic name."; return null; } }],
      });
      if (!v) return;
      const nt = { ...v, active: true, keywords: "", items: [] }; nt.items.push({ id: nextId(nt), text: "", risk: "Med", active: true });
      draft.topics.push(nt); open.add(nt.code); markDirty(); paneChecklist();
      root.querySelector(`[data-ti="${draft.topics.length - 1}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (act === "undo") { draft = clone(currentChecklist()); dirty = false; paneChecklist(); return; }
    if (act === "save") {
      const err = validate(); if (err) { toast(err, "error"); return; }
      draft.topics.forEach(x => { x.name = x.name.trim(); x.items = x.items.filter(i => i.text.trim() || usedItems.has(i.id)).map(i => ({ ...i, text: i.text.trim() })); });
      if (await save("checklist", draft, "Checklist saved. New audits use it from now on.")) { draft = clone(currentChecklist()); dirty = false; paneChecklist(); }
      return;
    }
    if (act === "restore") {
      if (!(await confirmBox("Restore the original 13 topics and 109 checks? Topics and checks you added are switched off (kept for old audits).", { ok: "Restore", danger: true }))) return;
      const extra = draft.topics.filter(x => !DEFAULT_CHECKLIST.topics.some(d => d.code === x.code)).map(x => ({ ...x, active: false }));
      draft = { topics: [...clone(DEFAULT_CHECKLIST.topics), ...extra] };
      if (await save("checklist", draft, "Original checklist restored.")) { draft = clone(currentChecklist()); dirty = false; paneChecklist(); }
    }
  });

  // ------------------------------------------------------------- lists
  function paneLists() {
    const p = root.querySelector("#pane");
    p.innerHTML = `<div class="card stack narrow">
      <h2 class="h2">Root causes</h2>
      <p class="muted small">One per line. Auditors pick from these when they record a finding; they can still type their own. ${saved("lists")}.</p>
      <textarea id="rc" rows="14">${esc(RC_LIST.join("\n"))}</textarea>
      <div class="btnrow"><button class="btn primary" id="rc-save">Save root causes</button><button class="btn ghost" id="rc-def">Restore defaults</button></div></div>`;
    p.querySelector("#rc-save").addEventListener("click", async () => {
      const list = [...new Set(p.querySelector("#rc").value.split("\n").map(s => s.trim()).filter(Boolean))];
      if (!list.length) return toast("Write at least one root cause.", "error");
      if (await save("lists", { ...SETTINGS.lists, rootCauses: list }, "Root causes saved.")) paneLists();
    });
    p.querySelector("#rc-def").addEventListener("click", () => { p.querySelector("#rc").value = DEFAULT_RC.join("\n"); });
  }

  // ------------------------------------------------------------- dashboard
  function paneDashboard() {
    const d = SETTINGS.dashboard, p = root.querySelector("#pane"), hidden = new Set(d.hidden || []);
    p.innerHTML = `<div class="card stack">
      <div class="form-grid">
        <label class="fld"><span>Dashboard title</span><input id="d-title" value="${esc(d.title)}"></label>
        <label class="fld"><span>Small line above the title</span><input id="d-eyebrow" value="${esc(d.eyebrow)}"></label>
        <label class="fld"><span>Closure rate target %</span><input id="d-ct" type="number" min="1" max="100" value="${esc(d.closureTarget)}"></label>
        <label class="fld"><span>Checklist compliance target %</span><input id="d-pt" type="number" min="1" max="100" value="${esc(d.complianceTarget)}"></label>
        <label class="fld"><span>Period shown when the dashboard opens</span><select id="d-period">${[["all", "All time"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["180", "Last 6 months"], ["year", "This year"]].map(([v, l]) => `<option value="${v}" ${d.defaultPeriod === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <h3 class="h2">What the dashboard shows</h3>
      <div class="checkgrid">${DASH_PANELS.map(([id, l]) => `<label class="check"><input type="checkbox" data-panel="${id}" ${hidden.has(id) ? "" : "checked"}> ${esc(l)}</label>`).join("")}</div>
      <p class="muted small">${saved("dashboard")}. Projects see the same choices on their own dashboard.</p>
      <div class="btnrow"><button class="btn primary" id="d-save">Save dashboard settings</button><button class="btn ghost" id="d-def">Restore defaults</button></div></div>`;
    p.querySelector("#d-save").addEventListener("click", async () => {
      const num = (id, def) => { const n = Math.round(+p.querySelector(id).value); return n >= 1 && n <= 100 ? n : def; };
      const v = { title: p.querySelector("#d-title").value.trim() || DEFAULTS.dashboard.title, eyebrow: p.querySelector("#d-eyebrow").value.trim(), closureTarget: num("#d-ct", 90), complianceTarget: num("#d-pt", 90), defaultPeriod: p.querySelector("#d-period").value,
        hidden: [...p.querySelectorAll("[data-panel]")].filter(c => !c.checked).map(c => c.dataset.panel) };
      if (await save("dashboard", v, "Dashboard settings saved.")) paneDashboard();
    });
    p.querySelector("#d-def").addEventListener("click", async () => { if (await save("dashboard", clone(DEFAULTS.dashboard), "Dashboard settings restored.")) paneDashboard(); });
  }

  // ------------------------------------------------------------- reports & names
  function paneReports() {
    const r = SETTINGS.report, g = SETTINGS.general, p = root.querySelector("#pane");
    p.innerHTML = `<div class="card stack">
      <h2 class="h2">Names in the app</h2>
      <div class="form-grid">
        <label class="fld"><span>System name (top bar)</span><input id="g-app" value="${esc(g.appName)}"></label>
        <label class="fld"><span>Department line (top bar)</span><input id="g-unit" value="${esc(g.unitName)}"></label>
      </div>
      <h2 class="h2">Excel and PowerPoint reports</h2>
      <div class="form-grid">
        <label class="fld"><span>Report title</span><input id="r-title" value="${esc(r.title)}"></label>
        <label class="fld"><span>Department label</span><input id="r-dept" value="${esc(r.dept)}"></label>
        <label class="fld"><span>Form reference</span><input id="r-ref" value="${esc(r.formRef)}"></label>
        <label class="fld"><span>Form revision</span><input id="r-rev" value="${esc(r.formRev)}"></label>
        <label class="fld span2"><span>PowerPoint footer</span><input id="r-foot" value="${esc(r.footer)}"></label>
      </div>
      <p class="muted small">${saved("report")}.</p>
      <div class="btnrow"><button class="btn primary" id="r-save">Save</button></div></div>`;
    p.querySelector("#r-save").addEventListener("click", async () => {
      const val = id => p.querySelector(id).value.trim();
      const ok1 = await save("general", { ...SETTINGS.general, appName: val("#g-app") || DEFAULTS.general.appName, unitName: val("#g-unit") }, "Saved.");
      if (!ok1) return;
      if (await save("report", { title: val("#r-title") || DEFAULTS.report.title, dept: val("#r-dept"), formRef: val("#r-ref"), formRev: val("#r-rev"), footer: val("#r-foot") }, "Names and report labels saved.")) {
        document.querySelector("#brand-name") && (document.querySelector("#brand-name").textContent = SETTINGS.general.appName);
        document.querySelector("#brand-unit") && (document.querySelector("#brand-unit").textContent = SETTINGS.general.unitName);
        paneReports();
      }
    });
  }

  shell();
  return { unmount() {} };
}
