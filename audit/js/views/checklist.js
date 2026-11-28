// Flash checklist editor (administrators). Change the wording or risk of a check, add checks to a
// topic, or take a check off the list. Changes apply to new Flash audits; a check taken off the list
// stays in audits that already answered it, so their scores don't change.
import * as S from "../store.js";
import * as M from "../model.js";
import { setTitle, setActions } from "../app.js";
import { esc, toast, confirmBox } from "../ui.js";
import { MODULES } from "../templates.js";

const RISKS = [["High", "High"], ["Med", "Medium"], ["Low", "Low"]];

export async function render(ctx) {
  const { view } = ctx;
  setTitle("Flash checklist", `${MODULES.flash.formRef}, used for new Flash audits`);
  if (!M.isAdmin()) { setActions(""); view.innerHTML = `<div class="panel"><p>Only an administrator changes the checklist.</p></div>`; return; }
  const base = MODULES.flash;
  const baseItem = {}; base.parts.forEach(p => p.items.forEach(it => { baseItem[it.id] = it; }));
  // working copy: one row per check, in topic order
  let rows = M.def("flash").parts.flatMap(p => p.items.map(it => ({ id: it.id, part: p.id, title: it.title, risk: it.risk || "Med", on: !it.retired, added: !!it.added })));
  const used = new Set(M.audits("flash").flatMap(a => Object.keys(a.ratings || {})));

  const nextId = part => {
    const nums = rows.filter(r => r.part === part).map(r => parseInt(String(r.id).split("-").pop(), 10)).filter(n => !isNaN(n));
    return `${part}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, "0")}`;
  };

  function draw() {
    const on = rows.filter(r => r.on).length;
    view.innerHTML = `
      <p class="muted" style="margin-top:0">${on} checks on the list. Changes apply to new Flash audits. Wording changes also show in old reports. A check taken off the list stays in audits that already answered it, so their scores don't change.</p>
      ${base.parts.map(p => { const list = rows.filter(r => r.part === p.id); return `
      <section class="panel" data-part="${esc(p.id)}"><div class="panel-h"><h2>${esc(p.name)}</h2><span class="muted">${list.filter(r => r.on).length} checks</span>
        <button class="btn sm" type="button" data-add="${esc(p.id)}" style="margin-left:auto">Add a check</button></div>
        <div class="stack" style="gap:8px">${list.map(r => `
          <div class="ck-row ${r.on ? "" : "off"}" data-id="${esc(r.id)}">
            <span class="q-id">${esc(r.id)}</span>
            <textarea rows="2" data-k="title" aria-label="Check ${esc(r.id)}">${esc(r.title)}</textarea>
            <select data-k="risk" aria-label="Risk of ${esc(r.id)}">${RISKS.map(([v, l]) => `<option value="${v}" ${r.risk === v ? "selected" : ""}>${l}</option>`).join("")}</select>
            <label class="tick small"><input type="checkbox" data-k="on" ${r.on ? "checked" : ""}>On the list</label>
            ${r.added ? `<span class="chip">Added</span>` : baseItem[r.id] && (baseItem[r.id].title !== r.title || (baseItem[r.id].risk || "Med") !== r.risk) ? `<span class="chip">Changed</span>` : ""}
          </div>`).join("")}</div>
      </section>`; }).join("")}`;
  }

  view.addEventListener("input", e => {
    const row = e.target.closest("[data-id]"); if (!row) return;
    const r = rows.find(x => x.id === row.dataset.id); const k = e.target.dataset.k;
    if (k === "title") r.title = e.target.value;
    if (k === "risk") r.risk = e.target.value;
    if (k === "on") { r.on = e.target.checked; row.classList.toggle("off", !r.on); }
  });
  view.addEventListener("click", e => {
    const add = e.target.closest("[data-add]"); if (!add) return;
    const part = add.dataset.add;
    const id = nextId(part);
    const last = rows.map(r => r.part).lastIndexOf(part);
    rows.splice(last + 1, 0, { id, part, title: "", risk: "Med", on: true, added: true });
    draw();
    const t = view.querySelector(`[data-id="${CSS.escape(id)}"] textarea`); if (t) t.focus();
  });

  async function save() {
    const empty = rows.find(r => r.on && !r.title.trim());
    if (empty) { toast(`Write the text of check ${empty.id}, or take it off the list.`, "error"); return; }
    const items = {}, added = [];
    for (const r of rows) {
      const title = r.title.trim();
      if (r.added) {
        if (!title && !used.has(r.id)) continue; // a new empty row nobody used
        added.push({ id: r.id, part: r.part, title, risk: r.risk });
        if (!r.on) items[r.id] = { retired: true };
        continue;
      }
      const b = baseItem[r.id]; const ch = {};
      if (title !== b.title) ch.title = title;
      if (r.risk !== (b.risk || "Med")) ch.risk = r.risk;
      if (!r.on) ch.retired = true;
      if (Object.keys(ch).length) items[r.id] = ch;
    }
    const st = S.settings(); const modules = { ...(st.modules || {}) };
    modules.flash = { ...(modules.flash || {}), items, added };
    await S.saveSettings({ modules });
    toast("Flash checklist saved.", "ok");
    rows = M.def("flash").parts.flatMap(p => p.items.map(it => ({ id: it.id, part: p.id, title: it.title, risk: it.risk || "Med", on: !it.retired, added: !!it.added })));
    draw();
  }
  async function reset() {
    if (!(await confirmBox("The wording and risks go back to the form. Checks you added are taken off the list. Audits that answered them keep them.", { title: "Back to the original list?", ok: "Go back" }))) return;
    const st = S.settings(); const modules = { ...(st.modules || {}) };
    const added = ((modules.flash || {}).added || []).filter(a => used.has(a.id));
    const items = {}; added.forEach(a => { items[a.id] = { retired: true }; });
    modules.flash = { ...(modules.flash || {}), items, added };
    await S.saveSettings({ modules });
    toast("Back to the original list.", "ok");
    rows = M.def("flash").parts.flatMap(p => p.items.map(it => ({ id: it.id, part: p.id, title: it.title, risk: it.risk || "Med", on: !it.retired, added: !!it.added })));
    draw();
  }
  const bar = setActions(`<button class="btn" type="button" id="ck-reset">Back to the original</button><button class="btn primary" type="button" id="ck-save">Save checklist</button>`);
  bar.querySelector("#ck-save").onclick = save;
  bar.querySelector("#ck-reset").onclick = reset;
  draw();
}
