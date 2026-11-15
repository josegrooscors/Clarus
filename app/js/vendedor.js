// Pantallas del vendedor: ruta del día, visita (gestión, fotos, inventario, promociones, pedido, cierre) y pedidos
const Visita = {
  get() { return LS.get("visita"); },
  set(v) { LS.set("visita", v); },
  fin() { LS.del("visita"); },
};

const PASOS = [
  ["fotos", "Fotos"], ["inventario", "Inventario"], ["promos", "Promociones"],
  ["pedido", "Pedido"], ["gestion", "Gestión"], ["cierre", "Cierre"],
];
// Evidencias obligatorias: sin ellas no se puede hacer check-out
const FOTOS_REQ = [["bodega", "Bodega"], ["exhibicion_deli", "Exhibición deli"], ["exhibicion_empacado", "Exhibición empacado"]];

const V = {
  // ---------------- HOY ----------------
  async hoy(root) {
    const cat = await DB.catalogos();
    const v = Visita.get();
    const dia = diaSemana();
    const hechas = LS.get("hechas:" + hoyISO(), {});
    const rutaIds = cat.ruta.filter((r) => (r.dias_semana || []).includes(dia)).map((r) => r.cliente_id);
    const ruta = cat.clientes.filter((c) => rutaIds.includes(c.id));
    const nombre = (DB.perfil.nombre || "").split(" ")[0];
    const hora = new Date().getHours();
    const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
    root.innerHTML = `
      <div class="top"><div><div class="muted small">${new Date().toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long" })}</div><h1>${saludo}, ${esc(nombre)}</h1></div><span id="syncpill"></span></div>
      ${v ? `<div class="card" style="border-color:var(--azul-med);background:var(--azul-cl)">
          <div class="row"><div class="grow"><div class="small muted">Visita en curso desde ${fmtHora(v.at)}</div><h2>${esc(v.tienda)}</h2></div>
          <a class="btn" href="#visita">Continuar</a></div></div>` : ""}
      <div id="porEscanear"></div>
      <div class="kpis">
        <div class="kpi"><div class="v">${ruta.length}</div><div class="l">Tiendas en ruta hoy</div></div>
        <div class="kpi"><div class="v">${ruta.filter((c) => hechas[c.id]).length}</div><div class="l">Visitadas</div></div>
      </div>
      ${V.tarjetaObjetivo(cat)}
      <h3 style="margin:18px 0 10px">Ruta de hoy</h3>
      <div class="list" id="ruta">${ruta.length ? "" : `<div class="empty card flat"><div class="ic">${ic("ruta", 34)}</div>Hoy no tienes tiendas asignadas.<br><span class="small">Puedes iniciar una visita desde "Otra tienda".</span></div>`}</div>
      <div class="row" style="margin:20px 0 10px"><h3 class="sp">Otra tienda</h3></div>
      <input class="in" id="buscar" placeholder="Buscar tienda o cadena…">
      <div class="list" id="otras" style="margin-top:10px"></div>`;
    const fila = (c) => {
      const h = hechas[c.id];
      return `<div class="item" data-c="${c.id}"><div class="ava">${esc(iniciales(c.cadena || c.nombre))}</div>
        <div class="grow"><div class="t">${esc(c.nombre)}</div><div class="small muted">${esc(c.cadena || "")}${c.zona ? " · " + esc(c.zona) : ""}</div>${V.avanceTienda(cat, c.id)}</div>
        ${h ? `<span class="pill p-menta">✓ ${fmtHora(h)}</span>` : `<span class="pill p-azul">Iniciar</span>`}</div>`;
    };
    $("#ruta").insertAdjacentHTML("beforeend", ruta.map(fila).join(""));
    const pintarOtras = (q) => {
      q = sinAcentos(q.trim());
      const lista = q ? cat.clientes.filter((c) => q.split(/\s+/).every((w) => sinAcentos(c.nombre + " " + (c.cadena || "") + " " + (c.codigo || "") + " " + (c.zona || "")).includes(w))).slice(0, 25) : [];
      $("#otras").innerHTML = lista.map(fila).join("") || (q ? `<div class="muted small">Sin resultados</div>` : "");
    };
    $("#buscar").oninput = (e) => pintarOtras(e.target.value);
    root.addEventListener("click", (e) => {
      const it = e.target.closest("[data-c]"); if (!it) return;
      const c = cat.clientes.find((x) => x.id == it.dataset.c);
      this.iniciar(c);
    });
    App.syncPill();
    if (navigator.onLine) sb.from("v_pedidos").select("id", { count: "exact", head: true }).eq("vendedor_id", DB.user.id).in("estado", ["propuesto", "aprobado"]).is("documento", null).then(({ count }) => {
      const el = $("#porEscanear"); if (!el || !count) return;
      el.innerHTML = `<a class="card" href="#mis-pedidos" style="display:flex;gap:12px;align-items:center;text-decoration:none;color:inherit;background:var(--azul-cl);border-color:var(--azul-med)">
        <span style="color:var(--azul)">${ic("doc", 26)}</span><div class="grow"><b>${count} pedido(s) sin orden escaneada</b><div class="small muted">Escanea la orden de compra cuando la tienda te la entregue</div></div><span class="btn sm">Escanear</span></a>`;
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
    const v = { lid: uid(), cliente_id: c.id, tienda: c.nombre, cadena: c.cadena, at: new Date().toISOString(), lat: pos.lat, lng: pos.lng, precision: pos.precision,
      gestiones: {}, fotos: [], inv: {}, promos: [], pedido: null, guardado: {} };
    Visita.set(v);
    await DB.encolar({ t: "visita_in", lid: v.lid, data: { cliente_id: c.id, at: v.at, lat: pos.lat, lng: pos.lng, precision: pos.precision } });
    toast(dist != null && dist > (c.radio_m || 100) ? `Check-in fuera de radio (${fmtDist(dist)})` : "Check-in registrado ✓", 3500);
    location.hash = "#visita";
  },

  // ---------------- VISITA ----------------
  async visita(root, paso) {
    const v = Visita.get();
    if (!v) { location.hash = "#hoy"; return; }
    const cat = await DB.catalogos();
    paso = paso || LS.get("paso") || "fotos";
    if (!PASOS.some((p) => p[0] === paso)) paso = "fotos";
    LS.set("paso", paso);
    const hecho = this.estado(v);
    root.innerHTML = `
      <div class="top"><div><div class="small muted">Check-in ${fmtHora(v.at)} · ${esc(v.cadena || "")}</div><h1>${esc(v.tienda)}</h1></div><span id="syncpill"></span></div>
      <div class="steps">${PASOS.map(([k, t]) => `<div class="step ${k === paso ? "on" : hecho[k] ? "ok" : ""}" data-p="${k}">${hecho[k] && k !== paso ? "✓ " : ""}${t}</div>`).join("")}</div>
      <div id="paso"></div>`;
    $$(".step", root).forEach((s) => (s.onclick = () => V.visita(root, s.dataset.p)));
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
    const fotosOk = FOTOS_REQ.every(([k]) => v.fotos.some((f) => f.tipo === k));
    return { fotos: fotosOk, inventario: !!v.guardado.inventario, promos: !!v.guardado.promos || v.promos.length > 0, pedido: !!v.pedido, gestion: !!v.guardado.gestion };
  },
  pendientes(v) {
    const e = this.estado(v), out = [];
    FOTOS_REQ.forEach(([k, t]) => { if (!v.fotos.some((f) => f.tipo === k)) out.push(["fotos", "Foto de " + t.toLowerCase()]); });
    if (!e.inventario) out.push(["inventario", "Inventario"]);
    if (!e.promos) out.push(["promos", "Promociones"]);
    if (!e.pedido) out.push(["pedido", "Pedido"]);
    if (!e.gestion) out.push(["gestion", "Gestión"]);
    return out;
  },

  pGestion(box, v, cat, siguiente) {
    box.innerHTML = `<p class="muted small" style="margin-top:0">Marca lo que hiciste en la tienda.</p>
      <div class="list">${cat.tareas.map((t) => `<div class="check ${v.gestiones[t.id] ? "on" : ""}" data-t="${t.id}"><div class="box">✓</div><div>${esc(t.nombre)}</div></div>`).join("")}</div>
      <button class="btn block" style="margin-top:16px" data-ok>Guardar y seguir</button>`;
    $$(".check", box).forEach((el) => (el.onclick = () => {
      el.classList.toggle("on"); v.gestiones[el.dataset.t] = el.classList.contains("on"); Visita.set(v);
    }));
    $("[data-ok]", box).onclick = async () => {
      await DB.encolar({ t: "gestiones", lid: v.lid, rows: cat.tareas.map((t) => ({ tarea_id: t.id, hecho: !!v.gestiones[t.id] })) });
      v.guardado.gestion = true; Visita.set(v); siguiente();
    };
  },

  pFotos(box, v, siguiente) {
    const tipos = FOTOS_REQ;
    const completo = this.estado(v).fotos;
    box.innerHTML = `<p class="muted small" style="margin-top:0">Las 3 evidencias son obligatorias y se toman en el momento con la cámara (no desde la galería).</p>
      <div class="list">${tipos.map(([k, t]) => {
        const fs = v.fotos.filter((f) => f.tipo === k);
        return `<div class="inv"><div class="row"><div class="sp"><div class="nm">${t}</div>
          <div class="tiny muted">${fs.length ? fs.length + " foto(s) · última " + fmtHora(fs[fs.length - 1].at) : "Obligatoria"}</div></div>
          ${fs.length ? `<span class="pill p-menta">✓ Lista</span>` : `<span class="pill p-durazno">Falta</span>`}</div>
          ${fs.length ? `<div class="thumbs" style="margin-top:10px">${fs.map((f) => `<img src="${f.thumb}">`).join("")}</div>` : ""}
          <button class="btn ${fs.length ? "ghost" : "sec"} block sm" style="margin-top:10px" data-f="${k}">${ic("camara", 18)} ${fs.length ? "Otra foto" : "Tomar foto"}</button></div>`;
      }).join("")}</div>
      <button class="btn block" style="margin-top:16px" data-ok ${completo ? "" : "disabled"}>${completo ? "Seguir" : "Toma las 3 fotos para seguir"}</button>`;
    $$("[data-f]", box).forEach((b) => (b.onclick = async () => {
      try {
        const tipoTxt = tipos.find((t) => t[0] === b.dataset.f)[1];
        const r = await Camara.evidencia({ titulo: tipoTxt, marca: v.tienda });
        if (!r) return;
        const key = uid(); await IDB.putBlob(key, r.blob);
        v.fotos.push({ key, tipo: b.dataset.f, tipoTxt, at: r.at, thumb: r.thumb }); Visita.set(v);
        await DB.encolar({ t: "foto", lid: v.lid, blob: key, data: { tipo: b.dataset.f, at: r.at, lat: v.lat, lng: v.lng } });
        this.pFotos(box, v, siguiente);
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
        <div class="inv" data-p="${p.id}"><div class="nm">${esc(p.nombre)}</div>
          <div class="tiny muted">1 ${esc(p.unidad_conteo)} = ${fmtNum(p.peso_kg_unidad, 3)} kg</div>
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
        $(".kg", el).innerHTML = b + e ? `${fmtNum(b + e)} ${esc(p.unidad_conteo)}s = <b>${fmtNum(kg, 2)} kg</b>` : "";
      });
      $("#totkg").textContent = fmtNum(tot, 2) + " kg";
    };
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-m],[data-s]"); if (!b) return;
      const u = b.dataset.m || b.dataset.s, inp = $(`[data-u=${u}]`, b.closest(".inv"));
      inp.value = Math.max(0, (parseFloat(inp.value) || 0) + (b.dataset.s ? 1 : -1)); inp.dispatchEvent(new Event("input", { bubbles: true }));
    });
    box.addEventListener("input", (e) => {
      const i = e.target.closest("[data-u]"); if (!i) return;
      v.inv[i.closest(".inv").dataset.p + ":" + i.dataset.u] = i.value === "" ? "" : Math.max(0, parseFloat(i.value) || 0); Visita.set(v); calc();
    });
    calc();
    $("[data-ok]", box).onclick = async () => {
      const rows = [];
      prods.forEach((p) => ["bodega", "exhibicion"].forEach((u) => { const x = v.inv[p.id + ":" + u]; rows.push({ producto_id: p.id, ubicacion: u, unidades: x === "" || x == null ? null : Number(x) }); }));
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
    if (v.pedido && !v.editandoPedido) {
      if (v.pedido.ninguno) {
        box.innerHTML = `<div class="card"><h2>Sin pedido</h2><p class="small muted">Indicaste que esta visita no necesita pedido.</p>
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
        <div class="small muted">${v.pedido.orden ? `Escaneada ✓ · ${v.pedido.orden.paginas} página(s) · ${fmtHora(v.pedido.orden.at)}` : "Escanea la hoja física que te entrega la tienda. En la oficina la descargan e imprimen."}</div></div></div>
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
      <p class="muted small" style="margin-top:0">${bajos ? `${bajos} producto(s) con inventario bajo. Revisa la sugerencia y ajusta las cantidades.` : "No hay productos bajo el mínimo. Si igual hace falta pedir, escribe las cantidades."}</p>
      <div class="list">${filas.map((f) => `<div class="inv" data-p="${f.p.id}"><div class="row"><div class="sp"><div class="nm">${esc(f.p.nombre)}</div>
          ${V.objProducto(cat, v.cliente_id, f.p)}
          <div class="tiny muted">Inventario: ${f.contado ? fmtNum(f.stock) + " " + esc(plural(f.stock, f.p.unidad_conteo)) : "sin contar"}${f.p.regla?.stock_minimo != null ? " · mínimo " + fmtNum(f.p.regla.stock_minimo) : ""}</div></div>
          ${f.bajo ? `<span class="pill p-rosa">Bajo</span>` : ""}</div>
          <div class="row" style="margin-top:10px"><span class="small muted sp">${f.sug ? "Sugerido: <b>" + f.sug + " " + esc(plural(f.sug, f.p.unidad_pedido)) + "</b>" : esc(plural(2, f.p.unidad_pedido))}</span>
          <div class="stepper" style="width:150px"><button data-m>−</button><input inputmode="numeric" value="${f.valor}" placeholder="0"><button data-s>+</button></div></div>
          <div class="kg" data-kg></div></div>`).join("")}</div>
      <div class="card flat" style="margin-top:12px"><div class="row"><span class="sp muted">Total del pedido</span><b id="totkgp"></b></div></div>
      <label class="f">Nota para operaciones</label><input class="in" id="nota" placeholder="Opcional" value="${esc(previo?.nota || "")}">
      <div class="row" style="margin-top:16px">${previo ? `<button class="btn sec sp" data-cancel>Cancelar</button>` : `<button class="btn sec sp" data-no>No hace falta pedido</button>`}<button class="btn sp" data-ok>${previo ? "Guardar cambios" : "Enviar pedido"}</button></div>`;
    const calcKg = () => {
      let tot = 0;
      filas.forEach((f) => {
        const q = parseFloat($(`[data-p="${f.p.id}"] input`, box).value) || 0, k = kgLinea(q, f.p); tot += k;
        $(`[data-p="${f.p.id}"] [data-kg]`, box).innerHTML = q ? `${fmtNum(q)} ${esc(plural(q, f.p.unidad_pedido))} = <b>${fmtKg(k)}</b>` : "";
      });
      $("#totkgp").textContent = fmtKg(tot);
    };
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-m],[data-s]"); if (!b) return;
      const inp = $("input", b.parentElement); inp.value = Math.max(0, (parseInt(inp.value) || 0) + (b.dataset.s !== undefined ? 1 : -1)) || ""; calcKg();
    });
    box.addEventListener("input", calcKg);
    calcKg();
    const no = $("[data-no]", box); if (no) no.onclick = () => { v.pedido = { ninguno: true, items: [] }; Visita.set(v); siguiente(); };
    const cn = $("[data-cancel]", box); if (cn) cn.onclick = () => { v.editandoPedido = false; Visita.set(v); this.pPedido(box, v, cat, siguiente); };
    $("[data-ok]", box).onclick = async () => {
      const items = filas.map((f) => ({ producto_id: f.p.id, nombre: f.p.nombre, unidad: f.p.unidad_pedido, stock: f.contado ? f.stock : null, sugerido: f.sug || null,
        propuesto: parseFloat($(`[data-p="${f.p.id}"] input`, box).value) || 0 })).filter((i) => i.propuesto > 0);
      if (!items.length) { toast("Escribe al menos una cantidad"); return; }
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

  pCierre(box, v, ir) {
    const pend = this.pendientes(v);
    const ok = !pend.length;
    const items = [
      ...FOTOS_REQ.map(([k, t]) => ["fotos", "Foto " + t.toLowerCase(), v.fotos.some((f) => f.tipo === k)]),
      ["inventario", "Inventario", this.estado(v).inventario], ["promos", "Promociones revisadas", this.estado(v).promos],
      ["pedido", "Pedido revisado", this.estado(v).pedido], ["gestion", "Gestión", this.estado(v).gestion],
    ];
    box.innerHTML = `<div class="card"><h2 style="margin-bottom:10px">Resumen de la visita</h2>
      ${items.map(([p, t, h]) => `<div class="row" style="padding:7px 0;cursor:pointer" data-ir="${p}"><span class="sp">${t}</span>${h ? `<span class="pill p-menta">✓ Listo</span>` : `<span class="pill p-rosa">Pendiente ›</span>`}</div>`).join("")}
      <div class="row" style="padding:7px 0"><span class="sp">Tiempo en tienda</span><b>${minutos(v.at, new Date())} min</b></div></div>
      ${ok ? "" : `<div class="card flat" style="background:var(--rosa);border-color:#F3C4C0"><b>No puedes hacer check-out todavía</b><div class="small">Completa lo pendiente. Toca cada punto para ir directo.</div></div>`}
      <label class="f">Comentario de la visita</label><textarea class="in" id="com" placeholder="Opcional">${esc(v.comentario || "")}</textarea>
      <button class="btn block ok" style="margin-top:16px" data-out ${ok ? "" : "disabled"}>Hacer check-out</button>`;
    $$("[data-ir]", box).forEach((el) => (el.onclick = () => ir(el.dataset.ir)));
    $("#com").oninput = (e) => { v.comentario = e.target.value; Visita.set(v); };
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
  tarjetaObjetivo(cat) {
    const mias = new Set(cat.ruta.map((r) => r.cliente_id));
    const os = (cat.obj || []).filter((o) => mias.has(o.cliente_id));
    if (!os.length) return "";
    const obj = os.reduce((a, o) => a + Number(o.objetivo_usd || 0), 0), ven = os.reduce((a, o) => a + Number(o.venta_usd || 0), 0), pc = pct(ven, obj);
    const corte = os.map((o) => o.corte).filter(Boolean).sort().pop();
    const porProd = cat.productos.map((p) => {
      const x = os.filter((o) => o.producto_id === p.id); if (!x.length) return "";
      const ok = x.reduce((a, o) => a + Number(o.objetivo_kg), 0), vk = x.reduce((a, o) => a + Number(o.venta_kg), 0);
      return `<div class="row small" style="margin-top:6px"><span class="sp">${esc(p.nombre.replace(/^Queso /, ""))}</span><b>${fmtNum(cajas(vk, p), 1)} / ${fmtNum(cajas(ok, p), 0)} cajas</b><span class="pill ${colorPct(pct(vk, ok))}">${pct(vk, ok) ?? 0}%</span></div>`;
    }).join("");
    const mes = new Date(mesActual() + "T12:00:00").toLocaleDateString("es-PA", { month: "long" });
    return `<div class="card"><div class="row"><div class="grow"><div class="small muted">Mi objetivo de ${mes}</div><h2>${fmtUsd(ven)} <span class="muted" style="font-weight:500;font-size:15px">de ${fmtUsd(obj)}</span></h2></div><span class="pill ${colorPct(pc)}" style="font-size:14px">${pc ?? 0}%</span></div>
      ${barra(pc)}${porProd}${corte ? `<div class="tiny muted" style="margin-top:8px">Facturado al ${fmtFecha(corte + "T12:00:00")}</div>` : ""}</div>`;
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
    root.innerHTML = `<div class="top"><h1>Mis pedidos</h1><span id="syncpill"></span></div><div class="list" id="lp"><div class="muted">Cargando…</div></div>`;
    App.syncPill();
    if (!navigator.onLine) { $("#lp").innerHTML = `<div class="empty card flat"><div class="ic">${ic("senal", 34)}</div>Sin señal. Los pedidos se verán cuando vuelva la conexión.</div>`; return; }
    const { data, error } = await sb.from("v_pedidos").select("*").eq("vendedor_id", DB.user.id).order("creado_at", { ascending: false }).limit(60);
    if (error) { $("#lp").innerHTML = `<div class="muted">${esc(error.message)}</div>`; return; }
    const orden = { propuesto: 0, aprobado: 1, orden_escaneada: 2, rechazado: 3, impreso: 4, anulado: 5 };
    data.sort((a, b) => orden[a.estado] - orden[b.estado] || new Date(b.creado_at) - new Date(a.creado_at));
    $("#lp").innerHTML = data.map((p) => `<div class="item" data-id="${p.id}"><div class="ava">${ic("pedidos", 20)}</div><div class="grow"><div class="t">${esc(p.tienda)}</div>
        <div class="small muted">${fmtFechaHora(p.creado_at)} · ${fmtNum(p.total_cajas)} cajas · ${fmtKg(p.total_kg)}</div>${p.estado === "rechazado" && p.nota_revision ? `<div class="small" style="color:var(--rosa-t)">${esc(p.nota_revision)}</div>` : ""}</div>
        ${["propuesto", "aprobado"].includes(p.estado) && !p.documento ? `<span class="btn sm">${ic("camara", 16)} Escanear</span>` : pillPedido(p.estado) + (p.documento && p.estado === "propuesto" ? ` <span class="pill p-lila">Orden ✓</span>` : "")}</div>`).join("") || `<div class="empty card flat"><div class="ic">${ic("pedidos", 34)}</div>Todavía no tienes pedidos.</div>`;
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
