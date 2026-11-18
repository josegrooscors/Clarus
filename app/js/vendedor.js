// Pantallas del vendedor: ruta del día, visita (gestión, fotos, inventario, promociones, pedido, cierre) y pedidos
const Visita = {
  get() { return LS.get("visita"); },
  set(v) { LS.set("visita", v); },
  fin() { LS.del("visita"); },
};

// Motivos de "sin pedido" (como en las apps de preventa): quedan registrados en la visita y se ven en el Resumen
// Motivos para justificar una tienda programada que no se va a visitar (catálogo cerrado + "otro" con nota)
const MOTIVOS_NO_VISITA = [
  ["reunion_oficina", "Reunión en la oficina"],
  ["tienda_cerrada", "Tienda cerrada"],
  ["otro", "Otro motivo"],
];
const motivoNoVisita = (k) => (MOTIVOS_NO_VISITA.find((m) => m[0] === k) || [0, k])[1];
const MOTIVOS_SIN_PEDIDO = [
  ["sin_stock", "No tenemos producto en bodega (empresa)"],
  ["tienda_bodega", "La tienda tiene producto en su bodega"],
  ["no_autoriza", "El encargado no autorizó el pedido"],
  ["pedido_central", "La cadena hace el pedido directo"],
  ["no_hace_falta", "No hace falta: el inventario alcanza"],
  ["otro", "Otro motivo"],
];
const PASOS = [
  ["fotos", "Fotos"], ["inventario", "Inventario"], ["promos", "Promociones"],
  ["pedido", "Pedido"], ["gestion", "Gestión"], ["cierre", "Cierre"],
];
// Evidencias obligatorias: sin ellas no se puede hacer check-out
// Fotos por mueble: la tienda tiene sus muebles (nevera abierta, vitrina deli...) y cada uno lleva al menos 1 foto. Bodega siempre.
// Los muebles salen de lo último usado en esa tienda, o de la auditoría de espacio, o por defecto vitrina deli + nevera abierta.
const FOTOS = {
  slots(v) {
    if (!v.mueblesFoto) {
      const cat = LS.get("cat") || {};
      const tipos = LS.get("mf:" + v.cliente_id) || [...new Set((cat.tiendaMuebles || []).filter((m) => m.cliente_id === v.cliente_id).sort((a, b) => a.orden - b.orden).map((m) => m.mueble))];
      v.mueblesFoto = FOTOS.armar(tipos.length ? tipos : ["deli", "nevera"]);
    }
    return v.mueblesFoto;
  },
  armar(tipos) {
    const n = {};
    return tipos.map((t) => { n[t] = (n[t] || 0) + 1; return { k: t + "-" + n[t], mueble: t }; })
      .map((x) => ({ ...x, nombre: PL.MUEBLES[x.mueble] + (tipos.filter((t) => t === x.mueble).length > 1 ? " " + x.k.split("-")[1] : "") }));
  },
  guardar(v) { LS.set("mf:" + v.cliente_id, v.mueblesFoto.map((m) => m.mueble)); Visita.set(v); },
  // lista de evidencias obligatorias: [clave, texto]
  req(v) { return [["bodega", "Bodega"], ...FOTOS.slots(v).map((m) => [m.k, m.nombre])]; },
  de(v, k) { return v.fotos.filter((f) => (f.slot || (f.tipo === "bodega" ? "bodega" : null)) === k); },
};
const FOTOS_REQ = [["bodega", "Bodega"], ["exhibicion_deli", "Exhibición deli"], ["exhibicion_empacado", "Exhibición empacado"]];

const V = {
  // ---------------- HOY ----------------
  async hoy(root, sel) {
    const cat = await DB.catalogos();
    const v = Visita.get();
    const dias = proximosDias(7);
    sel = sel || dias[0].iso;
    const dSel = dias.find((d) => d.iso === sel) || dias[0], esHoy = dSel.iso === dias[0].iso;
    const dia = dSel.dia;
    const hechas = LS.get("hechas:" + hoyISO(), {});
    const justTodo = LS.get("just", {}), justDe = (id, iso = dSel.iso) => { const x = justTodo[iso + "|" + id]; return x && x.p !== -1 ? x : null; };
    const rutaIds = cat.ruta.filter((r) => (r.dias_semana || []).includes(dia)).map((r) => r.cliente_id);
    const ordenDe = (id) => cat.ruta.find((r) => r.cliente_id === id)?.orden ?? 999;
    const ruta = cat.clientes.filter((c) => rutaIds.includes(c.id)).sort((a, b) => ordenDe(a.id) - ordenDe(b.id) || a.nombre.localeCompare(b.nombre));
    const nombre = (DB.perfil.nombre || "").split(" ")[0];
    const hora = new Date().getHours();
    const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
    const hoyProg = () => cat.ruta.filter((r) => (r.dias_semana || []).includes(dias[0].dia) && !(justDe(r.cliente_id, dias[0].iso) && !hechas[r.cliente_id])).length;
    root.innerHTML = `
      <div class="top"><div><div class="muted small">${new Date().toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long" })}</div><h1>${saludo}, ${esc(nombre)}</h1></div><span id="syncpill"></span></div>
      ${v ? `<div class="card" style="border-color:var(--azul-med);background:var(--azul-cl)">
          <div class="row"><div class="grow"><div class="small muted">Visita en curso desde ${fmtHora(v.at)}</div><h2>${esc(v.tienda)}</h2></div>
          <a class="btn" href="#visita">Continuar</a></div></div>` : ""}
      <div id="porEscanear"></div>
      <div id="desemp">${V.tarjetaDesempeno(LS.get("desemp"), hoyProg(), Object.keys(hechas).length)}</div>
      ${V.tarjetaObjetivo(cat)}
      <h3 style="margin:18px 0 10px">Mi ruta</h3>
      <div class="steps">${dias.map((d) => `<div class="step ${d.iso === dSel.iso ? "on" : ""}" data-dia="${d.iso}">${d.etiqueta} <span class="tiny">· ${cat.ruta.filter((r) => (r.dias_semana || []).includes(d.dia)).length}</span></div>`).join("")}</div>
      <div class="list" id="ruta">${ruta.length ? "" : `<div class="empty card flat"><div class="ic">${ic("ruta", 34)}</div>${esHoy ? "Hoy no tienes tiendas asignadas." : "No tienes tiendas programadas para este día."}<br><span class="small">Puedes iniciar una visita desde "Otra tienda".</span></div>`}</div>
      <div class="row" style="margin:20px 0 10px"><h3 class="sp">Otra tienda</h3></div>
      <input class="in" id="buscar" placeholder="Buscar tienda o cadena…">
      <div class="list" id="otras" style="margin-top:10px"></div>`;
    const fila = (c, i) => {
      const h = hechas[c.id], enRuta = rutaIds.includes(c.id) && typeof i === "number", j = enRuta ? justDe(c.id) : null;
      return `<div class="item" data-c="${c.id}"><div class="ava">${enRuta ? i + 1 : esc(iniciales(c.cadena || c.nombre))}</div>
        <div class="grow"><div class="t">${esc(c.nombre)}</div><div class="small muted">${esc(c.cadena || "")}${c.zona ? " · " + esc(c.zona) : ""}</div>${V.avanceTienda(cat, c.id)}
          ${enRuta && !(h && esHoy) ? (j ? `<div class="nov-l"><span>No se visitará: <b>${esc(motivoNoVisita(j.motivo))}</b>${j.nota ? " · " + esc(j.nota) : ""}</span> <a data-nov="${c.id}">Cambiar</a></div>` : `<div class="nov-l"><a data-nov="${c.id}">No podré visitarla</a></div>`) : ""}</div>
        ${h && esHoy ? `<span class="pill p-menta">✓ ${fmtHora(h)}</span>` : j ? `<span class="pill p-gris">Justificada</span>` : esHoy ? `<span class="pill p-azul">Iniciar</span>` : `<span class="pill p-gris">${esc(dSel.etiqueta)}</span>`}</div>`;
    };
    $("#ruta", root).insertAdjacentHTML("beforeend", ruta.map((c, i) => fila(c, i)).join(""));
    $$("[data-dia]", root).forEach((el) => (el.onclick = () => { root.innerHTML = ""; const nr = root.cloneNode(false); root.replaceWith(nr); V.hoy(nr, el.dataset.dia); }));
    const pintarOtras = (q) => {
      q = sinAcentos(q.trim());
      const lista = q ? cat.clientes.filter((c) => q.split(/\s+/).every((w) => sinAcentos(c.nombre + " " + (c.cadena || "") + " " + (c.codigo || "") + " " + (c.zona || "")).includes(w))).slice(0, 25) : [];
      $("#otras", root).innerHTML = lista.map((c) => fila(c)).join("") || (q ? `<div class="muted small">Sin resultados</div>` : "");
    };
    $("#buscar", root).oninput = (e) => pintarOtras(e.target.value);
    root.addEventListener("click", (e) => {
      const nv = e.target.closest("[data-nov]");
      if (nv) { e.preventDefault(); const c = cat.clientes.find((x) => x.id == nv.dataset.nov); return this.noVisita(c, dSel, ruta.filter((x) => !(esHoy && hechas[x.id]) && !justDe(x.id)), justDe(c.id), () => { const nr = root.cloneNode(false); root.replaceWith(nr); V.hoy(nr, dSel.iso); }); }
      const it = e.target.closest("[data-c]"); if (!it) return;
      const c = cat.clientes.find((x) => x.id == it.dataset.c);
      this.iniciar(c);
    });
    App.syncPill();
    if (navigator.onLine) sb.rpc("mi_desempeno").then(({ data }) => {
      if (!data) return; LS.set("desemp", data);
      const el = $("#desemp", root); if (el) el.innerHTML = V.tarjetaDesempeno(data, hoyProg(), Object.keys(hechas).length);
    });
    if (navigator.onLine) sb.from("v_pedidos").select("id", { count: "exact", head: true }).eq("vendedor_id", DB.user.id).in("estado", ["propuesto", "aprobado"]).is("documento", null).then(({ count }) => {
      const el = $("#porEscanear", root); if (!el || !count) return;
      el.innerHTML = `<a class="card" href="#mis-pedidos" style="display:flex;gap:12px;align-items:center;text-decoration:none;color:inherit;background:var(--azul-cl);border-color:var(--azul-med)">
        <span style="color:var(--azul)">${ic("doc", 26)}</span><div class="grow"><b>${plur(count, "pedido")} sin orden escaneada</b><div class="small muted">Escanea la orden de compra cuando la tienda te la entregue</div></div><span class="btn sm">Escanear</span></a>`;
    });
    // Actualiza tiendas y productos en segundo plano; si hay cambios, vuelve a pintar
    if (navigator.onLine && !V._refrescando) {
      V._refrescando = true;
      DB.catalogos(true).then((n) => {
        V._refrescando = false;
        if (JSON.stringify([n.clientes, n.ruta, n.productos, n.ap]) !== JSON.stringify([cat.clientes, cat.ruta, cat.productos, cat.ap]) && location.hash.replace("#", "") in { "": 1, hoy: 1 }) App.render();
      }).catch(() => (V._refrescando = false));
    }
  },

  // Tienda sin ubicación: quien tenga permiso la guarda desde la visita, parado en la tienda
  avisoGps(box, c) {
    if (!box || !c || c.lat != null || !(DB.puede("ubicacion") || DB.puede("tiendas"))) return;
    box.innerHTML = `<div class="card" style="background:var(--durazno);border-color:#F6D9B0;display:flex;gap:12px;align-items:center">
      <span style="color:var(--durazno-t)">${ic("ruta", 24)}</span><div class="grow"><b>Esta tienda no tiene ubicación</b>
      <div class="small" style="color:var(--durazno-t)">Si estás dentro de la tienda, guárdala para validar las próximas visitas.</div></div>
      <button class="btn sm" data-gps>Guardar</button></div>`;
    $("[data-gps]", box).onclick = async (e) => {
      const b = e.currentTarget;
      if (!navigator.onLine) return toast("Necesitas señal para guardar la ubicación");
      if (!(await confirmar(`Se guardará tu ubicación actual como la ubicación de ${c.nombre}. Hazlo solo si estás dentro de la tienda.`, "Guardar ubicación"))) return;
      b.disabled = true; toast("Obteniendo ubicación…", 9000);
      try {
        const p = await ubicacion();
        const { error } = await sb.rpc("fijar_ubicacion_tienda", { p_cliente: c.id, p_lat: p.lat, p_lng: p.lng, p_precision: p.precision });
        if (error) throw error;
        c.lat = p.lat; c.lng = p.lng; DB.catalogos(true).catch(() => {});
        box.innerHTML = ""; toast(`Ubicación guardada ✓ (precisión ${p.precision} m)`, 3500);
      } catch (err) { b.disabled = false; toast(err.message, 4500); }
    };
  },

  async iniciar(c) {
    if (Visita.get()) { toast("Primero cierra la visita en curso"); location.hash = "#visita"; return; }
    if (!(await confirmar(`Vas a hacer check-in en ${c.nombre}. Se registrará tu hora y ubicación.`, "Hacer check-in"))) return;
    toast("Obteniendo ubicación…", 9000);
    let pos;
    try { pos = await ubicacion(); } catch (e) { toast(e.message, 4000); return; }
    let aviso = "", dist = null;
    if (c.lat != null) {
      dist = distanciaM(pos, { lat: c.lat, lng: c.lng });
      if (dist > (c.radio_m || 100)) aviso = `Estás a ${fmtDist(dist)} de la tienda, fuera del radio permitido (${c.radio_m || 100} m). La visita quedará registrada como FUERA DE RADIO.`;
    } else aviso = "Esta tienda todavía no tiene ubicación registrada, así que no se puede validar que estés en ella. Avísale a tu supervisor.";
    if (aviso && !(await confirmar(aviso, "Continuar igual"))) return;
    const v = { lid: uid(), cliente_id: c.id, tienda: c.nombre, cadena: c.cadena, modalidad: c.modalidad || "pedido_tienda", at: new Date().toISOString(), lat: pos.lat, lng: pos.lng, precision: pos.precision,
      gestiones: {}, fotos: [], inv: {}, promos: [], pedido: null, guardado: {} };
    Visita.set(v);
    await DB.encolar({ t: "visita_in", lid: v.lid, data: { cliente_id: c.id, at: v.at, lat: pos.lat, lng: pos.lng, precision: pos.precision } });
    toast(dist != null && dist > (c.radio_m || 100) ? `Check-in fuera de radio (${fmtDist(dist)})` : "Check-in registrado ✓", 3500);
    // Alertas pendientes de esta tienda: se muestran antes de empezar y piden «Entendido»
    if (navigator.onLine) {
      try {
        const r = await Promise.race([sb.rpc("alertas_tienda", { p_cliente: c.id }), new Promise((_, no) => setTimeout(() => no(new Error("lento")), 6000))]);
        if (r.data?.alertas?.length) { v.alertas = r.data.alertas; v.ultima = r.data.ultima; Visita.set(v); }
      } catch {}
    }
    location.hash = "#visita";
  },

  // Pantalla de alertas al hacer check-in: no se puede empezar la visita sin tocar «Entendido»
  alertas(root, v) {
    const ICO = { inventario: "alerta", sin_conteo: "caja", sin_pedido: "pedidos", planograma: "planograma", comunicado: "msg" };
    root.innerHTML = `<div class="top"><div><div class="small muted">Check-in ${fmtHora(v.at)} · ${esc(v.cadena || "")}</div><h1>${esc(v.tienda)}</h1></div></div>
      <div class="chk-al"><div class="chk-al-cab">${ic("alerta", 22)}<div><b>Antes de empezar</b><div class="small">${v.alertas.length === 1 ? "Esta tienda tiene 1 alerta pendiente" : `Esta tienda tiene ${v.alertas.length} alertas pendientes`}${v.ultima ? ` · última visita ${fmtFecha(v.ultima.fecha)}` : ""}</div></div></div>
        ${v.alertas.map((a) => `<div class="chk-al-i ${a.nivel === "alta" ? "alta" : ""}"><span class="chk-al-ic">${ic(ICO[a.tipo] || "alerta", 20)}</span><div class="grow"><b>${esc(a.titulo)}</b>
          <div class="small">${esc(a.detalle)}</div>
          ${a.productos?.length ? `<div class="al-p" style="margin:6px 0">${a.productos.map((p) => `<span class="pill ${p.agotado ? "p-rosa" : p.bajo ? "p-durazno" : "p-gris"}">${esc(p.producto)}: ${p.agotado ? "AGOTADO" : fmtNum(p.kg, 1) + " kg" + (p.pct != null ? ` · ${p.pct}%` : "")}${!p.ultima && p.fecha ? ` <small>(${String(p.fecha).slice(8, 10)}/${String(p.fecha).slice(5, 7)})</small>` : ""}</span>`).join("")}</div>` : ""}
          </div></div>`).join("")}
        <button class="btn block chk-al-ok" id="alOk">Entendido</button>
        <p class="tiny muted" style="text-align:center;margin:8px 0 0">Al confirmar queda registrado que leíste estas alertas.</p></div>`;
    $("#alOk", root).onclick = async () => {
      v.alertasOk = new Date().toISOString(); Visita.set(v);
      await DB.encolar({ t: "alertas", lid: v.lid, cliente_id: v.cliente_id, alertas: v.alertas, at: v.alertasOk,
        comunicados: v.alertas.filter((a) => a.comunicado_id).map((a) => a.comunicado_id) });
      toast("Alertas confirmadas ✓"); V.visita(root);
    };
  },

  // ---------------- VISITA ----------------
  async visita(root, paso) {
    const v = Visita.get();
    if (!v) { location.hash = "#hoy"; return; }
    const cat = await DB.catalogos();
    if (v.alertas?.length && !v.alertasOk) return this.alertas(root, v);
    paso = paso || LS.get("paso") || "fotos";
    if (!PASOS.some((p) => p[0] === paso)) paso = "fotos";
    LS.set("paso", paso);
    const hecho = this.estado(v);
    root.innerHTML = `
      <div class="top"><div><div class="small muted">Check-in ${fmtHora(v.at)} · ${esc(v.cadena || "")}</div><h1>${esc(v.tienda)}</h1></div><span id="syncpill"></span></div>
      <div class="steps">${PASOS.map(([k, t]) => `<div class="step ${k === paso ? "on" : hecho[k] ? "ok" : ""}" data-p="${k}">${hecho[k] && k !== paso ? "✓ " : ""}${t}</div>`).join("")}</div>
      <div id="gpsTienda"></div><div id="paso"></div>`;
    $$(".step", root).forEach((s) => (s.onclick = () => V.visita(root, s.dataset.p)));
    V.avisoGps($("#gpsTienda", root), cat.clientes.find((c) => c.id === v.cliente_id));
    const box = $("#paso", root);
    const sig = (p) => () => V.visita(root, p);
    App.syncPill();
    if (paso === "fotos") return this.pFotos(box, v, sig("inventario"));
    if (paso === "inventario") return this.pInventario(box, v, cat, sig("promos"));
    if (paso === "promos") return this.pPromos(box, v, cat, sig("pedido"));
    if (paso === "pedido") return this.pPedido(box, v, cat, sig("gestion"));
    if (paso === "gestion") return this.pGestion(box, v, cat, sig("cierre"));
    if (paso === "cierre") return this.pCierre(box, v, (p) => V.visita(root, p));
  },

  // Qué está completo en la visita
  estado(v) {
    const fotosOk = FOTOS.req(v).every(([k]) => FOTOS.de(v, k).length);
    // Gestión ya no es una lista para marcar: solo pide respuesta si la tienda tiene planograma que revisar
    const pls = PL.deTienda(LS.get("cat") || {}, v.cliente_id) || [];
    const gestion = !!v.guardado.gestion || pls.every((p) => (v.planos || {})[p.id]);
    return { fotos: fotosOk, inventario: !!v.guardado.inventario, promos: !!v.guardado.promos || v.promos.length > 0, pedido: !!v.pedido || (v.modalidad === "pedido_cliente" && !v.forzarPedido), gestion };
  },
  pendientes(v) {
    const e = this.estado(v), out = [];
    FOTOS.req(v).forEach(([k, t]) => { if (!FOTOS.de(v, k).length) out.push(["fotos", "Foto de " + t.toLowerCase()]); });
    if (!e.inventario) out.push(["inventario", "Inventario"]);
    if (!e.promos) out.push(["promos", "Promociones"]);
    if (!e.pedido) out.push(["pedido", "Pedido"]);
    if (!e.gestion) out.push(["gestion", "Revisar planograma"]);
    return out;
  },

  pGestion(box, v, cat, siguiente) {
    box.onclick = null; box.oninput = null;
    const pls = PL.deTienda(cat, v.cliente_id);
    box.innerHTML = `${AUD.enVisita(v, cat)}${PL.enVisita(v, cat)}
      ${pls.length ? "" : `<p class="muted small" style="margin-top:0">Esta tienda no tiene planograma que revisar. Lo que hiciste queda registrado solo con tus fotos, inventario y pedido.</p>`}
      <button class="btn block" style="margin-top:16px" data-ok>Seguir</button>`;
    PL.enlazarVisita(box, v);
    AUD.enlazarVisita(box, v, cat, () => this.pGestion(box, v, cat, siguiente));
    $("[data-ok]", box).onclick = async () => {
      if (pls.some((p) => !(v.planos || {})[p.id])) return toast("Indica si la exhibición cumple el planograma");
      if (pls.length) await DB.encolar({ t: "planos", lid: v.lid, rows: pls.map((p) => ({ planograma_id: p.id, cumple: v.planos[p.id] })) });
      v.guardado.gestion = true; Visita.set(v); siguiente();
    };
  },


  pFotos(box, v, siguiente) {
    box.onclick = null; box.oninput = null;
    const slots = FOTOS.slots(v), completo = this.estado(v).fotos;
    const tarjeta = (k, nombre, icono, quitar) => {
      const fs = FOTOS.de(v, k);
      return `<div class="inv"><div class="row"><span class="foto-ic">${icono}</span><div class="sp"><div class="nm">${esc(nombre)}</div>
          <div class="tiny muted">${fs.length ? plur(fs.length, "foto") + " · última " + fmtHora(fs[fs.length - 1].at) : "Obligatoria · al menos 1 foto"}</div></div>
          ${fs.length ? `<span class="pill p-menta">✓ Lista</span>` : `<span class="pill p-durazno">Falta</span>`}</div>
        ${fs.length ? `<div class="thumbs" style="margin-top:10px">${fs.map((f) => `<div class="thumb-b"><img src="${f.thumb}"><button type="button" class="thumb-x" data-borrar="${f.key}" aria-label="Borrar foto">✕</button></div>`).join("")}</div>` : ""}
        <div class="row" style="gap:8px;margin-top:10px"><button class="btn ${fs.length ? "ghost" : "sec"} sm sp" data-f="${k}">${ic("camara", 18)} ${fs.length ? "Otra foto" : "Tomar foto"}</button>
          ${quitar && !fs.length ? `<button class="btn ghost sm" data-quitar="${k}">Quitar mueble</button>` : ""}</div></div>`;
    };
    box.innerHTML = `<p class="muted small" style="margin-top:0">Toma la bodega y <b>al menos 1 foto de cada mueble</b> de la tienda. Puedes tomar varias y borrar las que salgan mal antes del check-out.</p>
      <div class="list">${tarjeta("bodega", "Bodega", ic("caja", 22), false)}</div>
      <h3 class="sec-t" style="margin-top:16px">Muebles de la tienda</h3>
      <div class="list">${slots.map((m) => tarjeta(m.k, m.nombre, PL.icono(m.mueble, 24), slots.length > 1)).join("")}</div>
      <button class="btn ghost block" style="margin-top:10px" data-add>+ Agregar mueble</button>
      <div id="addm" hidden><div class="pl-tipos" style="margin-top:10px">${Object.entries(PL.MUEBLES).map(([t, n]) => `<button type="button" class="pl-tipo" data-tipo="${t}">${PL.icono(t)}<span>${n}</span></button>`).join("")}</div></div>
      <button class="btn block" style="margin-top:16px" data-ok ${completo ? "" : "disabled"}>${completo ? "Seguir" : "Toma las fotos que faltan para seguir"}</button>`;
    const redibujar = () => this.pFotos(box, v, siguiente);
    $("[data-add]", box).onclick = () => { $("#addm", box).hidden = !$("#addm", box).hidden; };
    $$("[data-tipo]", box).forEach((b) => (b.onclick = () => {
      const tipos = v.mueblesFoto.map((m) => m.mueble).concat(b.dataset.tipo);
      const viejos = Object.fromEntries(v.mueblesFoto.map((m) => [m.k, m]));
      v.mueblesFoto = FOTOS.armar(tipos).map((m) => viejos[m.k] ? { ...viejos[m.k], nombre: m.nombre } : m);
      FOTOS.guardar(v); toast(`${PL.MUEBLES[b.dataset.tipo]} agregado`); redibujar();
    }));
    $$("[data-quitar]", box).forEach((b) => (b.onclick = () => { v.mueblesFoto = v.mueblesFoto.filter((m) => m.k !== b.dataset.quitar); FOTOS.guardar(v); redibujar(); }));
    $$("[data-borrar]", box).forEach((b) => (b.onclick = async () => {
      if (!(await confirmar("La foto se borra y puedes tomar otra en su lugar.", "Borrar foto", "Cancelar", "¿Borrar esta foto?"))) return;
      const key = b.dataset.borrar;
      v.fotos = v.fotos.filter((f) => f.key !== key); Visita.set(v);
      // si todavía no se subió, se quita de la cola; si ya se subió, se borra en el servidor
      const op = (await IDB.ops()).find((o) => o.t === "foto" && o.blob === key);
      if (op) { await IDB.delOp(op.k); await IDB.delBlob(key); } else await DB.encolar({ t: "foto_borrar", key });
      toast("Foto borrada"); redibujar();
    }));
    $$("[data-f]", box).forEach((b) => (b.onclick = async () => {
      try {
        const k = b.dataset.f, m = v.mueblesFoto.find((x) => x.k === k);
        const nombre = k === "bodega" ? "Bodega" : m.nombre, tipo = k === "bodega" ? "bodega" : "exhibicion_" + m.mueble;
        const r = await Camara.evidencia({ titulo: nombre, marca: v.tienda });
        if (!r) return;
        const key = uid(); await IDB.putBlob(key, r.blob);
        v.fotos.push({ key, tipo, slot: k, tipoTxt: nombre, at: r.at, thumb: r.thumb }); Visita.set(v);
        await DB.encolar({ t: "foto", lid: v.lid, blob: key, data: { tipo, mueble: k === "bodega" ? null : nombre, at: r.at, lat: v.lat, lng: v.lng } });
        redibujar();
      } catch (e) { toast(e.message, 4000); }
    }));
    $("[data-ok]", box).onclick = siguiente;
  },

  productosTienda(v, cat) {
    const ap = cat.ap.filter((a) => a.cliente_id === v.cliente_id);
    const prods = ap.length ? cat.productos.filter((p) => ap.some((a) => a.producto_id === p.id)) : cat.productos;
    return prods.map((p) => ({ ...p, regla: ap.find((a) => a.producto_id === p.id) || null }));
  },

  pInventario(box, v, cat, siguiente) {
    const prods = this.productosTienda(v, cat);
    if (!prods.length) { box.innerHTML = `<div class="empty card flat"><div class="ic">${ic("caja", 34)}</div>No hay productos cargados todavía.</div><button class="btn block" data-ok>Seguir</button>`; $("[data-ok]", box).onclick = siguiente; return; }
    const val = (p, u) => v.inv[p + ":" + u] ?? "";
    box.innerHTML = `<p class="muted small" style="margin-top:0">Cuenta las unidades. La app las convierte a kilos.</p>
      <div class="list">${prods.map((p) => `
        <div class="inv ${v.agot?.[p.id] ? "agotado" : ""}" data-p="${p.id}"><div class="row"><div class="grow"><div class="nm">${esc(p.nombre)}</div>
          <div class="tiny muted">1 ${esc(p.unidad_conteo)} = ${fmtNum(p.peso_kg_unidad, 3)} kg</div></div>
          <button type="button" class="agot ${v.agot?.[p.id] ? "on" : ""}" data-agot="${p.id}">${v.agot?.[p.id] ? "✕ Agotado" : "Agotado"}</button></div>
          <div class="cols">${["bodega", "exhibicion"].map((u) => `<div><div class="tiny muted" style="margin-bottom:4px">${u === "bodega" ? "Bodega" : "Exhibición"} (${esc(p.unidad_conteo)}s)</div>
            <div class="stepper"><button data-m="${u}">−</button><input inputmode="decimal" data-u="${u}" value="${val(p.id, u)}" placeholder="0"><button data-s="${u}">+</button></div></div>`).join("")}</div>
          <div class="kg"></div></div>`).join("")}</div>
      <div class="card flat" style="margin-top:12px"><div class="row"><span class="sp muted">Total contado</span><b id="totkg"></b></div></div>
      <button class="btn block" style="margin-top:4px" data-ok>Guardar inventario</button>`;
    const calc = () => {
      let tot = 0;
      $$(".inv", box).forEach((el) => {
        const p = prods.find((x) => x.id == el.dataset.p);
        const b = parseFloat($("[data-u=bodega]", el).value) || 0, e = parseFloat($("[data-u=exhibicion]", el).value) || 0;
        const kg = (b + e) * Number(p.peso_kg_unidad); tot += kg;
        $(".kg", el).innerHTML = v.agot?.[p.id] ? `<b style="color:var(--rosa-t)">Producto agotado en la tienda</b>` : b + e ? `${fmtNum(b + e)} ${esc(p.unidad_conteo)}s = <b>${fmtNum(kg, 2)} kg</b>` : "";
      });
      $("#totkg").textContent = fmtNum(tot, 2) + " kg";
    };
    // una sola acción por pantalla (onclick reemplaza; addEventListener se acumulaba al volver a dibujar y sumaba de a 2)
    box.onclick = (e) => {
      const ag = e.target.closest("[data-agot]");
      if (ag) {
        const pid = ag.dataset.agot, card = ag.closest(".inv"); v.agot = v.agot || {};
        v.agot[pid] = !v.agot[pid];
        card.classList.toggle("agotado", v.agot[pid]); ag.classList.toggle("on", v.agot[pid]); ag.textContent = v.agot[pid] ? "✕ Agotado" : "Agotado";
        if (v.agot[pid]) $$("[data-u]", card).forEach((i) => { i.value = 0; v.inv[pid + ":" + i.dataset.u] = 0; });
        Visita.set(v); calc(); return;
      }
      const b = e.target.closest("[data-m],[data-s]"); if (!b) return;
      const u = b.dataset.m || b.dataset.s, inp = $(`[data-u=${u}]`, b.closest(".inv"));
      inp.value = Math.max(0, (parseFloat(inp.value) || 0) + (b.dataset.s ? 1 : -1)); inp.dispatchEvent(new Event("input", { bubbles: true }));
    };
    box.oninput = (e) => {
      const i = e.target.closest("[data-u]"); if (!i) return;
      v.inv[i.closest(".inv").dataset.p + ":" + i.dataset.u] = i.value === "" ? "" : Math.max(0, parseFloat(i.value) || 0); Visita.set(v); calc();
    };
    calc();
    $("[data-ok]", box).onclick = async () => {
      const rows = [];
      const sinContar = prods.filter((p) => !v.agot?.[p.id] && ["bodega", "exhibicion"].every((u) => (v.inv[p.id + ":" + u] ?? "") === ""));
      if (sinContar.length) { toast(`Cuenta ${sinContar.map((p) => p.nombre).join(" y ")} o márcalo como agotado`, 4000); return; }
      prods.forEach((p) => ["bodega", "exhibicion"].forEach((u) => { const x = v.agot?.[p.id] ? 0 : v.inv[p.id + ":" + u]; rows.push({ producto_id: p.id, ubicacion: u, unidades: x === "" || x == null ? 0 : Number(x), agotado: !!v.agot?.[p.id] }); }));
      await DB.encolar({ t: "inventario", lid: v.lid, rows });
      v.guardado.inventario = true; Visita.set(v); toast("Inventario guardado ✓"); siguiente();
    };
  },

  pPromos(box, v, cat, siguiente) {
    const tipos = { oferta_precio: "Oferta de precio", "2x1": "2x1 / combo", degustacion: "Degustación", material_pop: "Material POP", otra: "Otra" };
    box.innerHTML = `<p class="muted small" style="margin-top:0">Registra las promociones u ofertas que viste, con su foto.</p>
      <div class="list">${v.promos.map((p) => `<div class="item"><img src="${p.thumb}" style="width:48px;height:48px;border-radius:10px;object-fit:cover"><div class="grow"><div class="t">${esc(tipos[p.tipo])}</div><div class="small muted">${esc(p.producto || "")}${p.precio_oferta ? " · $" + p.precio_oferta : ""}</div></div></div>`).join("") || `<div class="empty"><div class="ic">${ic("etiqueta", 34)}</div>Sin promociones registradas</div>`}</div>
      <div class="row" style="margin-top:16px"><button class="btn sec sp" data-add>+ Agregar promoción</button><button class="btn sp" data-ok>${v.promos.length ? "Seguir" : "No hay promociones"}</button></div>`;
    $("[data-ok]", box).onclick = () => { v.guardado.promos = true; Visita.set(v); siguiente(); };
    $("[data-add]", box).onclick = () => {
      const prods = this.productosTienda(v, cat);
      modal(`<h2>Nueva promoción</h2>
        <label class="f">Tipo</label><select class="in" name="tipo">${Object.entries(tipos).map(([k, t]) => `<option value="${k}">${t}</option>`).join("")}</select>
        <label class="f">Producto</label><select class="in" name="producto"><option value="">— General —</option>${prods.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("")}</select>
        <div class="row"><div class="sp"><label class="f">Precio normal</label><input class="in" name="pr" inputmode="decimal" placeholder="$"></div><div class="sp"><label class="f">Precio oferta</label><input class="in" name="po" inputmode="decimal" placeholder="$"></div></div>
        <label class="f">Vigente hasta</label><input class="in" type="date" name="vig">
        <label class="f">Nota</label><input class="in" name="nota" placeholder="Opcional">
        <button class="btn block" style="margin-top:16px" data-foto>${ic("camara", 18)} Tomar foto y guardar</button>`, (m, close) => {
        $("[data-foto]", m).onclick = async () => {
          try {
            const r = await Camara.evidencia({ titulo: "Foto de la promoción", marca: v.tienda });
            if (!r) return;
            const key = uid(), plid = uid(); await IDB.putBlob(key, r.blob);
            const f = (n) => $(`[name=${n}]`, m).value;
            const pid = f("producto") ? Number(f("producto")) : null;
            const data = { tipo: f("tipo"), producto_id: pid, precio_regular: parseFloat(f("pr")) || null, precio_oferta: parseFloat(f("po")) || null, vigencia_hasta: f("vig") || null, nota: f("nota"), at: r.at, lat: v.lat, lng: v.lng };
            v.promos.push({ ...data, thumb: r.thumb, producto: prods.find((p) => p.id === pid)?.nombre });
            Visita.set(v);
            await DB.encolar({ t: "promo", lid: v.lid, plid, blob: key, data });
            close(); this.pPromos(box, v, cat, siguiente);
          } catch (e) { toast(e.message, 4000); }
        };
      });
    };
  },

  pPedido(box, v, cat, siguiente) {
    if (!v.pedido && v.modalidad === "pedido_cliente" && !v.forzarPedido) {
      box.innerHTML = `<div class="card"><div class="row"><span style="color:var(--azul)">${ic("pedidos", 26)}</span><div class="grow"><h2>Este cliente envía su pedido</h2>
        <p class="small muted" style="margin:4px 0 0">${esc(v.cadena || "La cadena")} manda el pedido directamente a la empresa. Aquí solo haces la visita y el servicio; no necesitas levantar pedido.</p></div></div>
        <button class="btn ghost block sm" style="margin-top:12px" data-forzar>Hacer un pedido de todas formas</button></div><button class="btn block" data-ok>Seguir</button>`;
      $("[data-forzar]", box).onclick = () => { v.forzarPedido = true; Visita.set(v); this.pPedido(box, v, cat, siguiente); };
      $("[data-ok]", box).onclick = siguiente; return;
    }
    if (v.pedido && !v.editandoPedido) {
      if (v.pedido.ninguno) {
        box.innerHTML = `<div class="card"><h2>Sin pedido</h2><p class="small muted">${v.pedido.motivo ? "Motivo: <b>" + esc(MOTIVOS_SIN_PEDIDO.find((m) => m[0] === v.pedido.motivo)?.[1] || "") + "</b>" + (v.motivoNota ? " · " + esc(v.motivoNota) : "") : "Indicaste que esta visita no necesita pedido."}</p>
          <button class="btn ghost block sm" data-camb>Hacer un pedido</button></div><button class="btn block" data-ok>Seguir</button>`;
        $("[data-camb]", box).onclick = () => { v.pedido = null; Visita.set(v); this.pPedido(box, v, cat, siguiente); };
        $("[data-ok]", box).onclick = siguiente; return;
      }
      box.innerHTML = `<div class="card"><div class="row"><h2 class="sp">Pedido enviado</h2>${pillPedido("propuesto")}</div>
        <div class="list" style="margin-top:12px">${v.pedido.items.map((i) => { const pr = cat.productos.find((x) => x.id === i.producto_id); return `<div class="row"><span class="sp">${esc(i.nombre)}</span><span style="text-align:right"><b>${fmtNum(i.propuesto)} ${esc(plural(i.propuesto, i.unidad))}</b><div class="tiny muted">${fmtKg(kgLinea(i.propuesto, pr))}</div></span></div>`; }).join("")}
          <div class="row" style="border-top:1px solid var(--borde);padding-top:8px"><span class="sp muted">Total</span><b>${fmtKg(v.pedido.items.reduce((a, i) => a + kgLinea(i.propuesto, cat.productos.find((x) => x.id === i.producto_id)), 0))}</b></div></div>
        ${v.pedido.nota ? `<p class="small muted">Nota: ${esc(v.pedido.nota)}</p>` : ""}
        <p class="small muted">Ya le llegó a operaciones. Puedes editarlo o anularlo mientras no lo impriman.</p>
        <div class="row"><button class="btn ghost sm sp" data-edit>Editar pedido</button><button class="btn peligro sm sp" data-anul>Anular</button></div></div>
      <div class="card" style="border-color:var(--azul-med)"><div class="row"><span style="color:var(--azul)">${ic("doc", 26)}</span><div class="grow"><h3>Orden de compra de la tienda</h3>
        <div class="small muted">${v.pedido.orden ? `Escaneada ✓ · ${plur(v.pedido.orden.paginas, "página")} · ${fmtHora(v.pedido.orden.at)}` : "Escanea la hoja física que te entrega la tienda. En la oficina la descargan e imprimen."}</div></div></div>
        <button class="btn ${v.pedido.orden ? "ghost" : ""} block" style="margin-top:12px" data-scan>${ic("camara", 18)} ${v.pedido.orden ? "Volver a escanear" : "Escanear orden de compra"}</button></div>
        <button class="btn sec block" data-ok>Seguir</button>`;
      $("[data-scan]", box).onclick = async () => {
        const r = await V.escanearOrden({ plid: v.pedido.plid });
        if (r) { v.pedido.orden = r; Visita.set(v); this.pPedido(box, v, cat, siguiente); }
      };
      $("[data-ok]", box).onclick = siguiente;
      $("[data-edit]", box).onclick = () => { v.editandoPedido = true; Visita.set(v); this.pPedido(box, v, cat, siguiente); };
      $("[data-anul]", box).onclick = async () => {
        if (!(await confirmar("Se anulará este pedido. Luego puedes hacer uno nuevo.", "Anular pedido"))) return;
        await DB.encolar({ t: "pedido_anular", plid: v.pedido.plid });
        v.pedido = null; Visita.set(v); toast("Pedido anulado"); this.pPedido(box, v, cat, siguiente);
      };
      return;
    }
    const previo = v.editandoPedido && v.pedido ? v.pedido : null;
    const prods = this.productosTienda(v, cat);
    const filas = prods.map((p) => {
      const stock = (Number(v.inv[p.id + ":bodega"]) || 0) + (Number(v.inv[p.id + ":exhibicion"]) || 0);
      const contado = (v.inv[p.id + ":bodega"] ?? "") !== "" || (v.inv[p.id + ":exhibicion"] ?? "") !== "";
      let sug = 0, bajo = false;
      const r = p.regla;
      if (r && r.stock_minimo != null && contado && stock <= Number(r.stock_minimo)) {
        bajo = true;
        const obj = r.stock_objetivo != null ? Number(r.stock_objetivo) : Number(r.stock_minimo) * 2;
        sug = Math.max(0, Math.ceil((obj - stock) / (Number(p.unidades_por_pedido) || 1)));
      }
      const valor = previo ? previo.items.find((i) => i.producto_id === p.id)?.propuesto || "" : sug || "";
      return { p, stock, contado, sug, bajo, valor };
    });
    const bajos = filas.filter((f) => f.bajo).length;
    box.innerHTML = `${!v.guardado.inventario ? `<div class="card flat" style="background:var(--durazno);border-color:#F6DDBB"><b>Primero guarda el inventario</b><div class="small">Así la app calcula el pedido sugerido.</div></div>` : ""}
      ${previo ? `<div class="card flat" style="background:var(--azul-cl);border-color:var(--azul-med)"><b>Editando el pedido</b><div class="small">Cambia las cantidades y guarda.</div></div>` : ""}
      <p class="muted small" style="margin-top:0">${bajos ? `${plur(bajos, "producto")} con inventario bajo. Revisa la sugerencia y ajusta las cantidades.` : "No hay productos bajo el mínimo. Si igual hace falta pedir, escribe las cantidades."}</p>
      <div class="list">${filas.map((f) => `<div class="inv" data-p="${f.p.id}"><div class="row"><div class="sp" style="min-width:0"><div class="nm nm-estado">${esc(f.p.nombre)}${v.agot?.[f.p.id] ? `<span class="pill p-rosa">Agotado</span>` : f.bajo ? `<span class="pill p-rosa">Bajo</span>` : ""}</div>
          ${V.objProducto(cat, v.cliente_id, f.p)}
          <div class="tiny muted">Inventario: ${f.contado ? fmtNum(f.stock) + " " + esc(plural(f.stock, f.p.unidad_conteo)) : "sin contar"}${f.p.regla?.stock_minimo != null ? " · mínimo " + fmtNum(f.p.regla.stock_minimo) : ""}</div></div></div>
          <div class="row" style="margin-top:10px"><span class="small muted sp">${f.sug ? "Sugerido: <b>" + f.sug + " " + esc(plural(f.sug, f.p.unidad_pedido)) + "</b>" : esc(plural(2, f.p.unidad_pedido))}</span>
          <div class="stepper" style="width:150px"><button data-m>−</button><input inputmode="numeric" value="${f.valor}" placeholder="0"><button data-s>+</button></div></div>
          <div class="kg" data-kg></div></div>`).join("")}</div>
      <div class="card flat" style="margin-top:12px"><div class="row"><span class="sp muted">Total del pedido</span><b id="totkgp"></b></div></div>
      <label class="f">Nota para operaciones</label><input class="in" id="nota" placeholder="Opcional" value="${esc(previo?.nota || "")}">
      <div class="row" style="margin-top:16px">${previo ? `<button class="btn sec sp" data-cancel>Cancelar</button>` : `<button class="btn sec sp" data-no>Sin pedido</button>`}<button class="btn sp" data-ok>${previo ? "Guardar cambios" : "Enviar pedido"}</button></div>`;
    const calcKg = () => {
      let tot = 0;
      filas.forEach((f) => {
        const q = parseFloat($(`[data-p="${f.p.id}"] input`, box).value) || 0, k = kgLinea(q, f.p); tot += k;
        $(`[data-p="${f.p.id}"] [data-kg]`, box).innerHTML = q ? `${fmtNum(q)} ${esc(plural(q, f.p.unidad_pedido))} = <b>${fmtKg(k)}</b>` : "";
      });
      $("#totkgp").textContent = fmtKg(tot);
    };
    box.onclick = (e) => {
      const b = e.target.closest("[data-m],[data-s]"); if (!b) return;
      const inp = $("input", b.parentElement); inp.value = Math.max(0, (parseInt(inp.value) || 0) + (b.dataset.s !== undefined ? 1 : -1)) || ""; calcKg();
    };
    box.oninput = calcKg;
    calcKg();
    const no = $("[data-no]", box); if (no) no.onclick = () => this.pSinPedido(box, v, cat, siguiente, bajos > 0 || filas.some((f) => v.agot?.[f.p.id]));
    const cn = $("[data-cancel]", box); if (cn) cn.onclick = () => { v.editandoPedido = false; Visita.set(v); this.pPedido(box, v, cat, siguiente); };
    $("[data-ok]", box).onclick = async () => {
      const items = filas.map((f) => ({ producto_id: f.p.id, nombre: f.p.nombre, unidad: f.p.unidad_pedido, stock: f.contado ? f.stock : null, sugerido: f.sug || null,
        propuesto: parseFloat($(`[data-p="${f.p.id}"] input`, box).value) || 0 })).filter((i) => i.propuesto > 0);
      if (!items.length && previo) {
        if (!(await confirmar("Todas las cantidades están en cero: se anulará el pedido y te pediremos el motivo.", "Anular pedido"))) return;
        await DB.encolar({ t: "pedido_anular", plid: previo.plid });
        v.pedido = null; v.editandoPedido = false; Visita.set(v); toast("Pedido anulado");
        return this.pSinPedido(box, v, cat, siguiente, true);
      }
      if (!items.length) { toast("Escribe al menos una cantidad o toca «Sin pedido»"); return; }
      const nota = $("#nota").value.trim();
      if (previo) {
        await DB.encolar({ t: "pedido_editar", plid: previo.plid, nota, items });
        v.pedido = { plid: previo.plid, items, nota }; v.editandoPedido = false; Visita.set(v);
        toast("Pedido actualizado ✓"); this.pPedido(box, v, cat, siguiente); return;
      }
      const plid = uid();
      await DB.encolar({ t: "pedido", lid: v.lid, plid, data: { cliente_id: v.cliente_id, nota }, items });
      v.pedido = { plid, items, nota }; Visita.set(v);
      toast("Pedido enviado a operaciones ✓"); this.pPedido(box, v, cat, siguiente);
    };
  },

  // Sin pedido: se elige el motivo (obligatorio si hay productos bajos o agotados)
  pSinPedido(box, v, cat, siguiente, requerido) {
    box.onclick = null; box.oninput = null; // no heredar las acciones de la pantalla de pedido
    let sel = v.motivoSinPedido || (requerido ? "" : "no_hace_falta");
    const pintar = () => {
      box.innerHTML = `<div class="card"><h3 style="margin:0 0 4px">¿Por qué no hay pedido?</h3>
        <div class="small muted" style="margin-bottom:10px">${requerido ? "Hay productos bajos o agotados: el motivo queda registrado para tu supervisor." : "Elige el motivo."}</div>
        <div class="list">${MOTIVOS_SIN_PEDIDO.filter(([k]) => !(requerido && k === "no_hace_falta")).map(([k, t]) => `<div class="check ${sel === k ? "on" : ""}" data-mot="${k}"><div class="box">✓</div><div>${esc(t)}</div></div>`).join("")}</div>
        <label class="f">Comentario ${sel === "otro" ? "" : '<span class="tiny muted">(opcional)</span>'}</label><input class="in" id="motn" value="${esc(v.motivoNota || "")}" placeholder="${sel === "sin_stock" ? "Ej.: Muenster llega el jueves" : "Ej.: el jefe de compras vuelve mañana"}"></div>
        <div class="row" style="margin-top:12px"><button class="btn sec sp" data-volver>Volver al pedido</button><button class="btn sp" data-ok>Seguir sin pedido</button></div>`;
      $$("[data-mot]", box).forEach((el) => (el.onclick = () => { v.motivoNota = $("#motn", box).value; sel = el.dataset.mot; pintar(); }));
      $("[data-volver]", box).onclick = () => { this.pPedido(box, v, cat, siguiente); };
      $("[data-ok]", box).onclick = async () => {
        const nota = $("#motn", box).value.trim();
        if (!sel) return toast("Elige el motivo");
        if (sel === "otro" && !nota) return toast("Escribe el motivo en el comentario");
        await DB.encolar({ t: "sin_pedido", lid: v.lid, motivo: sel, nota });
        v.pedido = { ninguno: true, items: [], motivo: sel }; v.motivoSinPedido = sel; v.motivoNota = nota; Visita.set(v);
        toast("Listo: visita sin pedido · " + MOTIVOS_SIN_PEDIDO.find((m) => m[0] === sel)[1]);
        siguiente();
      };
    };
    pintar();
  },

  pCierre(box, v, ir) {
    const pend = this.pendientes(v);
    const ok = !pend.length;
    // Lo que hizo la vendedora sale solo de los pasos y las evidencias (sin casillas para marcar)
    const e = this.estado(v), cat0 = LS.get("cat") || {}, pls = PL.deTienda(cat0, v.cliente_id) || [];
    const req = FOTOS.req(v), nFotos = req.filter(([k]) => FOTOS.de(v, k).length).length;
    const agot = Object.keys(v.agot || {}).filter((k) => v.agot[k]).length;
    const kgPed = (v.pedido?.items || []).reduce((t, i) => t + kgLinea(i.propuesto, (cat0.productos || []).find((x) => x.id === i.producto_id)), 0);
    const items = [
      ["fotos", `Fotos de evidencia · ${nFotos} de ${req.length} (${v.fotos.length} foto${v.fotos.length === 1 ? "" : "s"})`, e.fotos],
      ["inventario", `Inventario contado${agot ? ` · ${plur(agot, "agotado")}` : ""}`, e.inventario],
      ["promos", "Promociones revisadas", e.promos],
      ["pedido", v.pedido?.ninguno ? `Sin pedido${v.pedido.motivo ? " · " + (MOTIVOS_SIN_PEDIDO.find((m) => m[0] === v.pedido.motivo)?.[1] || "") : ""}` : v.pedido?.items?.length ? `Pedido enviado · ${fmtKg(kgPed)}` : "Pedido", e.pedido],
      ...(pls.length ? [["gestion", `Planograma revisado${pls.length > 1 ? " (" + pls.length + ")" : ""}`, e.gestion]] : []),
      ...(v.auditoria ? [["gestion", `Auditoría de espacio · ${v.auditoria.pct == null ? "hecha" : v.auditoria.pct + "% de la categoría"}`, true]] : []),
      ...((v.fotosCat || []).length ? [["gestion", `Fotos de la categoría · ${v.fotosCat.length}`, true]] : []),
    ];
    box.innerHTML = `<div class="card"><h2 style="margin-bottom:10px">Lo que hiciste en la visita</h2>
      ${items.map(([p, t, h]) => `<div class="row" style="padding:7px 0;cursor:pointer" data-ir="${p}"><span class="sp">${h ? "✓ " : ""}${esc(t)}</span>${h ? `<span class="pill p-menta">Listo</span>` : `<span class="pill p-rosa">Pendiente ›</span>`}</div>`).join("")}
      <div class="row" style="padding:7px 0"><span class="sp">Tiempo en tienda</span><b>${minutos(v.at, new Date())} min</b></div></div>
      ${ok ? "" : `<div class="card flat" style="background:var(--rosa);border-color:#F3C4C0"><b>No puedes hacer check-out todavía</b>
        <div class="small" style="margin:2px 0 8px">Falta completar:</div>
        <div class="row" style="gap:8px;flex-wrap:wrap">${pend.map(([p, t]) => `<button class="btn sm" data-ir="${p}">${esc(t)} ›</button>`).join("")}</div></div>`}
      ${(() => {
        const ag = v.modalidad === "pedido_cliente" ? [] : Object.keys(v.agot || {}).filter((k) => v.agot[k] && !(v.pedido?.items || []).some((i) => String(i.producto_id) === k));
        if (!ag.length) return "";
        const nombres = ag.map((k) => (LS.get("cat")?.productos || []).find((p) => String(p.id) === k)?.nombre?.replace(/^Queso /, "") || "producto").join(", ");
        const mot = v.motivoAgotado ? MOTIVOS_SIN_PEDIDO.find((m) => m[0] === v.motivoAgotado)?.[1] : null;
        return `<div class="card flat" style="background:#FFF7EC;border-color:#F5D9AE"><div class="row" style="gap:8px"><b class="sp">Aviso: ${esc(nombres)} agotado sin pedido</b><span class="pill p-gris">No bloquea</span></div>
          ${mot ? `<div class="small" style="margin-top:4px">Motivo registrado: <b>${esc(mot)}</b></div>`
            : `<div class="small" style="margin-top:4px">Le aparecerá a tu supervisor. Si no pediste porque no hay producto o por otra razón, indica el motivo.</div>
          <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn sm" data-motag>Indicar motivo</button><button class="btn ghost sm" data-ir="pedido">Agregar al pedido</button></div>`}</div>`;
      })()}
      <label class="f">Comentario de la visita</label><textarea class="in" id="com" placeholder="Opcional">${esc(v.comentario || "")}</textarea>
      <button class="btn block ok" style="margin-top:16px" data-out ${ok ? "" : "disabled"}>Hacer check-out</button>`;
    $$("[data-ir]", box).forEach((el) => (el.onclick = () => ir(el.dataset.ir)));
    $("#com").oninput = (e) => { v.comentario = e.target.value; Visita.set(v); };
    const ma = $("[data-motag]", box); if (ma) ma.onclick = () => {
      const op = MOTIVOS_SIN_PEDIDO.filter(([k]) => k !== "no_hace_falta");
      const caja = document.createElement("div"); caja.className = "card"; caja.style.marginTop = "8px";
      caja.innerHTML = `<b>¿Por qué no pediste el producto agotado?</b><div class="list" style="margin-top:8px">${op.map(([k, t]) => `<div class="check" data-m2="${k}"><div class="box">✓</div><div>${esc(t)}</div></div>`).join("")}</div>`;
      ma.closest(".card").after(caja); ma.disabled = true;
      $$("[data-m2]", caja).forEach((el) => (el.onclick = async () => {
        v.motivoAgotado = el.dataset.m2; Visita.set(v);
        await DB.encolar({ t: "sin_pedido", lid: v.lid, motivo: el.dataset.m2, nota: "Agotado sin pedido" });
        toast("Motivo registrado ✓"); this.pCierre(box, v, ir);
      }));
    };
    $("[data-out]", box).onclick = async () => {
      if (this.pendientes(v).length) return toast("Completa lo pendiente para hacer check-out");
      toast("Obteniendo ubicación…", 9000);
      let pos;
      try { pos = await ubicacion(); } catch (e) { toast(e.message, 4000); return; }
      const at = new Date().toISOString();
      await DB.encolar({ t: "visita_out", lid: v.lid, data: { at, lat: pos.lat, lng: pos.lng, precision: pos.precision, comentario: v.comentario } });
      const hechas = LS.get("hechas:" + hoyISO(), {}); hechas[v.cliente_id] = at; LS.set("hechas:" + hoyISO(), hechas);
      Visita.fin(); LS.del("paso");
      toast(`Visita cerrada · ${minutos(v.at, at)} min en tienda ✓`, 3500);
      location.hash = "#hoy";
    };
  },

  // ---------- Objetivos de venta ----------
  objDe(cat, clienteId) { return (cat.obj || []).filter((o) => o.cliente_id === clienteId); },
  avanceTienda(cat, clienteId) {
    const os = this.objDe(cat, clienteId).filter((o) => Number(o.objetivo_kg) > 0);
    if (!os.length) return "";
    return `<div class="tiny" style="margin-top:4px;display:flex;gap:10px;flex-wrap:wrap">${os.map((o) => {
      const p = cat.productos.find((x) => x.id === o.producto_id), pc = pct(o.venta_kg, o.objetivo_kg);
      const nom = (p?.nombre || "").replace(/^Queso /, "");
      return `<span class="pill ${colorPct(pc)}" style="font-weight:500">${esc(nom)} ${fmtNum(cajas(o.venta_kg, p), 1)}/${fmtNum(cajas(o.objetivo_kg, p), 0)} cj</span>`;
    }).join("")}</div>`;
  },
  objProducto(cat, clienteId, p) {
    const o = this.objDe(cat, clienteId).find((x) => x.producto_id === p.id);
    if (!o || !Number(o.objetivo_kg)) return "";
    const falta = Math.max(0, cajas(o.objetivo_kg - o.venta_kg, p)), pc = pct(o.venta_kg, o.objetivo_kg);
    return `<div class="tiny" style="margin:2px 0"><span class="pill ${colorPct(pc)}" style="font-weight:500">Objetivo del mes ${fmtNum(cajas(o.objetivo_kg, p), 0)} cj · facturado ${fmtNum(cajas(o.venta_kg, p), 1)} · ${falta > 0 ? "faltan " + fmtNum(falta, 1) : "cumplido ✓"}</span></div>`;
  },
  // Justificar una tienda programada que no se va a visitar (queda registrado para gerencia y no baja el cumplimiento)
  noVisita(c, dSel, pendientes, actual, alTerminar) {
    let sel = actual?.motivo || "", todas = false;
    const otras = pendientes.filter((x) => x.id !== c.id);
    const cuando = dSel.etiqueta === "Hoy" ? "hoy" : dSel.etiqueta === "Mañana" ? "mañana" : "el " + dSel.etiqueta;
    modal("", (m, close) => {
      const sheet = $(".sheet", m);
      const pintar = (nota = actual?.nota || "") => {
        sheet.innerHTML = `<h2 style="margin-bottom:4px">No podré visitar esta tienda</h2>
          <p class="muted small" style="margin:0 0 12px"><b>${esc(c.nombre)}</b> · ${esc(cuando)}. El motivo le queda registrado a tu supervisor y esta tienda no cuenta en tu cumplimiento de ruta.</p>
          <div class="list">${MOTIVOS_NO_VISITA.map(([k, t]) => `<div class="check ${sel === k ? "on" : ""}" data-mot="${k}"><div class="box">✓</div><div>${esc(t)}</div></div>`).join("")}</div>
          <label class="f">${sel === "otro" ? "Escribe el motivo" : 'Comentario <span class="tiny muted">(opcional)</span>'}</label><input class="in" id="novn" maxlength="140" value="${esc(nota)}" placeholder="${sel === "tienda_cerrada" ? "Ej.: cerrada por inventario" : sel === "reunion_oficina" ? "Ej.: reunión con gerencia a las 2 p. m." : "Ej.: vía cerrada por protesta"}">
          ${!actual && otras.length ? `<div class="check ${todas ? "on" : ""}" data-todas style="margin-top:10px"><div class="box">✓</div><div>Aplicar también a ${otras.length === 1 ? "la otra tienda" : "las otras " + otras.length + " tiendas"} sin visitar de ${esc(cuando)}</div></div>` : ""}
          <div class="row" style="margin-top:16px"><button class="btn sec sp" data-no>${actual ? "Quitar justificación" : "Cancelar"}</button><button class="btn sp" data-ok>Guardar</button></div>`;
        $$("[data-mot]", sheet).forEach((el) => (el.onclick = () => { sel = el.dataset.mot; pintar($("#novn", sheet).value); }));
        const t = $("[data-todas]", sheet); if (t) t.onclick = () => { todas = !todas; pintar($("#novn", sheet).value); };
        $("[data-no]", sheet).onclick = async () => {
          if (actual) { const j = LS.get("just", {}); j[dSel.iso + "|" + c.id] = { ...actual, p: -1 }; LS.set("just", j); await DB.encolar({ t: "no_visita_quitar", cliente_id: c.id, fecha: dSel.iso }); toast("Justificación quitada: la tienda vuelve a tu ruta"); }
          close(); if (actual) alTerminar();
        };
        $("[data-ok]", sheet).onclick = async () => {
          const nota = $("#novn", sheet).value.trim();
          if (!sel) return toast("Elige el motivo");
          if (sel === "otro" && !nota) return toast("Escribe el motivo");
          const filas = (todas ? [c, ...otras] : [c]).map((x) => ({ cliente_id: x.id, fecha: dSel.iso }));
          const j = LS.get("just", {}); filas.forEach((x) => (j[x.fecha + "|" + x.cliente_id] = { motivo: sel, nota, p: 1 })); LS.set("just", j);
          await DB.encolar({ t: "no_visita", rows: filas, motivo: sel, nota });
          close(); toast(filas.length === 1 ? "Justificada: " + motivoNoVisita(sel) : filas.length + " tiendas justificadas: " + motivoNoVisita(sel)); alTerminar();
        };
      };
      pintar();
    });
  },
  // Mi desempeño del mes (hasta ayer, sin feriados): cumplimiento de ruta + horarios promedio. Hoy se suma aparte.
  tarjetaDesempeno(d, hoyAg, hoyVis) {
    const mes = new Date().toLocaleDateString("es-PA", { month: "long" });
    const ag = d?.agendadas || 0, cu = d?.cumplidas || 0, pc = ag ? Math.round((cu / ag) * 100) : null;
    const tono = pc == null ? "" : pc >= 90 ? "ok" : pc >= 70 ? "medio" : "bajo";
    const hm = (m) => { if (m == null) return "—"; const h = Math.floor(m / 60), mi = String(m % 60).padStart(2, "0"); return `${h % 12 || 12}:${mi} ${h < 12 ? "a. m." : "p. m."}`; };
    return `<div class="card desemp">
      <div class="lbl">Mi desempeño de ${mes}</div>
      <div class="desemp-top"><b class="desemp-pct">${pc == null ? "—" : pc + "%"}</b><span class="desemp-tag ${tono}">${pc == null ? "Sin días cerrados aún" : pc >= 90 ? "Excelente" : pc >= 70 ? "Puedes mejorar" : "Atención"}</span></div>
      <div class="desemp-sub">Cumplimiento de ruta</div>
      <div class="barra"><i class="${tono}" style="width:${Math.min(100, pc || 0)}%"></i></div>
      <div class="row small desemp-cifras"><span class="sp">${cu} de ${ag} visitas agendadas</span><b>Hoy: ${hoyVis} de ${hoyAg}</b></div>
      <div class="desemp-mini">
        <div><span>${ic("sol", 16)} Inicio promedio</span><b>${hm(d?.inicio_min)}</b></div>
        <div><span>${ic("reloj", 16)} Tiempo por tienda</span><b>${d?.tienda_min != null ? d.tienda_min + " min" : "—"}</b></div>
        <div><span>${ic("luna", 16)} Cierre promedio</span><b>${hm(d?.cierre_min)}</b></div>
      </div></div>`;
  },
  tarjetaObjetivo(cat) {
    const mias = new Set(cat.ruta.map((r) => r.cliente_id));
    const os = (cat.obj || []).filter((o) => mias.has(o.cliente_id));
    if (!os.length) return "";
    const din = conDinero(), fM = din ? fmtUsd : fmtKilos;
    const obj = os.reduce((a, o) => a + Number((din ? o.objetivo_usd : o.objetivo_kg) || 0), 0), ven = os.reduce((a, o) => a + Number((din ? o.venta_usd : o.venta_kg) || 0), 0), pc = pct(ven, obj);
    const corte = os.map((o) => o.corte).filter(Boolean).sort().pop();
    const porProd = cat.productos.map((p) => {
      const x = os.filter((o) => o.producto_id === p.id); if (!x.length) return "";
      const ok = x.reduce((a, o) => a + Number(o.objetivo_kg), 0), vk = x.reduce((a, o) => a + Number(o.venta_kg), 0);
      return `<div class="row small" style="margin-top:6px"><span class="sp">${esc(p.nombre.replace(/^Queso /, ""))}</span><b>${fmtNum(cajas(vk, p), 1)} / ${fmtNum(cajas(ok, p), 0)} cajas</b><span class="pill ${colorPct(pct(vk, ok))}">${pct(vk, ok) ?? 0}%</span></div>`;
    }).join("");
    const mes = new Date(mesActual() + "T12:00:00").toLocaleDateString("es-PA", { month: "long" });
    return `<div class="card hero"><div class="row"><div class="grow"><div class="lbl muted">Mi objetivo de ${mes}</div><h2>${fM(ven)} <span class="muted" style="font-weight:500;font-size:15px">de ${fM(obj)}</span></h2></div><span class="pill ${colorPct(pc)}" style="font-size:14px">${pc ?? 0}%</span></div>
      ${barra(pc)}${porProd}${corte ? `<div class="tiny muted" style="margin-top:8px">${din ? "Facturado" : "Ventas"} al ${fmtFecha(corte + "T12:00:00")}</div>` : ""}</div>`;
  },

  // Escanear la orden de compra física (funciona sin señal: se envía cuando hay conexión)
  async escanearOrden(ref) {
    const numero = await new Promise((res) => modal(`<h2>Escanear orden de compra</h2>
      <p class="small muted">Pon la hoja sobre una superficie oscura y con buena luz. Si tiene varias páginas, las agregas una por una.</p>
      <label class="f">Número de la orden (opcional)</label><input class="in" id="norden" inputmode="text" placeholder="Ej. OC-12345">
      <div class="row" style="margin-top:16px"><button class="btn sec sp" data-no>Cancelar</button><button class="btn sp" data-si>${ic("camara", 18)} Abrir cámara</button></div>`, (m, close) => {
        $("[data-no]", m).onclick = () => { close(); res(null); };
        $("[data-si]", m).onclick = () => { const n = $("#norden", m).value.trim(); close(); res(n); };
      }));
    if (numero === null) return null;
    try {
      const r = await Escaner.escanear({ titulo: "Orden de compra" });
      if (!r) return null;
      let pos = null; try { pos = await ubicacion(6000); } catch {}
      const key = uid(), at = new Date().toISOString(); await IDB.putBlob(key, r.blob);
      await DB.encolar({ t: "orden", ...ref, blob: key, data: { paginas: r.paginas, numero_orden: numero, at, lat: pos?.lat, lng: pos?.lng } });
      toast(`Orden escaneada (${r.paginas} pág.) ✓ Se enviará a la oficina`, 3500);
      return { paginas: r.paginas, at, numero };
    } catch (e) { toast(e.message, 4000); return null; }
  },

  // ---------------- PEDIDOS (vendedor) ----------------
  async pedidos(root) {
    root.innerHTML = `<div class="top"><div><div class="muted small">Tus pedidos y su estado</div><h1>Mis pedidos</h1></div><span id="syncpill"></span></div><div class="list" id="lp"><div class="muted">Cargando…</div></div>`;
    App.syncPill();
    if (!navigator.onLine) { $("#lp").innerHTML = `<div class="empty card flat"><div class="ic">${ic("senal", 34)}</div>Sin señal. Los pedidos se verán cuando vuelva la conexión.</div>`; return; }
    const { data, error } = await sb.from("v_pedidos").select("*").eq("vendedor_id", DB.user.id).order("creado_at", { ascending: false }).limit(60);
    if (error) { $("#lp").innerHTML = `<div class="muted">${esc(error.message)}</div>`; return; }
    const orden = { propuesto: 0, aprobado: 1, orden_escaneada: 2, rechazado: 3, impreso: 4, anulado: 5 };
    data.sort((a, b) => orden[a.estado] - orden[b.estado] || new Date(b.creado_at) - new Date(a.creado_at));
    $("#lp").innerHTML = data.map((p) => `<div class="item" data-id="${p.id}"><div class="ava">${ic("pedidos", 20)}</div><div class="grow"><div class="t">${esc(p.tienda)}</div>
        <div class="small muted">${fmtFechaHora(p.creado_at)} · ${plur(fmtNum(p.total_cajas), "caja")}${p.total_kg != null ? " · " + fmtKg(p.total_kg) : ""}</div>${p.estado === "rechazado" && p.nota_revision ? `<div class="small" style="color:var(--rosa-t)">${esc(p.nota_revision)}</div>` : ""}
        <div class="item-pie">${pillPedido(p.estado)}${p.documento && p.estado === "propuesto" ? ` <span class="pill p-lila">Orden ✓</span>` : ""}${["propuesto", "aprobado"].includes(p.estado) && !p.documento ? `<span class="btn sm" style="margin-left:auto">${ic("camara", 16)} Escanear orden</span>` : ""}</div></div></div>`).join("") || `<div class="empty card flat"><div class="ic">${ic("pedidos", 34)}</div>Todavía no tienes pedidos.</div>`;
    $$("[data-id]", root).forEach((el) => (el.onclick = () => this.detallePedido(data.find((p) => p.id == el.dataset.id), () => this.pedidos(root))));
  },

  async detallePedido(p, recargar) {
    const { data: items } = await sb.from("pedido_items").select("*, productos(nombre, unidad_pedido, unidades_por_pedido, peso_kg_unidad)").eq("pedido_id", p.id).order("id");
    modal(`<div class="row"><h2 class="sp">${esc(p.tienda)}</h2>${pillPedido(p.estado)}</div>
      <div class="small muted" style="margin:4px 0 12px">Pedido #${p.id} · ${fmtFechaHora(p.creado_at)}</div>
      <table class="t"><tr><th>Producto</th><th>Cajas</th><th style="text-align:right">Kilos</th></tr>
      ${(items || []).map((i) => `<tr><td>${esc(i.productos.nombre)}</td><td>${p.estado === "propuesto" ? `<input class="in" style="width:80px;padding:8px" inputmode="decimal" data-i="${i.id}" value="${i.propuesto}">` : fmtNum(i.propuesto)}</td><td style="text-align:right" data-kgi="${i.id}">${fmtKg(kgLinea(i.propuesto, i.productos))}</td></tr>`).join("")}
      <tr><td colspan="2"><b>Total</b></td><td style="text-align:right"><b data-kgt>${fmtKg((items || []).reduce((a, i) => a + kgLinea(i.propuesto, i.productos), 0))}</b></td></tr></table>
      ${p.estado === "propuesto" ? `<p class="small muted">Todavía no lo imprimen: puedes corregir las cantidades o anularlo.</p>
        <div class="row"><button class="btn peligro sm sp" data-anul>Anular pedido</button><button class="btn sm sp" data-guardar>Guardar cambios</button></div>` : ""}
      ${p.nota_revision ? `<p class="small"><b>Nota:</b> ${esc(p.nota_revision)}</p>` : ""}
      ${["propuesto", "aprobado"].includes(p.estado) ? `<div class="card flat" style="background:var(--azul-cl);border-color:var(--azul-med);margin-top:14px"><b>Orden de compra de la tienda</b>
          <div class="small">${p.documento ? "Ya está escaneada ✓. Si cambió, puedes volver a escanearla." : "Cuando la tienda te entregue la orden física, escanéala aquí. En la oficina la descargan e imprimen."}</div></div>
        <button class="btn block" style="margin-top:12px" data-scan>${ic("camara", 18)} ${p.documento ? "Volver a escanear" : "Escanear orden de compra"}</button>` : ""}
      ${p.documento ? `<button class="btn sec block" style="margin-top:12px" data-ver>Ver orden escaneada</button>` : ""}`, (m, close) => {
      m.addEventListener("input", () => {
        let t = 0;
        (items || []).forEach((i) => { const inp = $(`[data-i="${i.id}"]`, m); const k = kgLinea(inp ? inp.value : i.propuesto, i.productos); t += k; $(`[data-kgi="${i.id}"]`, m).textContent = fmtKg(k); });
        $("[data-kgt]", m).textContent = fmtKg(t);
      });
      const g = $("[data-guardar]", m);
      if (g) g.onclick = async () => {
        for (const inp of $$("[data-i]", m)) {
          const val = parseFloat(inp.value) || 0;
          const r = val > 0 ? await sb.from("pedido_items").update({ propuesto: val }).eq("id", inp.dataset.i) : await sb.from("pedido_items").delete().eq("id", inp.dataset.i);
          if (r.error) { toast(r.error.message, 4000); return; }
        }
        toast("Pedido actualizado ✓"); close(); recargar();
      };
      const an = $("[data-anul]", m);
      if (an) an.onclick = async () => {
        if (!(await confirmar("Se anulará este pedido.", "Anular pedido"))) return;
        const { error } = await sb.from("pedidos").update({ estado: "anulado" }).eq("id", p.id);
        if (error) { toast(error.message, 4000); return; }
        toast("Pedido anulado"); close(); recargar();
      };
      const ver = $("[data-ver]", m);
      if (ver) ver.onclick = async () => window.open(await DB.urlFirmada("documentos", p.documento), "_blank");
      const sc = $("[data-scan]", m);
      if (sc) sc.onclick = async () => { close(); if (await V.escanearOrden({ pedido_id: p.id })) { await DB.sincronizar(); recargar(); } };
    });
  },
};
