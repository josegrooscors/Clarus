// Planogramas: cómo debe verse la exhibición (nevera, deli, anaquel) con frentes, fondo y altura por producto.
// La gerencia los diseña y los asigna a tiendas; la vendedora los ve en la visita y marca si la tienda cumple.
const PL = {
  MUEBLES: { nevera: "Nevera abierta", puertas: "Nevera de puertas", deli: "Vitrina deli", vitrina: "Vitrina recta", exhibidor: "Isla / exhibidor", cofre: "Congelador horizontal", anaquel: "Góndola seca", punta: "Punta de góndola" },
  // Íconos (vista 3/4) para elegir el mueble; el dibujo editable siempre es de frente
  ICONOS: {
    nevera: '<rect x="6" y="3" width="28" height="30" rx="2"/><path d="M6 8h28M10 15h20M10 21h20M10 27h20M8 33v3M32 33v3"/>',
    puertas: '<rect x="6" y="3" width="28" height="32" rx="2"/><path d="M20 3v32M16 15v6M24 15v6M6 8h28"/>',
    deli: '<path d="M4 33V20c0-6 6-10 14-10h18v23z"/><path d="M8 26h28M12 20h24M4 33h32v3H4z"/>',
    vitrina: '<rect x="4" y="12" width="32" height="21" rx="1.5"/><path d="M4 18h32M8 26h24M4 33h32v3H4z"/>',
    exhibidor: '<path d="M4 34h32l-3-6H7zM9 27h22l-3-6H12zM14 20h12l-2-5h-8z"/><path d="M20 15V6M16 3h8v4h-8z"/>',
    cofre: '<rect x="3" y="18" width="34" height="16" rx="2"/><path d="M5 18l3-5h24l3 5M20 13v5M3 24h34"/>',
    anaquel: '<path d="M6 3v33M34 3v33M6 10h28M6 18h28M6 26h28M6 34h28"/>',
    punta: '<rect x="9" y="3" width="22" height="7" rx="1.5"/><path d="M10 10v26M30 10v26M10 17h20M10 24h20M10 31h20"/>',
  },
  COMP: "competencia",
  OTRA: "otra", // otra categoría (embutidos, etc.): ocupa espacio pero no cuenta para la participación
  // Espacios por nivel habituales: una nevera real tiene muchos frentes por repisa (nuestros + competencia)
  ESPACIOS: { nevera: 16, puertas: 15, deli: 10, vitrina: 10, exhibidor: 10, cofre: 10, anaquel: 16, punta: 8 },
  // Nombre automático: mueble + tienda / cadena
  nombreAuto(mueble, ids, clientes) {
    const sel = clientes.filter((c) => ids.has(c.id)), m = this.MUEBLES[mueble] || "Mueble";
    if (!sel.length) return m;
    if (sel.length === 1) return `${m} · ${sel[0].nombre}`;
    const cads = [...new Set(sel.map((c) => c.cadena || ""))];
    return cads.length === 1 && cads[0] ? `${m} · ${cads[0]} (${sel.length} tiendas)` : `${m} · ${sel.length} tiendas`;
  },
  // Muebles de un planograma (cada uno con sus propios frentes). Compatibilidad: si no hay lista, usa las columnas sueltas.
  lista(pl) {
    const ms = Array.isArray(pl.muebles) && pl.muebles.length ? pl.muebles : [{ mueble: pl.mueble, niveles: pl.niveles, posiciones: pl.posiciones, celdas: pl.celdas }];
    return ms.map((m) => ({ ...pl, ...m, celdas: m.celdas || [] }));
  },
  // Todas las celdas de todos los muebles (para totales y participación del planograma completo)
  junto(pl) { return { ...pl, celdas: this.lista(pl).flatMap((m) => m.celdas || []) }; },
  // Niveles habituales y máximos por mueble (deli y vitrinas: 2; congelador: 1)
  TIPO: { nevera: { nv: 5, max: 8 }, puertas: { nv: 5, max: 8 }, deli: { nv: 2, max: 3 }, vitrina: { nv: 2, max: 3 }, exhibidor: { nv: 3, max: 5 }, cofre: { nv: 1, max: 2 }, anaquel: { nv: 5, max: 10 }, punta: { nv: 4, max: 8 } },
  // Isla: cada piso tiene su propio número de espacios (los de arriba son más chicos). Índice 0 = piso de arriba.
  piramide(niveles, base) { return Array.from({ length: niveles }, (_, n) => Math.max(2, base - 2 * (niveles - 1 - n))); },
  icono(t, s = 34) { return `<svg width="${s}" height="${s}" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${this.ICONOS[t] || this.ICONOS.nevera}</svg>`; },
  COLORES: ["#2F5BEA", "#F2B33D", "#E5484D", "#30A46C", "#8E4EC6", "#0B1B33", "#F76B15", "#12A594"],

  claveProd: (p) => "p" + p.id,
  totales(pl) {
    const t = {};
    (pl.celdas || []).forEach((fila) => (fila || []).forEach((k) => { if (k && k !== this.COMP && k !== this.OTRA) t[k] = (t[k] || 0) + 1; }));
    return Object.entries(t).map(([k, frentes]) => {
      const c = pl.productos?.[k] || { nombre: k, fondo: 1, alto: 1 };
      return { k, nombre: c.nombre, color: c.color, frentes, fondo: c.fondo || 1, alto: c.alto || 1, unidades: frentes * (c.fondo || 1) * (c.alto || 1) };
    });
  },

  // Dibujo del mueble de frente (solo lectura o editable). Los niveles se cuentan de abajo hacia arriba (1 = el de abajo).
  // celdas[0] es el nivel de arriba (así se guarda); solo cambia el número que se muestra.
  dibujo(pl, editable = false) {
    const t = this.MUEBLES[pl.mueble] ? pl.mueble : "nevera", filas = pl.celdas || [], N = filas.length;
    const ojos = ["nevera", "puertas", "anaquel", "punta"].includes(t) && N >= 3 ? 1 : -1; // segundo nivel desde arriba ≈ 1.4–1.6 m
    const max = Math.max(1, ...filas.map((f) => (f || []).length)); // isla: el ancho de cada piso depende de sus espacios; todos los frentes miden lo mismo
    const bandeja = ["deli", "exhibidor", "cofre"].includes(t);
    const niveles = filas.map((fila, n) => {
      const margen = t === "exhibidor" ? `width:calc((100% - 22px) * ${(fila || []).length / max} + 26px)` : "";
      return `<div class="pl-nivel ${n === ojos ? "ojos" : ""}" style="${margen}" ${n === ojos ? 'title="Nivel de los ojos: el que más vende"' : ""}><span class="pl-num">${N - n}</span>${(fila || []).map((k, p) => {
        const c = k ? pl.productos?.[k] : null;
        return `<div class="pl-celda ${k ? (k === PL.COMP ? "comp" : k === PL.OTRA ? "otra" : "llena") : ""}" ${editable ? `data-n="${n}" data-p="${p}"` : ""} style="${c && k !== PL.COMP && k !== PL.OTRA ? `background:${c.color};border-color:${c.color}` : ""}" title="${c ? esc(c.nombre) : "Vacío"}"></div>`;
      }).join("")}</div>`;
    }).join("");
    const puertas = t === "puertas" ? `<div class="pl-hojas">${"<i></i>".repeat(Math.max(1, Math.min(6, Math.round((pl.posiciones || 3) / 3))))}</div>` : "";
    const techo = { nevera: `<div class="pl-techo"><i></i></div>`, puertas: `<div class="pl-techo"><i></i></div>`, punta: `<div class="pl-cartel">${esc(pl.nombre || "Punta de góndola")}</div>`, cofre: `<div class="pl-tapa"><i></i><i></i></div>`, exhibidor: `<div class="pl-letrero"><i></i></div>` }[t] || "";
    const zocalo = ["anaquel", "punta"].includes(t) ? `<div class="pl-zocalo liso"></div>` : t === "exhibidor" ? `<div class="pl-zocalo base"></div>` : `<div class="pl-zocalo"></div>`;
    return `<div class="pl-mueble pl-${t} ${bandeja ? "pl-bandeja" : ""}">${techo}<div class="pl-caja"><div class="pl-interior">${niveles}${puertas}</div></div>${zocalo}</div>`;
  },
  sigla: (n) => String(n).replace(/^Queso /i, "").split(/\s+/).slice(0, 2).map((w) => w.slice(0, w.length > 5 ? 4 : w.length)).join(" "),
  // Participación en el espacio del mueble (share of shelf): lo nuestro vs. competencia vs. libre
  // Participación en la categoría = nuestro ÷ (nuestro + competencia). "Otra categoría" y vacíos no cuentan.
  espacio(pl) {
    const todas = (pl.celdas || []).flat();
    const comp = todas.filter((k) => k === this.COMP).length, otra = todas.filter((k) => k === this.OTRA).length;
    const nuestro = todas.filter((k) => k && k !== this.COMP && k !== this.OTRA).length, cat = nuestro + comp;
    return { nuestro, comp, otra, libre: todas.length - nuestro - comp - otra, total: todas.length, cat, pN: cat ? Math.round((nuestro / cat) * 100) : null, pC: cat ? Math.round((comp / cat) * 100) : null };
  },
  barraEspacio(e) {
    if (!e.total) return "";
    return `<div class="pl-share"><div class="row" style="align-items:baseline;gap:8px;margin-bottom:6px"><b style="font-size:22px">${e.pN == null ? "–" : e.pN + "%"}</b><span class="small muted">participación en la categoría</span></div>
      <div class="pl-share-b"><i style="width:${e.pN || 0}%"></i><i class="c" style="width:${e.pC || 0}%"></i></div>
      <div class="row small" style="gap:12px;flex-wrap:wrap"><span><b class="pl-dot" style="background:var(--azul)"></b>Nuestro <b>${e.nuestro}</b></span><span><b class="pl-dot pl-comp"></b>Competencia <b>${e.comp}</b></span>
        <span class="muted"><b class="pl-dot pl-otra"></b>Otra categoría ${e.otra}</span><span class="muted">Vacíos ${e.libre}</span></div>
      <div class="tiny muted" style="margin-top:4px">Nuestros frentes ÷ (nuestros + competencia). Otra categoría y vacíos no cuentan.</div></div>`;
  },
  tablaTotales(pl) {
    const t = this.totales(pl), e = this.espacio(pl);
    const barra = this.barraEspacio(e);
    if (!t.length) return barra + `<div class="small muted">Aún no hay productos en el planograma.</div>`;
    return barra + `<div class="scroll-x"><table class="t pl-tabla"><tr><th>Producto</th><th>Frentes</th><th>Fondo</th><th>Altura</th><th>Unidades</th></tr>
      ${t.map((x) => `<tr><td><span class="pl-dot" style="background:${x.color}"></span>${esc(x.nombre)}</td><td><b>${x.frentes}</b></td><td>${x.fondo}</td><td>${x.alto}</td><td><b>${x.unidades}</b></td></tr>`).join("")}</table></div>`;
  },

  // ---------- Lista ----------
  async render(root, id) {
    if (id) return this.editor(root, id === "nuevo" ? null : Number(id));
    root.innerHTML = `<div class="top"><div><div class="muted small">Exhibición por tienda</div><h1>Planogramas</h1></div><a class="btn sm" href="#planogramas/nuevo">+ Nuevo planograma</a></div><div id="pll" class="muted">Cargando…</div>`;
    const [{ data: pls, error }, { data: asg }] = await Promise.all([
      sb.from("planogramas").select("*").order("nombre"),
      sb.from("planograma_tiendas").select("planograma_id, cliente_id"),
    ]);
    if (error) { $("#pll", root).textContent = error.message; return; }
    $("#pll", root).outerHTML = pls.length ? `<div class="pl-grid">${pls.map((pl) => `<a class="card pl-card" href="#planogramas/${pl.id}">
        <div class="row"><div class="grow"><b>${esc(pl.nombre)}</b><div class="tiny muted">${this.lista(pl).map((m) => esc(this.MUEBLES[m.mueble])).join(" + ")}</div></div>
        ${pl.activo ? "" : `<span class="pill p-gris">Inactivo</span>`}</div>
        <div class="pl-mini">${this.dibujo(this.lista(pl)[0])}</div>${this.lista(pl).length > 1 ? `<div class="tiny muted">+ ${plur(this.lista(pl).length - 1, "mueble")} más</div>` : ""}
        <div class="tiny muted">${plur((asg || []).filter((a) => a.planograma_id === pl.id).length, "tienda")} · ${this.totales(this.junto(pl)).map((t) => `${esc(PL.sigla(t.nombre))}: ${t.frentes} frentes`).join(" · ") || "sin productos"}${this.espacio(this.junto(pl)).comp ? ` · ${this.espacio(this.junto(pl)).pN}% de la categoría` : ""}</div></a>`).join("")}</div>`
      : `<div class="empty card flat"><div class="ic">${ic("resumen", 34)}</div>Aún no hay planogramas. Crea el primero, por ejemplo "Mozzarella en deli".</div>`;
  },

  // ---------- Editor ----------
  async editor(root, id) {
    const cat = await DB.catalogos();
    let pl = { nombre: "", mueble: "nevera", niveles: 5, posiciones: 16, celdas: [], productos: {}, nota: "", activo: true };
    let tiendas = new Set();
    if (id) {
      const [{ data }, { data: asg }] = await Promise.all([sb.from("planogramas").select("*").eq("id", id).single(), sb.from("planograma_tiendas").select("cliente_id").eq("planograma_id", id)]);
      if (!data) { root.innerHTML = `<div class="empty card flat">No encontré el planograma.</div>`; return; }
      pl = { ...data, productos: data.productos || {}, celdas: data.celdas || [] }; tiendas = new Set((asg || []).map((a) => a.cliente_id));
    }
    // productos disponibles: catálogo + etiquetas propias guardadas en el planograma
    cat.productos.forEach((p, i) => { const k = this.claveProd(p); if (!pl.productos[k] && !Object.values(pl.productos).some((c) => c.nombre === p.nombre)) pl.productos[k] = { nombre: p.nombre, color: this.COLORES[i % this.COLORES.length], fondo: 1, alto: 1, catalogo: true }; });
    pl.productos[this.COMP] = { nombre: "Competencia", color: "#9AA6B8", fondo: 1, alto: 1, catalogo: true, comp: true };
    pl.productos[this.OTRA] = { nombre: "Otra categoría", color: "#E7ECF2", fondo: 1, alto: 1, catalogo: true, comp: true, otra: true };
    pl.muebles = this.lista(pl).map((m) => ({ mueble: m.mueble, niveles: m.niveles, posiciones: m.posiciones, celdas: m.celdas, porNivel: m.porNivel }));
    let mi = 0; // mueble activo
    const ajustar = () => {
      const c = [];
      const isla = pl.mueble === "exhibidor";
      if (isla && (!pl.porNivel || pl.porNivel.length !== pl.niveles)) pl.porNivel = this.piramide(pl.niveles, pl.posiciones);
      for (let n = 0; n < pl.niveles; n++) { c.push([]); const cant = isla ? pl.porNivel[n] : pl.posiciones; for (let p = 0; p < cant; p++) c[n].push(pl.celdas?.[n]?.[p] || null); }
      if (isla) pl.posiciones = Math.max(...pl.porNivel);
      pl.celdas = c;
    };
    // cada mueble se edita por separado: se guarda el activo en la lista y se carga el otro
    const guardarM = () => { pl.muebles[mi] = { mueble: pl.mueble, niveles: pl.niveles, posiciones: pl.posiciones, celdas: pl.celdas, ...(pl.mueble === "exhibidor" ? { porNivel: pl.porNivel } : {}) }; };
    const cargarM = (i) => {
      const m = pl.muebles[i]; mi = i;
      Object.assign(pl, { mueble: m.mueble, niveles: m.niveles, posiciones: m.posiciones, celdas: m.celdas || [], porNivel: m.porNivel || null });
      if (pl.mueble === "exhibidor" && !pl.porNivel && pl.celdas.length === pl.niveles && pl.celdas.every((f) => f && f.length)) pl.porNivel = pl.celdas.map((f) => f.length);
      ajustar();
    };
    const nuevoM = (t) => ({ mueble: t, niveles: this.TIPO[t].nv, posiciones: this.ESPACIOS[t], celdas: [] });
    cargarM(0);
    let pincel = Object.keys(pl.productos)[0] || null, borrar = false, filtro = "", cadSel = new Set(), soloSel = false, verN = 10;
    const clientes = cat.clientes.filter((c) => c.modalidad !== "resurtido_auto" || tiendas.has(c.id));

    const pintar = () => {
      root.innerHTML = `<a href="#planogramas" class="small" style="text-decoration:none">‹ Planogramas</a>
        <div class="top"><div><div class="muted small">${id ? "Editar planograma" : "Nuevo planograma"}</div><h1>${esc(pl.nombre || this.nombreAuto(pl.mueble, tiendas, clientes))}</h1></div>
          <div class="row" style="gap:8px">${id ? `<button class="btn ghost sm" data-dup>Duplicar</button>` : ""}<button class="btn sm" data-guardar>Guardar</button></div></div>
        <div class="card pl-tiendas-card"><div class="row"><h3 class="grow" style="margin:0"><span class="pl-paso">1</span>Tiendas donde aplica</h3><span class="pill p-azul">${plur(tiendas.size, "tienda")}</span></div>
              <div class="pl-filtros">
                <details class="pl-dd" id="pcad"><summary class="in"><span class="grow" id="pcadt"></span><span style="display:inline-flex;transform:rotate(-90deg)">${ic("chev", 16)}</span></summary>
                  <div class="pl-dd-panel"><input class="in" id="pcadb" placeholder="Buscar cadena…"><div class="pl-dd-list" id="pcadl"></div>
                    <div class="row" style="gap:6px;margin-top:8px"><button class="btn ghost sm" data-cadlimpiar>Todas</button><span class="sp"></span><button class="btn sm" data-cadok>Listo</button></div></div></details>
                <input class="in" id="pbus" placeholder="Buscar tienda…" value="${esc(filtro)}">
              </div>
              <div id="ptz"></div>
        </div>
        <div class="pl-ed">
          <div class="card">
            <h3 class="sec-t" style="margin-top:0"><span class="pl-paso">2</span>Muebles de la exhibición</h3>
            <div class="tiny muted" style="margin-bottom:8px">Cada mueble tiene sus propios niveles y frentes. ¿La tienda tiene nevera y vitrina deli? Agrega los dos.</div>
            <div class="pl-mtabs">${pl.muebles.map((m, i) => `<button type="button" class="pl-mtab ${i === mi ? "on" : ""}" data-mtab="${i}">${this.icono(i === mi ? pl.mueble : m.mueble, 22)}<span>${esc(this.MUEBLES[i === mi ? pl.mueble : m.mueble])}</span></button>`).join("")}<button type="button" class="pl-mtab mas" data-madd>+ Agregar mueble</button></div>
            <label class="f">Tipo de este mueble${pl.muebles.length > 1 ? ` <span class="tiny muted">(${mi + 1} de ${pl.muebles.length})</span>` : ""}</label>
            <input type="hidden" id="pm" value="${pl.mueble}">
            <div class="pl-tipos">${Object.entries(this.MUEBLES).map(([k, t]) => `<button type="button" class="pl-tipo ${k === pl.mueble ? "on" : ""}" data-mueble="${k}">${this.icono(k)}<span>${t}</span></button>`).join("")}</div>
            <div class="grid2c"><div><label class="f">Activo</label><select class="in" id="pa"><option value="1" ${pl.activo ? "selected" : ""}>Sí</option><option value="0" ${pl.activo ? "" : "selected"}>No</option></select></div>
              <div><label class="f">Niveles</label><input class="in" type="number" min="1" max="${this.TIPO[pl.mueble].max}" id="pnv" value="${pl.niveles}"></div></div>
            ${pl.mueble === "exhibidor"
              ? `<label class="f">Espacios por piso <span class="tiny muted">(los pisos de arriba son más chicos)</span></label><div class="pl-pisos">${pl.porNivel.map((v, n) => `<label class="tiny">Piso ${pl.niveles - n}<input class="in" type="number" min="1" max="30" data-piso="${n}" value="${v}"></label>`).join("")}</div>`
              : `<div class="grid2c"><div><label class="f">Espacios por nivel</label><input class="in" type="number" min="1" max="30" id="pps" value="${pl.posiciones}"></div><div></div></div>`}
            <label class="f">Nombre <span class="tiny muted">(opcional: si lo dejas vacío se arma solo)</span></label><input class="in" id="pn" value="${esc(pl.nombre)}" placeholder="${esc(this.nombreAuto(pl.mueble, tiendas, clientes))}">
            <label class="f">Instrucción para la vendedora</label><textarea class="in" id="pnt" rows="2" placeholder="Ej.: Mozzarella a la altura de los ojos, etiqueta de precio visible.">${esc(pl.nota || "")}</textarea>

            <h3 class="sec-t" style="margin-top:16px"><span class="pl-paso">3</span>Productos</h3>
            <div class="tiny muted" style="margin-bottom:6px">Elige un producto y toca los espacios del mueble. Cada espacio es un <b>frente</b>. Marca también <b>Competencia</b> para ver quién está a tu lado y cuánto espacio tienes.</div>
            <div class="list" style="gap:6px">${Object.entries(pl.productos).map(([k, c]) => `<div class="pl-prod ${pincel === k && !borrar ? "on" : ""}" data-pin="${k}">
              <span class="pl-dot ${c.otra ? "pl-otra" : c.comp ? "pl-comp" : ""}" style="${c.comp ? "" : `background:${c.color}`}"></span><span class="grow">${esc(c.nombre)}${c.otra ? '<div class="tiny muted">Embutidos u otros: no cuentan</div>' : c.comp ? '<div class="tiny muted">Otras marcas de la categoría</div>' : ""}</span>
              ${c.comp ? "" : `<label class="tiny">Fondo <input class="in pl-num-in" type="number" min="1" max="50" data-fondo="${k}" value="${c.fondo || 1}" title="Unidades hacia atrás en cada frente"></label>
              <label class="tiny">Altura <input class="in pl-num-in" type="number" min="1" max="10" data-alto="${k}" value="${c.alto || 1}" title="Unidades apiladas hacia arriba"></label>`}</div>`).join("")}</div>
            <div class="row" style="gap:6px;margin-top:8px"><button class="btn ghost sm" data-etq>+ Otra presentación</button><button class="btn sm ${borrar ? "" : "sec"}" data-borrar>Borrar posiciones</button></div>
          </div>
          <div>
            <div class="card"><div class="row"><h3 class="grow" style="margin:0">${esc(this.MUEBLES[pl.mueble])}${pl.muebles.length > 1 ? ` <span class="tiny muted">· mueble ${mi + 1} de ${pl.muebles.length}</span>` : ""}</h3><button class="btn ghost sm" data-limpiar>Vaciar</button>${pl.muebles.length > 1 ? `<button class="btn ghost sm" data-mquitar>Quitar mueble</button>` : ""}</div>
              <div style="margin-top:12px">${this.dibujo(pl, true)}</div>
              <div style="margin-top:14px">${this.tablaTotales(pl)}</div>
              <p class="tiny muted" style="margin:8px 0 0">Nivel 1 = el de abajo${["nevera", "puertas", "anaquel", "punta"].includes(pl.mueble) && pl.niveles >= 3 ? " · <b style=\"color:var(--azul)\">número azul</b> = nivel de los ojos, el que más vende" : ""} · Frentes = posiciones ocupadas · Fondo = unidades hacia atrás · Altura = unidades apiladas · Unidades = frentes × fondo × altura.</p></div>

          </div>
        </div>`;
      const leer = () => { pl.nombre = $("#pn").value.trim(); pl.mueble = $("#pm").value; pl.activo = $("#pa").value === "1"; pl.nota = $("#pnt").value; };
      $("#pn").oninput = () => (pl.nombre = $("#pn").value);
      $("#pnt").oninput = () => (pl.nota = $("#pnt").value);
      $$("[data-mueble]", root).forEach((b) => (b.onclick = () => {
        leer(); if (b.dataset.mueble === pl.mueble) return;
        if (pl.celdas.flat().some(Boolean)) {
          guardarM(); pl.muebles.push(nuevoM(b.dataset.mueble)); cargarM(pl.muebles.length - 1); pintar();
          return toast(`Se agregó ${this.MUEBLES[b.dataset.mueble]} como otro mueble. El anterior conserva sus frentes.`);
        }
        const antes = pl.mueble; pl.mueble = b.dataset.mueble; $("#pm", root).value = pl.mueble;
        const tp = this.TIPO[pl.mueble], vacio = true;
        if (vacio) { pl.niveles = tp.nv; pl.posiciones = this.ESPACIOS[pl.mueble]; } else if (pl.niveles > tp.max) { pl.niveles = tp.max; toast(`Este mueble lleva hasta ${tp.max} niveles; se quitaron los de arriba.`); }
        if (pl.mueble === "exhibidor" && antes !== "exhibidor") pl.porNivel = this.piramide(pl.niveles, pl.posiciones);
        if (pl.mueble !== "exhibidor" && antes === "exhibidor") pl.posiciones = Math.max(...pl.porNivel);
        pl.celdas = pl.celdas.slice(-pl.niveles); ajustar(); pintar();
      }));
      $("#pa").onchange = () => (pl.activo = $("#pa").value === "1");
      $("#pnv", root).onchange = () => {
        leer(); const nv = Math.min(this.TIPO[pl.mueble].max, Math.max(1, Number($("#pnv", root).value) || 1));
        // los niveles se agregan o quitan arriba: el nivel 1 (abajo) conserva lo que tiene
        const dif = nv - pl.niveles; pl.celdas = dif > 0 ? [...Array(dif).fill(null), ...pl.celdas] : pl.celdas.slice(-dif);
        if (pl.porNivel) pl.porNivel = dif > 0 ? [...this.piramide(nv, pl.porNivel[pl.porNivel.length - 1]).slice(0, dif), ...pl.porNivel] : pl.porNivel.slice(-dif);
        pl.niveles = nv; ajustar(); pintar();
      };
      const pps = $("#pps", root); if (pps) pps.onchange = () => { leer(); pl.posiciones = Math.min(30, Math.max(1, Number(pps.value) || 1)); ajustar(); pintar(); };
      $$("[data-piso]", root).forEach((el) => (el.onchange = () => { leer(); pl.porNivel[+el.dataset.piso] = Math.min(30, Math.max(1, Number(el.value) || 1)); ajustar(); pintar(); }));
      $$("[data-pin]").forEach((el) => (el.onclick = (e) => { if (e.target.tagName === "INPUT") return; leer(); pincel = el.dataset.pin; borrar = false; pintar(); }));
      $$("[data-fondo]").forEach((el) => (el.onchange = () => { leer(); pl.productos[el.dataset.fondo].fondo = Math.max(1, Number(el.value) || 1); pintar(); }));
      $$("[data-alto]").forEach((el) => (el.onchange = () => { leer(); pl.productos[el.dataset.alto].alto = Math.max(1, Number(el.value) || 1); pintar(); }));
      $("[data-borrar]").onclick = () => { leer(); borrar = !borrar; pintar(); };
      $("[data-limpiar]").onclick = () => { leer(); pl.celdas = []; ajustar(); pintar(); };
      $$("[data-mtab]", root).forEach((b) => (b.onclick = () => { leer(); guardarM(); cargarM(+b.dataset.mtab); pintar(); }));
      $("[data-madd]", root).onclick = () => { leer(); guardarM(); pl.muebles.push(nuevoM("nevera")); cargarM(pl.muebles.length - 1); pintar(); toast("Mueble nuevo: elige su tipo y marca sus frentes"); };
      const mq = $("[data-mquitar]", root); if (mq) mq.onclick = async () => {
        leer(); if (!(await confirmar(`Se quitará ${this.MUEBLES[pl.mueble]} con sus frentes de este planograma.`, "Quitar mueble"))) return;
        pl.muebles.splice(mi, 1); cargarM(Math.max(0, mi - 1)); pintar();
      };
      $("[data-etq]").onclick = () => {
        leer();
        const n = prompt("Nombre de la presentación (ej.: Mozzarella rebanada 200 g)");
        if (!n) return;
        const k = "t" + Date.now().toString(36);
        pl.productos[k] = { nombre: n.trim(), color: this.COLORES[Object.keys(pl.productos).length % this.COLORES.length], fondo: 1, alto: 1 };
        pincel = k; borrar = false; pintar();
      };
      // pintar celdas (clic o arrastrando)
      let arrastrando = false;
      const aplicar = (el) => { const n = +el.dataset.n, p = +el.dataset.p; pl.celdas[n][p] = borrar ? null : (pl.celdas[n][p] === pincel ? null : pincel); };
      $$(".pl-celda[data-n]").forEach((el) => {
        el.onpointerdown = (e) => { e.preventDefault(); leer(); arrastrando = true; aplicar(el); pintar(); };
        el.onpointerenter = () => { if (arrastrando && !borrar && pl.celdas[+el.dataset.n][+el.dataset.p] !== pincel) { pl.celdas[+el.dataset.n][+el.dataset.p] = pincel; el.style.background = pl.productos[pincel].color; } else if (arrastrando && borrar) { pl.celdas[+el.dataset.n][+el.dataset.p] = null; el.style.background = ""; } };
      });
      document.onpointerup = () => { if (arrastrando) { arrastrando = false; pintar(); } };
      // tiendas
      const cadenas = [...new Set(clientes.map((c) => c.cadena || "Sin cadena"))].sort((x, y) => x.localeCompare(y));
      const pillT = () => { const pi = $(".pill.p-azul", root); if (pi) pi.textContent = tiendas.size + " tienda(s)"; const au = this.nombreAuto(pl.mueble, tiendas, clientes); const pn = $("#pn", root); if (pn) pn.placeholder = au; if (!pl.nombre) $("h1", root).textContent = au; };
      const visibles = () => clientes.filter((c) => (!cadSel.size || cadSel.has(c.cadena || "Sin cadena")) && (!soloSel || tiendas.has(c.id)) && (!filtro || sinAcentos(c.nombre + " " + (c.cadena || "") + " " + (c.zona || "")).includes(sinAcentos(filtro))));
      const pintarCadenas = () => {
        $("#pcadt", root).innerHTML = cadSel.size ? `Cadena: <b>${cadSel.size === 1 ? esc([...cadSel][0]) : cadSel.size + " seleccionadas"}</b>` : `Cadena: <b>Todas</b>`;
        const q = sinAcentos($("#pcadb", root).value || "");
        $("#pcadl", root).innerHTML = cadenas.filter((c) => !q || sinAcentos(c).includes(q)).map((c) => `<label class="pl-dd-op"><input type="checkbox" data-cadop="${esc(c)}" ${cadSel.has(c) ? "checked" : ""}><span class="grow">${esc(c)}</span><span class="tiny muted">${clientes.filter((x) => (x.cadena || "Sin cadena") === c).length}</span></label>`).join("") || `<div class="tiny muted" style="padding:8px">Sin resultados</div>`;
        $$("[data-cadop]", root).forEach((el) => (el.onchange = () => { el.checked ? cadSel.add(el.dataset.cadop) : cadSel.delete(el.dataset.cadop); verN = 10; pintarCadenas(); pintarTiendas(); }));
      };
      const pintarTiendas = () => {
        const vis = visibles(), selVis = vis.filter((c) => tiendas.has(c.id)).length;
        $("#ptz", root).innerHTML = `<div class="row small pl-acc"><span class="sp muted">${plur(vis.length, "tienda")}${cadSel.size || filtro ? " con este filtro" : ""}</span>
            ${vis.length && selVis < vis.length ? `<button class="btn ghost sm" data-todas>Seleccionar ${vis.length}</button>` : ""}${selVis ? `<button class="btn ghost sm" data-quitar>Quitar ${selVis}</button>` : ""}</div>
          <label class="pl-solo"><input type="checkbox" data-solo ${soloSel ? "checked" : ""}> Ver solo las seleccionadas (${tiendas.size})</label>
          <div class="list pl-tiendas">${vis.slice(0, verN).map((c) => `<div class="check ${tiendas.has(c.id) ? "on" : ""}" data-t="${c.id}"><div class="box">✓</div><div class="grow">${esc(c.nombre)}<div class="tiny muted">${esc(c.cadena || "")}</div></div><span class="tiny muted">${esc(c.zona || "")}</span></div>`).join("") || `<div class="empty small">No hay tiendas con este filtro.</div>`}</div>
          ${vis.length > verN ? `<button class="btn ghost sm" data-mas style="margin-top:8px;width:100%">Ver 10 más (${vis.length - verN} restantes)</button>` : ""}`;
        $$("[data-t]", root).forEach((el) => (el.onclick = () => { const id2 = +el.dataset.t; tiendas.has(id2) ? tiendas.delete(id2) : tiendas.add(id2); pillT(); pintarTiendas(); }));
        const bt = $("[data-todas]", root); if (bt) bt.onclick = () => { vis.forEach((c) => tiendas.add(c.id)); pillT(); pintarTiendas(); };
        const bq = $("[data-quitar]", root); if (bq) bq.onclick = () => { vis.forEach((c) => tiendas.delete(c.id)); pillT(); pintarTiendas(); };
        const bm = $("[data-mas]", root); if (bm) bm.onclick = () => { verN += 10; pintarTiendas(); };
        $("[data-solo]", root).onchange = (e) => { soloSel = e.target.checked; verN = 10; pintarTiendas(); };
      };
      $("#pcadb", root).oninput = () => pintarCadenas();
      $("[data-cadlimpiar]", root).onclick = (e) => { e.preventDefault(); cadSel.clear(); verN = 10; pintarCadenas(); pintarTiendas(); };
      $("[data-cadok]", root).onclick = (e) => { e.preventDefault(); $("#pcad", root).open = false; };
      $("#pbus", root).oninput = (e) => { filtro = e.target.value; verN = 10; pintarTiendas(); };
      pintarCadenas(); pintarTiendas();
      // guardar
      const guardar = async (copia = false) => {
        leer(); guardarM();
        if (!pl.nombre) pl.nombre = this.nombreAuto(pl.muebles[0].mueble, tiendas, clientes);
        const usados = new Set(pl.muebles.flatMap((m) => (m.celdas || []).flat()).filter(Boolean));
        const prods = Object.fromEntries(Object.entries(pl.productos).filter(([k, c]) => usados.has(k) || !c.catalogo));
        const m0 = pl.muebles[0];
        const datos = { nombre: copia ? pl.nombre + " (copia)" : pl.nombre, mueble: m0.mueble, niveles: m0.niveles, posiciones: m0.posiciones, celdas: m0.celdas, muebles: pl.muebles, productos: prods, nota: pl.nota || null, activo: pl.activo, actualizado_at: new Date().toISOString() };
        const r = id && !copia ? await sb.from("planogramas").update(datos).eq("id", id).select("id").single() : await sb.from("planogramas").insert(datos).select("id").single();
        if (r.error) return toast(r.error.message);
        const nid = r.data.id;
        await sb.from("planograma_tiendas").delete().eq("planograma_id", nid);
        if (tiendas.size) { const r2 = await sb.from("planograma_tiendas").insert([...tiendas].map((c) => ({ planograma_id: nid, cliente_id: c }))); if (r2.error) return toast(r2.error.message); }
        toast(copia ? "Copia creada ✓" : "Planograma guardado ✓");
        location.hash = "#planogramas/" + nid;
        if (!copia && id) this.editor(root, nid);
      };
      $("[data-guardar]").onclick = () => guardar(false);
      const dup = $("[data-dup]"); if (dup) dup.onclick = () => guardar(true);
    };
    pintar();
  },

  // ---------- En la visita (paso Gestión) ----------
  deTienda(cat, clienteId) {
    return (cat.planos || []).filter((p) => p.activo && (cat.planoTiendas || []).some((a) => a.planograma_id === p.id && a.cliente_id === clienteId));
  },
  enVisita(v, cat) {
    const pls = this.deTienda(cat, v.cliente_id);
    if (!pls.length) return "";
    v.planos = v.planos || {};
    return `<h3 class="sec-t" style="margin-top:0">Planograma</h3>${pls.map((pl) => `<div class="card pl-visita" data-pl="${pl.id}">
      <div class="row"><b class="grow">${esc(pl.nombre)}</b><span class="tiny muted">${this.lista(pl).map((m) => esc(this.MUEBLES[m.mueble])).join(" + ")}</span></div>
      ${pl.nota ? `<div class="small" style="margin:6px 0">${esc(pl.nota)}</div>` : ""}
      ${this.lista(pl).map((m) => `${this.lista(pl).length > 1 ? `<div class="tiny muted" style="margin-top:10px"><b>${esc(this.MUEBLES[m.mueble])}</b></div>` : ""}<div class="pl-mini" style="margin:8px 0">${this.dibujo(m)}</div>`).join("")}${this.tablaTotales(this.junto(pl))}
      <div class="small" style="margin:12px 0 6px"><b>¿La exhibición cumple el planograma?</b></div>
      <div class="row" style="gap:6px">${[["si", "Cumple"], ["parcial", "Parcial"], ["no", "No cumple"]].map(([k, t]) => `<button class="btn sm sp ${v.planos[pl.id] === k ? "" : "sec"}" data-cumple="${k}">${t}</button>`).join("")}</div></div>`).join("")}`;
  },
  enlazarVisita(box, v) {
    $$(".pl-visita", box).forEach((card) => $$("[data-cumple]", card).forEach((b) => (b.onclick = () => {
      v.planos = v.planos || {}; v.planos[card.dataset.pl] = b.dataset.cumple; Visita.set(v);
      $$("[data-cumple]", card).forEach((x) => x.classList.toggle("sec", x !== b));
    })));
  },
};
