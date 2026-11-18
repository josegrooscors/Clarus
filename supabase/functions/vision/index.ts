// Clarus · Piloto de visión artificial (fotos de exhibición).
// Lo llama pg_cron cada 10 min con x-clarus-token. Toma fotos de exhibición de visitas hechas en Clarus que aún no tienen análisis,
// las baja del Storage (service role), se las muestra a un modelo de visión y guarda el resultado en foto_analisis.
// Si no existe el secreto ANTHROPIC_API_KEY, no llama a nadie: marca la foto como "sin_clave".
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-clarus-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const MODELO = Deno.env.get("VISION_MODELO") || "claude-sonnet-5-5";

const PROMPT = (ctx: { tienda: string; cadena: string; tipo: string; productos: string[] }) => `Eres un auditor de ejecución en punto de venta (como Trax o Nielsen). Analiza la foto de una exhibición de quesos.
Tienda: ${ctx.tienda} (${ctx.cadena}). Tipo de foto: ${ctx.tipo === "exhibicion_deli" ? "vitrina de deli (quesos en barra/bloque)" : "exhibición de producto empacado (nevera)"}.
Nuestra marca es VIEJO CÁNTARO. Nuestros productos: ${ctx.productos.join(", ")}. Todo queso de otra marca es COMPETENCIA. Embutidos, jamones u otras categorías son OTRA CATEGORÍA.
Un "frente" es cada unidad visible de cara al cliente en la primera fila.
Responde SOLO con un JSON válido, sin texto adicional, con esta forma:
{"calidad":{"ok":true,"problema":null},
 "mueble":"nevera|puertas|deli|vitrina|exhibidor|cofre|anaquel|punta|otro",
 "nuestros":[{"producto":"<uno de nuestros productos>","frentes":0}],
 "competencia_frentes":0,
 "competencia_marcas":["<marcas que reconozcas>"],
 "otra_categoria_frentes":0,
 "huecos_vacios":0,
 "agotados_nuestros":["<nuestros productos que no aparecen>"],
 "precios":[{"producto":"<texto de la etiqueta>","precio":0}],
 "observaciones":"<una o dos frases útiles para un supervisor>",
 "confianza":0.0}
"calidad.problema" puede ser "borrosa", "oscura", "lejos", "cortada" o "no_es_exhibicion" (entonces ok=false). Si no estás seguro de un número, da tu mejor estimación y baja "confianza". No inventes marcas ni precios que no se lean.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: sec } = await db.from("app_secretos").select("clave, valor");
  const S = Object.fromEntries((sec || []).map((x: { clave: string; valor: string }) => [x.clave, x.valor]));
  if (req.headers.get("x-clarus-token") !== S.cron_token) return json({ error: "No autorizado" }, 401);

  const clave = Deno.env.get("ANTHROPIC_API_KEY");
  const { data: pend, error } = await db.rpc("vision_pendientes", { p_limite: 6 });
  if (error) return json({ error: error.message }, 500);
  if (!pend?.length) return json({ ok: true, analizadas: 0 });
  if (!clave) {
    await db.from("foto_analisis").upsert(pend.map((f: any) => ({ foto_id: f.foto_id, empresa_id: f.empresa_id, visita_id: f.visita_id, estado: "sin_clave" })), { onConflict: "foto_id" });
    return json({ ok: true, sin_clave: pend.length });
  }

  const out: unknown[] = [];
  for (const f of pend) {
    try {
      const { data: prods } = await db.from("productos").select("nombre").eq("empresa_id", f.empresa_id).eq("activo", true);
      const dl = await db.storage.from("fotos").download(f.storage_path);
      if (dl.error || !dl.data) throw new Error("No se pudo bajar la foto: " + (dl.error?.message || ""));
      const bytes = new Uint8Array(await dl.data.arrayBuffer());
      let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": clave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: MODELO, max_tokens: 1200,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: btoa(bin) } },
            { type: "text", text: PROMPT({ tienda: f.cliente, cadena: f.cadena || "", tipo: f.tipo, productos: (prods || []).map((p: { nombre: string }) => p.nombre) }) },
          ] }],
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error?.message || "Error del modelo " + r.status);
      const texto = (body.content || []).map((c: { text?: string }) => c.text || "").join("");
      const m = texto.match(/\{[\s\S]*\}/);
      const resultado = m ? JSON.parse(m[0]) : null;
      if (!resultado) throw new Error("Respuesta sin JSON");
      await db.from("foto_analisis").upsert({ foto_id: f.foto_id, empresa_id: f.empresa_id, visita_id: f.visita_id, estado: "listo", modelo: MODELO, resultado,
        costo_tokens: (body.usage?.input_tokens || 0) + (body.usage?.output_tokens || 0), analizado_at: new Date().toISOString(), error: null }, { onConflict: "foto_id" });
      out.push({ foto: f.foto_id, ok: true });
    } catch (e) {
      await db.from("foto_analisis").upsert({ foto_id: f.foto_id, empresa_id: f.empresa_id, visita_id: f.visita_id, estado: "error", modelo: MODELO, error: String((e as Error).message || e), analizado_at: new Date().toISOString() }, { onConflict: "foto_id" });
      out.push({ foto: f.foto_id, ok: false, error: String((e as Error).message || e) });
    }
  }
  return json({ ok: true, resultados: out });
});
