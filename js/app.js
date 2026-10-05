// App shell: config, sign-in, navigation, routing, shared data store.
import { createSupabaseApi, createDemoApi } from "./data.js";
import { $, esc, toast, ICON, dialog } from "./ui.js";
import { loadSettings, SETTINGS } from "./settings.js";
import { installAvailable, installApp, onInstallChange, registerServiceWorker, watchConnection } from "./pwa.js";

const CFG = window.HSE_CONFIG || {};
const useDemo = CFG.demo || !CFG.supabaseUrl || !CFG.supabaseKey;
export const api = useDemo ? createDemoApi() : createSupabaseApi(CFG.supabaseUrl, CFG.supabaseKey);

// ---------- shared store ----------
export const store = {
  projects: [], audits: [], findings: [], photoMeta: [], loaded: false, stale: true, loading: null,
  async load(force = false) {
    if (this.loaded && !this.stale && !force) return this;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const [projects, audits, findings, photoMeta] = await Promise.all([api.listProjects(), api.listAudits(), api.listFindings(), api.listPhotoMeta()]);
      Object.assign(this, { projects, audits, findings, photoMeta, loaded: true, stale: false });
      this.photoCount = {};
      photoMeta.forEach(p => { const k = p.finding_id; this.photoCount[k] = this.photoCount[k] || { violation: 0, closure: 0 }; this.photoCount[k][p.kind]++; });
      return this;
    })();
    try { return await this.loading; } finally { this.loading = null; }
  },
  markStale() { this.stale = true; },
  project(id) { return this.projects.find(p => p.id === id); },
};

// ---------- who is signed in ----------
export const me = { role: null, project_id: null, project_name: "", project_code: "", display_name: "", name: "" };
export const isAdmin = () => me.role === "admin";
const NAME_KEY = "hse-audit:name";
function savedName() { try { return localStorage.getItem(NAME_KEY) || ""; } catch (e) { return ""; } }
function saveName(n) { try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* ignore */ } }
export async function askName() {
  const v = await dialog({
    title: "Your name",
    body: `<p class="muted">Your name is recorded with everything you add or change, so the administration can see who did what.</p><label class="fld"><span>Full name</span><input id="nm" value="${esc(me.name)}" autocomplete="name"></label>`,
    actions: [{ label: "Cancel", value: null }, { label: "Save", value: w => w.querySelector("#nm").value.trim(), validate: w => (w.querySelector("#nm").value.trim() ? null : "Enter your name.") }],
  });
  if (v) { me.name = v; saveName(v); renderChrome(); }
}

export async function changeMyPassword() {
  const v = await dialog({
    title: "Change my password",
    body: `<p class="muted">Use at least 8 characters. Your new password works from the next sign-in; you stay signed in now.</p>
      <label class="fld"><span>New password</span><input id="np1" type="password" autocomplete="new-password"></label>
      <label class="fld"><span>Repeat new password</span><input id="np2" type="password" autocomplete="new-password"></label>`,
    actions: [{ label: "Cancel", value: null }, {
      label: "Change password", value: w => w.querySelector("#np1").value,
      validate: w => { const a = w.querySelector("#np1").value, b = w.querySelector("#np2").value; return a.length < 8 ? "The password needs at least 8 characters." : a !== b ? "The two passwords don't match." : null; }
    }]
  });
  if (!v) return;
  try { await api.changeMyPassword(v); toast("Password changed."); } catch (e) { toast(e.message, "error"); }
}

// ---------- routing ----------
const ROUTES = {
  dashboard: () => import("./views/dashboard.js"),
  register: () => import("./views/register.js"),
  finding: () => import("./views/finding.js"),
  audits: () => import("./views/audits.js"),
  audit: () => import("./views/audit.js"),
  form: () => import("./views/form.js"),
  new: () => import("./views/form.js"),
  import: () => import("./views/import.js"),
  projects: () => import("./views/projects.js"),
  admins: () => import("./views/admins.js"),
  settings: () => import("./views/settings.js"),
  help: () => import("./views/help.js"),
};
const ADMIN_ONLY = new Set(["projects", "admins", "settings"]);
export function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
export function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const [path, qs] = h.split("?");
  const parts = path.split("/").filter(Boolean);
  return { name: parts[0] || "dashboard", params: parts.slice(1), query: Object.fromEntries(new URLSearchParams(qs || "")) };
}

let current = null, routeSeq = 0;
async function route() {
  if (!me.role) return renderLogin();
  const r = parseHash();
  if (!ROUTES[r.name] || (ADMIN_ONLY.has(r.name) && !isAdmin())) { location.replace("#/dashboard"); return; }
  const seq = ++routeSeq;
  renderChrome(r.name);
  // Each page gets a fresh container so no event handlers leak from the previous page.
  const old = $("#view"), view = old.cloneNode(false);
  old.replaceWith(view);
  if (current && current.unmount) { try { current.unmount(); } catch (e) { /* ignore */ } }
  current = null;
  view.innerHTML = `<div class="loading"><span class="spin"></span> Loading…</div>`;
  try {
    const mod = await ROUTES[r.name]();
    if (seq !== routeSeq || !view.isConnected) return;
    view.innerHTML = "";
    current = (await mod.render(view, { ...r, api, store, me, go, isAdmin: isAdmin() })) || null;
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    if (seq !== routeSeq) return;
    if (/session has expired/i.test(e.message)) { await signOut(); return; }
    view.innerHTML = `<div class="empty"><h3>This page couldn't load</h3><p>${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">Reload</button></div>`;
  }
}

// ---------- chrome ----------
const NAV = [
  ["dashboard", "Dashboard", ICON.dash], ["register", "Findings register", ICON.list], ["audits", "Audits", ICON.clip],
  ["new", "New audit", ICON.plus], ["import", "Import Excel report", ICON.upload],
  ["projects", "Projects", ICON.building, true], ["admins", "Administrators", ICON.users, true], ["settings", "Settings", ICON.gear, true],
  ["help", "Help", ICON.help],
];
function renderChrome(active) {
  const app = $("#app");
  if (!app.querySelector(".shell")) {
    app.innerHTML = `<div class="shell">
      <header class="topbar">
        <button class="icon-btn menu-btn" id="menu-btn" aria-label="Menu">${ICON.menu}</button>
        <a class="brand" href="#/dashboard"><img src="assets/orascom-logo.png" alt="Orascom Construction"><span class="brand-t"><b id="brand-name"></b><small id="brand-unit"></small></span></a>
        <div class="grow"></div>
        <button class="btn sm install-btn" id="inst-btn" hidden>${ICON.phone}<span>Install app</span></button>
        <div class="who" id="who"></div>
        <button class="icon-btn" id="pw-btn" title="Change my password" aria-label="Change my password" hidden>${ICON.key}</button>
        <button class="icon-btn" id="signout" title="Sign out" aria-label="Sign out">${ICON.out}</button>
      </header>
      ${api.mode === "demo" ? `<div class="demo-bar">Demo mode — sample data only. Nothing here is real and nothing is saved.</div>` : ""}
      <div class="net-bar" id="net-bar" hidden>No connection. You can look around, but nothing can be saved until you are back online.</div>
      <div class="upd-bar" id="upd-bar" hidden>A new version of the app is ready. <button class="linkish" onclick="location.reload()">Reload now</button></div>
      <div class="body">
        <nav class="side" id="side" aria-label="Main"></nav>
        <main class="view" id="view"></main>
      </div>
    </div>`;
    $("#signout").addEventListener("click", signOut);
    $("#pw-btn").addEventListener("click", changeMyPassword);
    $("#menu-btn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
    $("#side").addEventListener("click", e => { if (e.target.closest("a")) document.body.classList.remove("nav-open"); });
    $("#who").addEventListener("click", e => { if (e.target.closest("[data-name]")) askName(); });
    $("#inst-btn").addEventListener("click", installApp);
    onInstallChange(() => { const b = $("#inst-btn"); if (b) b.hidden = !installAvailable(); });
    watchConnection(on => { const b = $("#net-bar"); if (b) b.hidden = on; });
  }
  $("#inst-btn").hidden = !installAvailable();
  $("#brand-name").textContent = SETTINGS.general.appName || "HSE Flash Audit";
  $("#brand-unit").textContent = SETTINGS.general.unitName || "";
  $("#pw-btn").hidden = !isAdmin();
  const cur = active || parseHash().name;
  $("#side").innerHTML = NAV.filter(n => !n[3] || isAdmin()).map(([k, label, icon]) =>
    `<a href="#/${k}" class="${cur === k || (k === "audits" && (cur === "audit" || cur === "form")) || (k === "register" && cur === "finding") ? "on" : ""}">${icon}<span>${label}</span></a>`).join("")
    + `<div class="side-foot">${isAdmin() ? "Administration" : esc(me.project_name || "")}</div>`;
  $("#who").innerHTML = `<span class="role ${isAdmin() ? "adm" : "prj"}">${isAdmin() ? "Admin" : esc(me.project_code || "Project")}</span>
    <button class="linkish" data-name title="Change your name">${esc(me.name || "Add your name")}</button>`;
}

// ---------- sign in ----------
async function renderLogin() {
  const app = $("#app");
  let projects = [];
  try { projects = await api.loginProjects(); } catch (e) { /* shown below */ }
  app.innerHTML = `<div class="login">
    <div class="login-card">
      <img class="login-logo" src="assets/orascom-logo.png" alt="Orascom Construction">
      <h1>HSE Flash Audit System</h1>
      <p class="muted">Corporate HSE · audits, findings and closure tracking</p>
      ${api.mode === "demo" ? `<p class="demo-note">Demo mode with sample data. Every password is <b>demo1234</b>.</p>` : ""}
      <div class="tabs" role="tablist">
        <button role="tab" class="tab on" data-tab="project" aria-selected="true">Project</button>
        <button role="tab" class="tab" data-tab="admin" aria-selected="false">Administration</button>
      </div>
      <form id="f-project" class="login-form">
        <label class="fld"><span>Project</span><select id="lp" required>${projects.length ? `<option value="">Choose your project…</option>` + projects.map(p => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.code)})</option>`).join("") : `<option value="">No projects yet — ask the administration</option>`}</select></label>
        <label class="fld"><span>Project password</span><input id="lpw" type="password" autocomplete="current-password" required></label>
        <label class="fld"><span>Your name</span><input id="lnm" autocomplete="name" value="${esc(savedName())}" required></label>
        <button class="btn primary wide" type="submit">Sign in</button>
      </form>
      <form id="f-admin" class="login-form" hidden>
        <label class="fld"><span>E-mail</span><input id="la" type="email" autocomplete="username" required></label>
        <label class="fld"><span>Password</span><input id="lapw" type="password" autocomplete="current-password" required></label>
        <label class="fld"><span>Your name</span><input id="lan" autocomplete="name" value="${esc(savedName())}" required></label>
        <button class="btn primary wide" type="submit">Sign in</button>
      </form>
      <p class="login-err" id="lerr" role="alert"></p>
      <button class="btn ghost wide install-login" id="inst-login" ${installAvailable() ? "" : "hidden"}>${ICON.phone} Install the app on this phone</button>
    </div>
  </div>`;
  $("#inst-login").addEventListener("click", installApp);
  onInstallChange(() => { const b = $("#inst-login"); if (b) b.hidden = !installAvailable(); });
  const err = m => { $("#lerr").textContent = m || ""; };
  app.querySelector(".tabs").addEventListener("click", e => {
    const t = e.target.closest("[data-tab]"); if (!t) return;
    app.querySelectorAll(".tab").forEach(b => { b.classList.toggle("on", b === t); b.setAttribute("aria-selected", b === t); });
    $("#f-project").hidden = t.dataset.tab !== "project"; $("#f-admin").hidden = t.dataset.tab !== "admin"; err("");
  });
  const busy = (form, on) => { const b = form.querySelector("button[type=submit]"); b.disabled = on; b.textContent = on ? "Signing in…" : "Sign in"; };
  $("#f-project").addEventListener("submit", async e => {
    e.preventDefault(); err("");
    const pid = $("#lp").value, pw = $("#lpw").value, nm = $("#lnm").value.trim();
    if (!pid) return err("Choose your project.");
    if (!nm) return err("Enter your name.");
    busy(e.target, true);
    try { await api.signInProject(pid, pw); saveName(nm); me.name = nm; await afterSignIn(); }
    catch (x) { err(x.message); busy(e.target, false); }
  });
  $("#f-admin").addEventListener("submit", async e => {
    e.preventDefault(); err("");
    const nm = $("#lan").value.trim();
    if (!nm) return err("Enter your name.");
    busy(e.target, true);
    try { await api.signInAdmin($("#la").value, $("#lapw").value); saveName(nm); me.name = nm; await afterSignIn(); }
    catch (x) { err(x.message); busy(e.target, false); }
  });
}

async function afterSignIn() {
  const w = await api.whoami();
  if (!w) { await api.signOut(); throw new Error("This account isn't linked to a project or to the administration."); }
  Object.assign(me, w);
  me.name = me.name || savedName() || (w.role === "admin" ? (w.display_name || "Administration") : "");
  await loadSettings(api);
  $("#app").innerHTML = "";
  store.loaded = false; store.stale = true;
  if (!location.hash || location.hash === "#/login") location.hash = "#/dashboard";
  await route();
  if (w.role !== "admin" && !me.name) askName();
}

export async function signOut() {
  await api.signOut();
  Object.assign(me, { role: null, project_id: null, project_name: "", project_code: "", display_name: "" });
  store.loaded = false; store.projects = []; store.audits = []; store.findings = [];
  document.body.classList.remove("nav-open");
  renderLogin();
}

// ---------- boot ----------
window.addEventListener("hashchange", () => { if (me.role) route(); });
window.addEventListener("unhandledrejection", e => { const m = e.reason && e.reason.message; if (m) toast(m, "error"); });
registerServiceWorker(() => { const b = $("#upd-bar"); if (b) b.hidden = false; });
(async function boot() {
  try {
    const s = await api.session();
    if (s) { me.name = savedName(); await afterSignIn(); return; }
  } catch (e) { /* fall through to login */ }
  renderLogin();
})();
