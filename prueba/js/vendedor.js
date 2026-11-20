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
// Motivos para cerrar el inventario sin contar todas las categorías (avisa a gerencia, no bloquea)
const MOTIVOS_INV_INCOMPLETO = [
  ["no_maneja", "La tienda no maneja esas categorías"],
  ["sin_acceso", "No me dejaron entrar a la bodega o al área"],
  ["sin_tiempo", "No me alcanzó el tiempo"],
  ["otro", "Otro motivo"],
];
const motivoInvIncompleto = (k) => (MOTIVOS_INV_INCOMPLETO.find((m) => m[0] === k) || [0, k])[1];
const MOTIVOS_SIN_PEDIDO = [
  ["sin_stock", "No tenemos producto en bodega (empresa)"],
  ["tienda_bodega", "La tienda tiene producto en su bodega"],
  ["no_autoriza", "El encargado no autorizó el pedido"],
  ["pedido_central", "La cadena hace el pedido directo"],
  ["no_hace_falta", "No hace falta: el inventario alcanza"],
  ["otro", "Otro motivo"],
];
// El orden sigue el recorrido real de la tienda: bodega → exhibición (por mueble, con su foto y su conteo) → pedido → gestión (planograma, espacio, promociones) → cierre
const PASOS = [
  ["inventario", "Inventario"], ["exhibicion", "Exhibición"],
  ["pedido", "Pedido"], ["gestion", "Gestión"], ["cierre", "Cierre"],
];
const PASO_VIEJO = { fotos: "exhibicion", promos: "gestion" };
// Presentaciones que se cuentan en la exhibición. El empacado se cuenta en paquetes y Clarus lo pasa a kilos con el peso promedio del paquete.
const PAQ_KG = 0.13;
const PRES = [["b", null, null], ["r", "Rebanado", "paquetes de 130 g"], ["l", "Rallado", "paquetes de 130 g"]];
const MOTIVOS_INCOMPLETA = [
  ["me_fui", "Ya no estoy en la tienda"],
  ["sin_acceso", "No me dejaron terminar"],
  ["sin_tiempo", "No me alcanzó el tiempo"],
  ["otro", "Otro motivo"],
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
  req(v) { return FOTOS.slots(v).map((m) => [m.k, m.nombre]); },
  // Fotos de bodega de un producto (una visita empezada con la versión anterior trae una sola foto de bodega, que vale para todos)
  deProd(v, pid) { return v.fotos.filter((f) => (f.slot || (f.tipo === "bodega" ? "bodega" : null)) === "bodega" && (f.pid == null || String(f.pid) === String(pid))); },
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
      ${V.tarjetaMerma(cat)}
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
    // Candado: si el servidor tiene una visita mía abierta que este teléfono no conoce (otro teléfono, datos borrados), hay que cerrarla antes de entrar a otra tienda
    if (navigator.onLine && !(await IDB.ops()).some((o) => o.t === "visita_in" || o.t === "visita_out")) {
      try {
        const r = await Promise.race([sb.rpc("mi_visita_abierta", { p_id_local: null }), new Promise((_, no) => setTimeout(() => no(new Error("lento")), 5000))]);
        if (r.data?.id) {
          if (!(await confirmar(`Tienes una visita abierta en ${r.data.tienda} (entrada: ${fmtHora(r.data.entrada)}). Para entrar a otra tienda primero hay que cerrarla. Queda registrada como incompleta y la ve tu supervisor.`, "Cerrar esa visita", "Volver", "Tienes una visita sin cerrar"))) return;
          const c2 = await sb.rpc("cerrar_visita_incompleta", { p_id: r.data.id, p_nota: "Cerrada sin terminar: la visita no estaba en este teléfono" });
          if (c2.error || !c2.data) { toast("No se pudo cerrar esa visita. Revisa tu señal e intenta de nuevo.", 4000); return; }
          toast("Visita cerrada como incompleta");
        }
      } catch {}
    }
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
      gestiones: {}, fotos: [], inv: {}, exh: {}, flujo: 2, promos: [], pedido: null, guardado: {} };
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
    // Merma de esta tienda: se muestra después de las alertas (o sola, si la tienda tiene merma). Sale de lo guardado en el teléfono, así que sirve sin señal.
    const mt = MERMA.tienda(LS.get("cat"), c.id);
    if (mt && (mt.mes.m > 0 || mt.ant.m > 0 || v.alertas?.length)) { v.merma = mt; Visita.set(v); }
    location.hash = "#visita";
  },

  // Pantalla de alertas al hacer check-in: no se puede empezar la visita sin tocar «Entendido»
  alertas(root, v) {
    const ICO = { inventario: "alerta", sin_conteo: "caja", sin_pedido: "pedidos", planograma: "planograma", comunicado: "msg" };
    const als = v.alertas || [], mt = v.merma ? MERMA.textoTienda(v.merma) : null;
    const cab = als.length ? (als.length === 1 ? "Esta tienda tiene 1 alerta pendiente" : `Esta tienda tiene ${als.length} alertas pendientes`) + (v.ultima ? ` · última visita ${fmtFecha(v.ultima.fecha)}` : "") : "Así va la merma de esta tienda";
    root.innerHTML = `<div class="top"><div><div class="small muted">Check-in ${fmtHora(v.at)} · ${esc(v.cadena || "")}</div><h1>${esc(v.tienda)}</h1></div></div>
      <div class="chk-al ${als.length ? "" : "solo-merma"}"><div class="chk-al-cab">${ic(als.length ? "alerta" : "caja", 22)}<div><b>Antes de empezar</b><div class="small">${cab}</div></div></div>
        ${als.map((a) => `<div class="chk-al-i ${a.nivel === "alta" ? "alta" : ""}"><span class="chk-al-ic">${ic(ICO[a.tipo] || "alerta", 20)}</span><div class="grow"><b>${esc(a.titulo)}</b>
          <div class="small">${esc(a.detalle)}</div>
          ${a.productos?.length ? `<div class="al-p" style="margin:6px 0">${a.productos.map((p) => `<span class="pill ${p.agotado ? "p-rosa" : p.bajo ? "p-durazno" : "p-gris"}">${esc(p.producto)}: ${p.agotado ? "AGOTADO" : fmtNum(p.kg, 1) + " kg" + (p.pct != null ? ` · ${p.pct}%` : "")}${!p.ultima && p.fecha ? ` <small>(${String(p.fecha).slice(8, 10)}/${String(p.fecha).slice(5, 7)})</small>` : ""}</span>`).join("")}</div>` : ""}
          </div></div>`).join("")}
        ${mt ? `<div class="chk-al-i chk-merma ${mt.tono === "bajo" ? "alta" : ""}"><span class="chk-al-ic">${ic("caja", 20)}</span><div class="grow"><b>${esc(mt.titulo)}</b>
          <div class="small">${esc(mt.detalle)}</div>
          <div class="al-p" style="margin:6px 0"><span class="pill ${MERMA.pill(mt.ref)}">${mt.ref == null ? "Sin merma" : MERMA.etq(mt.ref)}</span></div>
          <div class="small">${esc(mt.consejo)}</div></div></div>` : ""}
        <button class="btn block chk-al-ok" id="alOk">Entendido</button>
        <p class="tiny muted" style="text-align:center;margin:8px 0 0">${als.length ? "Al confirmar queda registrado que leíste estas alertas." : "Al confirmar queda registrado que viste la merma de la tienda."}</p></div>`;
    $("#alOk", root).onclick = async () => {
      v.alertasOk = new Date().toISOString(); Visita.set(v);
      await DB.encolar({ t: "alertas", lid: v.lid, cliente_id: v.cliente_id, alertas: mt ? [...als, { tipo: "merma", titulo: mt.titulo, detalle: mt.detalle }] : als, at: v.alertasOk,
        comunicados: als.filter((a) => a.comunicado_id).map((a) => a.comunicado_id) });
      toast(als.length ? "Alertas confirmadas ✓" : "Confirmado ✓"); V.visita(root);
    };
  },

  // ---------------- VISITA ----------------
  async visita(root, paso) {
    const v = Visita.get();
    if (!v) { location.hash = "#hoy"; return; }
    const cat = await DB.catalogos();
    if ((v.alertas?.length || v.merma) && !v.alertasOk) return this.alertas(root, v);
    // Una visita empezada con la versión anterior se pasa al flujo nuevo sin perder lo contado
    if (v.flujo !== 2) {
      v.flujo = 2; v.exh = v.exh || {};
      const sl = FOTOS.slots(v), hay = Object.keys(v.inv || {}).filter((k) => k.endsWith(":exhibicion") && v.inv[k] !== "");
      if (hay.length && sl[0]) { const c = {}; hay.forEach((k) => (c[k.split(":")[0]] = { b: Number(v.inv[k]) || 0 })); sl.forEach((m, i) => (v.exh[m.k] = { ok: true, c: i ? {} : c })); }
      Visita.set(v);
    }
    let abrir = null;
    paso = paso || LS.get("paso") || "inventario";
    if (paso.includes(":")) [paso, abrir] = paso.split(":");
    paso = PASO_VIEJO[paso] || paso;
    if (!PASOS.some((p) => p[0] === paso)) paso = "inventario";
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
    if (paso === "inventario") return this.pInventario(box, v, cat, sig("exhibicion"));
    if (paso === "exhibicion") return this.pExhibicion(box, v, cat, sig("pedido"), abrir);
    if (paso === "pedido") return this.pPedido(box, v, cat, sig("gestion"));
    if (paso === "gestion") return this.pGestion(box, v, cat, sig("cierre"));
    if (paso === "cierre") return this.pCierre(box, v, (p) => V.visita(root, p));
  },

  // Qué está completo en la visita
  estado(v) {
    const slots = FOTOS.slots(v), exhOk = slots.every((m) => FOTOS.de(v, m.k).length && v.exh?.[m.k]?.ok);
    // Gestión ya no es una lista para marcar: solo pide respuesta si la tienda tiene planograma que revisar
    const pls = PL.deTienda(LS.get("cat") || {}, v.cliente_id) || [];
    const gestion = !!v.guardado.gestion || pls.every((p) => (v.planos || {})[p.id]);
    return { inventario: !!v.guardado.inventario && !this.sinFotoBodega(v).length, exhibicion: exhOk, pedido: !!v.pedido || (v.modalidad === "pedido_cliente" && !v.forzarPedido), gestion };
  },
  // Productos con existencia en bodega que todavía no tienen su foto (la foto solo es obligatoria si hay producto)
  sinFotoBodega(v) {
    const cat = LS.get("cat") || {};
    return Object.keys(v.inv || {}).filter((k) => k.endsWith(":bodega") && Number(v.inv[k]) > 0).map((k) => k.split(":")[0]).filter((pid) => !FOTOS.deProd(v, pid).length)
      .map((pid) => ({ id: pid, nombre: ((cat.productos || []).find((p) => String(p.id) === pid)?.nombre || "producto").replace(/^Queso /, "") }));
  },
  pendientes(v) {
    const e = this.estado(v), out = [];
    if (!v.guardado.inventario) out.push(["inventario", "Inventario de bodega"]);
    this.sinFotoBodega(v).forEach((p) => out.push(["inventario", "Foto de " + p.nombre + " en bodega"]));
    FOTOS.slots(v).forEach((m) => { if (!FOTOS.de(v, m.k).length) out.push(["exhibicion:" + m.k, "Foto de " + m.nombre.toLowerCase()]); if (!v.exh?.[m.k]?.ok) out.push(["exhibicion:" + m.k, "Conteo de " + m.nombre.toLowerCase()]); });
    if (!e.pedido) out.push(["pedido", "Pedido"]);
    if (!e.gestion) out.push(["gestion", "Revisar planograma"]);
    return out;
  },

  pGestion(box, v, cat, siguiente) {
    box.onclick = null; box.oninput = null;
    const pls = PL.deTienda(cat, v.cliente_id);
    const tiposP = { oferta_precio: "Oferta de precio", descuento: "Descuento (%)", "2x1": "2x1 / combo", degustacion: "Degustación", material_pop: "Material POP", otra: "Otra" };
    box.innerHTML = `${AUD.enVisita(v, cat)}${PL.enVisita(v, cat)}
      ${pls.length ? "" : `<p class="muted small" style="margin-top:0">Esta tienda no tiene planograma que revisar. Lo que hiciste queda registrado solo con tus fotos, inventario y pedido.</p>`}
      <div class="card" style="margin-top:12px"><div class="row" style="align-items:baseline;gap:8px"><h3 class="sp" style="margin:0">Promociones</h3><span class="tiny muted">las que viste hoy, con su foto</span></div>
        ${v.promos.length ? `<div class="list" style="margin-top:10px">${v.promos.map((p) => `<div class="item"><img src="${p.thumb}" alt="Foto de la promoción" style="width:48px;height:48px;border-radius:10px;object-fit:cover"><div class="grow"><div class="t">${esc(tiposP[p.tipo])}</div><div class="small muted">${esc(p.producto || "General")}${p.descuento_pct ? " · −" + fmtNum(p.descuento_pct, 1) + "%" : ""}${p.precio_oferta ? " · $" + fmtNum(p.precio_oferta, 2) : ""}</div></div></div>`).join("")}</div>` : `<div class="small muted" style="margin:8px 0 0">Sin promociones registradas. Si no hay, sigue.</div>`}
        <button type="button" class="btn sec block sm" style="margin-top:12px" data-promo>+ Agregar promoción</button></div>
      <button class="btn block" style="margin-top:16px" data-ok>Seguir</button>`;
    $("[data-promo]", box).onclick = () => this.promoNueva(v, cat, tiposP, () => this.pGestion(box, v, cat, siguiente));
    PL.enlazarVisita(box, v);
    AUD.enlazarVisita(box, v, cat, () => this.pGestion(box, v, cat, siguiente));
    $("[data-ok]", box).onclick = async () => {
      if (pls.some((p) => !(v.planos || {})[p.id])) return toast("Indica si la exhibición cumple el planograma");
      if (pls.length) await DB.encolar({ t: "planos", lid: v.lid, rows: pls.map((p) => ({ planograma_id: p.id, cumple: v.planos[p.id] })) });
      v.guardado.gestion = true; v.guardado.promos = true; Visita.set(v); siguiente();
    };
  },


  // ---------- Exhibición: cada mueble se cierra con su foto (cómo quedó) y el conteo de lo exhibido ----------
  presDe(m) { return ["deli", "vitrina"].includes(m.mueble) ? ["b"] : ["r", "l"]; },
  exhKg(x, p) { return (Number(x?.b) || 0) * Number(p.peso_kg_unidad) + ((Number(x?.r) || 0) + (Number(x?.l) || 0)) * PAQ_KG; },
  exhTexto(v, m, prods) {
    const e = v.exh?.[m.k]; if (!e?.ok) return "Falta el conteo";
    const t = prods.map((p) => { const x = e.c?.[p.id] || {}, b = Number(x.b) || 0, q = (Number(x.r) || 0) + (Number(x.l) || 0); return b || q ? `${p.nombre.replace(/^Queso /, "")} ${[b ? fmtNum(b) + " " + plural(b, p.unidad_conteo) : "", q ? q + " paq." : ""].filter(Boolean).join(" + ")}` : ""; }).filter(Boolean);
    return t.length ? t.join(" · ") : "Sin producto nuestro";
  },
  // Agotado en la tienda: bodega en cero y nada exhibido, cuando ya se contaron la bodega y todos los muebles
  recalcAgot(v, prods) {
    const todo = FOTOS.slots(v).every((m) => v.exh?.[m.k]?.ok); v.agot = v.agot || {};
    prods.forEach((p) => { const b = v.inv[p.id + ":bodega"]; v.agot[p.id] = todo && (b ?? "") !== "" && Number(b) === 0 && !(Number(v.inv[p.id + ":exhibicion"]) > 0); });
  },
  // Suma lo exhibido en los muebles ya contados y lo guarda como inventario de exhibición, con el desglose por mueble
  async guardarExh(v, prods) {
    const slots = FOTOS.slots(v).filter((m) => v.exh?.[m.k]?.ok);
    const filas = prods.map((p) => {
      let kg = 0; const det = [];
      slots.forEach((m) => { const x = v.exh[m.k].c?.[p.id]; if (!x) return; const k = this.exhKg(x, p); if (!k) return; kg += k; det.push({ mueble: m.nombre, tipo: m.mueble, barras: Number(x.b) || 0, rebanado: Number(x.r) || 0, rallado: Number(x.l) || 0 }); });
      const un = Number(p.peso_kg_unidad) > 0 ? Math.round((kg / Number(p.peso_kg_unidad)) * 1000) / 1000 : 0;
      v.inv[p.id + ":exhibicion"] = un;
      return { producto_id: p.id, ubicacion: "exhibicion", unidades: un, detalle: det };
    });
    this.recalcAgot(v, prods); Visita.set(v);
    if (!slots.length) return;
    await DB.encolar({ t: "inventario", lid: v.lid, conDetalle: true, rows: filas.map((f) => ({ ...f, agotado: !!v.agot[f.producto_id] })) });
    const bod = prods.filter((p) => this.contado(v, p)); if (bod.length) await DB.encolar({ t: "inventario", lid: v.lid, rows: this.filasInv(v, bod) });
  },
  pExhibicion(box, v, cat, siguiente, abrir) {
    box.onclick = null; box.oninput = null;
    const slots = FOTOS.slots(v), prods = this.productosTienda(v, cat), redibujar = (k) => this.pExhibicion(box, v, cat, siguiente, k);
    if (abrir && slots.some((m) => m.k === abrir)) return this.pMueble(box, v, cat, prods, abrir, () => redibujar());
    const completo = (m) => FOTOS.de(v, m.k).length > 0 && !!v.exh?.[m.k]?.ok, todo = slots.every(completo);
    box.innerHTML = `<p class="muted small" style="margin-top:0">Después de rebanar y acomodar: en cada mueble toma la foto de <b>cómo quedó</b> y cuenta lo exhibido.</p>
      <div class="list">${slots.map((m) => { const nf = FOTOS.de(v, m.k).length; return `<button type="button" class="inv mue" data-mue="${m.k}"><span class="foto-ic">${PL.icono(m.mueble, 24)}</span>
        <span class="grow"><b>${esc(m.nombre)}</b><span class="tiny muted">${nf ? plur(nf, "foto") + " ✓" : "Falta la foto"} · ${esc(this.exhTexto(v, m, prods))}</span></span>
        <span class="pill ${completo(m) ? "p-menta" : "p-durazno"}">${completo(m) ? "Completo" : "Pendiente"}</span>${ic("chev", 18)}</button>`; }).join("")}</div>
      <button class="btn ghost block" style="margin-top:10px" data-add>+ Agregar otro mueble</button>
      <div id="addm" hidden><div class="pl-tipos" style="margin-top:10px">${Object.entries(PL.MUEBLES).map(([t, n]) => `<button type="button" class="pl-tipo" data-tipo="${t}">${PL.icono(t)}<span>${n}</span></button>`).join("")}</div></div>
      <button class="btn block" style="margin-top:16px" data-ok ${todo ? "" : "disabled"}>${todo ? "Seguir a Pedido" : "Completa los muebles que faltan para seguir"}</button>`;
    $$("[data-mue]", box).forEach((b) => (b.onclick = () => redibujar(b.dataset.mue)));
    $("[data-add]", box).onclick = () => { $("#addm", box).hidden = !$("#addm", box).hidden; };
    $$("[data-tipo]", box).forEach((b) => (b.onclick = () => {
      const tipos = v.mueblesFoto.map((m) => m.mueble).concat(b.dataset.tipo);
      const viejos = Object.fromEntries(v.mueblesFoto.map((m) => [m.k, m]));
      v.mueblesFoto = FOTOS.armar(tipos).map((m) => viejos[m.k] ? { ...viejos[m.k], nombre: m.nombre } : m);
      FOTOS.guardar(v); toast(`${PL.MUEBLES[b.dataset.tipo]} agregado`); redibujar();
    }));
    $("[data-ok]", box).onclick = siguiente;
  },
  pMueble(box, v, cat, prods, k, volver) {
    const slots = FOTOS.slots(v), m = slots.find((x) => x.k === k), cats = this.categorias(prods, cat);
    v.exh = v.exh || {}; const e = (v.exh[k] = v.exh[k] || { c: {} }); e.c = e.c || {};
    const base = this.presDe(m), hayOtra = Object.values(e.c).some((x) => PRES.some(([pr]) => !base.includes(pr) && Number(x[pr]) > 0));
    let actual = cats.find((c) => c.id === v.exhCat) || cats[0], todas = hayOtra;
    const etq = (pr, p) => (pr === "b" ? [plural(2, p.unidad_conteo).replace(/^./, (c) => c.toUpperCase()), `${fmtNum(p.peso_kg_unidad, 2)} kg cada una`] : PRES.find((x) => x[0] === pr).slice(1));
    const info = (c) => { const n = c.prods.filter((p) => this.exhKg(e.c[p.id], p) > 0).length; return { listo: n > 0, texto: n ? n + " con conteo" : c.prods.length + " SKU" }; };
    const pintar = () => {
      const fs = FOTOS.de(v, k), vis = PRES.map((x) => x[0]).filter((pr) => todas || base.includes(pr));
      box.innerHTML = `<button type="button" class="venc-lk mue-volver" data-volver>‹ Todos los muebles</button>
        <h2 style="margin:4px 0 10px">${esc(m.nombre)}</h2>
        <h3 class="sec-t" style="margin-top:0">Lo exhibido en este mueble</h3>
        <button type="button" class="cat-sel" data-catbtn>${this.botonCategoria(actual, info(actual).texto)}</button>
        <div class="list">${actual.prods.map((p) => `<div class="inv" data-p="${p.id}"><div class="row"><div class="nm sp">${esc(p.nombre)}</div><span class="pill p-gris" data-kg></span></div>
          ${vis.map((pr) => { const [t, sub] = etq(pr, p); return `<div class="pres"><div class="grow"><b>${esc(t)}</b><span class="tiny muted">${esc(sub)}</span></div>
            <div class="stepper"><button type="button" data-m="${pr}" aria-label="Menos">−</button><input inputmode="${pr === "b" ? "decimal" : "numeric"}" data-u="${pr}" value="${e.c[p.id]?.[pr] ?? ""}" placeholder="0" aria-label="${esc(t)} de ${esc(p.nombre)}"><button type="button" data-s="${pr}" aria-label="Más">+</button></div></div>`; }).join("")}</div>`).join("")}</div>
        <button type="button" class="venc-lk" data-todas style="display:block;margin:12px 0 0">${todas ? "Mostrar solo lo habitual de este mueble" : base.includes("b") ? "Contar también empacado (rebanado o rallado)" : "Contar también barras enteras"}</button>
        <p class="tiny muted" style="margin:10px 0 0">Lo que dejes en blanco cuenta como cero. Los kilos los calcula Clarus: ${fmtNum(PAQ_KG * 1000, 0)} g por paquete.</p>
        <h3 class="sec-t" style="margin-top:16px">Foto del mueble</h3>
        <div class="inv"><div class="row"><span class="foto-ic">${PL.icono(m.mueble, 24)}</span><div class="sp" style="min-width:0"><div class="nm">Foto de cómo quedó</div>
            <div class="tiny muted">${fs.length ? plur(fs.length, "foto") + " · última " + fmtHora(fs[fs.length - 1].at) : "Obligatoria · al menos 1 foto"}</div></div>
            ${fs.length ? `<span class="pill p-menta">✓ Foto</span>` : `<span class="pill p-durazno">Falta la foto</span>`}</div>
          ${fs.length ? `<div class="thumbs" style="margin-top:10px">${fs.map((f) => `<div class="thumb-b"><img src="${f.thumb}" alt="Foto de ${esc(m.nombre)}"><button type="button" class="thumb-x" data-borrar="${f.key}" aria-label="Borrar foto">✕</button></div>`).join("")}</div>` : ""}
          <button type="button" class="btn ${fs.length ? "ghost" : "sec"} sm block" style="margin-top:10px" data-foto>${ic("camara", 18)} ${fs.length ? "Otra foto" : "Tomar foto"}</button></div>
        <button class="btn block" style="margin-top:14px" data-ok>Guardar mueble</button>
        ${slots.length > 1 && !fs.length ? `<button type="button" class="btn ghost block sm" style="margin-top:8px" data-quitar>Quitar este mueble</button>` : ""}`;
      const kgs = () => $$(".inv[data-p]", box).forEach((el) => { const p = prods.find((x) => x.id == el.dataset.p), kg = this.exhKg(e.c[p.id], p); $("[data-kg]", el).textContent = kg ? "≈ " + fmtNum(kg, 1) + " kg" : "0 kg"; $("[data-catbtn]", box).innerHTML = this.botonCategoria(actual, info(actual).texto); });
      kgs();
      box.onclick = async (ev) => {
        const t = ev.target;
        if (t.closest("[data-volver]")) return volver();
        if (t.closest("[data-catbtn]")) return this.elegirCategoria(cats, actual.id, info, (c) => { actual = c; v.exhCat = c.id; Visita.set(v); pintar(); }, "mueble");
        if (t.closest("[data-todas]")) { todas = !todas; return pintar(); }
        if (t.closest("[data-quitar]")) { v.mueblesFoto = v.mueblesFoto.filter((x) => x.k !== k); delete v.exh[k]; FOTOS.guardar(v); await this.guardarExh(v, prods); return volver(); }
        const bo = t.closest("[data-borrar]");
        if (bo) {
          if (!(await confirmar("La foto se borra y puedes tomar otra en su lugar.", "Borrar foto", "Cancelar", "¿Borrar esta foto?"))) return;
          await this.borrarFoto(v, bo.dataset.borrar); toast("Foto borrada"); return pintar();
        }
        if (t.closest("[data-foto]")) {
          try {
            const r = await Camara.evidencia({ titulo: m.nombre, marca: v.tienda }); if (!r) return;
            const key = uid(); await IDB.putBlob(key, r.blob);
            v.fotos.push({ key, tipo: "exhibicion_" + m.mueble, slot: k, tipoTxt: m.nombre, at: r.at, thumb: r.thumb }); Visita.set(v);
            await DB.encolar({ t: "foto", lid: v.lid, blob: key, data: { tipo: "exhibicion_" + m.mueble, mueble: m.nombre, at: r.at, lat: v.lat, lng: v.lng } });
            pintar();
          } catch (err) { toast(err.message, 4000); }
          return;
        }
        const st = t.closest("[data-m],[data-s]");
        if (st) { const pr = st.dataset.m || st.dataset.s, inp = $(`[data-u="${pr}"]`, st.closest(".pres")); inp.value = Math.max(0, (parseFloat(inp.value) || 0) + (st.dataset.s ? 1 : -1)); inp.dispatchEvent(new Event("input", { bubbles: true })); return; }
        if (t.closest("[data-ok]")) {
          if (!FOTOS.de(v, k).length) return toast("Toma la foto de cómo quedó el mueble");
          const hay = prods.some((p) => this.exhKg(e.c[p.id], p) > 0);
          if (!hay && !(await confirmar("No contaste ningún producto en este mueble. ¿Está sin producto nuestro?", "Sí, guardar en cero", "Volver a contar", "Mueble sin producto"))) return;
          e.ok = true; Visita.set(v); await this.guardarExh(v, prods); toast(`${m.nombre} guardado ✓`); volver();
        }
      };
      box.oninput = (ev) => {
        const i = ev.target.closest("[data-u]"); if (!i) return;
        i.value = i.value.replace(i.dataset.u === "b" ? /[^0-9.]/g : /\D/g, "");
        const pid = i.closest(".inv").dataset.p; e.c[pid] = e.c[pid] || {}; e.c[pid][i.dataset.u] = i.value === "" ? "" : Math.max(0, parseFloat(i.value) || 0);
        e.ok = false; Visita.set(v); kgs();
      };
    };
    pintar();
  },
  // Borra una foto de la visita: de la cola si aún no subió, o del servidor
  async borrarFoto(v, key) {
    v.fotos = v.fotos.filter((f) => f.key !== key); Visita.set(v);
    const op = (await IDB.ops()).find((o) => o.t === "foto" && o.blob === key);
    if (op) { await IDB.delOp(op.k); await IDB.delBlob(key); } else await DB.encolar({ t: "foto_borrar", key });
  },
  // Promoción nueva (se registra dentro de Gestión)
  promoNueva(v, cat, tipos, alGuardar) {
    const prods = this.productosTienda(v, cat);
    modal(`<h2>Nueva promoción</h2>
      <label class="f">Tipo</label><select class="in" name="tipo">${Object.entries(tipos).map(([k, t]) => `<option value="${k}">${t}</option>`).join("")}</select>
      <label class="f">Producto</label><select class="in" name="producto"><option value="">— General —</option>${prods.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("")}</select>
      <div id="pdw" hidden><label class="f">Descuento que dice el hablador</label><div class="row" style="gap:8px"><input class="in sp" name="pd" inputmode="decimal" placeholder="Ej.: 15" aria-label="Porcentaje de descuento"><b style="font-size:17px">%</b></div></div>
      <div class="row"><div class="sp"><label class="f">Precio normal</label><input class="in" name="pr" inputmode="decimal" placeholder="$"></div><div class="sp"><label class="f">Precio oferta</label><input class="in" name="po" inputmode="decimal" placeholder="$"></div></div>
      <div class="tiny muted" id="pdc" style="margin-top:4px" hidden></div>
      <label class="f">Vigente hasta</label><input class="in" type="date" name="vig">
      <label class="f">Nota</label><input class="in" name="nota" placeholder="Opcional">
      <button class="btn block" style="margin-top:16px" data-foto>${ic("camara", 18)} Tomar foto y guardar</button>`, (m, close) => {
      // Descuento en porcentaje: se escribe el % del hablador; con el precio normal, Clarus calcula el precio con descuento
      const g = (n) => $(`[name=${n}]`, m), esDesc = () => g("tipo").value === "descuento";
      const calcD = () => { const d = parseFloat(g("pd").value), n = parseFloat(g("pr").value); $("#pdw", m).hidden = !esDesc(); g("po").closest(".sp").hidden = esDesc();
        const c = $("#pdc", m); c.hidden = !(esDesc() && d > 0 && n > 0); if (!c.hidden) c.innerHTML = `Precio con descuento: <b>$${fmtNum(n * (1 - d / 100), 2)}</b>`; };
      g("tipo").onchange = calcD; g("pd").oninput = () => { g("pd").value = g("pd").value.replace(/[^0-9.]/g, ""); calcD(); }; g("pr").oninput = calcD;
      $("[data-foto]", m).onclick = async () => {
        if (esDesc()) { const d = parseFloat(g("pd").value); if (!(d > 0 && d <= 100)) return toast("Escribe el porcentaje de descuento, de 1 a 100"); }
        try {
          const r = await Camara.evidencia({ titulo: "Foto de la promoción", marca: v.tienda });
          if (!r) return;
          const key = uid(), plid = uid(); await IDB.putBlob(key, r.blob);
          const f = (n) => $(`[name=${n}]`, m).value;
          const pid = f("producto") ? Number(f("producto")) : null;
          const dsc = esDesc() ? parseFloat(f("pd")) : null, nor = parseFloat(f("pr")) || null;
          const data = { tipo: f("tipo"), producto_id: pid, precio_regular: nor, precio_oferta: dsc ? (nor ? Math.round(nor * (1 - dsc / 100) * 100) / 100 : null) : parseFloat(f("po")) || null, descuento_pct: dsc, vigencia_hasta: f("vig") || null, nota: f("nota"), at: r.at, lat: v.lat, lng: v.lng };
          v.promos.push({ ...data, thumb: r.thumb, producto: prods.find((p) => p.id === pid)?.nombre });
          Visita.set(v);
          await DB.encolar({ t: "promo", lid: v.lid, plid, blob: key, data });
          close(); alGuardar();
        } catch (e) { toast(e.message, 4000); }
      };
    });
  },

  productosTienda(v, cat) {
    const ap = cat.ap.filter((a) => a.cliente_id === v.cliente_id);
    const prods = ap.length ? cat.productos.filter((p) => ap.some((a) => a.producto_id === p.id)) : cat.productos;
    return prods.map((p) => ({ ...p, regla: ap.find((a) => a.producto_id === p.id) || null }));
  },

  // ---------- Vencimiento: una sola pregunta por producto («¿cuál vence primero?»), con un toque si sigue igual ----------
  vencPrev(v, p, cat) { return (cat.venc || []).find((x) => x.cliente_id === v.cliente_id && x.producto_id === p.id)?.vence || null; },
  vencHtml(v, p, cat) {
    if (!p.controla_vencimiento || v.agot?.[p.id]) return "";
    const st = (v.venc || {})[p.id], prev = this.vencPrev(v, p, cat), plazo = p.dias_alerta_vencimiento || 15;
    const cab = `<div class="venc-t">${ic("reloj", 15)} Fecha más próxima a vencer</div>`;
    if (!st) return prev
      ? `${cab}<div class="venc-f"><div><b>${esc(fmtDia(prev))}</b><span class="tiny muted">${esc(faltan(prev))} · según la visita anterior</span></div><div class="venc-b"><button type="button" class="btn sm ok" data-vi="${p.id}">Sigue igual</button><button type="button" class="btn sm sec" data-vc="${p.id}">Cambió</button></div></div>`
      : `${cab}<button type="button" class="btn sm sec" data-vc="${p.id}">Indicar la fecha</button>`;
    if (st.sin_fecha) return `${cab}<div class="venc-f"><span class="small muted">No se pudo ver la fecha en el empaque.</span><button type="button" class="venc-lk" data-vc="${p.id}">Cambiar</button></div>`;
    const d = diasPara(st.fecha), alerta = d <= plazo;
    return `${cab}<div class="venc-f"><div><b class="${alerta ? "venc-r" : ""}">${esc(fmtDia(st.fecha))}</b><span class="tiny muted">${esc(faltan(st.fecha))}${st.igual ? " · confirmada" : ""}</span></div><button type="button" class="venc-lk" data-vc="${p.id}">Cambiar</button></div>
      ${alerta ? `<div class="venc-al"><b>${d < 0 ? "Producto vencido" : "Vence pronto"}.</b> ¿Cuántas unidades (${esc(plural(2, p.unidad_conteo))}) tienen esa fecha?
        <input class="in" inputmode="numeric" data-vu="${p.id}" value="${st.unidades ?? ""}" placeholder="0">
        <span class="small">${d < 0 ? "Retíralas de la exhibición y avisa al encargado." : "Pásalas al frente y pide al encargado una rebaja."} Queda avisado tu supervisor.</span></div>` : ""}`;
  },
  // Hoja para escribir la fecha: la anterior como atajo y tres casillas Día / Mes / Año
  vencFecha(v, p, cat, alGuardar) {
    const prev = this.vencPrev(v, p, cat), st = (v.venc || {})[p.id], ini = st?.fecha || "";
    modal(`<h2 style="margin-bottom:4px">¿Cuál vence primero?</h2>
      <p class="muted small" style="margin:0 0 12px"><b>${esc(p.nombre)}.</b> Mira el empaque con la fecha más vieja, en exhibición o en bodega.</p>
      ${prev ? `<div class="tiny muted" style="margin-bottom:6px">Fecha de la visita anterior</div><button type="button" class="cs-op" data-atajo="${prev}"><span>${esc(fmtDia(prev))}</span><span class="cs-oa">${esc(faltan(prev))}</span></button>` : ""}
      <div class="tiny muted" style="margin:12px 0 6px">${prev ? "O escribe otra fecha" : "Escribe la fecha del empaque"}</div>
      <div class="venc-dma"><div><label class="f" style="margin-top:0">Día</label><input class="in" id="vd" inputmode="numeric" maxlength="2" placeholder="DD" value="${ini ? ini.slice(8, 10) : ""}"></div><div><label class="f" style="margin-top:0">Mes</label><input class="in" id="vm" inputmode="numeric" maxlength="2" placeholder="MM" value="${ini ? ini.slice(5, 7) : ""}"></div><div><label class="f" style="margin-top:0">Año</label><input class="in" id="va" inputmode="numeric" maxlength="4" placeholder="AAAA" value="${ini ? ini.slice(0, 4) : ""}"></div></div>
      <div class="row" style="margin-top:16px"><button class="btn sec sp" data-no>Cancelar</button><button class="btn sp" data-ok>Guardar fecha</button></div>
      <button type="button" class="venc-lk" data-sin style="display:block;margin:12px auto 0">No se ve la fecha en el empaque</button>`, (m, close) => {
      const pasar = (a, b, n) => ($(a, m).oninput = (e) => { e.target.value = e.target.value.replace(/\D/g, ""); if (e.target.value.length >= n) $(b, m).focus(); });
      pasar("#vd", "#vm", 2); pasar("#vm", "#va", 2); $("#va", m).oninput = (e) => (e.target.value = e.target.value.replace(/\D/g, ""));
      $("[data-no]", m).onclick = close;
      const at = $("[data-atajo]", m); if (at) at.onclick = () => { close(); alGuardar({ fecha: at.dataset.atajo, igual: true }); };
      $("[data-sin]", m).onclick = () => { close(); alGuardar({ sin_fecha: true }); };
      $("[data-ok]", m).onclick = () => {
        const d = Number($("#vd", m).value), mes = Number($("#vm", m).value); let a = Number($("#va", m).value);
        if (a > 0 && a < 100) a += 2000;
        const f = new Date(Date.UTC(a, mes - 1, d));
        if (!d || !mes || !a || f.getUTCDate() !== d || f.getUTCMonth() !== mes - 1 || a < 2020 || a > 2040) return toast("Revisa la fecha: día, mes y año");
        const iso = `${a}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        close(); alGuardar({ fecha: iso, igual: iso === prev });
      };
    });
  },
  // Qué falta de vencimiento en una lista de productos (para no dejar guardar a medias)
  vencFalta(v, prods) {
    for (const p of prods) {
      if (!p.controla_vencimiento || v.agot?.[p.id]) continue;
      const stock = (Number(v.inv[p.id + ":bodega"]) || 0) + (Number(v.inv[p.id + ":exhibicion"]) || 0); if (!stock) continue;
      const st = (v.venc || {})[p.id];
      if (!st) return `Confirma la fecha de vencimiento de ${p.nombre}`;
      if (st.fecha && diasPara(st.fecha) <= (p.dias_alerta_vencimiento || 15) && (st.unidades ?? "") === "") return `Indica cuántas unidades de ${p.nombre} vencen el ${fmtDia(st.fecha)}`;
    }
    return null;
  },
  async vencGuardar(v, prods) {
    const rows = prods.filter((p) => p.controla_vencimiento && !v.agot?.[p.id] && (v.venc || {})[p.id]).map((p) => { const st = v.venc[p.id]; return { producto_id: p.id, vence: st.fecha || null, unidades: st.fecha && (st.unidades ?? "") !== "" ? Number(st.unidades) : null, confirmada: !!st.igual, sin_fecha: !!st.sin_fecha }; });
    if (rows.length) await DB.encolar({ t: "vencimientos", lid: v.lid, cliente_id: v.cliente_id, rows });
  },

  // Categorías (familias de producto) de lo que vende la tienda. Con una sola, inventario y pedido quedan como siempre.
  categorias(prods, cat) {
    const nom = Object.fromEntries((cat.familias || []).map((f) => [f.id, f.nombre])), m = new Map();
    prods.forEach((p) => { const k = p.familia_id && nom[p.familia_id] ? String(p.familia_id) : "0"; if (!m.has(k)) m.set(k, { id: k, nombre: k === "0" ? "Sin categoría" : nom[p.familia_id], prods: [] }); m.get(k).prods.push(p); });
    return [...m.values()].sort((a, b) => (a.id === "0") - (b.id === "0") || a.nombre.localeCompare(b.nombre));
  },
  contado(v, p) { return (v.inv[p.id + ":bodega"] ?? "") !== ""; },
  filasInv(v, prods) { return prods.map((p) => { const x = v.inv[p.id + ":bodega"]; return { producto_id: p.id, ubicacion: "bodega", unidades: x === "" || x == null ? 0 : Number(x), agotado: !!v.agot?.[p.id] }; }); },
  // Botón que muestra la categoría actual y su avance; al tocarlo se despliega la lista completa
  botonCategoria(c, avance) {
    return `<span class="cs-t"><span class="cs-l">Categoría</span><b>${esc(c.nombre)}</b></span><span class="cs-a">${esc(avance)}</span>${ic("chev", 18)}`;
  },
  // Lista desplegable de categorías con su avance; primero las pendientes. Buscador cuando son muchas.
  // modo "inv": muestra cuántas están listas y las pinta en verde. En los demás (pedido, mueble) solo el nombre y su dato; la elegida se distingue por el marco azul.
  elegirCategoria(cats, actualId, info, alElegir, modo = "inv") {
    const orden = [...cats].sort((a, b) => info(a).listo - info(b).listo), inv = modo === "inv";
    modal(`<h2 style="margin-bottom:${inv ? 2 : 12}px">Elige la categoría</h2>${inv ? `<p class="muted small" style="margin:0 0 10px">${cats.filter((c) => info(c).listo).length} de ${cats.length} contadas. Primero salen las pendientes.</p>` : ""}
      ${cats.length > 8 ? `<input class="in" id="csq" placeholder="Buscar categoría…" style="margin-bottom:10px">` : ""}
      <div class="list" id="csl">${orden.map((c) => { const i = info(c); return `<button type="button" class="cs-op ${c.id === actualId ? "on" : ""} ${inv && i.listo ? "ok" : ""}" data-cs="${c.id}" data-n="${esc(sinAcentos(c.nombre))}" ${c.id === actualId ? 'aria-current="true"' : ""}><span>${esc(c.nombre)}</span><span class="cs-oa">${esc(i.texto)}</span></button>`; }).join("")}</div>`,
      (m, close) => {
        const q = $("#csq", m); if (q) q.oninput = () => { const t = sinAcentos(q.value.trim()); $$("[data-cs]", m).forEach((b) => (b.hidden = !!t && !b.dataset.n.includes(t))); };
        $$("[data-cs]", m).forEach((b) => (b.onclick = () => { close(); alElegir(cats.find((c) => c.id === b.dataset.cs)); }));
      });
  },
  // Cerrar el inventario dejando categorías sin contar: pide el motivo (le queda a gerencia) y deja seguir
  invIncompleto(v, faltan, alGuardar) {
    let sel = "";
    modal("", (m, close) => {
      const sheet = $(".sheet", m);
      const pintar = (nota = "") => {
        sheet.innerHTML = `<h2 style="margin-bottom:4px">Seguir sin contar todo</h2>
          <p class="muted small" style="margin:0 0 12px">Falta contar <b>${esc(faltan.map((c) => c.nombre).join(", "))}</b>. Puedes seguir, pero el motivo le queda registrado a tu supervisor.</p>
          <div class="list">${MOTIVOS_INV_INCOMPLETO.map(([k, t]) => `<div class="check ${sel === k ? "on" : ""}" data-mot="${k}"><div class="box">✓</div><div>${esc(t)}</div></div>`).join("")}</div>
          <label class="f">${sel === "otro" ? "Escribe el motivo" : 'Comentario <span class="tiny muted">(opcional)</span>'}</label><input class="in" id="iin" maxlength="140" value="${esc(nota)}" placeholder="Ej.: el encargado de bodega no estaba">
          <div class="row" style="margin-top:16px"><button class="btn sec sp" data-no>Volver a contar</button><button class="btn sp" data-ok>Seguir</button></div>`;
        $$("[data-mot]", sheet).forEach((el) => (el.onclick = () => { sel = el.dataset.mot; pintar($("#iin", sheet).value); }));
        $("[data-no]", sheet).onclick = close;
        $("[data-ok]", sheet).onclick = () => {
          const nota = $("#iin", sheet).value.trim();
          if (!sel) return toast("Elige el motivo");
          if (sel === "otro" && !nota) return toast("Escribe el motivo");
          close(); alGuardar(sel, nota);
        };
      };
      pintar();
    });
  },

  pInventario(box, v, cat, siguiente) {
    const prods = this.productosTienda(v, cat);
    const cats = this.categorias(prods, cat), famDe = {};
    cats.forEach((c) => c.prods.forEach((x) => (famDe[x.id] = c.id)));
    if (!prods.length) { box.innerHTML = `<div class="empty card flat"><div class="ic">${ic("caja", 34)}</div>No hay productos cargados todavía.</div><button class="btn block" data-ok>Seguir</button>`; $("[data-ok]", box).onclick = () => { v.guardado.inventario = true; Visita.set(v); siguiente(); }; return; }
    const val = (p) => v.inv[p + ":bodega"] ?? "";
    const camHtml = (p) => { const n = FOTOS.deProd(v, p.id).length; return `<button type="button" class="cam-b ${n ? "ok" : ""}" data-cam="${p.id}" aria-label="Tomar foto de ${esc(p.nombre)} en bodega${n ? ". Lleva " + plur(n, "foto") : ""}">${ic("camara", 22)}${n ? `<i>${n}</i>` : ""}</button>`; };
    const fotosHtml = (p) => { const fs = FOTOS.deProd(v, p.id); return fs.length ? `<div class="thumbs t4" style="margin-top:10px">${fs.map((f) => `<div class="thumb-b"><img src="${f.thumb}" alt="Foto de ${esc(p.nombre)} en bodega"><button type="button" class="thumb-x" data-borrar="${f.key}" aria-label="Borrar foto">✕</button></div>`).join("")}</div>` : ""; };
    box.innerHTML = `<p class="muted small" style="margin-top:0">Cuenta lo que queda en la bodega.</p>
      <div class="list">${prods.map((p) => `
        <div class="inv" data-p="${p.id}" data-fam="${famDe[p.id]}"><div class="row"><div class="sp" style="min-width:0"><div class="nm">${esc(p.nombre)}</div>
          <div class="tiny muted">1 ${esc(p.unidad_conteo)} = ${fmtNum(p.peso_kg_unidad, 3)} kg</div></div><span data-cam-w="${p.id}">${camHtml(p)}</span></div>
          <div class="tiny muted" style="margin:10px 0 4px">En bodega (${esc(plural(2, p.unidad_conteo))})</div>
          <div class="row" style="gap:10px"><div class="stepper sp"><button type="button" data-m="bodega" aria-label="Menos">−</button><input inputmode="decimal" data-u="bodega" value="${val(p.id)}" placeholder="0" aria-label="${esc(plural(2, p.unidad_conteo))} de ${esc(p.nombre)} en bodega"><button type="button" data-s="bodega" aria-label="Más">+</button></div>
            <button type="button" class="agot ${val(p.id) === 0 ? "on" : ""}" data-cero="${p.id}">Sin existencia</button></div>
          <div class="kg"></div><div data-fotos="${p.id}">${fotosHtml(p)}</div><div class="venc" data-venc="${p.id}">${this.vencHtml(v, p, cat)}</div></div>`).join("")}</div>
      <div class="card flat" style="margin-top:12px"><div class="row"><span class="sp muted">Total en bodega</span><b id="totkg"></b></div></div>
      <button class="btn block" style="margin-top:4px" data-ok>Guardar inventario</button>`;
    const calc = () => {
      let tot = 0;
      $$(".inv[data-p]", box).forEach((el) => {
        const p = prods.find((x) => x.id == el.dataset.p), raw = $("[data-u=bodega]", el).value, b = parseFloat(raw) || 0;
        const kg = b * Number(p.peso_kg_unidad); tot += kg;
        $("[data-cero]", el).classList.toggle("on", raw !== "" && b === 0);
        $(".kg", el).innerHTML = raw === "" ? "" : b === 0 ? `<b style="color:var(--rosa-t)">Sin existencia en bodega</b>` : `${fmtNum(b)} ${esc(plural(b, p.unidad_conteo))} = <b>${fmtNum(kg, 2)} kg</b>${FOTOS.deProd(v, p.id).length ? "" : ` <span class="pill p-durazno">Falta la foto</span>`}`;
      });
      $("#totkg").textContent = fmtNum(tot, 2) + " kg";
    };
    // una sola acción por pantalla (onclick reemplaza; addEventListener se acumulaba al volver a dibujar y sumaba de a 2)
    const pintarVenc = (pid) => { const el = $(`[data-venc="${pid}"]`, box), pr = prods.find((x) => x.id == pid); if (el && pr) el.innerHTML = this.vencHtml(v, pr, cat); };
    const pintarFotos = () => prods.forEach((p) => { $(`[data-cam-w="${p.id}"]`, box).innerHTML = camHtml(p); $(`[data-fotos="${p.id}"]`, box).innerHTML = fotosHtml(p); });
    box.onclick = async (e) => {
      const vi = e.target.closest("[data-vi]"), vc = e.target.closest("[data-vc]");
      if (vi || vc) {
        const pid = (vi || vc).dataset.vi || (vi || vc).dataset.vc, pr = prods.find((x) => x.id == pid); v.venc = v.venc || {};
        if (vi) { v.venc[pid] = { fecha: this.vencPrev(v, pr, cat), igual: true }; Visita.set(v); pintarVenc(pid); }
        else this.vencFecha(v, pr, cat, (st) => { v.venc[pid] = st; Visita.set(v); pintarVenc(pid); });
        return;
      }
      const cam = e.target.closest("[data-cam]");
      if (cam) {
        try {
          const pr = prods.find((x) => x.id == cam.dataset.cam), corto = pr.nombre.replace(/^Queso /, "");
          const r = await Camara.evidencia({ titulo: corto + " en bodega", marca: v.tienda }); if (!r) return;
          const key = uid(); await IDB.putBlob(key, r.blob);
          v.fotos.push({ key, tipo: "bodega", slot: "bodega", pid: pr.id, tipoTxt: "Bodega · " + corto, at: r.at, thumb: r.thumb }); Visita.set(v);
          await DB.encolar({ t: "foto", lid: v.lid, blob: key, data: { tipo: "bodega", mueble: null, producto_id: pr.id, at: r.at, lat: v.lat, lng: v.lng } });
          pintarFotos(); calc();
        } catch (err) { toast(err.message, 4000); }
        return;
      }
      const bo = e.target.closest("[data-borrar]");
      if (bo) {
        if (!(await confirmar("La foto se borra y puedes tomar otra en su lugar.", "Borrar foto", "Cancelar", "¿Borrar esta foto?"))) return;
        await this.borrarFoto(v, bo.dataset.borrar); toast("Foto borrada"); pintarFotos(); calc(); return;
      }
      const ce = e.target.closest("[data-cero]");
      if (ce) { const inp = $("[data-u=bodega]", ce.closest(".inv")); inp.value = inp.value !== "" && Number(inp.value) === 0 ? "" : 0; inp.dispatchEvent(new Event("input", { bubbles: true })); return; }
      const b = e.target.closest("[data-m],[data-s]"); if (!b) return;
      const inp = $("[data-u=bodega]", b.closest(".inv"));
      inp.value = Math.max(0, (parseFloat(inp.value) || 0) + (b.dataset.s ? 1 : -1)); inp.dispatchEvent(new Event("input", { bubbles: true }));
    };
    box.oninput = (e) => {
      const vu = e.target.closest("[data-vu]");
      if (vu) { vu.value = vu.value.replace(/[^0-9.]/g, ""); v.venc = v.venc || {}; if (v.venc[vu.dataset.vu]) { v.venc[vu.dataset.vu].unidades = vu.value; Visita.set(v); } return; }
      const i = e.target.closest("[data-u]"); if (!i) return;
      v.inv[i.closest(".inv").dataset.p + ":bodega"] = i.value === "" ? "" : Math.max(0, parseFloat(i.value) || 0); Visita.set(v); calc();
    };
    calc();
    // El selector de categoría va siempre, aunque la tienda tenga una sola: así la pantalla es la misma con 2 productos o con 200
    return this.invPorCategoria(box, v, prods, cats, calc, siguiente);
  },

  // Inventario con varias categorías: una a la vez, con selector desplegable, buscador y avance. Las tarjetas de las demás quedan ocultas (no se pierden los datos).
  invPorCategoria(box, v, prods, cats, calc, siguiente) {
    const lista = (c) => c.prods.every((x) => this.contado(v, x));
    const info = (c) => { const n = c.prods.filter((x) => this.contado(v, x)).length; return { listo: n === c.prods.length, texto: `${n} de ${c.prods.length}` }; };
    let actual = cats.find((c) => c.id === v.invCat) || cats.find((c) => !lista(c)) || cats[0], q = "";
    $("p.muted", box).outerHTML = `<p class="muted small" style="margin-top:0">Cuenta lo que queda en la bodega <b>después de sacar lo que vas a exhibir</b> y toma la foto de cada producto con su cámara.</p>
      <button type="button" class="cat-sel" data-catbtn></button>
      <div class="cat-av"><span class="cat-bar"><i></i></span><span class="tiny muted" data-catav></span></div>
      <input class="in" id="invq" placeholder="Buscar producto o código…" style="margin-bottom:10px">`;
    const okBtn = $("[data-ok]", box);
    okBtn.insertAdjacentHTML("afterend", `<button type="button" class="btn ghost block" style="margin-top:8px" data-saltar>Seguir sin contar lo que falta</button>`);
    const saltar = $("[data-saltar]", box);
    const pintar = () => {
      const listas = cats.filter(lista).length, sig = cats.find((c) => c.id !== actual.id && !lista(c));
      $("[data-catbtn]", box).innerHTML = this.botonCategoria(actual, info(actual).texto);
      $("[data-catav]", box).textContent = `${listas} de ${cats.length} categorías listas`;
      $(".cat-bar i", box).style.width = Math.round((listas / cats.length) * 100) + "%";
      $$(".inv[data-p]", box).forEach((el) => { const x = prods.find((y) => y.id == el.dataset.p); el.hidden = q ? !sinAcentos(x.nombre + " " + (x.sku || "")).includes(q) : el.dataset.fam !== actual.id; });
      okBtn.textContent = sig ? `Guardar y seguir con ${sig.nombre}` : "Guardar y seguir a Exhibición";
      saltar.hidden = cats.every(lista);
    };
    $("[data-catbtn]", box).onclick = () => this.elegirCategoria(cats, actual.id, info, (c) => { actual = c; v.invCat = c.id; Visita.set(v); q = ""; $("#invq", box).value = ""; pintar(); });
    $("#invq", box).oninput = (e) => { q = sinAcentos(e.target.value.trim()); pintar(); };
    const guardarContados = async () => { const hechos = prods.filter((x) => this.contado(v, x)); this.recalcAgot(v, prods); if (hechos.length) await DB.encolar({ t: "inventario", lid: v.lid, rows: this.filasInv(v, hechos) }); await this.vencGuardar(v, hechos); };
    okBtn.onclick = async () => {
      const falta = actual.prods.filter((x) => !this.contado(v, x));
      if (falta.length) { toast(`En ${actual.nombre} falta contar ${falta.length === 1 ? falta[0].nombre : falta.length + " productos"}. Si no hay en bodega, toca «Sin existencia»`, 4500); return; }
      const sinF = actual.prods.filter((x) => Number(v.inv[x.id + ":bodega"]) > 0 && !FOTOS.deProd(v, x.id).length);
      if (sinF.length) { toast(`Falta la foto de ${sinF.length === 1 ? sinF[0].nombre : sinF.length + " productos"} en bodega: toca su cámara`, 4500); return; }
      const fv = this.vencFalta(v, actual.prods); if (fv) { toast(fv, 4000); return; }
      await guardarContados();
      const sig = cats.find((c) => !lista(c));
      if (sig) { toast(`${actual.nombre} guardada ✓`); actual = sig; v.invCat = sig.id; Visita.set(v); q = ""; $("#invq", box).value = ""; pintar(); box.scrollIntoView({ block: "start" }); return; }
      if (v.invIncompleto) { delete v.invIncompleto; await DB.encolar({ t: "inv_incompleto", lid: v.lid, motivo: null, nota: null }); }
      v.guardado.inventario = true; Visita.set(v); toast("Inventario guardado ✓"); siguiente();
    };
    saltar.onclick = () => {
      const faltan = cats.filter((c) => !lista(c));
      this.invIncompleto(v, faltan, async (motivo, nota) => {
        await guardarContados();
        const txt = "Faltó contar: " + faltan.map((c) => c.nombre).join(", ") + (nota ? " · " + nota : "");
        await DB.encolar({ t: "inv_incompleto", lid: v.lid, motivo, nota: txt });
        v.invIncompleto = { motivo, nota, cats: faltan.map((c) => c.nombre) }; v.guardado.inventario = true; Visita.set(v);
        toast("Inventario guardado con aviso a tu supervisor"); siguiente();
      });
    };
    pintar();
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
        <button class="btn block" data-ok>Seguir</button>`;
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
      <div class="list" id="pedl">${filas.map((f) => `<div class="inv" data-p="${f.p.id}"><div class="row"><div class="sp" style="min-width:0"><div class="nm nm-estado">${esc(f.p.nombre)}${v.agot?.[f.p.id] ? `<span class="pill p-rosa">Agotado</span>` : f.bajo ? `<span class="pill p-rosa">Bajo</span>` : ""}</div>
          ${V.objProducto(cat, v.cliente_id, f.p)}
          <div class="tiny muted">En tienda: ${f.contado ? fmtNum(f.stock) + " " + esc(plural(f.stock, f.p.unidad_conteo)) + ` (bodega ${fmtNum(Number(v.inv[f.p.id + ":bodega"]) || 0)} + exhibido ${fmtNum(Number(v.inv[f.p.id + ":exhibicion"]) || 0)})` : "sin contar"}${f.p.regla?.stock_minimo != null ? " · mínimo " + fmtNum(f.p.regla.stock_minimo) : ""}</div></div></div>
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
    // Un solo pedido, visto por categoría: el selector va siempre. Abre en la categoría que tiene sugeridos y, dentro de ella, lo sugerido sale primero.
    const catsP = this.categorias(prods, cat), famP = {}; catsP.forEach((c) => c.prods.forEach((x) => (famP[x.id] = c.id)));
    const cant = (f) => parseFloat($(`[data-p="${f.p.id}"] input`, box).value) || 0;
    const esSug = (f) => f.bajo || f.sug > 0 || !!v.agot?.[f.p.id];
    const sugDe = (c) => filas.filter((f) => famP[f.p.id] === c.id && esSug(f));
    let actualP = catsP.find((c) => c.id === v.pedCat) || catsP.find((c) => sugDe(c).length) || catsP[0], qp = "";
    $("#pedl", box).insertAdjacentHTML("beforebegin", `<button type="button" class="cat-sel" data-pcat></button>
      <input class="in" id="pedq" placeholder="Buscar producto o código…" style="margin-bottom:10px">
      <div class="empty card flat" id="pedvacio" hidden>Ningún producto coincide con la búsqueda.</div>`);
    filas.forEach((f) => { $(`[data-p="${f.p.id}"]`, box).style.order = esSug(f) ? 0 : 1; });
    const infoP = (c) => { const n = filas.filter((f) => famP[f.p.id] === c.id && cant(f) > 0).length, sg = sugDe(c).length; return { listo: !sg, texto: sg ? plur(sg, "sugerido") : n ? `${n} en el pedido` : c.prods.length + " SKU" }; };
    const pintarP = () => {
      let visibles = 0;
      $("[data-pcat]", box).hidden = !!qp;
      $("[data-pcat]", box).innerHTML = this.botonCategoria(actualP, infoP(actualP).texto);
      filas.forEach((f) => { const el = $(`[data-p="${f.p.id}"]`, box), ver = qp ? sinAcentos(f.p.nombre + " " + (f.p.sku || "")).includes(qp) : famP[f.p.id] === actualP.id; el.hidden = !ver; if (ver) visibles++; });
      $("#pedvacio", box).hidden = visibles > 0;
    };
    $("[data-pcat]", box).onclick = () => this.elegirCategoria(catsP, actualP.id, infoP, (c) => { actualP = c; v.pedCat = c.id; Visita.set(v); pintarP(); }, "pedido");
    $("#pedq", box).oninput = (e) => { e.stopPropagation(); qp = sinAcentos(e.target.value.trim()); pintarP(); };
    const calcKg0 = box.oninput; box.oninput = (e) => { calcKg0(e); if (!e.target.closest("#pedq")) $("[data-pcat]", box).innerHTML = this.botonCategoria(actualP, infoP(actualP).texto); };
    pintarP();
    const no = $("[data-no]", box); if (no) no.onclick = () => this.pSinPedido(box, v, cat, siguiente, bajos > 0 || filas.some((f) => v.agot?.[f.p.id]));
    const cn = $("[data-cancel]", box); if (cn) cn.onclick = () => { v.editandoPedido = false; Visita.set(v); this.pPedido(box, v, cat, siguiente); };
    $("[data-ok]", box).onclick = async () => {
      const otras = catsP.filter((c) => c.id !== actualP.id && sugDe(c).some((f) => cant(f) === 0));
      if (otras.length && !(await confirmar(`Hay productos sugeridos sin pedir en ${otras.map((c) => c.nombre).join(", ")}. Puedes revisarlos con el selector de categoría.`, "Enviar así", "Revisar", "Quedan sugeridos sin pedir"))) return;
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
    const slots = FOTOS.slots(v), nMue = slots.filter((m) => FOTOS.de(v, m.k).length && v.exh?.[m.k]?.ok).length, nFB = v.fotos.filter((f) => f.slot === "bodega").length;
    const agot = Object.keys(v.agot || {}).filter((k) => v.agot[k]).length;
    const kgPed = (v.pedido?.items || []).reduce((t, i) => t + kgLinea(i.propuesto, (cat0.productos || []).find((x) => x.id === i.producto_id)), 0);
    const items = [
      ["inventario", `${v.invIncompleto ? "Inventario de bodega · faltó " + plur(v.invIncompleto.cats.length, "categoría") : "Inventario de bodega"}${nFB ? ` · ${plur(nFB, "foto")}` : ""}`, e.inventario],
      ["exhibicion", `Exhibición · ${nMue} de ${plur(slots.length, "mueble")} con foto y conteo${agot ? ` · ${plur(agot, "agotado")}` : ""}`, e.exhibicion],
      ["pedido", v.pedido?.ninguno ? `Sin pedido${v.pedido.motivo ? " · " + (MOTIVOS_SIN_PEDIDO.find((m) => m[0] === v.pedido.motivo)?.[1] || "") : ""}` : v.pedido?.items?.length ? `Pedido enviado · ${fmtKg(kgPed)}` : "Pedido", e.pedido],
      ...(pls.length ? [["gestion", `Planograma revisado${pls.length > 1 ? " (" + pls.length + ")" : ""}`, e.gestion]] : []),
      ...(v.auditoria ? [["gestion", `Auditoría de espacio · ${v.auditoria.pct == null ? "hecha" : v.auditoria.pct + "% de la categoría"}`, true]] : []),
      ...((v.fotosCat || []).length ? [["gestion", `Fotos de la categoría · ${v.fotosCat.length}`, true]] : []),
      ...(v.promos.length ? [["gestion", `Promociones registradas · ${v.promos.length}`, true]] : []),
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
      ${v.invIncompleto ? `<div class="card flat" style="background:#FFF7EC;border-color:#F5D9AE"><div class="row" style="gap:8px"><b class="sp">Aviso: faltó contar ${esc(v.invIncompleto.cats.join(", "))}</b><span class="pill p-gris">No bloquea</span></div>
        <div class="small" style="margin-top:4px">Motivo: <b>${esc(motivoInvIncompleto(v.invIncompleto.motivo))}</b>${v.invIncompleto.nota ? " · " + esc(v.invIncompleto.nota) : ""}. Le aparecerá a tu supervisor.</div>
        <div class="row" style="margin-top:8px"><button class="btn sm" data-ir="inventario">Contar ahora</button></div></div>` : ""}
      <label class="f">Comentario de la visita</label><textarea class="in" id="com" placeholder="Opcional">${esc(v.comentario || "")}</textarea>
      <button class="btn block ok" style="margin-top:16px" data-out ${ok ? "" : "disabled"}>Hacer check-out</button>
      ${ok ? "" : `<button type="button" class="btn ghost block" style="margin-top:8px" data-inc>Cerrar sin terminar</button>
        <p class="tiny muted" style="text-align:center;margin:6px 0 0">Úsalo solo si no puedes completar la visita. Queda registrada como incompleta.</p>`}`;
    const inc = $("[data-inc]", box); if (inc) inc.onclick = () => this.cerrarIncompleta(v);
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

  // Cerrar la visita sin terminar: pide el motivo, registra lo que faltó y la marca incompleta para gerencia. Se puede hacer desde cualquier lugar.
  cerrarIncompleta(v) {
    const pend = this.pendientes(v).map((x) => x[1]); let sel = "";
    modal("", (m, close) => {
      const sheet = $(".sheet", m);
      const pintar = (nota = "") => {
        sheet.innerHTML = `<h2 style="margin-bottom:4px">Cerrar sin terminar</h2>
          <p class="muted small" style="margin:0 0 12px">Faltó: <b>${esc(pend.join(", "))}</b>. La visita queda registrada como <b>incompleta</b> y la ve tu supervisor.</p>
          <div class="list">${MOTIVOS_INCOMPLETA.map(([k, t]) => `<div class="check ${sel === k ? "on" : ""}" data-mot="${k}" role="button" tabindex="0"><div class="box">✓</div><div>${esc(t)}</div></div>`).join("")}</div>
          <label class="f">${sel === "otro" ? "Escribe el motivo" : 'Comentario <span class="tiny muted">(opcional)</span>'}</label><input class="in" id="icn" maxlength="140" value="${esc(nota)}" placeholder="Ej.: me llamaron de la oficina">
          <div class="row" style="margin-top:16px"><button class="btn sec sp" data-no>Volver a la visita</button><button class="btn peligro sp" data-ok>Cerrar incompleta</button></div>`;
        $$("[data-mot]", sheet).forEach((el) => (el.onclick = () => { sel = el.dataset.mot; pintar($("#icn", sheet).value); }));
        $("[data-no]", sheet).onclick = close;
        $("[data-ok]", sheet).onclick = async () => {
          const nota = $("#icn", sheet).value.trim();
          if (!sel) return toast("Elige el motivo");
          if (sel === "otro" && !nota) return toast("Escribe el motivo");
          toast("Obteniendo ubicación…", 9000);
          let pos = null; try { pos = await ubicacion(); } catch {} // si no hay ubicación se cierra igual: lo importante es que no quede abierta
          const at = new Date().toISOString(), mot = MOTIVOS_INCOMPLETA.find((x) => x[0] === sel)[1];
          await DB.encolar({ t: "visita_out", lid: v.lid, data: { at, lat: pos?.lat ?? null, lng: pos?.lng ?? null, precision: pos?.precision ?? null, comentario: v.comentario,
            incompleta: true, incompleta_nota: (`Faltó: ${pend.join(", ")} · Motivo: ${mot}` + (nota ? " · " + nota : "")).slice(0, 480) } });
          const hechas = LS.get("hechas:" + hoyISO(), {}); hechas[v.cliente_id] = at; LS.set("hechas:" + hoyISO(), hechas);
          Visita.fin(); LS.del("paso"); close();
          toast("Visita cerrada como incompleta", 3500); location.hash = "#hoy";
        };
      };
      pintar();
    });
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
    let sel = actual?.motivo || "", todas = false, foto = null; // foto = { key, thumb, at, lat, lng, dist, dentro } de la tienda cerrada
    const esHoyNV = dSel.iso === hoyISO();
    const otras = pendientes.filter((x) => x.id !== c.id);
    const cuando = dSel.etiqueta === "Hoy" ? "hoy" : dSel.etiqueta === "Mañana" ? "mañana" : "el " + dSel.etiqueta;
    modal("", (m, close) => {
      const sheet = $(".sheet", m);
      const pintar = (nota = actual?.nota || "") => {
        sheet.innerHTML = `<h2 style="margin-bottom:4px">No podré visitar esta tienda</h2>
          <p class="muted small" style="margin:0 0 12px"><b>${esc(c.nombre)}</b> · ${esc(cuando)}. El motivo le queda registrado a tu supervisor y esta tienda no cuenta en tu cumplimiento de ruta.</p>
          <div class="list">${MOTIVOS_NO_VISITA.map(([k, t]) => `<div class="check ${sel === k ? "on" : ""}" data-mot="${k}"><div class="box">✓</div><div>${esc(t)}</div></div>`).join("")}</div>
          <label class="f">${sel === "otro" ? "Escribe el motivo" : 'Comentario <span class="tiny muted">(opcional)</span>'}</label><input class="in" id="novn" maxlength="140" value="${esc(nota)}" placeholder="${sel === "tienda_cerrada" ? "Ej.: cerrada por inventario" : sel === "reunion_oficina" ? "Ej.: reunión con gerencia a las 2 p. m." : "Ej.: vía cerrada por protesta"}">
          ${sel === "tienda_cerrada" ? (esHoyNV ? `<div class="nov-foto">${foto ? `<img src="${foto.thumb}" alt="Foto de la tienda cerrada"><div class="grow"><b>Foto tomada ✓</b><div class="tiny muted">${fmtHora(foto.at)}${foto.dist != null ? " · " + (foto.dentro ? "en la tienda" : "a " + fmtDist(foto.dist) + " de la tienda") : " · sin ubicación"}</div><a href="#" class="tiny" data-foto>Repetir foto</a></div>` : actual?.foto ? `<div class="grow"><b>Foto ya enviada ✓</b><div class="tiny muted">Puedes cambiar el comentario.</div></div>` : `<div class="grow"><b>Foto de la tienda cerrada</b><div class="tiny muted">Obligatoria. Sin la foto, la tienda queda como no visitada.</div></div><button type="button" class="btn sm" data-foto>${ic("camara", 16)} Tomar foto</button>`}</div>`
            : `<div class="nov-foto"><div class="grow"><b>Solo el mismo día y en la tienda</b><div class="tiny muted">«Tienda cerrada» pide una foto de la tienda, así que se marca al llegar y encontrarla cerrada.</div></div></div>`) : ""}
          ${!actual && otras.length && sel !== "tienda_cerrada" ? `<div class="check ${todas ? "on" : ""}" data-todas style="margin-top:10px"><div class="box">✓</div><div>Aplicar también a ${otras.length === 1 ? "la otra tienda" : "las otras " + otras.length + " tiendas"} sin visitar de ${esc(cuando)}</div></div>` : ""}
          <div class="row" style="margin-top:16px"><button class="btn sec sp" data-no>${actual ? "Quitar justificación" : "Cancelar"}</button><button class="btn sp" data-ok>Guardar</button></div>`;
        $$("[data-mot]", sheet).forEach((el) => (el.onclick = () => { sel = el.dataset.mot; pintar($("#novn", sheet).value); }));
        const bf = $("[data-foto]", sheet);
        if (bf) bf.onclick = async (e) => {
          e.preventDefault(); const nt = $("#novn", sheet).value;
          const r = await Camara.evidencia({ titulo: "Tienda cerrada", marca: c.nombre + " · cerrada" }); if (!r) return;
          let pos = null; try { toast("Obteniendo ubicación…", 6000); pos = await ubicacion(); } catch {}
          const dist = pos && c.lat != null ? Math.round(distanciaM(pos, { lat: c.lat, lng: c.lng })) : null;
          const key = uid(); await IDB.putBlob(key, r.blob);
          foto = { key, thumb: r.thumb, at: r.at, lat: pos?.lat ?? null, lng: pos?.lng ?? null, dist, dentro: dist == null ? null : dist <= (c.radio_m || 100) };
          pintar(nt);
        };
        const t = $("[data-todas]", sheet); if (t) t.onclick = () => { todas = !todas; pintar($("#novn", sheet).value); };
        $("[data-no]", sheet).onclick = async () => {
          if (actual) { const j = LS.get("just", {}); j[dSel.iso + "|" + c.id] = { ...actual, p: -1 }; LS.set("just", j); await DB.encolar({ t: "no_visita_quitar", cliente_id: c.id, fecha: dSel.iso }); toast("Justificación quitada: la tienda vuelve a tu ruta"); }
          close(); if (actual) alTerminar();
        };
        $("[data-ok]", sheet).onclick = async () => {
          const nota = $("#novn", sheet).value.trim();
          if (!sel) return toast("Elige el motivo");
          if (sel === "otro" && !nota) return toast("Escribe el motivo");
          if (sel === "tienda_cerrada" && !esHoyNV) return toast("«Tienda cerrada» se marca el mismo día, en la tienda", 4000);
          if (sel === "tienda_cerrada" && !foto && !actual?.foto) return toast("Toma la foto de la tienda cerrada", 3500);
          const filas = (todas && sel !== "tienda_cerrada" ? [c, ...otras] : [c]).map((x) => ({ cliente_id: x.id, fecha: dSel.iso }));
          const j = LS.get("just", {}); filas.forEach((x) => (j[x.fecha + "|" + x.cliente_id] = { motivo: sel, nota, p: 1, ...(sel === "tienda_cerrada" ? { foto: true } : {}) })); LS.set("just", j);
          await DB.encolar({ t: "no_visita", rows: filas, motivo: sel, nota, ...(sel === "tienda_cerrada" && foto ? { foto: { blob: foto.key, at: foto.at, lat: foto.lat, lng: foto.lng, dist: foto.dist, dentro: foto.dentro } } : {}) });
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
  // Mi merma del mes: lo que mis tiendas devolvieron o descontaron (notas de crédito) sobre lo que se les facturó
  tarjetaMerma(cat) {
    const mias = new Set(cat.ruta.map((r) => r.cliente_id)), fs = (cat.merma?.filas || []).filter((f) => mias.has(f[1]));
    if (!fs.length) return "";
    const mes0 = mesActual(), r = MERMA.de(fs, mes0), din = conDinero(), lim = MERMA.lim();
    if (!r.mes.m && !r.ant.m) return "";
    const ref = r.mes.p, tono = MERMA.tono(ref), nom = Object.fromEntries(cat.clientes.map((c) => [c.id, c.nombre]));
    const top = [...mias].map((id) => ({ id, ...MERMA.de(fs, mes0, (f) => f[1] === id) })).map((x) => ({ ...x, m: x.mes.m + x.ant.m, v: x.mes.v + x.ant.v })).filter((x) => x.m > 0 && nom[x.id]).map((x) => ({ ...x, p: MERMA.pc(x.m, x.v) })).sort((a, b) => b.m - a.m).slice(0, 3);
    return `<div class="card desemp panel indigo">
      <div class="lbl">Mi merma de ${MERMA.nombreMes(mes0)}</div>
      <div class="desemp-top"><b class="desemp-pct">${ref == null ? (din ? fmtUsd2(r.mes.m) : "–") : MERMA.fp(ref)}</b><span class="desemp-tag ${tono}">${ref == null ? (r.mes.m ? "Aún sin factura" : "Sin merma este mes") : MERMA.etq(ref)}</span></div>
      <div class="desemp-sub">${ref == null ? "de mis tiendas" : "de la venta facturada a mis tiendas"} · límite ${fmtNum(lim, 0)}%</div>
      <div class="barra"><i class="${tono || "ok"}" style="width:${Math.min(100, ((ref || 0) / (lim * 2)) * 100)}%"></i></div>
      <div class="row small desemp-cifras"><span class="sp">${din && r.mes.m ? fmtUsd2(r.mes.m) + " en notas de crédito" : "Merma = producto que la tienda devolvió o descontó"}</span><b>3 meses anteriores: ${MERMA.fp(r.ant.p)}</b></div>
      ${top.length ? `<div class="tiny desemp-cifras" style="margin-top:12px;border-top:1px solid rgba(255,255,255,.22);padding-top:10px">Tiendas con más merma (este mes y los 3 anteriores)</div>${top.map((x) => `<div class="row small" style="margin-top:6px"><span class="sp">${esc(nom[x.id])}</span>${din ? `<b>${fmtUsd(x.m)}</b>` : ""}<span class="pill ${MERMA.pill(x.p)}">${MERMA.fp(x.p)}</span></div>`).join("")}` : ""}
      ${cat.merma?.corte ? `<p class="tiny desemp-cifras" style="margin:10px 0 0">Datos de facturación al ${fmtFecha(cat.merma.corte + "T12:00:00")}.</p>` : ""}</div>`;
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
    const { data: items } = await sb.from("pedido_items").select("*, productos(nombre, unidad_pedido, kg_por_pedido, unidades_por_pedido, peso_kg_unidad)").eq("pedido_id", p.id).order("id");
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
