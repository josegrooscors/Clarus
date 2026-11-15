// Pantallas del vendedor: ruta del día, visita (gestión, fotos, inventario, promociones, pedido, cierre) y pedidos
const Visita = {
  get() { return LS.get("visita"); },
  set(v) { LS.set("visita", v); },
  fin() { LS.del("visita"); },
};

const PASOS = [
  ["gestion", "Gestión"], ["fotos", "Fotos"], ["inventario", "Inventario"],
  ["promos", "Promociones"], ["pedido", "Pedido"], ["cierre", "Cierre"],
];

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
      <div class="kpis">
        <div class="kpi"><div class="v">${ruta.length}</div><div class="l">Tiendas en ruta hoy</div></div>
        <div class="kpi"><div class="v">${ruta.filter((c) => hechas[c.id]).length}</div><div class="l">Visitadas</div></div>
      </div>
      <h3 style="margin:18px 0 10px">Ruta de hoy</h3>
      <div class="list" id="ruta">${ruta.length ? "" : `<div class="empty card flat"><div class="ic">🗺️</div>Hoy no tienes tiendas asignadas.<br><span class="small">Puedes iniciar una visita desde "Otra tienda".</span></div>`}</div>
      <div class="row" style="margin:20px 0 10px"><h3 class="sp">Otra tienda</h3></div>
      <input class="in" id="buscar" placeholder="Buscar tienda o cadena…">
      <div class="list" id="otras" style="margin-top:10px"></div>`;
    const fila = (c) => {
      const h = hechas[c.id];
      return `<div class="item" data-c="${c.id}"><div class="ava">${esc(iniciales(c.cadena || c.nombre))}</div>
        <div class="grow"><div class="t">${esc(c.nombre)}</div><div class="small muted">${esc(c.cadena || "")}${c.zona ? " · " + esc(c.zona) : ""}</div></div>
        ${h ? `<span class="pill p-menta">✓ ${fmtHora(h)}</span>` : `<span class="pill p-azul">Iniciar</span>`}</div>`;
    };
    $("#ruta").insertAdjacentHTML("beforeend", ruta.map(fila).join(""));
    const pintarOtras = (q) => {
      q = q.trim().toLowerCase();
      const lista = q ? cat.clientes.filter((c) => (c.nombre + " " + (c.cadena || "") + " " + (c.codigo || "")).toLowerCase().includes(q)).slice(0, 25) : [];
      $("#otras").innerHTML = lista.map(fila).join("") || (q ? `<div class="muted small">Sin resultados</div>` : "");
    };
    $("#buscar").oninput = (e) => pintarOtras(e.target.value);
    root.addEventListener("click", (e) => {
      const it = e.target.closest("[data-c]"); if (!it) return;
      const c = cat.clientes.find((x) => x.id == it.dataset.c);
      this.iniciar(c);
    });
    App.syncPill();
  },

  async iniciar(c) {
    if (Visita.get()) { toast("Primero cierra la visita en curso"); location.hash = "#visita"; return; }
    if (!(await confirmar(`Vas a hacer check-in en ${c.nombre}. Se registrará tu hora y ubicación.`, "Hacer check-in"))) return;
    toast("Obteniendo ubicación…", 9000);
    let pos;
    try { pos = await ubicacion(); } catch (e) { toast(e.message, 4000); return; }
    let aviso = "";
    if (c.lat != null) {
      const d = Math.round(distanciaM(pos, { lat: c.lat, lng: c.lng }));
      if (d > (c.radio_m || 100)) aviso = `Estás a ${d} m de la tienda. La visita quedará marcada como fuera de la tienda.`;
    }
    if (aviso && !(await confirmar(aviso, "Continuar igual"))) return;
    const v = { lid: uid(), cliente_id: c.id, tienda: c.nombre, cadena: c.cadena, at: new Date().toISOString(), lat: pos.lat, lng: pos.lng, precision: pos.precision,
      gestiones: {}, fotos: [], inv: {}, promos: [], pedido: null, guardado: {} };
    Visita.set(v);
    await DB.encolar({ t: "visita_in", lid: v.lid, data: { cliente_id: c.id, at: v.at, lat: pos.lat, lng: pos.lng, precision: pos.precision } });
    toast("Check-in registrado ✓");
    location.hash = "#visita";
  },

  // ---------------- VISITA ----------------
  async visita(root, paso) {
    const v = Visita.get();
    if (!v) { location.hash = "#hoy"; return; }
    const cat = await DB.catalogos();
    paso = paso || LS.get("paso") || "gestion";
    LS.set("paso", paso);
    const hecho = {
      gestion: Object.values(v.gestiones).some(Boolean), fotos: v.fotos.length > 0, inventario: !!v.guardado.inventario,
      promos: !!v.guardado.promos || v.promos.length > 0, pedido: !!v.pedido,
    };
    root.innerHTML = `
      <div class="top"><div><div class="small muted">Check-in ${fmtHora(v.at)} · ${esc(v.cadena || "")}</div><h1>${esc(v.tienda)}</h1></div><span id="syncpill"></span></div>
      <div class="steps">${PASOS.map(([k, t]) => `<div class="step ${k === paso ? "on" : hecho[k] ? "ok" : ""}" data-p="${k}">${hecho[k] && k !== paso ? "✓ " : ""}${t}</div>`).join("")}</div>
      <div id="paso"></div>`;
    $$(".step", root).forEach((s) => (s.onclick = () => V.visita(root, s.dataset.p)));
    const box = $("#paso", root);
    const sig = (p) => () => V.visita(root, p);
    App.syncPill();
    if (paso === "gestion") return this.pGestion(box, v, cat, sig("fotos"));
    if (paso === "fotos") return this.pFotos(box, v, sig("inventario"));
    if (paso === "inventario") return this.pInventario(box, v, cat, sig("promos"));
    if (paso === "promos") return this.pPromos(box, v, cat, sig("pedido"));
    if (paso === "pedido") return this.pPedido(box, v, cat, sig("cierre"));
    if (paso === "cierre") return this.pCierre(box, v, hecho);
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
    const tipos = [["antes", "Antes"], ["despues", "Después"], ["exhibicion", "Exhibición"], ["bodega", "Bodega"]];
    box.innerHTML = `<p class="muted small" style="margin-top:0">Las fotos se toman en el momento con la cámara. No se pueden subir desde la galería.</p>
      <div class="row wrap" style="gap:8px">${tipos.map(([k, t]) => `<button class="btn sec sm" data-f="${k}">📷 ${t}</button>`).join("")}</div>
      <div class="thumbs" style="margin-top:14px">${v.fotos.map((f) => `<div><img src="${f.thumb}"><div class="tiny muted">${esc(f.tipoTxt)} · ${fmtHora(f.at)}</div></div>`).join("")}</div>
      ${v.fotos.length ? "" : `<div class="empty"><div class="ic">📷</div>Aún no hay fotos</div>`}
      <button class="btn block" style="margin-top:16px" data-ok>Seguir</button>`;
    $$("[data-f]", box).forEach((b) => (b.onclick = async () => {
      try {
        const r = await Camara.evidencia({ titulo: b.textContent.replace("📷 ", ""), marca: v.tienda });
        if (!r) return;
        const key = uid(); await IDB.putBlob(key, r.blob);
        const tipoTxt = tipos.find((t) => t[0] === b.dataset.f)[1];
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
    if (!prods.length) { box.innerHTML = `<div class="empty card flat"><div class="ic">📦</div>No hay productos cargados todavía.</div><button class="btn block" data-ok>Seguir</button>`; $("[data-ok]", box).onclick = siguiente; return; }
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
      <div class="list">${v.promos.map((p) => `<div class="item"><img src="${p.thumb}" style="width:48px;height:48px;border-radius:10px;object-fit:cover"><div class="grow"><div class="t">${esc(tipos[p.tipo])}</div><div class="small muted">${esc(p.producto || "")}${p.precio_oferta ? " · $" + p.precio_oferta : ""}</div></div></div>`).join("") || `<div class="empty"><div class="ic">🏷️</div>Sin promociones registradas</div>`}</div>
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
        <button class="btn block" style="margin-top:16px" data-foto>📷 Tomar foto y guardar</button>`, (m, close) => {
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
    if (v.pedido) {
      box.innerHTML = `<div class="card"><div class="row"><h2 class="sp">Pedido propuesto</h2>${pillPedido("propuesto")}</div>
        <div class="list" style="margin-top:12px">${v.pedido.items.map((i) => `<div class="row"><span class="sp">${esc(i.nombre)}</span><b>${fmtNum(i.propuesto)} ${esc(i.unidad)}</b></div>`).join("")}</div>
        <p class="small muted">Lo revisará tu supervisor. Cuando lo apruebe, te aparecerá en Pedidos para escanear la orden.</p></div>
        <button class="btn block" data-ok>Seguir al cierre</button>`;
      $("[data-ok]", box).onclick = siguiente; return;
    }
    const prods = this.productosTienda(v, cat);
    const filas = prods.map((p) => {
      const stock = (Number(v.inv[p.id + ":bodega"]) || 0) + (Number(v.inv[p.id + ":exhibicion"]) || 0);
      const contado = v.inv[p.id + ":bodega"] !== undefined || v.inv[p.id + ":exhibicion"] !== undefined;
      let sug = 0, bajo = false;
      const r = p.regla;
      if (r && r.stock_minimo != null && contado && stock <= Number(r.stock_minimo)) {
        bajo = true;
        const obj = r.stock_objetivo != null ? Number(r.stock_objetivo) : Number(r.stock_minimo) * 2;
        sug = Math.max(0, Math.ceil((obj - stock) / (Number(p.unidades_por_pedido) || 1)));
      }
      return { p, stock, contado, sug, bajo };
    });
    const bajos = filas.filter((f) => f.bajo).length;
    box.innerHTML = `${!v.guardado.inventario ? `<div class="card flat" style="background:var(--durazno);border-color:#F6DDBB"><b>Primero guarda el inventario</b><div class="small">Así la app calcula el pedido sugerido.</div></div>` : ""}
      <p class="muted small" style="margin-top:0">${bajos ? `${bajos} producto(s) con inventario bajo. Revisa la sugerencia y ajusta las cantidades.` : "No hay productos bajo el mínimo. Si igual hace falta pedir, escribe las cantidades."}</p>
      <div class="list">${filas.map((f) => `<div class="inv" data-p="${f.p.id}"><div class="row"><div class="sp"><div class="nm">${esc(f.p.nombre)}</div>
          <div class="tiny muted">Inventario: ${f.contado ? fmtNum(f.stock) + " " + esc(f.p.unidad_conteo) + "s" : "sin contar"}${f.p.regla?.stock_minimo != null ? " · mínimo " + fmtNum(f.p.regla.stock_minimo) : ""}</div></div>
          ${f.bajo ? `<span class="pill p-rosa">Bajo</span>` : ""}</div>
          <div class="row" style="margin-top:10px"><span class="small muted sp">${f.sug ? "Sugerido: <b>" + f.sug + " " + esc(f.p.unidad_pedido) + "(s)</b>" : ""}</span>
          <div class="stepper" style="width:150px"><button data-m>−</button><input inputmode="numeric" value="${f.sug || ""}" placeholder="0"><button data-s>+</button></div></div></div>`).join("")}</div>
      <label class="f">Nota para el supervisor</label><input class="in" id="nota" placeholder="Opcional">
      <div class="row" style="margin-top:16px"><button class="btn sec sp" data-no>No hace falta pedido</button><button class="btn sp" data-ok>Proponer pedido</button></div>`;
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-m],[data-s]"); if (!b) return;
      const inp = $("input", b.parentElement); inp.value = Math.max(0, (parseInt(inp.value) || 0) + (b.dataset.s !== undefined ? 1 : -1)) || "";
    });
    $("[data-no]", box).onclick = () => { v.pedido = { ninguno: true, items: [] }; Visita.set(v); siguiente(); };
    $("[data-ok]", box).onclick = async () => {
      const items = filas.map((f) => ({ producto_id: f.p.id, nombre: f.p.nombre, unidad: f.p.unidad_pedido, stock: f.contado ? f.stock : null, sugerido: f.sug || null,
        propuesto: parseFloat($(`[data-p="${f.p.id}"] input`, box).value) || 0 })).filter((i) => i.propuesto > 0);
      if (!items.length) { toast("Escribe al menos una cantidad"); return; }
      const plid = uid();
      await DB.encolar({ t: "pedido", lid: v.lid, plid, data: { cliente_id: v.cliente_id, nota: $("#nota").value }, items });
      v.pedido = { plid, items }; Visita.set(v);
      toast("Pedido enviado para aprobación ✓"); siguiente();
    };
  },

  pCierre(box, v, hecho) {
    const items = [["Gestión", hecho.gestion], ["Fotos (" + v.fotos.length + ")", hecho.fotos], ["Inventario", hecho.inventario], ["Promociones revisadas", hecho.promos], ["Pedido revisado", hecho.pedido]];
    box.innerHTML = `<div class="card"><h2 style="margin-bottom:10px">Resumen</h2>
      ${items.map(([t, ok]) => `<div class="row" style="padding:6px 0"><span class="sp">${t}</span>${ok ? `<span class="pill p-menta">✓ Listo</span>` : `<span class="pill p-durazno">Pendiente</span>`}</div>`).join("")}
      <div class="row" style="padding:6px 0"><span class="sp">Tiempo en tienda</span><b>${minutos(v.at, new Date())} min</b></div></div>
      <label class="f">Comentario de la visita</label><textarea class="in" id="com" placeholder="Opcional">${esc(v.comentario || "")}</textarea>
      <button class="btn block ok" style="margin-top:16px" data-out>Hacer check-out</button>`;
    $("#com").oninput = (e) => { v.comentario = e.target.value; Visita.set(v); };
    $("[data-out]", box).onclick = async () => {
      const faltan = items.filter((i) => !i[1]).map((i) => i[0]);
      if (faltan.length && !(await confirmar(`Te falta: ${faltan.join(", ")}. ¿Cerrar la visita igual?`, "Cerrar visita"))) return;
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

  // ---------------- PEDIDOS (vendedor) ----------------
  async pedidos(root) {
    root.innerHTML = `<div class="top"><h1>Mis pedidos</h1><span id="syncpill"></span></div><div class="list" id="lp"><div class="muted">Cargando…</div></div>`;
    App.syncPill();
    if (!navigator.onLine) { $("#lp").innerHTML = `<div class="empty card flat"><div class="ic">📶</div>Sin señal. Los pedidos se verán cuando vuelva la conexión.</div>`; return; }
    const { data, error } = await sb.from("v_pedidos").select("*").eq("vendedor_id", DB.user.id).order("creado_at", { ascending: false }).limit(60);
    if (error) { $("#lp").innerHTML = `<div class="muted">${esc(error.message)}</div>`; return; }
    const orden = { aprobado: 0, propuesto: 1, rechazado: 2, orden_escaneada: 3, impreso: 4, anulado: 5 };
    data.sort((a, b) => orden[a.estado] - orden[b.estado] || new Date(b.creado_at) - new Date(a.creado_at));
    $("#lp").innerHTML = data.map((p) => `<div class="item" data-id="${p.id}"><div class="ava">📝</div><div class="grow"><div class="t">${esc(p.tienda)}</div>
        <div class="small muted">${fmtFechaHora(p.creado_at)} · ${fmtNum(p.total_cajas)} cajas</div>${p.estado === "rechazado" && p.nota_revision ? `<div class="small" style="color:var(--rosa-t)">${esc(p.nota_revision)}</div>` : ""}</div>
        ${pillPedido(p.estado)}</div>`).join("") || `<div class="empty card flat"><div class="ic">📝</div>Todavía no tienes pedidos.</div>`;
    $$("[data-id]", root).forEach((el) => (el.onclick = () => this.detallePedido(data.find((p) => p.id == el.dataset.id), () => this.pedidos(root))));
  },

  async detallePedido(p, recargar) {
    const { data: items } = await sb.from("pedido_items").select("*, productos(nombre, unidad_pedido)").eq("pedido_id", p.id);
    modal(`<div class="row"><h2 class="sp">${esc(p.tienda)}</h2>${pillPedido(p.estado)}</div>
      <div class="small muted" style="margin:4px 0 12px">Pedido #${p.id} · ${fmtFechaHora(p.creado_at)}</div>
      <table class="t"><tr><th>Producto</th><th>Propuesto</th><th>Aprobado</th></tr>
      ${(items || []).map((i) => `<tr><td>${esc(i.productos.nombre)}</td><td>${fmtNum(i.propuesto)}</td><td><b>${i.aprobado != null ? fmtNum(i.aprobado) : "–"}</b></td></tr>`).join("")}</table>
      ${p.nota_revision ? `<p class="small"><b>Nota del supervisor:</b> ${esc(p.nota_revision)}</p>` : ""}
      ${p.estado === "aprobado" ? `<div class="card flat" style="background:var(--azul-cl);border-color:var(--azul-med);margin-top:14px"><b>Siguiente paso</b><div class="small">Cuando te entreguen la orden física, escanéala aquí.</div></div>
        <label class="f">Número de la orden (si lo tiene)</label><input class="in" id="norden" placeholder="Opcional">
        <button class="btn block" style="margin-top:12px" data-scan>📄 Escanear orden</button>` : ""}
      ${p.documento ? `<button class="btn sec block" style="margin-top:12px" data-ver>Ver orden escaneada</button>` : ""}`, (m, close) => {
      const ver = $("[data-ver]", m);
      if (ver) ver.onclick = async () => window.open(await DB.urlFirmada("documentos", p.documento), "_blank");
      const sc = $("[data-scan]", m);
      if (sc) sc.onclick = async () => {
        const numero = $("#norden", m).value.trim();
        close();
        try {
          const r = await Escaner.escanear({ titulo: "Orden de compra" });
          if (!r) return;
          let pos = null; try { pos = await ubicacion(6000); } catch {}
          const key = uid(); await IDB.putBlob(key, r.blob);
          await DB.encolar({ t: "orden", pedido_id: p.id, blob: key, data: { paginas: r.paginas, numero_orden: numero, at: new Date().toISOString(), lat: pos?.lat, lng: pos?.lng } });
          toast(`Orden escaneada (${r.paginas} pág.) ✓ Se enviará a operaciones`, 3500);
          await DB.sincronizar(); recargar();
        } catch (e) { toast(e.message, 4000); }
      };
    });
  },
};
