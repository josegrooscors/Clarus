// Clarus · Solicitudes desde la pantalla de inicio, sin sesión:
//  - clave: "Olvidé mi contraseña" → avisa (push) a los administradores y abre un ticket en Soporte.
//  - demo:  "Solicitar demostración" → avisa (push) al dueño de la plataforma.
//  - registro: prueba gratis de 15 días → crea la empresa y su administrador con correo y contraseña; entra de inmediato.
//  - contratar: (con sesión) la empresa en prueba quiere pagar → avisa al dueño de la plataforma.
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

  // alias: la persona escribió su nombre ("Diranis", "Itzel Pérez") en vez de su usuario → devuelve el usuario si hay UNA sola coincidencia
  if (b.tipo === "alias") {
    const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const q = norm(txt(b.nombre, 80));
    if (q.length < 3) return json({ usuario: null });
    const { data: ps } = await db.from("perfiles").select("id, nombre").eq("activo", true);
    const hits = (ps || []).filter((p) => { const n = norm(p.nombre || ""); return n === q || n.split(/\s+/).includes(q); });
    if (hits.length !== 1) return json({ usuario: null });
    const { data: au } = await db.auth.admin.getUserById(hits[0].id);
    const email = (au?.user?.email || "").toLowerCase();
    return json({ usuario: email.endsWith("@" + DOMINIO) ? email.split("@")[0] : null });
  }

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
    const usuario = txt(b.usuario, 120).toLowerCase();
    const correoBuscado = usuario.includes("@") ? usuario : `${usuario}@${DOMINIO}`;
    if (!/^[a-z0-9._+-]{2,60}(@[^@\s]+\.[^@\s]+)?$/.test(usuario)) return json({ error: "Escribe tu usuario o correo" }, 400);
    // Buscar el usuario sin revelar si existe
    const { data: lista } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const au = (lista?.users || []).find((u) => (u.email || "").toLowerCase() === correoBuscado);
    if (au) {
      const { data: p } = await db.from("perfiles").select("id, nombre, empresa_id, activo").eq("id", au.id).maybeSingle();
      if (p?.activo) {
        const hace30 = new Date(Date.now() - 30 * 60e3).toISOString();
        const { data: dup } = await db.from("solicitudes").select("id").eq("tipo", "clave").eq("perfil_id", p.id).eq("estado", "pendiente").gte("creado_at", hace30).limit(1);
        if (!dup?.length) {
          await db.from("solicitudes").insert({ tipo: "clave", empresa_id: p.empresa_id, perfil_id: p.id, usuario, nombre: p.nombre, mensaje: txt(b.mensaje, 300) || null });
          // También llega al buzón de Soporte del administrador (con botón "Asignar contraseña")
          const { data: tk } = await db.from("soporte_tickets").insert({ empresa_id: p.empresa_id, user_id: p.id, categoria: "otro", asunto: "Olvidé mi contraseña", diagnostico: `Solicitud desde la pantalla de inicio · usuario ${usuario}` }).select("id").single();
          if (tk) await db.from("soporte_mensajes").insert({ ticket_id: tk.id, autor_id: p.id, texto: `${p.nombre} (usuario ${usuario}) pide una contraseña nueva desde la pantalla de inicio.${b.mensaje ? "\nMensaje: " + txt(b.mensaje, 300) : ""}` });
          const { data: adm } = await db.from("perfiles").select("id, rol").eq("empresa_id", p.empresa_id).eq("activo", true).in("rol", ["admin", "supervisor"]);
          const { data: perm } = await db.from("permisos_rol").select("rol").eq("empresa_id", p.empresa_id).eq("permiso", "usuarios").eq("permitido", true);
          const rolesOk = new Set(["admin", ...(perm || []).map((x) => x.rol)]);
          await push((adm || []).filter((a) => rolesOk.has(a.rol) && a.id !== p.id).map((a) => a.id),
            { title: "Olvidó su contraseña", body: `${p.nombre} pide una contraseña nueva. Toca para asignarla.`, url: tk ? "#soporte/" + tk.id : "#config", tag: "clave-" + p.id });
        }
      }
    }
    return json({ ok: true });
  }

  if (b.tipo === "registro") {
    const nombre = txt(b.nombre, 80), empresa = txt(b.empresa, 100), correo = txt(b.correo, 120).toLowerCase(), password = String(b.password ?? "");
    const telefono = txt(b.telefono, 30);
    if (!nombre || !empresa) return json({ error: "Escribe tu nombre y el de tu empresa" }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return json({ error: "Revisa tu correo" }, 400);
    if (correo.endsWith("@" + DOMINIO)) return json({ error: "Usa tu correo de trabajo" }, 400);
    if (password.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);
    const { count: nuevas } = await db.from("empresas").select("id", { count: "exact", head: true }).eq("registro_publico", true).gte("creado_at", hace1h);
    if ((nuevas || 0) >= 15) return json({ error: "Muchos registros en este momento. Intenta en un rato." }, 429);
    const hasta = new Date(Date.now() + 15 * 864e5).toISOString();
    const { data: emp, error: e1 } = await db.from("empresas").insert({ nombre: empresa, plan: "prueba", prueba_hasta: hasta, correo_contacto: correo, registro_publico: true, activo: true }).select("id").single();
    if (e1) return json({ error: "No se pudo crear la empresa" }, 500);
    const { data: nu, error: e2 } = await db.auth.admin.createUser({ email: correo, password, email_confirm: true, user_metadata: { nombre, registro: "prueba" } });
    if (e2) {
      await db.from("empresas").delete().eq("id", emp.id);
      return json({ error: /already|registered|exists/i.test(e2.message) ? "Ese correo ya tiene una cuenta. Inicia sesión o usa “Olvidé mi contraseña”." : "No se pudo crear la cuenta" }, 400);
    }
    const { error: e3 } = await db.from("perfiles").insert({ id: nu.user.id, empresa_id: emp.id, nombre, telefono: telefono || null, rol: "admin" });
    if (e3) { await db.auth.admin.deleteUser(nu.user.id); await db.from("empresas").delete().eq("id", emp.id); return json({ error: "No se pudo crear el usuario" }, 500); }
    // Permisos por rol: copia los de la empresa del dueño de la plataforma como punto de partida
    if (S.dueno_plataforma) {
      const { data: dueno } = await db.from("perfiles").select("empresa_id").eq("id", S.dueno_plataforma).maybeSingle();
      if (dueno) {
        const { data: per } = await db.from("permisos_rol").select("rol, permiso, permitido").eq("empresa_id", dueno.empresa_id);
        if (per?.length) await db.from("permisos_rol").insert(per.map((x) => ({ ...x, empresa_id: emp.id })));
      }
      await push([S.dueno_plataforma], { title: "Nueva empresa en prueba", body: `${empresa} · ${nombre} · ${correo}`, url: "#config", tag: "registro" });
    }
    return json({ ok: true });
  }

  if (b.tipo === "contratar") {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
    const { data: u } = await db.auth.getUser(jwt);
    if (!u?.user) return json({ error: "Inicia sesión" }, 401);
    const { data: p } = await db.from("perfiles").select("id, nombre, telefono, empresa_id, empresas(nombre, correo_contacto)").eq("id", u.user.id).maybeSingle();
    if (!p) return json({ error: "Usuario no encontrado" }, 404);
    const emp = p.empresas as unknown as { nombre: string; correo_contacto: string | null };
    const telefono = txt(b.telefono, 30) || p.telefono || null;
    await db.from("solicitudes").insert({ tipo: "contratar", empresa_id: p.empresa_id, perfil_id: p.id, nombre: p.nombre, empresa_nombre: emp?.nombre, correo: u.user.email, telefono, vendedores: txt(b.vendedores, 20) || null, mensaje: txt(b.mensaje, 600) || null });
    if (S.dueno_plataforma) await push([S.dueno_plataforma], { title: "¡Quieren contratar Clarus!", body: `${emp?.nombre} · ${p.nombre}${telefono ? " · " + telefono : ""}`, url: "#config", tag: "contratar" });
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
