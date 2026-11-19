// Clarus · pedido-aviso: aviso al teléfono por cada pedido nuevo.
// Lo llama la base de datos (disparador trg_items_aviso, con x-clarus-token) cuando se guardan los productos de un pedido.
// Lo reciben los administradores y los roles con el permiso «aviso_pedido» (operaciones y administración por defecto), menos quien hizo el pedido.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: sec } = await db.from("app_secretos").select("clave, valor");
  const S = Object.fromEntries((sec || []).map((r) => [r.clave, r.valor]));
  if (!S.cron_token || req.headers.get("x-clarus-token") !== S.cron_token) return json({ error: "no autorizado" }, 401);
  const body = await req.json().catch(() => ({}));
  const { data: p } = await db.from("pedidos").select("id, empresa_id, vendedor_id, clientes(nombre), perfiles!pedidos_vendedor_id_fkey(nombre), pedido_items(propuesto, productos(nombre, kg_por_pedido, unidad_pedido))").eq("id", Number(body.pedido_nuevo)).maybeSingle();
  if (!p) return json({ error: "sin pedido" }, 404);
  // deno-lint-ignore no-explicit-any
  const x = p as any, its = (x.pedido_items || []).filter((i: any) => Number(i.propuesto) > 0);
  // deno-lint-ignore no-explicit-any
  const kg = its.reduce((t: number, i: any) => t + Number(i.propuesto) * Number(i.productos?.kg_por_pedido || 0), 0);
  const num = (n: number) => String(Math.round(n * 100) / 100);
  // deno-lint-ignore no-explicit-any
  const det = its.map((i: any) => `${num(Number(i.propuesto))} ${i.productos?.unidad_pedido || "caja"}${Number(i.propuesto) === 1 ? "" : "s"} de ${String(i.productos?.nombre || "").replace(/^Queso /, "")}`).join(" · ");
  const { data: roles } = await db.from("permisos_rol").select("rol").eq("empresa_id", x.empresa_id).eq("permiso", "aviso_pedido").eq("permitido", true);
  const rs = new Set(["admin", ...(roles || []).map((r) => r.rol)]);
  const { data: us } = await db.from("perfiles").select("id, rol").eq("empresa_id", x.empresa_id).eq("activo", true);
  const para = (us || []).filter((u) => rs.has(u.rol) && u.id !== x.vendedor_id);
  const aviso = { title: `🧾 Pedido nuevo · ${x.clientes?.nombre || "Tienda"}`, body: `${x.perfiles?.nombre || ""}: ${det || "sin productos"}${kg ? ` (${num(kg)} kg)` : ""}`, tag: `pedido-${x.id}`, url: "./#pedidos" };
  if (body.solo_texto) return json({ ok: true, aviso, para: para.length });
  webpush.setVapidDetails("mailto:soporte@clarus.app", S.vapid_publica, S.vapid_privada);
  let enviados = 0;
  for (const u of para) {
    const { data: subs } = await db.from("push_suscripciones").select("endpoint, p256dh, auth").eq("user_id", u.id);
    for (const s of subs || []) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(aviso), { TTL: 3600, urgency: "high" }); enviados++; }
      catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await db.from("push_suscripciones").delete().eq("endpoint", s.endpoint); }
    }
  }
  return json({ ok: true, aviso, para: para.length, enviados });
});
