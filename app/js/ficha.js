// Clarus · Ficha de visita: la ejecución completa de una visita para gerencia y supervisión.
// Se abre con FICHA.abrir(idVisita) desde Equipo, Alertas de inventario o una notificación (#ficha/123).
// Solo lee: horas, GPS, fotos por mueble, inventario, pedido o motivo, auditoría de espacio, planograma y lo que leyó Clarus Vision.
const FICHA = {
  mueble(tipo, m) {
    const k = m || String(tipo || "").replace(/^exhibicion_?/, "");
    if (tipo === "bodega") return "Bodega";
    if (tipo === "categoria") return "Categoría completa";
    return (typeof PL !== "undefined" && PL.MUEBLES?.[k]) || (tipo === "exhibicion" ? "Exhibición" : k ? k[0].toUpperCase() + k.slice(1) : "Foto");
  },
  dur(min) { if (min == null) return "–"; const m = Math.round(min); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`; },

  // Áreas de oportunidad: se deducen de los datos, no las escribe nadie.
  oportunidades(d) {
    const o = [], v = d.v;
    const pedidos = new Set(d.items.filter((i) => Number(i.propuesto) > 0).map((i) => i.producto_id));
    d.inv.forEach((p) => {
      if (p.total === 0 && !pedidos.has(p.id)) o.push(["rosa", `${p.nombre} está agotado en bodega y exhibición, y no se pidió.`]);
      else if (p.exh === 0 && p.bod > 0) o.push(["durazno", `${p.nombre} no está en exhibición, pero hay ${fmtNum(p.bod, 0)} en bodega: faltó surtir.`]);
    });
    if (v.checkin_dentro === false || v.checkout_dentro === false) o.push(["rosa", `Marcó fuera del radio de la tienda (${fmtDist(Math.max(v.checkin_dist_m || 0, v.checkout_dist_m || 0))}).`]);
    if (v.checkout_at && v.minutos_en_tienda != null && v.minutos_en_tienda < 10) o.push(["durazno", `Visita muy corta: ${FICHA.dur(v.minutos_en_tienda)}.`]);
    if (v.checkout_at && !d.fotos.some((f) => f.tipo !== "bodega")) o.push(["durazno", "No hay fotos de la exhibición."]);
    if (v.checkout_at && !d.inv.length) o.push(["durazno", "No registró inventario."]);
    if (v.checkout_at && !d.pedidos.length && !d.vx?.sin_pedido_motivo) o.push(["durazno", "Cerró sin pedido y sin indicar el motivo."]);
    d.plano.filter((r) => r.cumple === false).forEach((r) => o.push(["durazno", `Planograma no cumplido${r.nota ? ": " + r.nota : "."}`]));
    return o;
  },

  async datos(id) {
    const [vR, vxR, fR, iR, pR, aR, plR, prR] = await Promise.all([
      sb.from("v_visitas").select("*").eq("id", id).limit(1),
      sb.from("visitas").select("comentario, sin_pedido_motivo, sin_pedido_nota").eq("id", id).limit(1),
      sb.from("fotos").select("id, tipo, mueble, storage_path, tomada_at").eq("visita_id", id).order("tomada_at"),
      sb.from("inventarios").select("producto_id, ubicacion, unidades, kg, agotado, productos(nombre)").eq("visita_id", id),
      sb.from("v_pedidos").select("id, estado, total_cajas, total_kg, numero_orden, nota_vendedor").eq("visita_id", id),
      sb.from("auditorias_espacio").select("pct, nuestro, competencia, otra, vacio").eq("visita_id", id).order("creado_at", { ascending: false }).limit(1),
      sb.from("planograma_revisiones").select("cumple, nota, planogramas(nombre)").eq("visita_id", id),
      sb.from("promociones").select("tipo, precio_regular, precio_oferta, nota, productos(nombre)").eq("visita_id", id),
    ]);
    if (vR.error) throw vR.error;
    if (!vR.data?.[0]) throw new Error("No se encontró la visita o no tienes acceso a ella.");
    const fotos = fR.data || [], pedidos = pR.data || [];
    const [itR, anR, urls] = await Promise.all([
      pedidos.length ? sb.from("pedido_items").select("pedido_id, producto_id, stock_unidades, sugerido, propuesto, productos(nombre)").in("pedido_id", pedidos.map((p) => p.id)) : { data: [] },
      fotos.length ? sb.from("foto_analisis").select("foto_id, estado, resultado").in("foto_id", fotos.map((f) => f.id)) : { data: [] },
      fotos.filter((f) => f.storage_path).length ? sb.storage.from("fotos").createSignedUrls(fotos.filter((f) => f.storage_path).map((f) => f.storage_path), 3600).catch(() => ({ data: [] })) : { data: [] },
    ]);
    const url = {}; (urls.data || []).forEach((u) => { if (u.signedUrl) url[u.path] = u.signedUrl; });
    const porProd = {};
    (iR.data || []).forEach((i) => {
      const p = (porProd[i.producto_id] = porProd[i.producto_id] || { id: i.producto_id, nombre: (i.productos?.nombre || "Producto").replace(/^Queso /, ""), bod: null, exh: null, kg: 0, agot: false });
      const u = Number(i.unidades || 0); if (i.ubicacion === "bodega") p.bod = (p.bod || 0) + u; else p.exh = (p.exh || 0) + u;
      p.kg += Number(i.kg || 0); p.agot = p.agot || !!i.agotado;
    });
    const inv = Object.values(porProd).map((p) => ({ ...p, total: (p.bod || 0) + (p.exh || 0) })).sort((a, b) => a.nombre.localeCompare(b.nombre));
    return { v: vR.data[0], vx: (vxR.data || [])[0], fotos: fotos.map((f) => ({ ...f, url: url[f.storage_path] })), inv, pedidos, items: itR.data || [], analisis: anR.data || [],
      aud: (aR.data || [])[0], plano: plR.data || [], promos: prR.data || [] };
  },

  html(d) {
    const v = d.v, vx = d.vx || {}, op = FICHA.oportunidades(d);
    const sec = (t, cuerpo, n = "") => `<section class="fv-sec"><h3>${t}${n !== "" ? ` <span class="muted">· ${n}</span>` : ""}</h3>${cuerpo}</section>`;
    const motivo = vx.sin_pedido_motivo ? (MOTIVOS_SIN_PEDIDO.find((m) => m[0] === vx.sin_pedido_motivo) || [, vx.sin_pedido_motivo])[1] : null;
    const vis = d.analisis.filter((a) => a.estado === "listo"), espera = d.analisis.filter((a) => ["sin_clave", "sin_saldo", "pendiente"].includes(a.estado)).length;
    return `<div class="fv-cab"><div class="grow"><div class="muted small">${esc(v.vendedor)} · ${fmtFecha(v.checkin_at)}</div><h2>${esc(v.tienda)}</h2></div><button class="x-btn" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="item-pie" style="margin:0 0 14px">${v.checkout_at ? `<span class="pill p-gris">Cerrada</span>` : `<span class="pill p-azul">En tienda ahora</span>`}${G.gps(v)}${d.pedidos.length ? `<span class="pill p-menta">Con pedido</span>` : v.checkout_at ? `<span class="pill p-durazno">Sin pedido</span>` : ""}</div>
      <div class="fv-kpis"><div><b>${fmtHora(v.checkin_at)}</b><span>Entrada</span></div><div><b>${v.checkout_at ? fmtHora(v.checkout_at) : "–"}</b><span>Salida</span></div><div><b>${v.checkout_at ? FICHA.dur(v.minutos_en_tienda) : "En curso"}</b><span>En tienda</span></div></div>
      ${op.length ? sec("Áreas de oportunidad", `<div class="fv-op">${op.map(([c, t]) => `<div class="fv-o ${c}">${ic("alerta", 16)}<span>${esc(t)}</span></div>`).join("")}</div>`, op.length) : v.checkout_at ? `<div class="fv-o menta" style="margin-bottom:16px">${ic("ok", 16)}<span>Visita completa, sin observaciones.</span></div>` : ""}
      ${sec("Fotos", d.fotos.length ? `<div class="fv-fotos">${d.fotos.map((f) => { const g = FICHA.mueble(f.tipo, f.mueble); return `<figure class="fv-fig">${f.url ? `<button class="fv-f" data-foto="${esc(f.url)}" data-pie="${esc(g + " · " + fmtHora(f.tomada_at))}"><img src="${esc(f.url)}" alt="${esc(g)}" loading="lazy"></button>` : `<div class="fv-f pend">Subiendo…</div>`}<figcaption>${esc(g)}<span>${fmtHora(f.tomada_at)}</span></figcaption></figure>`; }).join("")}</div>` : `<p class="muted small">Todavía no hay fotos.</p>`, d.fotos.length)}
      ${sec("Inventario", d.inv.length ? `<table class="fv-t"><tr><th>Producto</th><th>Bodega</th><th>Exhibición</th><th>Total</th></tr>${d.inv.map((p) => `<tr><td><b>${esc(p.nombre)}</b>${p.total === 0 || p.agot ? ` <span class="pill p-rosa">Agotado</span>` : ""}</td><td>${p.bod == null ? "–" : fmtNum(p.bod, 0)}</td><td>${p.exh == null ? "–" : fmtNum(p.exh, 0)}</td><td><b>${fmtNum(p.total, 0)}</b><div class="tiny muted">${fmtKg(p.kg)}</div></td></tr>`).join("")}</table>` : `<p class="muted small">Todavía no registró inventario.</p>`)}
      ${sec("Pedido", d.pedidos.length ? d.pedidos.map((p) => `<div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:6px">${pillPedido(p.estado)}<span class="small">${plur(fmtNum(p.total_cajas, 0), "caja")}${p.total_kg != null ? " · " + fmtKg(p.total_kg) : ""}${p.numero_orden ? " · Orden " + esc(p.numero_orden) : ""}</span></div>
          <table class="fv-t"><tr><th>Producto</th><th>Sugerido</th><th>Pedido</th></tr>${d.items.filter((i) => i.pedido_id === p.id).map((i) => `<tr><td>${esc((i.productos?.nombre || "").replace(/^Queso /, ""))}</td><td>${fmtNum(i.sugerido, 0)}</td><td><b>${fmtNum(i.propuesto, 0)}</b></td></tr>`).join("")}</table>${p.nota_vendedor ? `<p class="small muted" style="margin-top:6px">Nota: ${esc(p.nota_vendedor)}</p>` : ""}`).join("")
        : motivo ? `<p class="small"><b>Sin pedido.</b> Motivo: ${esc(motivo)}${vx.sin_pedido_nota ? " · " + esc(vx.sin_pedido_nota) : ""}</p>` : `<p class="muted small">${v.checkout_at ? "Cerró sin pedido y sin motivo." : "Todavía no hay pedido."}</p>`)}
      ${d.aud ? sec("Auditoría de espacio", `<p class="small"><b style="font-size:20px;font-family:var(--font-t)">${d.aud.pct == null ? "–" : fmtNum(d.aud.pct, 0) + "%"}</b> de participación · ${fmtNum(d.aud.nuestro, 0)} frentes nuestros y ${fmtNum(d.aud.competencia, 0)} de la competencia</p>`) : ""}
      ${d.plano.length ? sec("Planograma", d.plano.map((r) => `<div class="row" style="gap:8px;margin-bottom:4px"><span class="pill ${r.cumple ? "p-menta" : "p-durazno"}">${r.cumple ? "Cumple" : "No cumple"}</span><span class="small">${esc(r.planogramas?.nombre || "")}${r.nota ? " · " + esc(r.nota) : ""}</span></div>`).join("")) : ""}
      ${d.promos.length ? sec("Promociones", d.promos.map((p) => `<p class="small" style="margin:0 0 4px"><b>${esc((p.productos?.nombre || "").replace(/^Queso /, ""))}</b> · ${esc(p.tipo || "")}${p.precio_oferta ? " · $" + fmtNum(p.precio_oferta, 2) : ""}${p.nota ? " · " + esc(p.nota) : ""}</p>`).join(""), d.promos.length) : ""}
      ${d.analisis.length ? sec(`${visionIc(16)} Clarus Vision`, vis.length ? vis.map((a) => `<p class="small" style="margin:0 0 6px">${esc(a.resultado?.observaciones || "Foto revisada.")}</p>`).join("") : `<p class="muted small">${plur(espera, "foto")} en espera de lectura.</p>`) : ""}
      ${vx.comentario ? sec("Comentario de la vendedora", `<p class="small">${esc(vx.comentario)}</p>`) : ""}`;
  },

  async abrir(id) {
    const m = modal(`<div class="muted" style="padding:30px 0;text-align:center">Cargando la visita…</div>`);
    m.classList.add("fv");
    try {
      const d = await FICHA.datos(id);
      $(".sheet", m).innerHTML = FICHA.html(d);
      $("[data-cerrar]", m).onclick = () => m.remove();
      $$("[data-foto]", m).forEach((b) => (b.onclick = () => FICHA.foto(b.dataset.foto, b.dataset.pie)));
    } catch (e) {
      $(".sheet", m).innerHTML = `<div class="fv-cab"><h2 class="grow">Visita</h2><button class="x-btn" data-cerrar>✕</button></div><p class="muted">${esc(e.message || "No se pudo cargar.")}</p>`;
      $("[data-cerrar]", m).onclick = () => m.remove();
    }
  },

  foto(url, pie) {
    const v = document.createElement("div");
    v.className = "fv-visor"; v.innerHTML = `<img src="${esc(url)}" alt=""><div class="fv-pie">${esc(pie || "")}</div><button class="x-btn" aria-label="Cerrar">✕</button>`;
    v.onclick = () => v.remove(); document.body.appendChild(v);
  },
};
// Cualquier elemento con data-fv="<id de visita>" abre la ficha.
document.addEventListener("click", (e) => { const el = e.target.closest("[data-fv]"); if (el && !e.target.closest("button:not([data-fv]),a:not([data-fv])")) { e.preventDefault(); FICHA.abrir(Number(el.dataset.fv)); } });
