// Planogramas: cómo debe verse la exhibición (nevera, deli, anaquel) con frentes, fondo y altura por producto.
// La gerencia los diseña y los asigna a tiendas; la vendedora los ve en la visita y marca si la tienda cumple.
const PL = {
  MUEBLES: { nevera: "Nevera abierta", puertas: "Nevera de puertas", deli: "Vitrina deli curva", vitrina: "Vitrina recta", exhibidor: "Isla / exhibidor", cofre: "Congelador horizontal", anaquel: "Góndola seca", punta: "Punta de góndola" },
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
  icono(t, s = 34) { return `<svg width="${s}" height="${s}" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${this.ICONOS[t] || this.ICONOS.nevera}</svg>`; },
  COLORES: ["#2F5BEA", "#F2B33D", "#E5484D", "#30A46C", "#8E4EC6", "#0B1B33", "#F76B15", "#12A594"],

  claveProd: (p) => "p" + p.id,
  totales(pl) {
    const t = {};
    (pl.celdas || []).forEach((fila) => (fila || []).forEach((k) => { if (k) t[k] = (t[k] || 0) + 1; }));
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
    const escalon = { deli: 16, exhibidor: 24 }[t] || 0; // vitrinas y exhibidores: los niveles de arriba van más atrás / más angostos
    const bandeja = ["deli", "exhibidor", "cofre"].includes(t);
    const niveles = filas.map((fila, n) => {
      const margen = escalon ? `margin:0 ${Math.round((N - 1 - n) * escalon / Math.max(1, N - 1) * (N > 1 ? 1 : 0))}%` : "";
      return `<div class="pl-nivel ${n === ojos ? "ojos" : ""}" style="${margen}" ${n === ojos ? 'title="Nivel de los ojos: el que más vende"' : ""}><span class="pl-num">${N - n}</span>${(fila || []).map((k, p) => {
        const c = k ? pl.productos?.[k] : null;
        return `<div class="pl-celda ${k ? "llena" : ""}" ${editable ? `data-n="${n}" data-p="${p}"` : ""} style="${c ? `background:${c.color};border-color:${c.color}` : ""}" title="${c ? esc(c.nombre) : "Vacío"}">${c ? `<span>${esc(PL.sigla(c.nombre))}</span>${(c.alto || 1) > 1 ? `<i>×${c.alto}</i>` : ""}` : ""}</div>`;
      }).join("")}</div>`;
    }).join("");
    const puertas = t === "puertas" ? `<div class="pl-hojas">${"<i></i>".repeat(Math.max(1, Math.min(6, Math.round((pl.posiciones || 3) / 3))))}</div>` : "";
    const techo = { nevera: `<div class="pl-techo"><i></i></div>`, puertas: `<div class="pl-techo"><i></i></div>`, punta: `<div class="pl-cartel">${esc(pl.nombre || "Punta de góndola")}</div>`, cofre: `<div class="pl-tapa"><i></i><i></i></div>`, exhibidor: `<div class="pl-letrero"><i></i></div>` }[t] || "";
    const zocalo = ["anaquel", "punta"].includes(t) ? `<div class="pl-zocalo liso"></div>` : t === "exhibidor" ? `<div class="pl-zocalo base"></div>` : `<div class="pl-zocalo"></div>`;
    return `<div class="pl-mueble pl-${t} ${bandeja ? "pl-bandeja" : ""}">${techo}<div class="pl-caja"><div class="pl-interior">${niveles}${puertas}</div></div>${zocalo}</div>`;
  },
  sigla: (n) => String(n).replace(/^Queso /i, "").split(/\s+/).slice(0, 2).map((w) => w.slice(0, w.length > 5 ? 4 : w.length)).join(" "),
  tablaTotales(pl) {
    const t = this.totales(pl);
    if (!t.length) return `<div class="small muted">Aún no hay productos en el planograma.</div>`;
    return `<table class="t pl-tabla"><tr><th>Producto</th><th>Frentes</th><th>Fondo</th><th>Altura</th><th>Unidades</th></tr>
      ${t.map((x) => `<tr><td><span class="pl-dot" style="background:${x.color}"></span>${esc(x.nombre)}</td><td><b>${x.frentes}</b></td><td>${x.fondo}</td><td>${x.alto}</td><td><b>${x.unidades}</b></td></tr>`).join("")}</table>`;
  },

  // ---------- Lista ----------
  async render(root, id) {
    if (id) return this.editor(root, id === "nuevo" ? null : Number(id));
    root.innerHTML = `<div class="top"><div><div class="muted small">Cómo debe verse la exhibición en cada tienda</div><h1>Planogramas</h1></div><a class="btn sm" href="#planogramas/nuevo">+ Nuevo planograma</a></div><div id="pll" class="muted">Cargando…</div>`;
    const [{ data: pls, error }, { data: asg }] = await Promise.all([
      sb.from("planogramas").select("*").order("nombre"),
      sb.from("planograma_tiendas").select("planograma_id, cliente_id"),
    ]);
    if (error) { $("#pll", root).textContent = error.message; return; }
    $("#pll", root).outerHTML = pls.length ? `<div class="pl-grid">${pls.map((pl) => `<a class="card pl-card" href="#planogramas/${pl.id}">
        <div class="row"><div class="grow"><b>${esc(pl.nombre)}</b><div class="tiny muted">${esc(this.MUEBLES[pl.mueble])} · ${pl.niveles} niveles × ${pl.posiciones} posiciones</div></div>
        ${pl.activo ? "" : `<span class="pill p-gris">Inactivo</span>`}</div>
        <div class="pl-mini">${this.dibujo(pl)}</div>
        <div class="tiny muted">${(asg || []).filter((a) => a.planograma_id === pl.id).length} tienda(s) · ${this.totales(pl).map((t) => `${esc(PL.sigla(t.nombre))}: ${t.frentes} frentes`).join(" · ") || "sin productos"}</div></a>`).join("")}</div>`
      : `<div class="empty card flat"><div class="ic">${ic("resumen", 34)}</div>Aún no hay planogramas. Crea el primero, por ejemplo "Mozzarella en deli".</div>`;
  },

  // ---------- Editor ----------
  async editor(root, id) {
    const cat = await DB.catalogos();
    let pl = { nombre: "", mueble: "nevera", niveles: 4, posiciones: 8, celdas: [], productos: {}, nota: "", activo: true };
    let tiendas = new Set();
    if (id) {
      const [{ data }, { data: asg }] = await Promise.all([sb.from("planogramas").select("*").eq("id", id).single(), sb.from("planograma_tiendas").select("cliente_id").eq("planograma_id", id)]);
      if (!data) { root.innerHTML = `<div class="empty card flat">No encontré el planograma.</div>`; return; }
      pl = { ...data, productos: data.productos || {}, celdas: data.celdas || [] }; tiendas = new Set((asg || []).map((a) => a.cliente_id));
    }
    // productos disponibles: catálogo + etiquetas propias guardadas en el planograma
    cat.productos.forEach((p, i) => { const k = this.claveProd(p); if (!pl.productos[k] && !Object.values(pl.productos).some((c) => c.nombre === p.nombre)) pl.productos[k] = { nombre: p.nombre, color: this.COLORES[i % this.COLORES.length], fondo: 1, alto: 1, catalogo: true }; });
    const ajustar = () => {
      const c = [];
      for (let n = 0; n < pl.niveles; n++) { c.push([]); for (let p = 0; p < pl.posiciones; p++) c[n].push(pl.celdas?.[n]?.[p] || null); }
      pl.celdas = c;
    };
    ajustar();
    let pincel = Object.keys(pl.productos)[0] || null, borrar = false, filtro = "";
    const clientes = cat.clientes.filter((c) => c.modalidad !== "resurtido_auto" || tiendas.has(c.id));

    const pintar = () => {
      root.innerHTML = `<a href="#planogramas" class="small" style="text-decoration:none">‹ Planogramas</a>
        <div class="top"><div><div class="muted small">${id ? "Editar planograma" : "Nuevo planograma"}</div><h1>${esc(pl.nombre || "Sin nombre")}</h1></div>
          <div class="row" style="gap:8px">${id ? `<button class="btn ghost sm" data-dup>Duplicar</button>` : ""}<button class="btn sm" data-guardar>Guardar</button></div></div>
        <div class="pl-ed">
          <div class="card">
            <label class="f" style="margin-top:0">Nombre</label><input class="in" id="pn" value="${esc(pl.nombre)}" placeholder="Ej.: Mozzarella en deli · Super 99">
            <label class="f">Mueble</label><input type="hidden" id="pm" value="${pl.mueble}">
            <div class="pl-tipos">${Object.entries(this.MUEBLES).map(([k, t]) => `<button type="button" class="pl-tipo ${k === pl.mueble ? "on" : ""}" data-mueble="${k}">${this.icono(k)}<span>${t}</span></button>`).join("")}</div>
            <div class="grid2c"><div><label class="f">Activo</label><select class="in" id="pa"><option value="1" ${pl.activo ? "selected" : ""}>Sí</option><option value="0" ${pl.activo ? "" : "selected"}>No</option></select></div>
              <div><label class="f">Niveles</label><input class="in" type="number" min="1" max="10" id="pnv" value="${pl.niveles}"></div></div>
            <div class="grid2c"><div><label class="f">Posiciones por nivel</label><input class="in" type="number" min="1" max="30" id="pps" value="${pl.posiciones}"></div><div></div></div>
            <label class="f">Instrucción para la vendedora</label><textarea class="in" id="pnt" rows="2" placeholder="Ej.: Mozzarella a la altura de los ojos, etiqueta de precio visible.">${esc(pl.nota || "")}</textarea>

            <h3 class="sec-t" style="margin-top:16px">Productos</h3>
            <div class="tiny muted" style="margin-bottom:6px">Elige un producto y toca las posiciones del mueble. Cada posición es un <b>frente</b>.</div>
            <div class="list" style="gap:6px">${Object.entries(pl.productos).map(([k, c]) => `<div class="pl-prod ${pincel === k && !borrar ? "on" : ""}" data-pin="${k}">
              <span class="pl-dot" style="background:${c.color}"></span><span class="grow">${esc(c.nombre)}</span>
              <label class="tiny">Fondo <input class="in pl-num-in" type="number" min="1" max="50" data-fondo="${k}" value="${c.fondo || 1}" title="Unidades hacia atrás en cada frente"></label>
              <label class="tiny">Altura <input class="in pl-num-in" type="number" min="1" max="10" data-alto="${k}" value="${c.alto || 1}" title="Unidades apiladas hacia arriba"></label></div>`).join("")}</div>
            <div class="row" style="gap:6px;margin-top:8px"><button class="btn ghost sm" data-etq>+ Otra presentación</button><button class="btn sm ${borrar ? "" : "sec"}" data-borrar>Borrar posiciones</button></div>
          </div>
          <div>
            <div class="card"><div class="row"><h3 class="grow" style="margin:0">${esc(this.MUEBLES[pl.mueble])}</h3><button class="btn ghost sm" data-limpiar>Vaciar</button></div>
              <div style="margin-top:12px">${this.dibujo(pl, true)}</div>
              <div style="margin-top:14px">${this.tablaTotales(pl)}</div>
              <p class="tiny muted" style="margin:8px 0 0">Nivel 1 = el de abajo${["nevera", "puertas", "anaquel", "punta"].includes(pl.mueble) && pl.niveles >= 3 ? " · <b style=\"color:var(--azul)\">número azul</b> = nivel de los ojos, el que más vende" : ""} · Frentes = posiciones ocupadas · Fondo = unidades hacia atrás · Altura = unidades apiladas · Unidades = frentes × fondo × altura.</p></div>
            <div class="card"><div class="row"><h3 class="grow" style="margin:0">Tiendas donde aplica</h3><span class="pill p-azul">${tiendas.size} tienda(s)</span></div>
              <div class="row" style="gap:6px;flex-wrap:wrap;margin:10px 0">${[...new Set(clientes.map((c) => c.cadena).filter(Boolean))].sort().map((cd) => `<button class="btn ghost sm" data-cad="${esc(cd)}">${esc(cd)}</button>`).join("")}<button class="btn ghost sm" data-ninguna>Ninguna</button></div>
              <input class="in" id="pbus" placeholder="Buscar tienda…" value="${esc(filtro)}">
              <div class="list pl-tiendas">${clientes.filter((c) => !filtro || sinAcentos(c.nombre + " " + (c.cadena || "")).includes(sinAcentos(filtro))).map((c) => `<div class="check ${tiendas.has(c.id) ? "on" : ""}" data-t="${c.id}"><div class="box">✓</div><div class="grow">${esc(c.nombre)}</div><span class="tiny muted">${esc(c.zona || "")}</span></div>`).join("")}</div>
            </div>
          </div>
        </div>`;
      const leer = () => { pl.nombre = $("#pn").value.trim(); pl.mueble = $("#pm").value; pl.activo = $("#pa").value === "1"; pl.nota = $("#pnt").value; };
      $("#pn").oninput = () => (pl.nombre = $("#pn").value);
      $("#pnt").oninput = () => (pl.nota = $("#pnt").value);
      $$("[data-mueble]", root).forEach((b) => (b.onclick = () => { leer(); pl.mueble = b.dataset.mueble; $("#pm", root).value = pl.mueble; pintar(); }));
      $("#pa").onchange = () => (pl.activo = $("#pa").value === "1");
      $("#pnv").onchange = () => { leer(); pl.niveles = Math.min(10, Math.max(1, Number($("#pnv").value) || 1)); ajustar(); pintar(); };
      $("#pps").onchange = () => { leer(); pl.posiciones = Math.min(30, Math.max(1, Number($("#pps").value) || 1)); ajustar(); pintar(); };
      $$("[data-pin]").forEach((el) => (el.onclick = (e) => { if (e.target.tagName === "INPUT") return; leer(); pincel = el.dataset.pin; borrar = false; pintar(); }));
      $$("[data-fondo]").forEach((el) => (el.onchange = () => { leer(); pl.productos[el.dataset.fondo].fondo = Math.max(1, Number(el.value) || 1); pintar(); }));
      $$("[data-alto]").forEach((el) => (el.onchange = () => { leer(); pl.productos[el.dataset.alto].alto = Math.max(1, Number(el.value) || 1); pintar(); }));
      $("[data-borrar]").onclick = () => { leer(); borrar = !borrar; pintar(); };
      $("[data-limpiar]").onclick = () => { leer(); pl.celdas = []; ajustar(); pintar(); };
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
      $$("[data-t]").forEach((el) => (el.onclick = () => { const id2 = +el.dataset.t; tiendas.has(id2) ? tiendas.delete(id2) : tiendas.add(id2); el.classList.toggle("on"); $(".pill.p-azul", root).textContent = tiendas.size + " tienda(s)"; }));
      $$("[data-cad]").forEach((el) => (el.onclick = () => { leer(); clientes.filter((c) => c.cadena === el.dataset.cad).forEach((c) => tiendas.add(c.id)); pintar(); }));
      $("[data-ninguna]").onclick = () => { leer(); tiendas.clear(); pintar(); };
      $("#pbus").oninput = (e) => { leer(); filtro = e.target.value; const pos = e.target.selectionStart; pintar(); const b = $("#pbus"); b.focus(); b.setSelectionRange(pos, pos); };
      // guardar
      const guardar = async (copia = false) => {
        leer();
        if (!pl.nombre) return toast("Ponle un nombre al planograma");
        const usados = new Set(pl.celdas.flat().filter(Boolean));
        const prods = Object.fromEntries(Object.entries(pl.productos).filter(([k, c]) => usados.has(k) || !c.catalogo));
        const datos = { nombre: copia ? pl.nombre + " (copia)" : pl.nombre, mueble: pl.mueble, niveles: pl.niveles, posiciones: pl.posiciones, celdas: pl.celdas, productos: prods, nota: pl.nota || null, activo: pl.activo, actualizado_at: new Date().toISOString() };
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
      <div class="row"><b class="grow">${esc(pl.nombre)}</b><span class="tiny muted">${esc(this.MUEBLES[pl.mueble])}</span></div>
      ${pl.nota ? `<div class="small" style="margin:6px 0">${esc(pl.nota)}</div>` : ""}
      <div class="pl-mini" style="margin:8px 0">${this.dibujo(pl)}</div>${this.tablaTotales(pl)}
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
