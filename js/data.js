// Data layer. Two backends share one interface:
//  - Supabase (production)  - Demo (in-browser sample data, for previews)
import { todayISO, addDays, clone } from "./ui.js";
import { TOPICS, ITEM, ITEM_IDS } from "./checklist.js";

export const BUCKET = "audit-photos";
const PROJECT_EMAIL = id => `p-${id}@projects.hse-audit.internal`;
const FINDING_SELECT = "*, projects(name, code), audits(ref, audit_date, audit_type, source, status)";

function friendly(err) {
  if (!err) return new Error("Something went wrong.");
  const m = String(err.message || err.error_description || err.error || err);
  if (/invalid login credentials/i.test(m)) return new Error("Wrong password. Check it and try again.");
  if (/jwt expired|invalid jwt|not authenticated/i.test(m)) return new Error("Your session has expired. Sign in again.");
  if (/failed to fetch|networkerror|load failed/i.test(m)) return new Error("No connection to the server. Check the internet and try again.");
  if (/row-level security|permission denied/i.test(m)) return new Error("You don't have permission to do that.");
  if (/duplicate key.*projects_code_key/i.test(m)) return new Error("Another project already uses that code.");
  return new Error(m);
}
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "x" + Math.random().toString(16).slice(2) + Date.now().toString(16));

// ======================================================================
export function createSupabaseApi(url, key) {
  const sb = window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "hse-audit-auth" } });
  const urlCache = new Map();
  const q = async p => { const { data, error } = await p; if (error) throw friendly(error); return data; };
  async function fetchAll(build) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const rows = await q(build().range(from, from + 999));
      out.push(...rows);
      if (rows.length < 1000) break;
    }
    return out;
  }
  async function fn(body) {
    const { data, error } = await sb.functions.invoke("admin-users", { body });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) { /* keep */ }
      if (/failed to send a request|fetch/i.test(msg)) msg = "The user-management function isn't reachable. Check it is deployed as 'admin-users'.";
      throw new Error(msg);
    }
    return data;
  }
  async function removePaths(paths) {
    for (const part of chunk(paths, 100)) { if (part.length) await sb.storage.from(BUCKET).remove(part); }
  }

  return {
    mode: "supabase",
    async session() { const { data } = await sb.auth.getSession(); return data.session; },
    onAuthChange(cb) { sb.auth.onAuthStateChange((ev) => cb(ev)); },
    loginProjects: () => q(sb.rpc("login_projects")),
    async signInProject(projectId, password) { const { error } = await sb.auth.signInWithPassword({ email: PROJECT_EMAIL(projectId), password }); if (error) throw friendly(error); },
    async signInAdmin(email, password) { const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password }); if (error) throw friendly(error); },
    async signOut() { await sb.auth.signOut(); urlCache.clear(); },
    async whoami() { const rows = await q(sb.rpc("whoami")); return rows && rows[0] ? rows[0] : null; },
    async changeMyPassword(password) { const { error } = await sb.auth.updateUser({ password }); if (error) throw friendly(error); },

    // projects & users
    listProjects: () => q(sb.from("projects").select("*").order("name")),
    async saveProject(p) {
      const row = { code: p.code, name: p.name, location: p.location || "", pm: p.pm || "", client: p.client || "", active: p.active !== false };
      return p.id ? q(sb.from("projects").update(row).eq("id", p.id).select().single()) : q(sb.from("projects").insert(row).select().single());
    },
    deleteProject: id => fn({ action: "delete_project", project_id: id }),
    setProjectPassword: (id, password) => fn({ action: "set_project_login", project_id: id, password }),
    async listAdmins() { return (await fn({ action: "list_admins" })).admins; },
    createAdmin: (email, name, password) => fn({ action: "create_admin", email, name, password }),
    setAdminPassword: (user_id, password) => fn({ action: "set_admin_password", user_id, password }),
    deleteAdmin: user_id => fn({ action: "delete_admin", user_id }),

    // audits
    listAudits: () => fetchAll(() => sb.from("audits").select("*, projects(name, code)").order("audit_date", { ascending: false }).order("ref", { ascending: false })),
    getAudit: id => q(sb.from("audits").select("*, projects(name, code, pm)").eq("id", id).single()),
    createAudit: a => q(sb.from("audits").insert(a).select("*, projects(name, code, pm)").single()),
    updateAudit: (id, patch) => q(sb.from("audits").update(patch).eq("id", id).select("*, projects(name, code, pm)").single()),
    async deleteAudit(id) {
      const fs = await q(sb.from("findings").select("id").eq("audit_id", id));
      const ids = fs.map(f => f.id);
      for (const part of chunk(ids, 100)) {
        const ph = await q(sb.from("finding_photos").select("path").in("finding_id", part));
        await removePaths(ph.map(p => p.path));
      }
      await q(sb.from("audits").delete().eq("id", id));
    },

    // findings
    listFindings: () => fetchAll(() => sb.from("findings").select(FINDING_SELECT).order("ref", { ascending: false })),
    findingsOfAudit: auditId => q(sb.from("findings").select(FINDING_SELECT).eq("audit_id", auditId).order("seq")),
    getFinding: id => q(sb.from("findings").select(FINDING_SELECT).eq("id", id).single()),
    createFinding: f => q(sb.from("findings").insert(f).select(FINDING_SELECT).single()),
    updateFinding: (id, patch) => q(sb.from("findings").update(patch).eq("id", id).select(FINDING_SELECT).single()),
    async deleteFinding(id) {
      const ph = await q(sb.from("finding_photos").select("path").eq("finding_id", id));
      await removePaths(ph.map(p => p.path));
      await q(sb.from("findings").delete().eq("id", id));
    },
    submitClosure: (id, note, by) => q(sb.rpc("submit_closure", { p_finding: id, p_note: note, p_by: by })),
    reviewClosure: (id, approve, comment, by) => q(sb.rpc("review_closure", { p_finding: id, p_approve: approve, p_comment: comment, p_by: by })),
    setStatus: (id, status, comment, by) => q(sb.rpc("set_finding_status", { p_finding: id, p_status: status, p_comment: comment, p_by: by })),

    // photos
    listPhotoMeta: () => fetchAll(() => sb.from("finding_photos").select("id, finding_id, kind, path, created_at").order("created_at")),
    async photosOf(findingIds) {
      const out = [];
      for (const part of chunk(findingIds, 100)) out.push(...await q(sb.from("finding_photos").select("*").in("finding_id", part).order("created_at")));
      return out;
    },
    async uploadPhoto({ projectId, findingId, kind, blob, by }) {
      const path = `${projectId}/${findingId}/${kind}-${uid()}.jpg`;
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
      if (error) throw friendly(error);
      try {
        return await q(sb.from("finding_photos").insert({ finding_id: findingId, project_id: projectId, kind, path, created_by_name: by || "" }).select().single());
      } catch (e) { await sb.storage.from(BUCKET).remove([path]); throw e; }
    },
    async deletePhoto(photo) {
      await q(sb.from("finding_photos").delete().eq("id", photo.id));
      await sb.storage.from(BUCKET).remove([photo.path]);
      urlCache.delete(photo.path);
    },
    async urls(paths) {
      const now = Date.now(), need = [...new Set(paths)].filter(p => { const c = urlCache.get(p); return !c || c.exp < now; });
      for (const part of chunk(need, 100)) {
        const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(part, 3600);
        if (error) throw friendly(error);
        (data || []).forEach(d => { if (d.signedUrl) urlCache.set(d.path, { url: d.signedUrl, exp: now + 50 * 60 * 1000 }); });
      }
      const out = {}; paths.forEach(p => { const c = urlCache.get(p); if (c) out[p] = c.url; });
      return out;
    },

    // comments
    commentsOf: id => q(sb.from("finding_comments").select("*").eq("finding_id", id).order("created_at")),
    addComment: (id, body, by) => q(sb.from("finding_comments").insert({ finding_id: id, body, author_name: by || "" }).select().single()),
    deleteComment: id => q(sb.from("finding_comments").delete().eq("id", id)),
  };
}

// ======================================================================
// Demo backend: everything lives in memory (resets on reload). Data is invented and labelled as such.
export function createDemoApi() {
  const S = seed();
  let me = null;
  const delay = (v, ms = 80) => new Promise(r => setTimeout(() => r(clone(v)), ms));
  const proj = id => S.projects.find(p => p.id === id);
  const can = pid => me && (me.role === "admin" || me.project_id === pid);
  const withJoin = f => ({ ...f, projects: { name: proj(f.project_id)?.name, code: proj(f.project_id)?.code }, audits: (a => a && { ref: a.ref, audit_date: a.audit_date, audit_type: a.audit_type, source: a.source, status: a.status })(S.audits.find(a => a.id === f.audit_id)) });
  const auditJoin = a => ({ ...a, projects: { name: proj(a.project_id)?.name, code: proj(a.project_id)?.code, pm: proj(a.project_id)?.pm } });
  const need = cond => { if (!cond) throw new Error("You don't have permission to do that."); };
  const comment = (finding_id, kind, body, by, role) => S.comments.push({ id: uid(), finding_id, project_id: S.findings.find(f => f.id === finding_id).project_id, author_name: by || "", author_role: role || (me?.role === "admin" ? "admin" : "project"), kind, body, created_at: new Date().toISOString() });
  let ref = 1000, aref = 100;

  return {
    mode: "demo",
    async session() { return me ? { user: { id: "demo" } } : null; },
    onAuthChange() {},
    loginProjects: () => delay(S.projects.filter(p => p.active).map(p => ({ id: p.id, code: p.code, name: p.name }))),
    async signInProject(projectId, password) { if (password !== "demo1234") throw new Error("Wrong password. In the demo every project password is demo1234."); me = { role: "project", project_id: projectId }; },
    async signInAdmin(email, password) { if (password !== "demo1234") throw new Error("Wrong password. In the demo the admin password is demo1234."); me = { role: "admin", project_id: null, display_name: "Demo Admin" }; },
    async signOut() { me = null; },
    async changeMyPassword(pw) { if (String(pw).length < 8) throw new Error("Passwords need at least 8 characters."); },
    async whoami() { if (!me) return null; const p = proj(me.project_id); return { role: me.role, project_id: me.project_id, project_name: p?.name || null, project_code: p?.code || null, display_name: me.display_name || p?.name || "" }; },

    listProjects: () => delay(S.projects.filter(p => can(p.id)).sort((a, b) => a.name.localeCompare(b.name))),
    async saveProject(p) {
      need(me?.role === "admin");
      if (S.projects.some(x => x.code === p.code && x.id !== p.id)) throw new Error("Another project already uses that code.");
      if (p.id) { Object.assign(proj(p.id), p); return delay(proj(p.id)); }
      const row = { id: uid(), code: p.code, name: p.name, location: p.location || "", pm: p.pm || "", client: p.client || "", active: p.active !== false, login_user_id: null, created_at: new Date().toISOString() };
      S.projects.push(row); return delay(row);
    },
    async deleteProject(id) { need(me?.role === "admin"); const fids = S.findings.filter(f => f.project_id === id).map(f => f.id); S.photos = S.photos.filter(p => !fids.includes(p.finding_id)); S.findings = S.findings.filter(f => f.project_id !== id); S.audits = S.audits.filter(a => a.project_id !== id); S.projects = S.projects.filter(p => p.id !== id); return { ok: true }; },
    async setProjectPassword(id, pw) { need(me?.role === "admin"); if (String(pw).length < 8) throw new Error("Passwords need at least 8 characters."); proj(id).login_user_id = proj(id).login_user_id || uid(); return { ok: true }; },
    async listAdmins() { return delay(S.admins.map(a => ({ ...a, is_me: a.email === "admin@demo.local" }))); },
    async createAdmin(email, name, pw) { if (String(pw).length < 8) throw new Error("Passwords need at least 8 characters."); S.admins.push({ user_id: uid(), email, name, last_sign_in_at: null }); return { ok: true }; },
    async setAdminPassword() { return { ok: true }; },
    async deleteAdmin(id) { S.admins = S.admins.filter(a => a.user_id !== id); return { ok: true }; },

    listAudits: () => delay(S.audits.filter(a => can(a.project_id)).sort((a, b) => (b.audit_date + b.ref).localeCompare(a.audit_date + a.ref)).map(auditJoin)),
    getAudit: id => { const a = S.audits.find(x => x.id === id); need(a && can(a.project_id)); return delay(auditJoin(a)); },
    async createAudit(a) {
      need(can(a.project_id));
      const row = { id: uid(), ref: ++aref, audit_date: todayISO(), audit_type: me.role === "admin" ? (a.audit_type || "corporate") : "project", source: "form", auditor: "", pm: "", poc: null, manpower: null, areas: "", scope: "", conclusion: "", checks: {}, status: "draft", file_name: "", created_by_name: "", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...a };
      if (me.role !== "admin") row.audit_type = "project";
      S.audits.push(row); return delay(auditJoin(row));
    },
    async updateAudit(id, patch) {
      const a = S.audits.find(x => x.id === id); need(a && can(a.project_id));
      if (me.role !== "admin" && a.status === "submitted") throw new Error("This audit is submitted. Only the administration can change it.");
      Object.assign(a, patch, { updated_at: new Date().toISOString() }); return delay(auditJoin(a));
    },
    async deleteAudit(id) {
      const a = S.audits.find(x => x.id === id); need(a && can(a.project_id));
      if (me.role !== "admin" && a.status === "submitted") throw new Error("This audit is submitted. Only the administration can delete it.");
      const fids = S.findings.filter(f => f.audit_id === id).map(f => f.id);
      S.photos = S.photos.filter(p => !fids.includes(p.finding_id)); S.findings = S.findings.filter(f => f.audit_id !== id); S.audits = S.audits.filter(x => x.id !== id);
    },

    listFindings: () => delay(S.findings.filter(f => can(f.project_id)).sort((a, b) => b.ref - a.ref).map(withJoin)),
    findingsOfAudit: id => delay(S.findings.filter(f => f.audit_id === id && can(f.project_id)).sort((a, b) => a.seq - b.seq).map(withJoin)),
    getFinding: id => { const f = S.findings.find(x => x.id === id); need(f && can(f.project_id)); return delay(withJoin(f)); },
    async createFinding(f) {
      const a = S.audits.find(x => x.id === f.audit_id); need(a && can(a.project_id));
      if (me.role !== "admin" && a.status === "submitted") throw new Error("This audit is submitted. Findings can no longer be added.");
      const row = { id: uid(), ref: ++ref, seq: 1, item_id: "", topic: "GEN", area: "", observation: "", risk: "Med", root_cause: "", immediate_action: "", interim_control: "", action_plan: "", owner: "", target_date: null, fixed_on_spot: false, needs_support: false, support_title: "", status: "open", closure_note: "", closure_submitted_at: null, closure_submitted_by: "", closed_at: null, closed_by: "", created_by_name: "", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...f, project_id: a.project_id };
      if (row.status === "closed") { if (me.role === "admin") row.closed_at = new Date().toISOString(); else { row.status = "pending"; row.closure_submitted_at = new Date().toISOString(); } }
      S.findings.push(row); return delay(withJoin(row));
    },
    async updateFinding(id, patch) {
      const f = S.findings.find(x => x.id === id); need(f && can(f.project_id));
      const a = S.audits.find(x => x.id === f.audit_id);
      if (me.role !== "admin") { if (a.status === "submitted") throw new Error('This audit is submitted. Use "Submit closure" to close the finding.'); if (patch.status === "closed") patch.status = "pending"; }
      Object.assign(f, patch, { updated_at: new Date().toISOString() });
      if (f.status === "closed" && !f.closed_at) f.closed_at = new Date().toISOString();
      return delay(withJoin(f));
    },
    async deleteFinding(id) {
      const f = S.findings.find(x => x.id === id); need(f && can(f.project_id));
      if (me.role !== "admin" && S.audits.find(a => a.id === f.audit_id).status === "submitted") throw new Error("This audit is submitted. Only the administration can delete findings.");
      S.photos = S.photos.filter(p => p.finding_id !== id); S.findings = S.findings.filter(x => x.id !== id);
    },
    async submitClosure(id, note, by) {
      const f = S.findings.find(x => x.id === id); need(f && can(f.project_id));
      if (f.status === "closed") throw new Error("This finding is already closed.");
      if (!String(note || "").trim()) throw new Error("Describe the action taken to close the finding.");
      Object.assign(f, { status: "pending", closure_note: note, closure_submitted_at: new Date().toISOString(), closure_submitted_by: by });
      comment(id, "submitted", note, by);
    },
    async reviewClosure(id, approve, c, by) {
      need(me?.role === "admin"); const f = S.findings.find(x => x.id === id);
      if (!approve && !String(c || "").trim()) throw new Error("Write the reason for returning the closure.");
      Object.assign(f, approve ? { status: "closed", closed_at: new Date().toISOString(), closed_by: by } : { status: "open", closed_at: null, closed_by: "" });
      comment(id, approve ? "approved" : "rejected", c || "", by, "admin");
    },
    async setStatus(id, status, c, by) {
      need(me?.role === "admin"); const f = S.findings.find(x => x.id === id);
      Object.assign(f, status === "closed" ? { status, closed_at: new Date().toISOString(), closed_by: by } : { status, closed_at: null, closed_by: "" });
      comment(id, status === "closed" ? "closed" : "reopened", c || "", by, "admin");
    },

    listPhotoMeta: () => delay(S.photos.filter(p => can(S.findings.find(f => f.id === p.finding_id)?.project_id)).map(({ id, finding_id, kind, path, created_at }) => ({ id, finding_id, kind, path, created_at }))),
    photosOf: ids => delay(S.photos.filter(p => ids.includes(p.finding_id))),
    async uploadPhoto({ projectId, findingId, kind, blob, by }) {
      const f = S.findings.find(x => x.id === findingId); need(f && can(f.project_id));
      const path = `${projectId}/${findingId}/${kind}-${uid()}.jpg`;
      S.blobs[path] = URL.createObjectURL(blob);
      const row = { id: uid(), finding_id: findingId, project_id: projectId, kind, path, created_by_name: by || "", created_at: new Date().toISOString() };
      S.photos.push(row); return delay(row, 300);
    },
    async deletePhoto(photo) { S.photos = S.photos.filter(p => p.id !== photo.id); },
    async urls(paths) { const out = {}; paths.forEach(p => { out[p] = S.blobs[p] || demoPhoto(p); }); return out; },

    commentsOf: id => delay(S.comments.filter(c => c.finding_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at))),
    async addComment(id, body, by) { comment(id, "comment", body, by); return {}; },
    async deleteComment(id) { S.comments = S.comments.filter(c => c.id !== id); },
  };
}

// --- demo data (clearly invented) ---
const photoCache = {};
function demoPhoto(path) {
  if (photoCache[path]) return photoCache[path];
  let h = 0; for (const ch of path) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const c = document.createElement("canvas"); c.width = 480; c.height = 360;
  const g = c.getContext("2d");
  const hue = h % 360, closure = path.includes("/closure-");
  const grd = g.createLinearGradient(0, 0, 480, 360);
  grd.addColorStop(0, `hsl(${hue},25%,${closure ? 70 : 55}%)`); grd.addColorStop(1, `hsl(${(hue + 40) % 360},30%,${closure ? 55 : 35}%)`);
  g.fillStyle = grd; g.fillRect(0, 0, 480, 360);
  g.fillStyle = "rgba(255,255,255,.85)"; g.font = "bold 26px Segoe UI, sans-serif"; g.textAlign = "center";
  g.fillText(closure ? "Closure photo" : "Site photo", 240, 170); g.font = "18px Segoe UI, sans-serif"; g.fillText("Demo image", 240, 205);
  return (photoCache[path] = c.toDataURL("image/jpeg", 0.7));
}
function seed() {
  let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const projects = [
    ["demo-a", "Demo Project A – Water Treatment Plant", "Jubail", "PM Demo A"], ["demo-b", "Demo Project B – Power Plant Expansion", "Eastern Province", "PM Demo B"],
    ["demo-c", "Demo Project C – Metro Station Package", "Riyadh", "PM Demo C"], ["demo-d", "Demo Project D – Industrial Building", "Dammam", "PM Demo D"],
    ["demo-e", "Demo Project E – Desalination Intake", "Al Khobar", "PM Demo E"], ["demo-f", "Demo Project F – Substation Works", "Jeddah", "PM Demo F"],
  ].map(([code, name, location, pm], i) => ({ id: "p" + i + "-demo", code, name, location, pm, client: "Demo Client", active: true, login_user_id: "u" + i, created_at: "2026-04-01T08:00:00Z" }));
  const weak = { "p0-demo": ["WAH", "TRF", "HKP"], "p1-demo": ["LFT", "PTW", "ELE"], "p2-demo": ["EXC", "FOB", "WAH"], "p3-demo": ["FIR", "HKP", "ELE"], "p4-demo": ["CSE", "EMR"], "p5-demo": ["ELE", "LOF", "TRF"] };
  const areas = ["Main yard", "Laydown area", "Process area", "Substation", "Workshop", "Batching plant", "Pipe rack", "Tank farm", "Site office", "Gate 2"];
  const owners = ["Site Supervisor", "Scaffolding Foreman", "Electrical Engineer", "Logistics Lead", "Civil Engineer", "HSE Officer"];
  const RC = ["Lack of Supervision", "Lack of Inspection", "Lack of Training / Competence", "Inadequate Planning / Risk Assessment", "Procedure Not Followed", "Lack of Resources", "Lack of Coordination"];
  const audits = [], findings = [], photos = [], comments = [];
  const today = todayISO();
  let aref = 0, fref = 0;
  projects.forEach((p, pi) => {
    const nAud = 3 + (pi % 3);
    for (let k = 0; k < nAud; k++) {
      const date = addDays(today, -Math.floor(10 + rnd() * 170));
      const type = k % 2 ? "corporate" : "project";
      const checks = {};
      const aId = `a-${pi}-${k}`;
      let seq = 0;
      ITEM_IDS.forEach(id => {
        const it = ITEM[id]; const isWeak = weak[p.id].includes(it.topic);
        const x = rnd();
        if (x < (isWeak ? 0.16 : 0.05)) checks[id] = "nc"; else if (x < 0.82) checks[id] = "ok"; else checks[id] = "na";
      });
      audits.push({ id: aId, ref: ++aref, project_id: p.id, audit_date: date, audit_type: type, source: k === 2 ? "excel" : "form", auditor: type === "corporate" ? "Corporate HSE (demo)" : "Project HSE (demo)", pm: p.pm, poc: 20 + Math.floor(rnd() * 70), manpower: 300 + Math.floor(rnd() * 1500), areas: pick(areas) + ", " + pick(areas), scope: "", conclusion: "", checks, status: "submitted", file_name: "", created_by_name: "Demo", created_at: date + "T09:00:00Z", updated_at: date + "T09:00:00Z" });
      Object.keys(checks).filter(id => checks[id] === "nc").forEach(id => {
        const it = ITEM[id]; seq++;
        const fixed = rnd() < 0.45;
        const age = daysSince(date, today);
        const target = fixed ? date : addDays(date, 3 + Math.floor(rnd() * 14));
        let status = "open";
        if (fixed) status = "closed";
        else if (age > 20 && rnd() < 0.75) status = "closed";
        else if (rnd() < 0.25) status = "pending";
        const risk = rnd() < 0.15 ? (it.risk === "High" ? "Med" : "High") : it.risk;
        const fid = `f-${pi}-${k}-${seq}`;
        const closedAt = status === "closed" ? addDays(date, fixed ? 0 : 2 + Math.floor(rnd() * 12)) + "T15:00:00Z" : null;
        findings.push({ id: fid, ref: ++fref, audit_id: aId, project_id: p.id, seq, item_id: id, topic: it.topic, area: pick(areas), observation: "Not compliant: " + it.text.charAt(0).toLowerCase() + it.text.slice(1) + ".", risk, root_cause: pick(RC) + (rnd() < 0.4 ? "\n" + pick(RC) : ""), immediate_action: fixed ? "Corrected on site during the audit and the crew re-briefed." : "", interim_control: fixed ? "" : "Area barricaded and work restricted until corrected.", action_plan: fixed ? "" : "Permanent correction agreed with the site team.", owner: pick(owners), target_date: target, fixed_on_spot: fixed, needs_support: !fixed && risk === "High" && rnd() < 0.3, support_title: "", status, closure_note: status !== "open" ? "Corrected and verified on site." : "", closure_submitted_at: status !== "open" ? closedAt || date + "T12:00:00Z" : null, closure_submitted_by: status !== "open" ? "Site HSE" : "", closed_at: closedAt, closed_by: status === "closed" ? "Demo Admin" : "", created_by_name: "Demo", created_at: date + "T10:00:00Z", updated_at: date + "T10:00:00Z" });
        photos.push({ id: fid + "-v", finding_id: fid, project_id: p.id, kind: "violation", path: `${p.id}/${fid}/violation-1.jpg`, created_by_name: "Demo", created_at: date + "T10:00:00Z" });
        if (status !== "open") photos.push({ id: fid + "-c", finding_id: fid, project_id: p.id, kind: "closure", path: `${p.id}/${fid}/closure-1.jpg`, created_by_name: "Demo", created_at: date + "T12:00:00Z" });
        if (status === "closed" && !fixed) { comments.push({ id: fid + "-c1", finding_id: fid, project_id: p.id, author_name: "Site HSE", author_role: "project", kind: "submitted", body: "Corrected and verified on site.", created_at: closedAt }); comments.push({ id: fid + "-c2", finding_id: fid, project_id: p.id, author_name: "Demo Admin", author_role: "admin", kind: "approved", body: "Verified from photo.", created_at: closedAt }); }
      });
    }
  });
  return { projects, audits, findings, photos, comments, blobs: {}, admins: [{ user_id: "adm1", email: "admin@demo.local", name: "Demo Admin", last_sign_in_at: new Date().toISOString() }] };
}
function daysSince(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
export { TOPICS };
