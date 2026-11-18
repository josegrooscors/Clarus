// Clarus · Piloto de visión artificial (fotos de exhibición y fotos de categoría).
// Lo llama pg_cron cada 10 min con x-clarus-token. Toma fotos de exhibición de visitas hechas en Clarus que aún no tienen análisis,
// las baja del Storage (service role), se las muestra a un modelo de visión y guarda el resultado en foto_analisis.
// Si no existe el secreto ANTHROPIC_API_KEY, no llama a nadie: marca la foto como "sin_clave".
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-clarus-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const MODELO = Deno.env.get("VISION_MODELO") || "claude-sonnet-5-5";

type Config = { marca: string; productos: { producto: string; presentaciones: { presentacion: string; donde: string; aspecto: string }[] }[]; competencia: string[]; reglas: { id: string; texto: string }[] };

// El prompt se arma con la configuración de visión de cada empresa (marca, presentaciones, competencia y reglas): sirve para cualquier cliente.
const PROMPT = (ctx: { tienda: string; cadena: string; tipo: string; mueble?: string; cfg: Config }) => {
  const c = ctx.cfg;
  const pres = c.productos.flatMap((p) => p.presentaciones.map((x) => `- ${p.producto} · ${x.presentacion} (${x.donde}): ${x.aspecto}`)).join("\n");
  const cat = ctx.tipo === "categoria";
  const que = cat
    ? `FOTO DE CATEGORÍA (share of shelf, como Nielsen): muestra toda la categoría de quesos o un tramo de ella, con nuestra marca y la competencia.
Cuenta TODOS los frentes de quesos de TODOS los niveles visibles, marca por marca. Es la parte más importante: cuenta con cuidado, nivel por nivel, de izquierda a derecha.
Si un producto está cortado en el borde de la foto, cuéntalo solo si se ve más de la mitad (la vendedora toma tramos seguidos sin repetir).
No evalúes reglas de exhibición: deja "reglas" vacío.`
    : `Analiza esta foto de exhibición. Mueble fotografiado: ${ctx.mueble || ctx.tipo.replace("exhibicion_", "")} (${["exhibicion_deli", "exhibicion_vitrina"].includes(ctx.tipo) ? "vitrina de deli: quesos en barra" : "producto empacado: rebanados y rallados"}).`;
  return `Eres un auditor de ejecución en punto de venta (como Trax o Nielsen).
Tienda: ${ctx.tienda} (${ctx.cadena}).
${que}
NUESTRA MARCA: ${c.marca}. Así se ven nuestras presentaciones:
${pres}
COMPETENCIA conocida (puede haber otras): ${c.competencia.join(", ")}. Todo producto de la misma categoría de otra marca es competencia (incluye sucedáneos e imitaciones).
OTRA CATEGORÍA: embutidos, pepperoni, jamones, etc.
REGLAS de exhibición a evaluar:
${c.reglas.map((r) => `- [${r.id}] ${r.texto}`).join("\n")}
Un "frente" es cada unidad visible de cara al cliente en la primera fila (no cuentes las de atrás).
Responde SOLO con un JSON válido, sin texto adicional:
{"calidad":{"ok":true,"problema":null},
 "mueble":"nevera|puertas|deli|vitrina|exhibidor|cofre|anaquel|punta|otro",
 "nuestros":[{"producto":"<producto>","presentacion":"<presentación>","frentes":0,"precio":null}],
 "competencia":[{"marca":"<marca>","frentes":0}],
 "competencia_frentes":0,
 "otra_categoria_frentes":0,
 "huecos_vacios":0,
 "agotados_nuestros":["<producto · presentación esperada que no aparece>"],
 "reglas":[{"id":"<id>","cumple":true,"detalle":"<por qué, corto>"}],
 "observaciones":"<una o dos frases útiles para un supervisor>",
 "confianza":0.0}
En "competencia" pon cada marca por separado con sus frentes; "competencia_frentes" es la suma. Si no lees la marca, usa "Sin identificar".
"calidad.problema": "borrosa", "oscura", "lejos", "cortada" o "no_es_exhibicion" (ok=false). Evalúa solo las reglas que apliquen al tipo de foto. Si no estás seguro de un número, estímalo y baja "confianza". No inventes marcas ni precios que no se lean.`;
};

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
      const { data: emp } = await db.from("empresas").select("nombre, vision_config").eq("id", f.empresa_id).single();
      let cfg = emp?.vision_config as Config | null;
      if (!cfg) { // empresa sin configuración de visión: lo mínimo con su catálogo
        const { data: prods } = await db.from("productos").select("nombre").eq("empresa_id", f.empresa_id).eq("activo", true);
        cfg = { marca: emp?.nombre || "nuestra marca", productos: (prods || []).map((p: { nombre: string }) => ({ producto: p.nombre, presentaciones: [{ presentacion: "única", donde: "exhibición", aspecto: "producto con la marca " + (emp?.nombre || "") }] })), competencia: [], reglas: [] };
      }
      const dl = await db.storage.from("fotos").download(f.storage_path);
      if (dl.error || !dl.data) throw new Error("No se pudo bajar la foto: " + (dl.error?.message || ""));
      const bytes = new Uint8Array(await dl.data.arrayBuffer());
      let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": clave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: MODELO, max_tokens: 2500,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: btoa(bin) } },
            { type: "text", text: PROMPT({ tienda: f.cliente, cadena: f.cadena || "", tipo: f.tipo, mueble: f.mueble, cfg }) },
          ] }],
        }),
      });
      const body = await r.json();
      if (!r.ok) {
        const msg = body?.error?.message || "Error del modelo " + r.status;
        // Sin saldo, clave inválida, límite o servicio saturado: la foto queda en espera y se reintenta, no se marca como error.
        if ([401, 402, 403, 429, 500, 502, 503, 529].includes(r.status) || /credit|balance|billing/i.test(msg)) {
          await db.from("foto_analisis").upsert({ foto_id: f.foto_id, empresa_id: f.empresa_id, visita_id: f.visita_id, estado: "sin_saldo", modelo: MODELO, error: msg }, { onConflict: "foto_id" });
          out.push({ foto: f.foto_id, ok: false, espera: msg });
          break; // si una falla por saldo, las demás también: no gastar llamadas
        }
        throw new Error(msg);
      }
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
