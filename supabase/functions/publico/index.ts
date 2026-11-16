// Clarus · Solicitudes desde la pantalla de inicio, sin sesión:
//  - clave: "Olvidé mi contraseña" → avisa (push) a los administradores de la empresa del usuario.
//  - demo:  "Solicitar demostración" → avisa (push) al dueño de la plataforma.
// Nunca revela si un usuario existe. Límite simple contra abuso.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const txt = (v: unknown, n = 200) => String(v ?? "").trim().slice(0, n);
const DOMINIO = "clarus.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const b = await req.json().catch(() => ({}));

  // Límite global: máximo 40 solicitudes por hora
  const hace1h = new Date(Date.now() - 3600e3).toISOString();
  const { count } = await db.from("solicitudes").select("id", { count: "exact", head: true }).gte("creado_at", hace1h);
  if ((count || 0) >= 40) return json({ error: "Demasiadas solicitudes. Intenta más tarde." }, 429);

  const { data: sec } = await db.from("app_secretos").select("clave, valor");
  const S = Object.fromEntries((sec || []).map((r) => [r.clave, r.valor]));
  webpush.setVapidDetails("mailto:soporte@clarus.app", S.vapid_publica, S.vapid_privada);
  const push = async (uids: string[], payload: Record<string, unknown>) => {
    if (!uids.length) return;
    const { data: subs } = await db.from("push_suscripciones").select("endpoint, p256dh, auth").in("user_id", uids);
    for (const s of subs || []) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: "high" }); }
      catch (e) { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) await db.from("push_suscripciones").delete().eq("endpoint", s.endpoint); }
    }
  };

  if (b.tipo === "clave") {
    const usuario = txt(b.usuario, 60).toLowerCase().replace(/@.*$/, "");
    if (!/^[a-z0-9._-]{2,30}$/.test(usuario)) return json({ error: "Escribe tu usuario" }, 400);
    // Buscar el usuario sin revelar si existe
    const { data: lista } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const au = (lista?.users || []).find((u) => (u.email || "").toLowerCase() === `${usuario}@${DOMINIO}`);
    if (au) {
      const { data: p } = await db.from("perfiles").select("id, nombre, empresa_id, activo").eq("id", au.id).maybeSingle();
      if (p?.activo) {
        const hace30 = new Date(Date.now() - 30 * 60e3).toISOString();
        const { data: dup } = await db.from("solicitudes").select("id").eq("tipo", "clave").eq("perfil_id", p.id).eq("estado", "pendiente").gte("creado_at", hace30).limit(1);
        if (!dup?.length) {
          await db.from("solicitudes").insert({ tipo: "clave", empresa_id: p.empresa_id, perfil_id: p.id, usuario, nombre: p.nombre, mensaje: txt(b.mensaje, 300) || null });
          const { data: adm } = await db.from("perfiles").select("id, rol").eq("empresa_id", p.empresa_id).eq("activo", true).in("rol", ["admin", "supervisor"]);
          const { data: perm } = await db.from("permisos_rol").select("rol").eq("empresa_id", p.empresa_id).eq("permiso", "usuarios").eq("permitido", true);
          const rolesOk = new Set(["admin", ...(perm || []).map((x) => x.rol)]);
          await push((adm || []).filter((a) => rolesOk.has(a.rol) && a.id !== p.id).map((a) => a.id),
            { title: "Olvidó su contraseña", body: `${p.nombre} pide una contraseña nueva. Toca para asignarla.`, url: "#config", tag: "clave-" + p.id });
        }
      }
    }
    return json({ ok: true });
  }

  if (b.tipo === "demo") {
    const nombre = txt(b.nombre, 80), empresa = txt(b.empresa, 100), telefono = txt(b.telefono, 30), correo = txt(b.correo, 120);
    if (!nombre || !empresa) return json({ error: "Escribe tu nombre y el de tu empresa" }, 400);
    if (!telefono && !correo) return json({ error: "Déjanos un teléfono o un correo para contactarte" }, 400);
    if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return json({ error: "Revisa el correo" }, 400);
    await db.from("solicitudes").insert({ tipo: "demo", nombre, empresa_nombre: empresa, telefono: telefono || null, correo: correo || null, rubro: txt(b.rubro, 60) || null, vendedores: txt(b.vendedores, 20) || null, mensaje: txt(b.mensaje, 600) || null });
    if (S.dueno_plataforma) await push([S.dueno_plataforma], { title: "Nuevo interesado en Clarus", body: `${nombre} · ${empresa}${telefono ? " · " + telefono : ""}`, url: "#config", tag: "demo" });
    return json({ ok: true });
  }
  return json({ error: "Solicitud no válida" }, 400);
});
