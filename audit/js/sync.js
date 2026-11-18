// Sync between this device and the server (Supabase).
// The device is the first place every change is saved. When there is internet,
// changes are sent (newest change wins on the server) and new changes are pulled.
// Photos go to a private storage bucket. Sample mode never talks to the server.
import * as S from "./store.js";
import { ensureSupabase, toast } from "./ui.js";

const CFG = window.HSE_AUDIT_CONFIG || {};
const BUCKET = CFG.photoBucket || "audit-photos";
const listeners = new Set();
let st = { mode: "demo", online: navigator.onLine, pending: 0, syncing: false, error: "", last: null, needLogin: false };
let client = null, timer = null, running = null, again = false, started = false;
const emit = () => { for (const fn of listeners) { try { fn({ ...st }); } catch (e) { console.error(e); } } };

export const status = () => ({ ...st });
export const on = fn => { listeners.add(fn); return () => listeners.delete(fn); };

async function getClient() {
  if (client) return client;
  const sb = await ensureSupabase();
  // Own storage key: the Flash Audit system on the same site keeps its own sign-in.
  client = sb.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "oc-hse-audit-auth" } });
  return client;
}

const nice = e => {
  const m = String((e && (e.message || e.error_description)) || e || "");
  if (/Invalid login credentials/i.test(m)) return "Wrong e-mail or password.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "No connection to the server. Check the internet and try again.";
  if (/ha_me|ha_push|ha_docs|does not exist|schema cache/i.test(m)) return "The audit tables are not set up on the server yet. Run supabase/audit-schema.sql once.";
  if (/JWT|refresh token|not authenticated/i.test(m)) return "Your sign-in has ended. Sign in again to send your changes.";
  return m || "Something went wrong.";
};

export async function signIn(email, password) {
  const c = await getClient();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(nice(error));
  const { data, error: e2 } = await c.rpc("ha_me");
  if (e2) { await c.auth.signOut(); throw new Error(nice(e2)); }
  const me = Array.isArray(data) ? data[0] : data;
  if (!me) { await c.auth.signOut(); throw new Error("This e-mail is not in the audit system. Ask Corporate HSE to add you under Auditors and users."); }
  const member = { id: me.id, kind: "member", name: me.name, email: me.email, role: me.role, position: me.position || "", active: true };
  await S.meta("me", member);
  if (!S.get(member.id)) await S.putMany([{ ...member, updated_at: new Date(0).toISOString() }], { fromServer: true, silent: true });
  return member;
}

// Back to the last session on this device, even with no internet.
export async function resume() {
  const me = await S.meta("me");
  if (!me) return null;
  const local = S.get(me.id);
  return local ? { ...me, ...local } : me;
}

export async function signOut() {
  try { const c = await getClient(); await c.auth.signOut(); } catch (e) { /* offline */ }
  await S.wipeAll();
}

export function init(mode) {
  st.mode = mode;
  if (started) return; started = true;
  window.addEventListener("online", () => { st.online = true; emit(); syncNow(); });
  window.addEventListener("offline", () => { st.online = false; emit(); });
  if (mode !== "cloud") { emit(); return; }
  S.setPhotoFetcher(fetchPhoto);
  S.on(e => { if (!e.fromServer) { countPending(); schedule(2500); } });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncNow(); });
  timer = setInterval(() => syncNow(), 60000);
  countPending();
  syncNow();
}
function schedule(ms) { clearTimeout(schedule.t); schedule.t = setTimeout(() => syncNow(), ms); }
async function countPending() {
  const docs = S.dirtyDocs().filter(d => !d.sample).length;
  let photos = 0; try { photos = (await S.pendingPhotos()).length; } catch (e) { /* ignore */ }
  st.pending = docs + photos; emit();
}

export async function syncNow(loud = false) {
  if (st.mode !== "cloud") return;
  if (running) { again = true; return running; }
  running = (async () => {
    st.syncing = true; emit();
    try {
      const c = await getClient();
      const { data: sess } = await c.auth.getSession();
      if (!sess || !sess.session) { st.needLogin = true; throw new Error("Your sign-in has ended. Sign in again to send your changes."); }
      st.needLogin = false;
      await pushPhotos(c);
      await pushDocs(c);
      await pull(c);
      st.error = ""; st.online = true; st.last = new Date().toISOString();
      await afterFirstPull();
    } catch (e) {
      st.error = nice(e);
      if (/connection/i.test(st.error)) st.online = false;
      if (loud) toast(st.error, "error");
    } finally {
      st.syncing = false; running = null; await countPending();
      if (again) { again = false; schedule(500); }
    }
  })();
  return running;
}

async function pushDocs(c) {
  const dirty = S.dirtyDocs().filter(d => !d.sample);
  for (let i = 0; i < dirty.length; i += 150) {
    const batch = dirty.slice(i, i + 150);
    const payload = batch.map(({ dirty: _d, server_ts: _s, ...rest }) => rest);
    const { data, error } = await c.rpc("ha_push", { docs: payload });
    if (error) throw error;
    await S.markClean(batch.map(d => ({ id: d.id, updated_at: d.updated_at })), data);
  }
}

async function pull(c) {
  let cursor = (await S.meta("cursor")) || "1970-01-01T00:00:00Z";
  for (let guard = 0; guard < 50; guard++) {
    const { data, error } = await c.from("ha_docs").select("id,data,deleted,server_ts").gt("server_ts", cursor).order("server_ts", { ascending: true }).limit(500);
    if (error) throw error;
    if (!data.length) break;
    const incoming = [];
    for (const row of data) {
      const doc = { ...row.data, deleted: row.deleted || !!row.data.deleted, server_ts: row.server_ts };
      const local = S.getAny(doc.id);
      // keep my own newer change that hasn't been sent yet
      if (local && local.dirty && (local.updated_at || "") > (doc.updated_at || "")) continue;
      incoming.push({ ...doc, dirty: 0 });
    }
    if (incoming.length) await S.putMany(incoming, { fromServer: true });
    cursor = data[data.length - 1].server_ts;
    await S.meta("cursor", cursor);
    if (data.length < 500) break;
  }
}

async function pushPhotos(c) {
  const list = await S.pendingPhotos();
  for (const p of list) {
    const { error } = await c.storage.from(BUCKET).upload(`${p.id}.jpg`, p.blob, { contentType: p.type || "image/jpeg", upsert: false });
    if (error && !/exists|Duplicate/i.test(error.message || "")) throw error;
    await S.markPhotoUploaded(p.id);
  }
}

// A photo taken on another device: download it once and keep it here.
async function fetchPhoto(id) {
  if (!navigator.onLine) return null;
  try {
    const c = await getClient();
    const { data, error } = await c.storage.from(BUCKET).download(`${id}.jpg`);
    if (error || !data) return null;
    await S.putPhoto(data, { id, uploaded: 1 });
    return data;
  } catch (e) { return null; }
}

// First sign-in of the first admin on an empty server: load the company projects.
async function afterFirstPull() {
  if (await S.meta("seeded")) return;
  await S.meta("seeded", true);
  const me = await S.meta("me");
  if (!me || me.role !== "admin") return;
  if (S.all("project").length) return;
  const { projectDocs } = await import("./seed.js");
  await S.putMany(projectDocs(new Date().toISOString()));
  toast("The company project list was added. You can edit it under Projects.");
  schedule(800);
}
