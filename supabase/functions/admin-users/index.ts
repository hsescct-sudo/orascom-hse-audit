// Supabase Edge Function: admin-users
// Manages logins for the HSE Flash Audit system. Only administration users may call it.
// Deploy with "Verify JWT" turned OFF — the function checks the caller itself.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    try { const obj = JSON.parse(keys); const first = Object.values(obj)[0]; if (typeof first === "string") return first; } catch { /* ignore */ }
  }
  throw new Error("No service key available to the function.");
}
const projectEmail = (projectId: string) => `p-${projectId}@projects.hse-audit.internal`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Use POST." });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });

    // Who is calling?
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return reply(401, { error: "Sign in first." });
    const { data: who, error: whoErr } = await admin.auth.getUser(token);
    if (whoErr || !who?.user) return reply(401, { error: "Your session has expired. Sign in again." });
    const { data: prof } = await admin.from("profiles").select("role").eq("user_id", who.user.id).maybeSingle();
    if (prof?.role !== "admin") return reply(403, { error: "Only the administration can manage logins." });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const pw = (p: unknown) => {
      const s = String(p || "");
      if (s.length < 8) throw new Error("Passwords need at least 8 characters.");
      return s;
    };

    if (action === "set_project_login") {
      const password = pw(body.password);
      const { data: project, error } = await admin.from("projects").select("id, code, name, login_user_id").eq("id", body.project_id).maybeSingle();
      if (error || !project) return reply(404, { error: "Project not found." });
      if (project.login_user_id) {
        const { error: e } = await admin.auth.admin.updateUserById(project.login_user_id, { password });
        if (e) throw e;
        return reply(200, { ok: true, message: "Password changed." });
      }
      const { data: created, error: e1 } = await admin.auth.admin.createUser({
        email: projectEmail(project.id), password, email_confirm: true,
        user_metadata: { project_code: project.code, project_name: project.name },
      });
      if (e1 || !created?.user) throw e1 || new Error("Could not create the login.");
      const uid = created.user.id;
      const { error: e2 } = await admin.from("profiles").upsert({ user_id: uid, role: "project", project_id: project.id, display_name: project.name });
      if (e2) throw e2;
      const { error: e3 } = await admin.from("projects").update({ login_user_id: uid }).eq("id", project.id);
      if (e3) throw e3;
      return reply(200, { ok: true, message: "Login created." });
    }

    if (action === "delete_project") {
      const { data: project } = await admin.from("projects").select("id, login_user_id").eq("id", body.project_id).maybeSingle();
      if (!project) return reply(404, { error: "Project not found." });
      // photos first (storage objects are not removed by cascades)
      let removed = 0;
      for (;;) {
        const { data: rows } = await admin.from("finding_photos").select("id, path").eq("project_id", project.id).limit(100);
        if (!rows || !rows.length) break;
        await admin.storage.from("audit-photos").remove(rows.map((r) => r.path));
        await admin.from("finding_photos").delete().in("id", rows.map((r) => r.id));
        removed += rows.length;
      }
      const { error: e1 } = await admin.from("projects").delete().eq("id", project.id);
      if (e1) throw e1;
      if (project.login_user_id) await admin.auth.admin.deleteUser(project.login_user_id);
      return reply(200, { ok: true, photosRemoved: removed });
    }

    if (action === "list_admins") {
      const { data: rows, error } = await admin.from("profiles").select("user_id, display_name, created_at").eq("role", "admin");
      if (error) throw error;
      const out = [];
      for (const r of rows || []) {
        const { data: u } = await admin.auth.admin.getUserById(r.user_id);
        out.push({ user_id: r.user_id, name: r.display_name, email: u?.user?.email || "", last_sign_in_at: u?.user?.last_sign_in_at || null, is_me: r.user_id === who.user.id });
      }
      return reply(200, { ok: true, admins: out });
    }

    if (action === "create_admin") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(400, { error: "Enter a valid e-mail address." });
      const password = pw(body.password);
      const { data: created, error: e1 } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (e1 || !created?.user) throw e1 || new Error("Could not create the user.");
      const { error: e2 } = await admin.from("profiles").insert({ user_id: created.user.id, role: "admin", display_name: String(body.name || "").trim() });
      if (e2) throw e2;
      return reply(200, { ok: true, message: "Administrator added." });
    }

    if (action === "set_admin_password") {
      const password = pw(body.password);
      const { data: p } = await admin.from("profiles").select("role").eq("user_id", body.user_id).maybeSingle();
      if (p?.role !== "admin") return reply(404, { error: "Administrator not found." });
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password });
      if (error) throw error;
      return reply(200, { ok: true, message: "Password changed." });
    }

    if (action === "delete_admin") {
      if (body.user_id === who.user.id) return reply(400, { error: "You can't remove your own account." });
      const { data: p } = await admin.from("profiles").select("role").eq("user_id", body.user_id).maybeSingle();
      if (p?.role !== "admin") return reply(404, { error: "Administrator not found." });
      const { error } = await admin.auth.admin.deleteUser(body.user_id);
      if (error) throw error;
      return reply(200, { ok: true, message: "Administrator removed." });
    }

    return reply(400, { error: "Unknown action." });
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as { message?: string })?.message || String(e);
    return reply(400, { error: msg });
  }
});
