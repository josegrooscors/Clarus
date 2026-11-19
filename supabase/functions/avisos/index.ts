// Clarus · avisos: envía comunicados programados, recordatorios (push) hasta que la vendedora toque "Entendido" y el cierre del día de cada vendedora.
// Lo llama pg_cron cada 5 min (x-clarus-token) y la app al enviar un comunicado (JWT del usuario).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-clarus-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: sec } = await db.from("app_secretos").select("clave, valor");
  const S = Object.fromEntries((sec || []).map((r) => [r.clave, r.valor]));

  // Autorización: token del cron o usuario con sesión válida
  const tok = req.headers.get("x-clarus-token");
  let quien: string | null = null;
  if (tok !== S.cron_token) {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
    const { data, error } = await db.auth.getUser(jwt);
    if (error || !data?.user) return json({ error: "no autorizado" }, 401);
    quien = data.user.id;
  }
  const body = await req.json().catch(() => ({}));
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

  // Aviso de prueba a los dispositivos de quien lo pide (para comprobar que este teléfono o computadora recibe avisos)
  if (quien && body.push_prueba) {
    const subs = await subsDe(quien);
    await push(quien, { title: "🔔 Aviso de prueba de Clarus", body: "Si ves esto, este dispositivo recibe los avisos.", tag: "prueba", url: "./#resumen", renotify: true });
    return json({ ok: true, dispositivos: subs.length, enviados });
  }

  // Soporte: avisa a la otra parte cuando llega un mensaje
  if (body.soporte) {
    const { data: m } = await db.from("soporte_mensajes").select("id, autor_id, texto, soporte_tickets(id, user_id, empresa_id, asunto)").eq("id", body.soporte).maybeSingle();
    const t = m?.soporte_tickets as unknown as { id: number; user_id: string; empresa_id: string; asunto: string } | undefined;
    if (!m || !t || (quien && quien !== m.autor_id)) return json({ error: "mensaje no válido" }, 400);
    let para: string[] = [];
    if (m.autor_id === t.user_id) {
      const { data: ad } = await db.from("perfiles").select("id").eq("empresa_id", t.empresa_id).eq("rol", "admin").eq("activo", true);
      para = (ad || []).map((x) => x.id);
    } else para = [t.user_id];
    const { data: autor } = await db.from("perfiles").select("nombre").eq("id", m.autor_id).maybeSingle();
    const titulo = m.autor_id === t.user_id ? "🛟 " + (autor?.nombre || "Soporte") + ": " + t.asunto : "🛟 Soporte respondió: " + t.asunto;
    for (const u of para) await push(u, { title: titulo, body: (m.texto || "📷 Captura").slice(0, 140), tag: "sop-" + t.id, url: "./#soporte/" + t.id, renotify: true });
    return json({ ok: true, enviados });
  }

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
  // Texto del aviso de cierre (el mismo para el envío real y para la prueba)
  // deno-lint-ignore no-explicit-any
  const textoCierre = (r: any, completo: boolean) => {
    const nom = String(r.vendedor || "Vendedora").split(" ")[0], pl = (n: number, w: string) => `${n} ${w}${Number(n) === 1 ? "" : "s"}`;
    const areas = Number(r.fuera_radio) + Number(r.cortas) + Number(r.pendientes) + Number(r.agotados);
    const titulo = completo ? (r.hechas ? `${nom} cerró su día: ${r.hechas} de ${r.agendadas} visitas` : `${nom}: día justificado (${pl(r.justificadas, "tienda")})`)
      : `${nom}: día sin cerrar, ${r.hechas} de ${r.agendadas} visitas`;
    const partes = [r.justificadas && r.hechas ? pl(r.justificadas, "justificada") : "", !completo && r.pendientes ? `${pl(r.pendientes, "tienda")} sin visitar` : "", !completo && r.abiertas ? `${pl(r.abiertas, "visita")} sin check-out` : "",
      areas ? (areas === 1 ? "1 área de oportunidad" : `${areas} áreas de oportunidad`) : "Sin observaciones", r.pedidos ? pl(r.pedidos, "pedido") : ""].filter(Boolean);
    return { titulo: (completo ? "✅ " : "⚠️ ") + titulo, cuerpo: partes.join(" · ") };
  };
  // Prueba del cierre (solo con el token del cron): arma el aviso de un día dado y lo manda a UNA persona, sin guardar nada.
  if (!quien && body.cierre_prueba) {
    const t = body.cierre_prueba as { vendedor: string; fecha: string; para: string };
    const { data: r } = await db.rpc("cierre_dia", { p_vendedor: t.vendedor, p_fecha: t.fecha });
    if (!r) return json({ error: "sin datos" }, 400);
    const completo = r.pendientes === 0 && r.en_curso === 0 && r.abiertas === 0, tx = textoCierre(r, completo);
    await push(t.para, { title: tx.titulo, body: tx.cuerpo, tag: `cierre-${t.vendedor}-${t.fecha}`, url: `./#cierre/${t.vendedor}/${t.fecha}` });
    return json({ ok: true, prueba: tx, enviados });
  }

  // 3) Cierre del día: un aviso por vendedora cuando termina lo agendado (visitado o justificado), o a la hora de corte si no terminó.
  //    Lo reciben los administradores y los roles con el permiso «aviso_cierre». Se guarda en cierres_dia para no repetir.
  let cierres = 0;
  if (!quien && hora >= 7 && hora < 22) {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" }).format(ahora);
    const dow = ((new Date(hoy + "T12:00:00Z").getUTCDay() + 6) % 7) + 1; // 1 = lunes … 7 = domingo
    const { data: emps } = await db.from("empresas").select("id, cierre_hora_corte").eq("activo", true).eq("cierre_diario", true);
    for (const e of emps || []) {
      const { data: feriado } = await db.from("dias_no_laborables").select("fecha").eq("empresa_id", e.id).eq("fecha", hoy).limit(1);
      if (feriado?.length) continue;
      const { data: asig } = await db.from("asignacion_tiendas").select("vendedor_id, clientes(cadena)").eq("empresa_id", e.id).contains("dias_semana", [dow]);
      const porVend: Record<string, boolean> = {}; // vendedora → ¿todas sus tiendas de hoy son de pruebas?
      for (const a of asig || []) { const pr = ((a.clientes as unknown as { cadena?: string })?.cadena || "") === "Pruebas"; porVend[a.vendedor_id] = porVend[a.vendedor_id] === undefined ? pr : porVend[a.vendedor_id] && pr; }
      const vends = Object.keys(porVend); if (!vends.length) continue;
      const { data: ya } = await db.from("cierres_dia").select("vendedor_id").eq("fecha", hoy).in("vendedor_id", vends);
      const hechos = new Set((ya || []).map((x) => x.vendedor_id));
      const { data: activos } = await db.from("perfiles").select("id").eq("empresa_id", e.id).eq("activo", true).in("id", vends);
      const vivos = new Set((activos || []).map((x) => x.id));
      let para: string[] | null = null;
      for (const vid of vends) {
        if (hechos.has(vid) || !vivos.has(vid)) continue;
        const { data: r } = await db.rpc("cierre_dia", { p_vendedor: vid, p_fecha: hoy });
        if (!r || !r.agendadas) continue;
        const completo = r.pendientes === 0 && r.en_curso === 0 && r.abiertas === 0;
        const corte = hora >= (e.cierre_hora_corte || 19);
        if (!completo && !(corte && !porVend[vid])) continue; // la tienda de pruebas no genera «día sin cerrar»
        const { data: ins } = await db.from("cierres_dia").upsert({ empresa_id: e.id, vendedor_id: vid, fecha: hoy, estado: completo ? "completo" : "sin_cerrar", resumen: r }, { onConflict: "vendedor_id,fecha", ignoreDuplicates: true }).select("id");
        if (!ins?.length) continue; // otro proceso ya lo registró
        if (para === null) {
          const { data: roles } = await db.from("permisos_rol").select("rol").eq("empresa_id", e.id).eq("permiso", "aviso_cierre").eq("permitido", true);
          const { data: us } = await db.from("perfiles").select("id, rol").eq("empresa_id", e.id).eq("activo", true).in("rol", ["admin", ...(roles || []).map((x) => x.rol)]);
          para = (us || []).map((x) => x.id);
        }
        const { titulo, cuerpo } = textoCierre(r, completo);
        let n = 0;
        for (const u of para) { if (u === vid) continue; const antes = enviados; await push(u, { title: titulo, body: cuerpo, tag: `cierre-${vid}-${hoy}`, url: `./#cierre/${vid}/${hoy}` }); n += enviados - antes; }
        await db.from("cierres_dia").update({ avisados: n }).eq("id", ins[0].id);
        cierres++;
      }
    }
  }
  return json({ ok: true, nuevos: nuevos?.length || 0, recordados, cierres, enviados });
});
