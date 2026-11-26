// Local store on the device (IndexedDB). Everything is saved here first, so the
// system works with no internet. sync.js sends changes to the server later.
// Records ("docs") have: id, kind, updated_at, and dirty=1 until the server has them.
const DB_NAME = "oc-hse-audit";
const DB_VERSION = 1;
let db = null;
const cache = new Map(); // id -> doc
const listeners = new Set();
const urlCache = new Map(); // photo id -> object URL

function req(r) { return new Promise((ok, bad) => { r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); }); }
function tx(store, mode = "readonly") { return db.transaction(store, mode).objectStore(store); }

export async function openStore() {
  if (db) return;
  db = await new Promise((ok, bad) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("docs")) d.createObjectStore("docs", { keyPath: "id" });
      if (!d.objectStoreNames.contains("photos")) d.createObjectStore("photos", { keyPath: "id" });
      if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "key" });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => bad(r.error || new Error("This browser can't save data on the device."));
    r.onblocked = () => bad(new Error("Close the other tabs of the audit system and reload."));
  });
  const all = await req(tx("docs").getAll());
  cache.clear();
  for (const d of all) cache.set(d.id, d);
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* optional */ }
}

export const uid = (p = "id") => p + "-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
export const nowISO = () => new Date().toISOString();

export function all(kind, { withDeleted = false } = {}) {
  const out = [];
  for (const d of cache.values()) if (d.kind === kind && (withDeleted || !d.deleted)) out.push(d);
  return out;
}
const seed = (id, d) => { if (d && !snaps.has(id) && (d.kind === "audit" || d.kind === "ncr")) { try { snaps.set(id, structuredClone(d)); } catch (e) { /* ignore */ } } };
export const get = id => { const d = cache.get(id); seed(id, d); return d && !d.deleted ? d : null; };
export const getAny = id => { const d = cache.get(id); seed(id, d); return d || null; };

// Save a record. Pass the full record; updated_at and dirty are set here.
// Change log: who changed an audit or NCR, when, and which fields.
let _actor = "";
export const setActor = n => { _actor = n || ""; };
export const actor = () => _actor;
const LOG_SKIP = new Set(["updated_at", "created_at", "dirty", "server_rev", "history"]);
const short = v => { const s = typeof v === "string" ? v : JSON.stringify(v); return s == null ? "" : s.length > 40 ? s.slice(0, 40) + "…" : s; };
function logChange(prev, d) {
  if (d.kind !== "audit" && d.kind !== "ncr") return null;
  const changes = [];
  if (prev) {
    for (const k of new Set([...Object.keys(prev), ...Object.keys(d)])) {
      if (LOG_SKIP.has(k)) continue;
      if (k === "ratings") { const a = prev.ratings || {}, b = d.ratings || {}; for (const i of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[i] !== b[i]) changes.push(`Item ${i}: ${a[i] ?? "-"} → ${b[i] ?? "-"}`); continue; }
      if (k === "sigs") { const a = prev.sigs || {}, b = d.sigs || {}; for (const i of new Set([...Object.keys(a), ...Object.keys(b)])) if ((a[i] || {}).img !== (b[i] || {}).img) changes.push(`Signature ${i}: ${(b[i] || {}).img ? "signed" : "removed"}`); continue; }
      if (/photos$/.test(k) && JSON.stringify(prev[k] || []) !== JSON.stringify(d[k] || [])) { changes.push(`${k}: ${(prev[k] || []).length} → ${(d[k] || []).length}`); continue; }
      const empty = v => v == null || v === "" || (Array.isArray(v) && !v.length);
      if (empty(prev[k]) && empty(d[k])) continue; // nothing to nothing is not a change
      if (JSON.stringify(prev[k]) !== JSON.stringify(d[k])) changes.push(`${k}: ${short(prev[k])} → ${short(d[k])}`);
    }
    if (!changes.length) return null;
  }
  return { id: uid("log"), kind: "log", audit_id: d.kind === "audit" ? d.id : d.audit_id, project_id: d.project_id, target: d.id, target_kind: d.kind, target_ref: d.ref || "",
    action: !prev ? "Created" : d.deleted ? "Deleted" : "Edited", changes: changes.slice(0, 30), by: _actor, at: nowISO(), created_at: nowISO(), updated_at: nowISO(), dirty: 1 };
}
// The screens edit audits and NCRs in place, so the cache cannot be used to see what changed.
// We keep a copy of the last saved version and compare against that.
const snaps = new Map();
// Edits by the same person on the same record within 2 minutes become one line (typing saves many times).
function coalesceLog(log) {
  let last = null;
  for (const x of cache.values()) if (x.kind === "log" && x.target === log.target && x.by === log.by && (!last || x.at > last.at)) last = x;
  if (!last || last.action !== "Edited" || log.action !== "Edited" || Date.parse(log.at) - Date.parse(last.at) > 120000) return log;
  // status steps, signatures and reasons are audit evidence: never folded into an earlier line
  const key_event = c => /^(status|Signature|return_reason|reopen_reason|repeated|sent):?/.test(c);
  if (log.changes.some(key_event) || last.changes.some(key_event)) return log;
  const key = s => s.split(": ")[0];
  const merged = new Map(last.changes.map(c => [key(c), c]));
  for (const c of log.changes) {
    const o = merged.get(key(c));
    if (o && o.includes(" → ") && c.includes(" → ")) merged.set(key(c), o.split(" → ")[0] + " → " + c.split(" → ").slice(-1)[0]);
    else merged.set(key(c), c);
  }
  const changes = [...merged.values()].filter(c => { const p = c.split(": ").slice(1).join(": ").split(" → "); return p.length < 2 || p[0] !== p[p.length - 1]; }).slice(0, 30);
  return { ...last, changes, at: log.at, updated_at: log.at, dirty: 1 };
}
export async function put(doc, { silent = false, fromServer = false } = {}) {
  const d = { ...doc };
  const _prev = snaps.get(d.id) || cache.get(d.id);
  const _log = fromServer ? null : logChange(_prev, d);
  if (d.kind === "audit" || d.kind === "ncr") { try { snaps.set(d.id, structuredClone(d)); } catch (e) { snaps.delete(d.id); } }
  if (_log) { const lg = coalesceLog(_log); cache.set(lg.id, lg); await req(tx("docs", "readwrite").put(lg)); }
  if (!fromServer) { d.updated_at = nowISO(); d.dirty = 1; if (!d.created_at) d.created_at = d.updated_at; }
  cache.set(d.id, d);
  await req(tx("docs", "readwrite").put(d));
  if (!silent) emit({ type: "put", doc: d, fromServer });
  return d;
}
export async function putMany(docs, opts = {}) {
  const store = db.transaction("docs", "readwrite").objectStore("docs");
  const stamp = nowISO();
  const out = docs.map(doc => {
    const d = { ...doc };
    if (!opts.fromServer) { d.updated_at = d.updated_at && opts.keepDates ? d.updated_at : stamp; d.dirty = opts.clean ? 0 : 1; if (!d.created_at) d.created_at = d.updated_at; }
    cache.set(d.id, d); store.put(d); return d;
  });
  await new Promise((ok, bad) => { store.transaction.oncomplete = ok; store.transaction.onerror = () => bad(store.transaction.error); });
  if (!opts.silent) emit({ type: "bulk", count: out.length, fromServer: !!opts.fromServer });
  return out;
}
export async function remove(id) { const d = cache.get(id); if (d) await put({ ...d, deleted: true }); }
// Hard delete on this device only (used to clear sample data).
export async function purge(ids) {
  const store = db.transaction("docs", "readwrite").objectStore("docs");
  for (const id of ids) { cache.delete(id); store.delete(id); }
  await new Promise(ok => { store.transaction.oncomplete = ok; });
  emit({ type: "bulk", count: ids.length });
}
export const dirtyDocs = () => [...cache.values()].filter(d => d.dirty);
// Mark records as on the server, unless they changed again while sending.
export async function markClean(items, serverStamp) {
  const store = db.transaction("docs", "readwrite").objectStore("docs");
  for (const { id, updated_at } of items) { const d = cache.get(id); if (d && d.updated_at === updated_at) { d.dirty = 0; if (serverStamp) d.server_ts = serverStamp; store.put(d); } }
  await new Promise(ok => { store.transaction.oncomplete = ok; });
}

export function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(e) { for (const fn of listeners) { try { fn(e); } catch (err) { console.error(err); } } }

// ---- meta (settings for this device) ----
export async function meta(key, value) {
  if (value === undefined) { const r = await req(tx("meta").get(key)); return r ? r.value : undefined; }
  await req(tx("meta", "readwrite").put({ key, value }));
  return value;
}

// ---- photos (kept as small JPEGs on the device; uploaded=1 once on the server) ----
export async function putPhoto(blob, { id = uid("ph"), uploaded = 0 } = {}) {
  await req(tx("photos", "readwrite").put({ id, blob, type: blob.type || "image/jpeg", size: blob.size, uploaded, created_at: nowISO() }));
  return id;
}
export async function getPhoto(id) { return (await req(tx("photos").get(id))) || null; }
let photoFetcher = null; // set by sync.js: downloads a photo taken on another device
export const setPhotoFetcher = fn => { photoFetcher = fn; };
export async function photoURL(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const p = await getPhoto(id);
  let blob = p ? p.blob : null;
  if (!blob && photoFetcher) blob = await photoFetcher(id);
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  urlCache.set(id, u);
  return u;
}
export async function pendingPhotos() { return (await req(tx("photos").getAll())).filter(p => !p.uploaded); }
export async function markPhotoUploaded(id) { const p = await getPhoto(id); if (p) { p.uploaded = 1; await req(tx("photos", "readwrite").put(p)); } }
export async function photoCount() { return req(tx("photos").count()); }

export async function wipeAll() {
  for (const s of ["docs", "photos", "meta"]) await req(tx(s, "readwrite").clear());
  cache.clear();
  for (const u of urlCache.values()) URL.revokeObjectURL(u);
  urlCache.clear();
  emit({ type: "bulk", count: 0 });
}

// ---- app settings (one shared record) ----
export const settings = () => get("settings") || { id: "settings", kind: "settings", modules: {}, zeroIsNA: false, orgName: "Orascom Construction" };
export const saveSettings = s => put({ ...settings(), ...s, id: "settings", kind: "settings" });
