// Clarus · Ficha de visita: la ejecución completa de una visita para gerencia y supervisión.
// Se abre con FICHA.abrir(idVisita) desde Equipo, Alertas de inventario o una notificación (#ficha/123).
// Solo lee: horas, GPS, fotos por mueble, inventario, pedido o motivo, auditoría de espacio, planograma y lo que leyó Clarus Vision.
const FICHA = {
  mueble(tipo, m) {
    const k = m || String(tipo || "").replace(/^exhibicion_?/, "");
    if (tipo === "bodega") return "Bodega" + (m && typeof m === "object" && m.nombre ? " · " + m.nombre.replace(/^Queso /, "") : "");
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
    (d.venc || []).forEach((x) => {
      if (x.sin_fecha) o.push(["durazno", `${x.nombre}: no se pudo ver la fecha de vencimiento.`]);
      else if (x.dias != null && x.dias < 0) o.push(["rosa", `${x.nombre} está vencido (${faltan(x.vence)})${x.unidades != null ? ": " + fmtNum(x.unidades, 0) + " " + plural(Number(x.unidades), x.uni) : ""}.`]);
      else if (x.dias != null && x.dias <= x.plazo) o.push(["durazno", `${x.nombre} vence el ${fmtDia(x.vence)} (${faltan(x.vence)})${x.unidades != null ? ": " + fmtNum(x.unidades, 0) + " " + plural(Number(x.unidades), x.uni) : ""}.`]);
    });
    if (d.vx?.inv_incompleto_motivo) o.push(["durazno", `Inventario incompleto. ${d.vx.inv_incompleto_nota || ""} Motivo: ${motivoInvIncompleto(d.vx.inv_incompleto_motivo)}.`.replace(/\s+/g, " ")]);
    if (v.checkout_at && !d.pedidos.length && !d.vx?.sin_pedido_motivo) o.push(["durazno", "Cerró sin pedido y sin indicar el motivo."]);
    d.plano.filter((r) => r.cumple === false).forEach((r) => o.push(["durazno", `Planograma no cumplido${r.nota ? ": " + r.nota : "."}`]));
    return o;
  },

  async datos(id) {
    const [vR, vxR, fR, iR, pR, aR, plR, prR, veR] = await Promise.all([
      sb.from("v_visitas").select("*").eq("id", id).limit(1),
      sb.from("visitas").select("comentario, sin_pedido_motivo, sin_pedido_nota, inv_incompleto_motivo, inv_incompleto_nota").eq("id", id).limit(1),
      sb.from("fotos").select("id, tipo, mueble, producto_id, storage_path, tomada_at, productos(nombre)").eq("visita_id", id).order("tomada_at"),
      sb.from("inventarios").select("producto_id, ubicacion, unidades, kg, agotado, detalle, productos(nombre)").eq("visita_id", id),
      sb.from("v_pedidos").select("id, estado, total_cajas, total_kg, numero_orden, nota_vendedor").eq("visita_id", id),
      sb.from("auditorias_espacio").select("pct, nuestro, competencia, otra, vacio").eq("visita_id", id).order("creado_at", { ascending: false }).limit(1),
      sb.from("planograma_revisiones").select("cumple, nota, planogramas(nombre)").eq("visita_id", id),
      sb.from("promociones").select("tipo, precio_regular, precio_oferta, nota, productos(nombre)").eq("visita_id", id),
      sb.from("vencimientos").select("producto_id, vence, unidades, confirmada, sin_fecha, productos(nombre, unidad_conteo, dias_alerta_vencimiento)").eq("visita_id", id),
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
      // Exhibición del flujo nuevo: desglose por mueble (barras y paquetes)
      if (Array.isArray(i.detalle) && i.detalle.length) p.det = i.detalle.map((x) => `${x.mueble}: ${[x.barras ? fmtNum(x.barras) + " en barra" : "", x.rebanado ? x.rebanado + " paq. rebanado" : "", x.rallado ? x.rallado + " paq. rallado" : ""].filter(Boolean).join(" + ")}`).join(" · ");
    });
    const inv = Object.values(porProd).map((p) => ({ ...p, total: (p.bod || 0) + (p.exh || 0) })).sort((a, b) => a.nombre.localeCompare(b.nombre));
    return { v: vR.data[0], vx: (vxR.data || [])[0], fotos: fotos.map((f) => ({ ...f, url: url[f.storage_path] })), inv, pedidos, items: itR.data || [], analisis: anR.data || [],
      aud: (aR.data || [])[0], plano: plR.data || [], promos: prR.data || [],
      venc: (veR.error ? [] : veR.data || []).map((x) => ({ ...x, nombre: (x.productos?.nombre || "Producto").replace(/^Queso /, ""), dias: x.vence ? diasPara(x.vence) : null, plazo: x.productos?.dias_alerta_vencimiento || 15, uni: x.productos?.unidad_conteo || "unidad" })) };
  },

  html(d) {
    const v = d.v, vx = d.vx || {}, op = FICHA.oportunidades(d);
    const sec = (t, cuerpo, n = "") => `<section class="fv-sec"><h3>${t}${n !== "" ? ` <span class="muted">· ${n}</span>` : ""}</h3>${cuerpo}</section>`;
    const motivo = vx.sin_pedido_motivo ? (MOTIVOS_SIN_PEDIDO.find((m) => m[0] === vx.sin_pedido_motivo) || [, vx.sin_pedido_motivo])[1] : null;
    const vis = d.analisis.filter((a) => a.estado === "listo"), espera = d.analisis.filter((a) => ["sin_clave", "sin_saldo", "pendiente"].includes(a.estado)).length;
    return `<div class="fv-cab"><div class="grow"><div class="muted small">${esc(v.vendedor)} · ${fmtFecha(v.checkin_at)}</div><h2>${esc(v.tienda)}</h2></div><button class="btn sm fv-comp" data-compartir disabled>${ic("compartir", 16)}<span>Preparando…</span></button><button class="x-btn" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="item-pie" style="margin:0 0 14px">${v.checkout_at ? `<span class="pill p-gris">Cerrada</span>` : `<span class="pill p-azul">En tienda ahora</span>`}${G.gps(v)}${d.pedidos.length ? `<span class="pill p-menta">Con pedido</span>` : v.checkout_at ? `<span class="pill p-durazno">Sin pedido</span>` : ""}</div>
      <div class="fv-kpis"><div><b>${fmtHora(v.checkin_at)}</b><span>Entrada</span></div><div><b>${v.checkout_at ? fmtHora(v.checkout_at) : "–"}</b><span>Salida</span></div><div><b>${v.checkout_at ? FICHA.dur(v.minutos_en_tienda) : "En curso"}</b><span>En tienda</span></div></div>
      ${op.length ? sec("Áreas de oportunidad", `<div class="fv-op">${op.map(([c, t]) => `<div class="fv-o ${c}">${ic("alerta", 16)}<span>${esc(t)}</span></div>`).join("")}</div>`, op.length) : v.checkout_at ? `<div class="fv-o menta" style="margin-bottom:16px">${ic("ok", 16)}<span>Visita completa, sin observaciones.</span></div>` : ""}
      ${sec("Fotos", d.fotos.length ? `<div class="fv-fotos">${d.fotos.map((f) => { const g = FICHA.mueble(f.tipo, f.tipo === "bodega" ? f.productos : f.mueble); return `<figure class="fv-fig">${f.url ? `<button class="fv-f" data-foto="${esc(f.url)}" data-pie="${esc(g + " · " + fmtHora(f.tomada_at))}"><img src="${esc(f.url)}" alt="${esc(g)}" loading="lazy"></button>` : `<div class="fv-f pend">Subiendo…</div>`}<figcaption>${esc(g)}<span>${fmtHora(f.tomada_at)}</span></figcaption></figure>`; }).join("")}</div>` : `<p class="muted small">Todavía no hay fotos.</p>`, d.fotos.length)}
      ${sec("Inventario", d.inv.length ? `<table class="fv-t"><tr><th>Producto</th><th>Bodega</th><th>Exhibición</th><th>Total</th></tr>${d.inv.map((p) => `<tr><td><b>${esc(p.nombre)}</b>${p.total === 0 || p.agot ? ` <span class="pill p-rosa">Agotado</span>` : ""}${p.det ? `<div class="tiny muted">${esc(p.det)}</div>` : ""}</td><td>${p.bod == null ? "–" : fmtNum(p.bod, 1)}</td><td>${p.exh == null ? "–" : fmtNum(p.exh, 1)}</td><td><b>${fmtNum(p.total, 1)}</b><div class="tiny muted">${fmtKg(p.kg)}</div></td></tr>`).join("")}</table>` : `<p class="muted small">Todavía no registró inventario.</p>`)}
      ${(d.venc || []).length ? sec("Vencimiento", `<table class="fv-t"><tr><th>Producto</th><th>Vence primero</th><th>Unidades</th></tr>${d.venc.map((x) => `<tr><td><b>${esc(x.nombre)}</b></td><td>${x.sin_fecha ? "No se vio la fecha" : esc(fmtDia(x.vence)) + `<div class="tiny ${x.dias <= x.plazo ? "" : "muted"}" ${x.dias <= x.plazo ? 'style="color:var(--rosa-t)"' : ""}>${esc(faltan(x.vence))}${x.confirmada ? " · sigue igual" : ""}</div>`}</td><td>${x.unidades == null ? "–" : fmtNum(x.unidades, 0)}</td></tr>`).join("")}</table>`) : ""}
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
      // La imagen se arma al abrir, para que al tocar «Compartir» el teléfono abra de una vez WhatsApp y demás (no deja compartir si pasa mucho rato entre el toque y el envío)
      const bc = $("[data-compartir]", m);
      FICHA.imagen(d).then((blob) => {
        if (!bc.isConnected) return;
        const nombre = `Visita ${d.v.tienda} ${new Date(d.v.checkin_at).toLocaleDateString("en-CA", { timeZone: "America/Panama" })}.jpg`.replace(/[\\/:*?"<>|]/g, " ");
        const file = new File([blob], nombre, { type: "image/jpeg" });
        const puede = !!(navigator.canShare && navigator.canShare({ files: [file] }));
        bc.disabled = false; $("span", bc).textContent = puede ? "Compartir" : "Descargar";
        bc.onclick = async () => {
          if (puede) { try { await navigator.share({ files: [file], title: "Visita " + d.v.tienda, text: `${d.v.tienda} · ${d.v.vendedor} · ${fmtFecha(d.v.checkin_at)}` }); return; } catch (e) { if (e.name === "AbortError") return; } }
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          toast("Imagen descargada");
        };
      }).catch(() => { if (bc.isConnected) $("span", bc).textContent = "No se pudo"; });
    } catch (e) {
      $(".sheet", m).innerHTML = `<div class="fv-cab"><h2 class="grow">Visita</h2><button class="x-btn" data-cerrar>✕</button></div><p class="muted">${esc(e.message || "No se pudo cargar.")}</p>`;
      $("[data-cerrar]", m).onclick = () => m.remove();
    }
  },

  // Arma la ficha de la visita como UNA imagen (JPG) lista para compartir: datos, áreas de oportunidad, inventario, pedido y fotos.
  async imagen(d) {
    const W = 1080, M = 56, AN = W - M * 2, v = d.v, vx = d.vx || {};
    const TI = "#0B1B33", GR = "#5B6577", AZ = "#2F5BEA", BD = "#E3E8F0", FO = "#F7F9FC";
    try { await Promise.all([document.fonts.load('700 40px "Inter Tight"'), document.fonts.load('400 26px Inter'), document.fonts.load('600 26px Inter')]); } catch (e) {}
    const imgs = await Promise.all(d.fotos.filter((f) => f.url).slice(0, 9).map(async (f) => {
      try { const r = await fetch(f.url); if (!r.ok) throw 0; return { f, bmp: await createImageBitmap(await r.blob()) }; } catch (e) { return { f, bmp: null }; }
    }));
    const c = document.createElement("canvas"); c.width = W; c.height = 9000;
    const x = c.getContext("2d"); x.textBaseline = "top";
    x.fillStyle = "#FFFFFF"; x.fillRect(0, 0, W, c.height);
    const F = (peso, px, tight) => (x.font = `${peso} ${px}px ${tight ? '"Inter Tight", ' : ""}Inter, sans-serif`);
    const partir = (t, ancho) => { const out = []; let l = ""; String(t).split(/\s+/).forEach((w) => { const p = l ? l + " " + w : w; if (x.measureText(p).width > ancho && l) { out.push(l); l = w; } else l = p; }); if (l) out.push(l); return out; };
    const texto = (t, px, y, o = {}) => { F(o.peso || 400, px, o.tight); x.fillStyle = o.color || TI; const ls = partir(t, o.ancho || AN); ls.forEach((l, i) => x.fillText(l, o.x ?? M, y + i * px * 1.35)); return y + ls.length * px * 1.35; };
    const caja = (X, Y, w, h, r, color) => { x.fillStyle = color; x.beginPath(); x.roundRect(X, Y, w, h, r); x.fill(); };
    let y = 0;
    // Encabezado de marca
    caja(0, 0, W, 112, 0, FO);
    x.strokeStyle = AZ; x.lineWidth = 7; x.lineCap = "round"; x.beginPath(); x.arc(M + 22, 56, 19, Math.PI * 0.3, Math.PI * 1.7); x.stroke();
    x.fillStyle = TI; x.beginPath(); x.arc(M + 22, 56, 6, 0, 7); x.fill();
    F(700, 36, true); x.fillStyle = TI; x.fillText("clarus", M + 56, 36);
    F(500, 22); x.fillStyle = GR; x.textAlign = "right"; x.fillText("Reporte de visita", W - M, 44); x.textAlign = "left";
    y = 148;
    y = texto(`${v.vendedor} · ${fmtFecha(v.checkin_at)}`, 26, y, { color: GR });
    y = texto(v.tienda, 52, y + 4, { peso: 700, tight: true }) + 14;
    const estado = [v.checkout_at ? "Visita cerrada" : "En tienda ahora", v.checkin_dentro === false || v.checkout_dentro === false ? "Marcó fuera del radio" : "Ubicación correcta", d.pedidos.length ? "Con pedido" : v.checkout_at ? "Sin pedido" : null].filter(Boolean).join("  ·  ");
    y = texto(estado, 24, y, { color: GR, peso: 500 }) + 22;
    // Entrada / salida / tiempo
    const k = [[fmtHora(v.checkin_at), "Entrada"], [v.checkout_at ? fmtHora(v.checkout_at) : "–", "Salida"], [v.checkout_at ? FICHA.dur(v.minutos_en_tienda) : "En curso", "En tienda"]], kw = (AN - 32) / 3;
    k.forEach(([a, b], i) => { const X = M + i * (kw + 16); caja(X, y, kw, 124, 20, FO); F(700, 36, true); x.fillStyle = TI; x.fillText(a, X + 24, y + 22); F(400, 22); x.fillStyle = GR; x.fillText(b, X + 24, y + 76); });
    y += 124 + 40;
    const titulo = (t) => { y = texto(t, 30, y, { peso: 700, tight: true }) + 12; };
    // Áreas de oportunidad
    const op = FICHA.oportunidades(d);
    if (op.length || v.checkout_at) {
      titulo(op.length ? `Áreas de oportunidad · ${op.length}` : "Resultado");
      (op.length ? op : [["menta", "Visita completa, sin observaciones."]]).forEach(([tono, t]) => {
        const col = tono === "rosa" ? ["#FDE7E5", "#B3261E"] : tono === "menta" ? ["#E3F5EC", "#0F7A4F"] : ["#FFF3D6", "#8A5A00"];
        F(500, 25); const ls = partir(t, AN - 48), h = ls.length * 34 + 30;
        caja(M, y, AN, h, 16, col[0]); x.fillStyle = col[1]; ls.forEach((l, i) => x.fillText(l, M + 24, y + 16 + i * 34)); y += h + 10;
      });
      y += 26;
    }
    // Tabla sencilla: columnas con ancho proporcional
    const tabla = (cab, filas, anchos) => {
      const X = [M + 20]; anchos.slice(0, -1).forEach((a, i) => X.push(X[i] + (AN - 40) * a));
      caja(M, y, AN, 50, 12, FO); F(600, 21); x.fillStyle = GR; cab.forEach((t, i) => x.fillText(t, X[i], y + 14)); y += 58;
      filas.forEach((f) => { f.forEach((t, i) => { F(i === 0 || i === f.length - 1 ? 600 : 400, 25); x.fillStyle = TI; x.fillText(String(t), X[i], y + 8); }); y += 46; x.fillStyle = BD; x.fillRect(M, y - 2, AN, 1.5); });
      y += 30;
    };
    if (d.inv.length) { titulo("Inventario"); tabla(["Producto", "Bodega", "Exhibición", "Total"], d.inv.map((p) => [p.nombre + (p.total === 0 || p.agot ? "  (agotado)" : ""), p.bod == null ? "–" : fmtNum(p.bod, 1), p.exh == null ? "–" : fmtNum(p.exh, 1), fmtNum(p.total, 1)]), [0.46, 0.18, 0.2, 0.16]); }
    if ((d.venc || []).length) { titulo("Vencimiento"); tabla(["Producto", "Vence primero", "Unidades"], d.venc.map((z) => [z.nombre, z.sin_fecha ? "No se vio la fecha" : `${fmtDia(z.vence)} (${faltan(z.vence)})`, z.unidades == null ? "–" : fmtNum(z.unidades, 0)]), [0.3, 0.52, 0.18]); }
    titulo("Pedido");
    if (d.pedidos.length) d.pedidos.forEach((p) => {
      y = texto(`${plur(fmtNum(p.total_cajas, 0), "caja")}${p.total_kg != null ? " · " + fmtKg(p.total_kg) : ""}${p.numero_orden ? " · Orden " + p.numero_orden : ""}`, 25, y, { color: GR }) + 8;
      tabla(["Producto", "Sugerido", "Pedido"], d.items.filter((i) => i.pedido_id === p.id).map((i) => [(i.productos?.nombre || "").replace(/^Queso /, ""), fmtNum(i.sugerido, 0), fmtNum(i.propuesto, 0)]), [0.56, 0.22, 0.22]);
    });
    else { const mot = vx.sin_pedido_motivo ? (MOTIVOS_SIN_PEDIDO.find((m) => m[0] === vx.sin_pedido_motivo) || [, vx.sin_pedido_motivo])[1] : null; y = texto(mot ? `Sin pedido. Motivo: ${mot}${vx.sin_pedido_nota ? " · " + vx.sin_pedido_nota : ""}` : v.checkout_at ? "Cerró sin pedido y sin motivo." : "Todavía no hay pedido.", 25, y) + 30; }
    if (vx.comentario) { titulo("Comentario de la vendedora"); y = texto(vx.comentario, 25, y) + 30; }
    // Fotos: dos por fila, completas (sin recortar), con su pie
    if (imgs.length) {
      titulo(`Fotos · ${d.fotos.length}`);
      const fw = (AN - 20) / 2, fh = 560;
      for (let i = 0; i < imgs.length; i += 2) {
        [imgs[i], imgs[i + 1]].forEach((it, j) => {
          if (!it) return; const X = M + j * (fw + 20);
          caja(X, y, fw, fh, 18, FO);
          if (it.bmp) { const e = Math.min(fw / it.bmp.width, fh / it.bmp.height), w = it.bmp.width * e, h = it.bmp.height * e; x.save(); x.beginPath(); x.roundRect(X, y, fw, fh, 18); x.clip(); x.drawImage(it.bmp, X + (fw - w) / 2, y + (fh - h) / 2, w, h); x.restore(); }
          else { F(400, 22); x.fillStyle = GR; x.fillText("Foto no disponible", X + 24, y + fh / 2); }
          F(600, 22); x.fillStyle = TI; x.fillText(FICHA.mueble(it.f.tipo, it.f.tipo === "bodega" ? it.f.productos : it.f.mueble), X, y + fh + 12);
          F(400, 20); x.fillStyle = GR; x.fillText(fmtHora(it.f.tomada_at), X, y + fh + 42);
        });
        y += fh + 90;
      }
    }
    y += 6; x.fillStyle = BD; x.fillRect(M, y, AN, 1.5); y += 22;
    F(400, 20); x.fillStyle = GR; x.fillText(`Generado con Clarus · ${new Date().toLocaleString("es-PA", { timeZone: "America/Panama", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}`, M, y); y += 60;
    const out = document.createElement("canvas"); out.width = W; out.height = Math.ceil(y);
    out.getContext("2d").drawImage(c, 0, 0);
    return await new Promise((ok, no) => out.toBlob((b) => (b ? ok(b) : no(new Error("sin imagen"))), "image/jpeg", 0.9));
  },

  foto(url, pie) {
    const v = document.createElement("div");
    v.className = "fv-visor"; v.innerHTML = `<img src="${esc(url)}" alt=""><div class="fv-pie">${esc(pie || "")}</div><button class="x-btn" aria-label="Cerrar">✕</button>`;
    // Abre con la foto completa a la vista. Tocar la foto la amplía (se desliza con el dedo) y otro toque la vuelve a mostrar completa; tocar fuera o la ✕ cierra.
    v.onclick = (e) => {
      if (e.target.tagName !== "IMG") return v.remove();
      const r = e.target.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      v.classList.toggle("zoom");
      if (v.classList.contains("zoom")) { const n = e.target.getBoundingClientRect(); v.scrollLeft = n.width * fx - innerWidth / 2; v.scrollTop = n.height * fy - innerHeight / 2; }
    };
    document.body.appendChild(v);
  },
};
// Cualquier elemento con data-fv="<id de visita>" abre la ficha.
document.addEventListener("click", (e) => { const el = e.target.closest("[data-fv]"); if (el && !e.target.closest("button:not([data-fv]),a:not([data-fv])")) { e.preventDefault(); FICHA.abrir(Number(el.dataset.fv)); } });
