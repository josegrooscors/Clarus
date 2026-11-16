// Clarus · Gestión de usuarios (administradores, o roles con el permiso "usuarios")
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const ROLES = ["admin", "supervisor", "operaciones", "administracion", "vendedor"];
const DOMINIO = "clarus.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ error: "Sesión no válida" }, 401);

    const { data: yo } = await admin.from("perfiles").select("empresa_id, rol, activo").eq("id", u.user.id).single();
    if (!yo || !yo.activo) return json({ error: "Usuario no autorizado" }, 403);
    const esAdmin = yo.rol === "admin";
    if (!esAdmin) {
      const { data: p } = await admin.from("permisos_rol").select("permitido")
        .eq("empresa_id", yo.empresa_id).eq("rol", yo.rol).eq("permiso", "usuarios").maybeSingle();
      if (!p?.permitido) return json({ error: "No tienes permiso para gestionar usuarios" }, 403);
    }

    const b = await req.json();
    // Solo un administrador puede crear administradores o tocar a un administrador
    if (!esAdmin && b.rol === "admin") return json({ error: "Solo un administrador puede asignar el rol de administrador" }, 403);

    if (b.accion === "crear") {
      const usuario = String(b.usuario || "").trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) return json({ error: "Usuario inválido (3–30 letras, números, punto o guion)" }, 400);
      if (!b.password || String(b.password).length < 6) return json({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);
      if (!ROLES.includes(b.rol)) return json({ error: "Rol inválido" }, 400);
      if (!b.nombre) return json({ error: "Falta el nombre" }, 400);

      const { data: nu, error } = await admin.auth.admin.createUser({
        email: `${usuario}@${DOMINIO}`, password: String(b.password), email_confirm: true,
        user_metadata: { nombre: b.nombre, usuario },
      });
      if (error) return json({ error: error.message.includes("already") ? "Ese usuario ya existe" : error.message }, 400);

      const { error: e2 } = await admin.from("perfiles").insert({
        id: nu.user.id, empresa_id: yo.empresa_id, nombre: b.nombre, telefono: b.telefono || null, rol: b.rol,
      });
      if (e2) { await admin.auth.admin.deleteUser(nu.user.id); return json({ error: e2.message }, 400); }
      return json({ ok: true, id: nu.user.id, usuario });
    }

    // Las demás acciones son sobre un usuario de la misma empresa
    const { data: obj } = await admin.from("perfiles").select("id, empresa_id, rol").eq("id", b.id).single();
    if (!obj || obj.empresa_id !== yo.empresa_id) return json({ error: "Usuario no encontrado" }, 404);
    if (!esAdmin && obj.rol === "admin") return json({ error: "Solo un administrador puede modificar a otro administrador" }, 403);

    if (b.accion === "editar") {
      if (!b.nombre) return json({ error: "Falta el nombre" }, 400);
      if (!ROLES.includes(b.rol)) return json({ error: "Rol inválido" }, 400);
      if (b.id === u.user.id && b.rol !== yo.rol) return json({ error: "No puedes cambiar tu propio rol" }, 400);
      const { error } = await admin.from("perfiles").update({ nombre: String(b.nombre).trim(), telefono: b.telefono || null, rol: b.rol }).eq("id", b.id);
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }

    if (b.accion === "password") {
      if (!b.password || String(b.password).length < 6) return json({ error: "La contraseña debe tener al menos 6 caracteres" }, 400);
      const { error } = await admin.auth.admin.updateUserById(b.id, { password: String(b.password) });
      if (error) return json({ error: error.message }, 400);
      // Si había pedido "Olvidé mi contraseña", queda atendido
      await admin.from("solicitudes").update({ estado: "atendida", atendida_por: u.user.id, atendida_at: new Date().toISOString() })
        .eq("tipo", "clave").eq("perfil_id", b.id).eq("estado", "pendiente");
      return json({ ok: true });
    }
    if (b.accion === "activo") {
      const { error } = await admin.from("perfiles").update({ activo: !!b.activo }).eq("id", b.id);
      await admin.auth.admin.updateUserById(b.id, { ban_duration: b.activo ? "none" : "876000h" });
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }
    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
