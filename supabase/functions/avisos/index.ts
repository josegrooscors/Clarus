// Clarus · avisos: envía comunicados programados y recordatorios (push) hasta que la vendedora toque "Entendido".
// Lo llama pg_cron cada 5 min (x-clarus-token) y la app al enviar un comunicado (JWT del usuario).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-clarus-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: sec } = await db.from("app_secretos").select("clave, valor");
  const S = Object.fromEntries((sec || []).map((r) => [r.clave, r.valor]));

  // Autorización: token del cron o usuario con sesión válida
  const tok = req.headers.get("x-clarus-token");
  if (tok !== S.cron_token) {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
    const { data, error } = await db.auth.getUser(jwt);
    if (error || !data?.user) return json({ error: "no autorizado" }, 401);
  }
  webpush.setVapidDetails("mailto:soporte@clarus.app", S.vapid_publica, S.vapid_privada);

  const subsCache: Record<string, { endpoint: string; p256dh: string; auth: string }[]> = {};
  const subsDe = async (uid: string) => {
    if (!subsCache[uid]) subsCache[uid] = (await db.from("push_suscripciones").select("endpoint, p256dh, auth").eq("user_id", uid)).data || [];
    return subsCache[uid];
  };
  let enviados = 0;
  const push = async (uid: string, payload: Record<string, unknown>) => {
    for (const s of await subsDe(uid)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
        enviados++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from("push_suscripciones").delete().eq("endpoint", s.endpoint);
      }
    }
  };
  const ahora = new Date();

  // 1) Comunicados que ya tocan
  const { data: nuevos } = await db.from("comunicados").select("id, titulo, cuerpo").is("enviado_at", null).eq("anulado", false).lte("programado_at", ahora.toISOString());
  for (const c of nuevos || []) {
    const { data: upd } = await db.from("comunicados").update({ enviado_at: ahora.toISOString() }).eq("id", c.id).is("enviado_at", null).select("id");
    if (!upd?.length) continue; // otro proceso ya lo envió
    const { data: ds } = await db.from("comunicado_destinos").select("user_id").eq("comunicado_id", c.id);
    for (const d of ds || []) await push(d.user_id, { title: "📣 " + c.titulo, body: (c.cuerpo || "").slice(0, 140), tag: "com-" + c.id, url: "./#mensajes/" + c.id });
    await db.from("comunicado_destinos").update({ recordado_at: ahora.toISOString() }).eq("comunicado_id", c.id);
  }

  // 2) Recordatorios: sin "Entendido", de 7 am a 7 pm hora de Panamá
  const hora = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Panama", hour: "numeric", hour12: false }).format(ahora));
  let recordados = 0;
  if (hora >= 7 && hora < 19) {
    const { data: pend } = await db.from("comunicado_destinos")
      .select("comunicado_id, user_id, recordado_at, recordatorios, comunicados!inner(titulo, requiere_ok, recordar_min, enviado_at, anulado)")
      .is("ok_at", null).eq("comunicados.requiere_ok", true).eq("comunicados.anulado", false).not("comunicados.enviado_at", "is", null).limit(1000);
    for (const d of pend || []) {
      const c = d.comunicados as unknown as { titulo: string; recordar_min: number };
      const ult = d.recordado_at ? new Date(d.recordado_at).getTime() : 0;
      if (ahora.getTime() - ult < (c.recordar_min || 60) * 60000 - 30000) continue;
      await push(d.user_id, { title: "⏰ Pendiente: " + c.titulo, body: "Abre el comunicado y toca «Entendido».", tag: "com-" + d.comunicado_id, url: "./#mensajes/" + d.comunicado_id, renotify: true });
      await db.from("comunicado_destinos").update({ recordado_at: ahora.toISOString(), recordatorios: (d.recordatorios || 0) + 1 }).eq("comunicado_id", d.comunicado_id).eq("user_id", d.user_id);
      recordados++;
    }
  }
  return json({ ok: true, nuevos: nuevos?.length || 0, recordados, enviados });
});
