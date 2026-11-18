// Catálogos (tipos de cliente, zonas, familias, unidades, listas de precio, descuentos, promociones) y Mapa con zonificador
const PALETA = ["#2F5BEA", "#E8590C", "#2B8A3E", "#AE3EC9", "#C2255C", "#0B7285", "#E67700", "#5F3DC4", "#5C940D", "#D6336C", "#1971C2", "#862E9C"];

const K = {
  subs() {
    const t = DB.puede("tiendas"), p = DB.puede("productos");
    return [["tipos", "Tipos de cliente", t], ["zonas", "Zonas", t], ["familias", "Familias", p], ["unidades", "Unidades", p],
      ["listas", "Listas de precio", p], ["descuentos", "Descuentos", p], ["promos", "Promociones", p], ["transportes", "Transportes", t || p]].filter((x) => x[2]);
  },

  async render(box, sub) {
    const ss = this.subs();
    sub = ss.some((s) => s[0] === sub) ? sub : LS.get("catSub") && ss.some((s) => s[0] === LS.get("catSub")) ? LS.get("catSub") : ss[0][0];
    LS.set("catSub", sub);
    box.innerHTML = `<div class="row wrap" style="gap:6px;margin-bottom:12px">${ss.map(([k, t]) => `<button class="btn sm ${k === sub ? "" : "sec"}" data-sub="${k}">${t}</button>`).join("")}</div><div id="kb"></div>`;
    $$("[data-sub]", box).forEach((b) => (b.onclick = () => this.render(box, b.dataset.sub)));
    const kb = $("#kb", box), re = () => this.render(box, sub);
    if (sub === "tipos") return this.simple(kb, "tipos_cliente", "tipo de cliente", re, { ej: "Supermercado, Restaurante, Hotel…", cuenta: "tipo_id" });
    if (sub === "familias") return this.simple(kb, "familias_producto", "familia", re, { ej: "Quesos, Embutidos, Bebidas…", cuentaProd: "familia_id" });
    if (sub === "unidades") return this.unidades(kb, re);
    if (sub === "zonas") return this.zonas(kb, re);
    if (sub === "listas") return this.listas(kb, re);
    if (sub === "descuentos") return this.descuentos(kb, re);
    if (sub === "promos") return this.promos(kb, re);
    if (sub === "transportes") return this.transportes(kb, re);
  },

  // Empresas de transporte tercerizadas: se eligen al crear una ruta de despacho en Picking
  async transportes(kb, re) {
    const [{ data, error }, { data: des }] = await Promise.all([sb.from("transportes").select("*").order("nombre"), sb.from("despachos").select("transporte_id").neq("estado", "anulado")]);
    if (error) throw error;
    const n = (id) => (des || []).filter((d) => d.transporte_id === id).length;
    kb.innerHTML = `<div class="card"><div class="row wrap"><input class="in sp" id="tn" placeholder="Empresa de transporte"><input class="in" id="tc" placeholder="Contacto" style="width:160px"><input class="in" id="tt" placeholder="Teléfono" inputmode="tel" style="width:140px"><button class="btn" id="ta">Agregar</button></div></div>
      <div class="list">${data.map((x) => `<div class="item" data-id="${x.id}"><div class="ava" style="color:var(--azul)">${ic("caja", 22)}</div><div class="grow"><div class="t">${esc(x.nombre)}</div><div class="tiny muted">${[x.contacto, x.telefono].filter(Boolean).map(esc).join(" · ") || "Sin contacto"} · ${plur(n(x.id), "ruta")}</div></div>${x.activo ? "" : `<span class="pill p-gris">Inactivo</span>`}<span class="muted">›</span></div>`).join("") || `<div class="empty card flat">Aún no hay transportes. Agrega las empresas que llevan la mercancía.</div>`}</div>`;
    $("#ta", kb).onclick = async () => {
      const v = $("#tn", kb).value.trim(); if (!v) return toast("Escribe el nombre del transporte");
      const r = await sb.from("transportes").insert({ nombre: v, contacto: $("#tc", kb).value.trim() || null, telefono: $("#tt", kb).value.trim() || null });
      if (r.error) return toast(r.error.code === "23505" ? "Ya existe" : r.error.message); toast("Agregado ✓"); re();
    };
    $$("[data-id]", kb).forEach((el) => (el.onclick = () => {
      const x = data.find((d) => d.id == el.dataset.id);
      modal(`<h2>Editar transporte</h2><label class="f">Empresa</label><input class="in" name="n" value="${esc(x.nombre)}">
        <label class="f">Contacto</label><input class="in" name="c" value="${esc(x.contacto || "")}">
        <label class="f">Teléfono</label><input class="in" name="t" inputmode="tel" value="${esc(x.telefono || "")}">
        <label class="f">Estado</label><select class="in" name="a"><option value="1">Activo</option><option value="0" ${x.activo ? "" : "selected"}>Inactivo</option></select>
        <button class="btn block" style="margin-top:16px" data-ok>Guardar</button>`, (m, close) => {
        $("[data-ok]", m).onclick = async () => {
          const r = await sb.from("transportes").update({ nombre: $("[name=n]", m).value.trim(), contacto: $("[name=c]", m).value.trim() || null, telefono: $("[name=t]", m).value.trim() || null, activo: $("[name=a]", m).value === "1" }).eq("id", x.id);
          if (r.error) return toast(r.error.message); close(); re();
        };
      });
    }));
  },

  // Catálogo de solo nombre (tipos de cliente, familias)
  async simple(kb, tabla, nombre, re, { ej, cuenta, cuentaProd }) {
    const [{ data, error }, rel] = await Promise.all([sb.from(tabla).select("*").order("nombre"),
      cuenta ? sb.from("clientes").select(cuenta) : cuentaProd ? sb.from("productos").select(cuentaProd) : Promise.resolve({ data: [] })]);
    if (error) throw error;
    const n = (id) => (rel.data || []).filter((r) => r[cuenta || cuentaProd] === id).length;
    kb.innerHTML = `<div class="card"><div class="row"><input class="in sp" id="kn" placeholder="Nuevo ${nombre}: ${ej}"><button class="btn" id="ka">Agregar</button></div></div>
      <div class="list">${data.map((x) => `<div class="item" data-id="${x.id}"><div class="grow"><div class="t">${esc(x.nombre)}</div><div class="tiny muted">${plur(n(x.id), cuenta ? "tienda" : "producto")}</div></div>${x.activo ? "" : `<span class="pill p-gris">Inactivo</span>`}<span class="muted">›</span></div>`).join("") || `<div class="empty card flat">Aún no hay ${nombre}s.</div>`}</div>`;
    $("#ka", kb).onclick = async () => { const v = $("#kn", kb).value.trim(); if (!v) return; const r = await sb.from(tabla).insert({ nombre: v }); if (r.error) return toast(r.error.code === "23505" ? "Ya existe" : r.error.message); toast("Agregado ✓"); re(); };
    $$("[data-id]", kb).forEach((el) => (el.onclick = () => {
      const x = data.find((d) => d.id == el.dataset.id);
      modal(`<h2>Editar ${nombre}</h2><label class="f">Nombre</label><input class="in" name="n" value="${esc(x.nombre)}">
        <label class="f">Estado</label><select class="in" name="a"><option value="1">Activo</option><option value="0" ${x.activo ? "" : "selected"}>Inactivo</option></select>
        <button class="btn block" style="margin-top:16px" data-ok>Guardar</button>`, (m, close) => {
        $("[data-ok]", m).onclick = async () => { const r = await sb.from(tabla).update({ nombre: $("[name=n]", m).value.trim(), activo: $("[name=a]", m).value === "1" }).eq("id", x.id); if (r.error) return toast(r.error.message); close(); re(); };
      });
    }));
  },

  async unidades(kb, re) {
    const { data, error } = await sb.from("unidades_medida").select("*").order("tipo").order("nombre");
    if (error) throw error;
    const tipos = { unidad: "Unidad / pieza", peso: "Peso", volumen: "Volumen", longitud: "Longitud" };
    kb.innerHTML = `<div class="card"><div class="row wrap"><input class="in" id="uc" placeholder="Código (ej. kg)" style="width:120px"><input class="in sp" id="un" placeholder="Nombre (ej. Kilogramo)">
        <select class="in" id="ut" style="width:auto">${Object.entries(tipos).map(([k, t]) => `<option value="${k}">${t}</option>`).join("")}</select><button class="btn" id="ua">Agregar</button></div></div>
      <div class="card scroll-x"><table class="t"><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th></th></tr>
      ${data.map((u) => `<tr><td><b>${esc(u.codigo)}</b></td><td>${esc(u.nombre)}</td><td>${tipos[u.tipo]}</td><td>${u.activo ? "" : `<span class="pill p-gris">Inactiva</span>`}</td></tr>`).join("")}</table></div>`;
    $("#ua", kb).onclick = async () => {
      const c = $("#uc", kb).value.trim(), n = $("#un", kb).value.trim(); if (!c || !n) return toast("Escribe código y nombre");
      const r = await sb.from("unidades_medida").insert({ codigo: c, nombre: n, tipo: $("#ut", kb).value }); if (r.error) return toast(r.error.code === "23505" ? "Ese código ya existe" : r.error.message); re();
    };
  },

  // ---------- Zonas ----------
  async zonas(kb, re) {
    const [{ data, error }, { data: cl }] = await Promise.all([sb.from("zonas").select("*").order("nombre"), sb.from("clientes").select("id, nombre, zona_id, lat, lng, activo")]);
    if (error) throw error;
    kb.innerHTML = `<div class="card"><div class="row wrap"><input class="in sp" id="zn" placeholder="Nueva zona (ej. San Miguelito)"><input type="color" id="zc" value="${PALETA[data.length % PALETA.length]}" style="width:48px;height:44px;border:0;background:none">
        <button class="btn" id="za">Agregar</button></div>
        <div class="row wrap" style="margin-top:10px"><label class="btn sec sm" style="cursor:pointer">${ic("doc", 16)} Importar de Google My Maps (KML)<input type="file" id="zk" accept=".kml,application/vnd.google-earth.kml+xml" hidden></label>
        <span class="tiny muted sp">En My Maps: ⋮ › Exportar a KML/KMZ › marca "Exportar a un archivo .KML". Trae zonas (polígonos) y ubicación de tiendas (puntos).</span></div></div>
      <div class="list">${data.map((z) => { const n = (cl || []).filter((c) => c.zona_id === z.id).length;
        return `<div class="item" data-id="${z.id}"><span style="width:14px;height:14px;border-radius:4px;background:${esc(z.color)};flex:none"></span><div class="grow"><div class="t">${esc(z.nombre)}</div>
          <div class="tiny muted">${plur(n, "tienda")} · ${z.poligono ? "zona dibujada en el mapa" : "sin dibujar"}</div></div>${z.activo ? "" : `<span class="pill p-gris">Inactiva</span>`}<span class="muted">›</span></div>`; }).join("") || `<div class="empty card flat">Aún no hay zonas. Crea una o impórtalas de Google My Maps.</div>`}</div>`;
    $("#za", kb).onclick = async () => { const v = $("#zn", kb).value.trim(); if (!v) return; const r = await sb.from("zonas").insert({ nombre: v, color: $("#zc", kb).value }); if (r.error) return toast(r.error.code === "23505" ? "Ya existe" : r.error.message); re(); };
    $("#zk", kb).onchange = (e) => e.target.files[0] && this.importarKml(e.target.files[0], data, cl || [], re);
    $$("[data-id]", kb).forEach((el) => (el.onclick = () => this.zona(data.find((z) => z.id == el.dataset.id), cl || [], re)));
  },

  zona(z, clientes, re) {
    const dentro = (c) => z.poligono && c.lat != null && enPoligono([c.lat, c.lng], z.poligono);
    const nDentro = clientes.filter((c) => c.activo && dentro(c)).length;
    modal(`<h2>${esc(z.nombre)}</h2>
      <label class="f">Nombre</label><input class="in" name="n" value="${esc(z.nombre)}">
      <div class="grid2c"><div><label class="f">Color</label><input type="color" name="c" value="${esc(z.color)}" style="width:100%;height:44px;border:0;background:none"></div>
      <div><label class="f">Estado</label><select class="in" name="a"><option value="1">Activa</option><option value="0" ${z.activo ? "" : "selected"}>Inactiva</option></select></div></div>
      <button class="btn sec block" style="margin-top:14px" data-dib>${ic("ruta", 18)} ${z.poligono ? "Redibujar en el mapa" : "Dibujar en el mapa"}</button>
      ${z.poligono ? `<button class="btn ghost block" style="margin-top:8px" data-asig>Asignar a esta zona las ${plur(nDentro, "tienda")} que quedan dentro</button>` : ""}
      <button class="btn block" style="margin-top:16px" data-ok>Guardar</button>`, (m, close) => {
      $("[data-ok]", m).onclick = async () => { const r = await sb.from("zonas").update({ nombre: $("[name=n]", m).value.trim(), color: $("[name=c]", m).value, activo: $("[name=a]", m).value === "1" }).eq("id", z.id); if (r.error) return toast(r.error.message); close(); re(); };
      $("[data-dib]", m).onclick = () => { close(); M.dibujar(z, async (pol) => { const r = await sb.from("zonas").update({ poligono: pol }).eq("id", z.id); if (r.error) return toast(r.error.message); toast("Zona guardada ✓"); re(); }); };
      const a = $("[data-asig]", m);
      if (a) a.onclick = async () => {
        const ids = clientes.filter((c) => c.activo && dentro(c)).map((c) => c.id);
        if (!ids.length) return toast("No hay tiendas con GPS dentro de la zona");
        const r = await sb.from("clientes").update({ zona_id: z.id }).in("id", ids); if (r.error) return toast(r.error.message);
        close(); toast(`${plur(ids.length, "tienda")} asignadas a ${z.nombre} ✓`); re();
      };
    });
  },

  async importarKml(file, zonas, clientes, re) {
    const xml = new DOMParser().parseFromString(await file.text(), "application/xml");
    const pm = [...xml.getElementsByTagName("Placemark")];
    const coords = (el) => (el?.textContent || "").trim().split(/\s+/).map((s) => s.split(",").map(Number)).filter((c) => c.length >= 2 && !isNaN(c[0])).map(([lng, lat]) => [lat, lng]);
    const polis = [], puntos = [];
    pm.forEach((p) => {
      const nombre = (p.getElementsByTagName("name")[0]?.textContent || "").trim();
      const pol = p.getElementsByTagName("Polygon")[0], pt = p.getElementsByTagName("Point")[0];
      if (pol) polis.push({ nombre, pol: coords(pol.getElementsByTagName("coordinates")[0]) });
      else if (pt) { const c = coords(pt.getElementsByTagName("coordinates")[0])[0]; if (c) puntos.push({ nombre, lat: c[0], lng: c[1] }); }
    });
    const norm = (s) => sinAcentos(s).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    const match = puntos.map((p) => { const n = norm(p.nombre); const c = clientes.find((c) => norm(c.nombre) === n) || clientes.find((c) => n.length > 4 && (norm(c.nombre).includes(n) || n.includes(norm(c.nombre)))); return { ...p, c }; });
    const ok = match.filter((x) => x.c);
    if (!polis.length && !puntos.length) return toast("El archivo no tiene zonas ni puntos", 4000);
    modal(`<h2>Importar de My Maps</h2>
      <p>${plur(polis.length, "zona")} ${polis.length === 1 ? "dibujada" : "dibujadas"} y ${plur(puntos.length, "punto")}.</p>
      ${polis.length ? `<p class="small"><b>Zonas:</b> ${polis.map((p) => esc(p.nombre || "Sin nombre")).join(", ")}</p>` : ""}
      ${puntos.length ? `<p class="small"><b>${plur(ok.length, "punto")} coinciden con una tienda</b> por el nombre y se les guardará la ubicación.${puntos.length - ok.length ? ` ${puntos.length - ok.length} no coinciden y se ignoran.` : ""}</p>
        <div class="list small" style="max-height:220px;overflow:auto">${ok.slice(0, 50).map((x) => `<div>${esc(x.nombre)} → <b>${esc(x.c.nombre)}</b></div>`).join("")}</div>` : ""}
      <button class="btn block" style="margin-top:16px" data-ok>Importar</button>`, (m, close) => {
      $("[data-ok]", m).onclick = async () => {
        $("[data-ok]", m).disabled = true;
        for (const [i, p] of polis.entries()) {
          const ex = zonas.find((z) => sinAcentos(z.nombre) === sinAcentos(p.nombre));
          const r = ex ? await sb.from("zonas").update({ poligono: p.pol }).eq("id", ex.id) : await sb.from("zonas").insert({ nombre: p.nombre || "Zona " + (i + 1), poligono: p.pol, color: PALETA[(zonas.length + i) % PALETA.length] });
          if (r.error) { toast(r.error.message, 4000); break; }
        }
        for (const x of ok) { const r = await sb.from("clientes").update({ lat: x.lat, lng: x.lng }).eq("id", x.c.id); if (r.error) { toast(r.error.message, 4000); break; } }
        close(); toast("Importación lista ✓"); DB.catalogos(true).catch(() => {}); re();
      };
    });
  },

  // ---------- Listas de precio ----------
  async listas(kb, re) {
    const [{ data, error }, { data: prods }, { data: pr }, { data: cl }] = await Promise.all([sb.from("listas_precio").select("*").order("nombre"),
      sb.from("productos").select("id, nombre, sku, unidad_id, unidades_medida(codigo)").eq("activo", true).order("nombre"), sb.from("precios").select("*"), sb.from("clientes").select("lista_id")]);
    if (error) throw error;
    kb.innerHTML = `<div class="card"><div class="row wrap"><input class="in sp" id="ln" placeholder="Nueva lista (ej. Canal tradicional)"><input class="in" id="lc" placeholder="Canal (opcional)" style="max-width:200px"><button class="btn" id="la">Agregar</button></div></div>
      <div class="list">${data.map((l) => `<div class="item" data-id="${l.id}"><div class="ava">${ic("etiqueta", 20)}</div><div class="grow"><div class="t">${esc(l.nombre)} ${l.por_defecto ? `<span class="pill p-azul">Por defecto</span>` : ""}</div>
        <div class="tiny muted">${esc(l.canal || "")}${l.canal ? " · " : ""}${plur((pr || []).filter((p) => p.lista_id === l.id).length, "precio")} · ${plur((cl || []).filter((c) => c.lista_id === l.id).length, "cliente")} · ${esc(l.moneda)}</div></div><span class="muted">›</span></div>`).join("")}</div>`;
    $("#la", kb).onclick = async () => { const v = $("#ln", kb).value.trim(); if (!v) return; const r = await sb.from("listas_precio").insert({ nombre: v, canal: $("#lc", kb).value.trim() || null }); if (r.error) return toast(r.error.code === "23505" ? "Ya existe" : r.error.message); re(); };
    $$("[data-id]", kb).forEach((el) => (el.onclick = () => {
      const l = data.find((x) => x.id == el.dataset.id), P = (pid) => (pr || []).find((p) => p.lista_id === l.id && p.producto_id === pid)?.precio ?? "";
      modal(`<h2>${esc(l.nombre)}</h2>
        <div class="grid2c"><div><label class="f">Nombre</label><input class="in" name="n" value="${esc(l.nombre)}"></div><div><label class="f">Canal</label><input class="in" name="c" value="${esc(l.canal || "")}"></div></div>
        <div class="grid2c"><div><label class="f">Moneda</label><input class="in" name="mo" value="${esc(l.moneda)}"></div>
          <div><label class="f">Por defecto</label><select class="in" name="d"><option value="0">No</option><option value="1" ${l.por_defecto ? "selected" : ""}>Sí (clientes sin lista)</option></select></div></div>
        <h3 style="margin:18px 0 8px">Precios</h3>
        <table class="t">${(prods || []).map((p) => `<tr><td>${esc(p.nombre)}</td><td style="width:140px"><input class="in" style="padding:8px" inputmode="decimal" data-p="${p.id}" value="${P(p.id)}" placeholder="$ por ${esc(p.unidades_medida?.codigo || "unidad")}"></td></tr>`).join("")}</table>
        <button class="btn block" style="margin-top:16px" data-ok>Guardar</button>`, (m, close) => {
        $("[data-ok]", m).onclick = async () => {
          const f = (n) => $(`[name=${n}]`, m).value.trim();
          let r = await sb.from("listas_precio").update({ nombre: f("n"), canal: f("c") || null, moneda: f("mo") || "USD", por_defecto: f("d") === "1" }).eq("id", l.id);
          if (r.error) return toast(r.error.message);
          if (f("d") === "1") await sb.from("listas_precio").update({ por_defecto: false }).neq("id", l.id);
          const up = [], del = [];
          $$("[data-p]", m).forEach((i) => (i.value.trim() === "" ? del.push(Number(i.dataset.p)) : up.push({ lista_id: l.id, producto_id: Number(i.dataset.p), precio: Number(i.value) })));
          if (up.length) { r = await sb.from("precios").upsert(up); if (r.error) return toast(r.error.message); }
          if (del.length) await sb.from("precios").delete().eq("lista_id", l.id).in("producto_id", del);
          close(); toast("Lista guardada ✓"); re();
        };
      });
    }));
  },

  // ---------- Descuentos por cantidad ----------
  async descuentos(kb, re) {
    const [{ data, error }, { data: prods }, { data: ls }] = await Promise.all([sb.from("descuentos_cantidad").select("*").order("producto_id").order("desde_cantidad"),
      sb.from("productos").select("id, nombre").eq("activo", true).order("nombre"), sb.from("listas_precio").select("id, nombre").order("nombre")]);
    if (error) throw error;
    const nP = (id) => (id ? prods.find((p) => p.id === id)?.nombre : "Todos los productos"), nL = (id) => (id ? ls.find((l) => l.id === id)?.nombre : "Todas las listas");
    kb.innerHTML = `<div class="card"><p class="small muted" style="margin-top:0">Escalas de descuento según la cantidad pedida. Las vendedoras no pueden modificarlas.</p>
      <div class="row wrap"><select class="in" id="dp" style="width:auto"><option value="">Todos los productos</option>${prods.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("")}</select>
        <select class="in" id="dl" style="width:auto"><option value="">Todas las listas</option>${ls.map((l) => `<option value="${l.id}">${esc(l.nombre)}</option>`).join("")}</select>
        <input class="in" id="dd" placeholder="Desde (cant.)" inputmode="decimal" style="width:130px"><input class="in" id="dv" placeholder="% desc." inputmode="decimal" style="width:100px"><button class="btn" id="da">Agregar</button></div></div>
      <div class="card scroll-x"><table class="t"><tr><th>Producto</th><th>Lista</th><th>Desde</th><th>Descuento</th><th></th></tr>
      ${data.map((d) => `<tr><td>${esc(nP(d.producto_id))}</td><td>${esc(nL(d.lista_id))}</td><td>${fmtNum(d.desde_cantidad)}</td><td><b>${fmtNum(d.descuento_pct)}%</b></td><td><button class="btn peligro sm" data-x="${d.id}">Quitar</button></td></tr>`).join("") || `<tr><td colspan="5" class="muted">Sin descuentos</td></tr>`}</table></div>`;
    $("#da", kb).onclick = async () => {
      const d = Number($("#dd", kb).value), v = Number($("#dv", kb).value);
      if (!(d > 0) || !(v > 0 && v <= 100)) return toast("Indica cantidad y % válidos");
      const r = await sb.from("descuentos_cantidad").insert({ producto_id: Number($("#dp", kb).value) || null, lista_id: Number($("#dl", kb).value) || null, desde_cantidad: d, descuento_pct: v });
      if (r.error) return toast(r.error.message); re();
    };
    $$("[data-x]", kb).forEach((b) => (b.onclick = async () => { const r = await sb.from("descuentos_cantidad").delete().eq("id", b.dataset.x); if (r.error) return toast(r.error.message); re(); }));
  },

  // ---------- Promociones comerciales ----------
  async promos(kb, re) {
    const [{ data, error }, { data: prods }, { data: tipos }, { data: zonas }, { data: ls }] = await Promise.all([sb.from("promociones_comerciales").select("*").order("desde", { ascending: false }),
      sb.from("productos").select("id, nombre").order("nombre"), sb.from("tipos_cliente").select("id, nombre").order("nombre"), sb.from("zonas").select("id, nombre").order("nombre"), sb.from("listas_precio").select("id, nombre").order("nombre")]);
    if (error) throw error;
    const TT = { descuento_pct: "% de descuento", precio_especial: "Precio especial", lleva_paga: "Lleva X, paga Y", regalo: "Regalo / obsequio" };
    const hoy = hoyISO(), vig = (p) => p.activo && (!p.desde || p.desde <= hoy) && (!p.hasta || p.hasta >= hoy);
    const det = (p) => p.tipo === "descuento_pct" ? fmtNum(p.valor) + "%" : p.tipo === "precio_especial" ? "$" + fmtNum(p.valor, 2) : p.tipo === "lleva_paga" ? `lleva ${p.lleva} paga ${p.paga}` : "";
    kb.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="sp small muted">Promociones de tu empresa para los clientes. Las vendedoras solo las consultan.</span><button class="btn" data-nueva>+ Nueva promoción</button></div>
      <div class="list">${data.map((p) => `<div class="item" data-id="${p.id}"><div class="ava">${ic("etiqueta", 20)}</div><div class="grow"><div class="t">${esc(p.nombre)}</div>
        <div class="tiny muted">${TT[p.tipo]} ${det(p)} · ${esc(prods.find((x) => x.id === p.producto_id)?.nombre || "todos los productos")}${p.desde || p.hasta ? ` · ${p.desde ? fmtFecha(p.desde + "T12:00:00") : "…"} a ${p.hasta ? fmtFecha(p.hasta + "T12:00:00") : "…"}` : ""}</div></div>
        ${vig(p) ? `<span class="pill p-menta">Vigente</span>` : `<span class="pill p-gris">No vigente</span>`}</div>`).join("") || `<div class="empty card flat">Aún no hay promociones.</div>`}</div>`;
    const form = (p) => {
      p = p || { tipo: "descuento_pct", activo: true };
      const sel = (n, xs, v, todos) => `<select class="in" name="${n}"><option value="">${todos}</option>${xs.map((x) => `<option value="${x.id}" ${x.id === v ? "selected" : ""}>${esc(x.nombre)}</option>`).join("")}</select>`;
      modal(`<h2>${p.id ? "Editar promoción" : "Nueva promoción"}</h2>
        <label class="f">Nombre *</label><input class="in" name="nombre" value="${esc(p.nombre || "")}">
        <label class="f">Descripción</label><input class="in" name="descripcion" value="${esc(p.descripcion || "")}">
        <div class="grid2c"><div><label class="f">Tipo</label><select class="in" name="tipo">${Object.entries(TT).map(([k, t]) => `<option value="${k}" ${k === p.tipo ? "selected" : ""}>${t}</option>`).join("")}</select></div>
          <div><label class="f">Valor (% o $)</label><input class="in" name="valor" inputmode="decimal" value="${p.valor ?? ""}"></div></div>
        <div class="grid2c"><div><label class="f">Lleva</label><input class="in" name="lleva" inputmode="numeric" value="${p.lleva ?? ""}"></div><div><label class="f">Paga</label><input class="in" name="paga" inputmode="numeric" value="${p.paga ?? ""}"></div></div>
        <label class="f">Producto</label>${sel("producto_id", prods, p.producto_id, "Todos los productos")}
        <div class="grid2c"><div><label class="f">Tipo de cliente</label>${sel("tipo_cliente_id", tipos, p.tipo_cliente_id, "Todos")}</div><div><label class="f">Zona</label>${sel("zona_id", zonas, p.zona_id, "Todas")}</div></div>
        <label class="f">Lista de precio</label>${sel("lista_id", ls, p.lista_id, "Todas")}
        <div class="grid2c"><div><label class="f">Desde</label><input class="in" type="date" name="desde" value="${p.desde || ""}"></div><div><label class="f">Hasta</label><input class="in" type="date" name="hasta" value="${p.hasta || ""}"></div></div>
        <label class="f">Estado</label><select class="in" name="activo"><option value="1">Activa</option><option value="0" ${p.activo ? "" : "selected"}>Inactiva</option></select>
        <button class="btn block" style="margin-top:16px" data-ok>Guardar</button>`, (m, close) => {
        $("[data-ok]", m).onclick = async () => {
          const f = (n) => $(`[name=${n}]`, m).value.trim(), num = (n) => (f(n) === "" ? null : Number(f(n)));
          if (!f("nombre")) return toast("Falta el nombre");
          const d = { nombre: f("nombre"), descripcion: f("descripcion") || null, tipo: f("tipo"), valor: num("valor"), lleva: num("lleva"), paga: num("paga"),
            producto_id: num("producto_id"), tipo_cliente_id: num("tipo_cliente_id"), zona_id: num("zona_id"), lista_id: num("lista_id"), desde: f("desde") || null, hasta: f("hasta") || null, activo: f("activo") === "1" };
          const r = p.id ? await sb.from("promociones_comerciales").update(d).eq("id", p.id) : await sb.from("promociones_comerciales").insert(d);
          if (r.error) return toast(r.error.message); close(); toast("Promoción guardada ✓"); re();
        };
      });
    };
    $("[data-nueva]", kb).onclick = () => form(null);
    $$("[data-id]", kb).forEach((el) => (el.onclick = () => form(data.find((p) => p.id == el.dataset.id))));
  },
};

// ¿El punto [lat,lng] está dentro del polígono [[lat,lng],...]?
function enPoligono([y, x], pol) {
  let d = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [yi, xi] = pol[i], [yj, xj] = pol[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

// ---------------- MAPA (Leaflet + OpenStreetMap) ----------------
const M = {
  cargar() {
    if (window.L) return Promise.resolve();
    return (this._p = this._p || new Promise((res, rej) => {
      const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.appendChild(css);
      const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"; s.onload = res; s.onerror = () => rej(new Error("No se pudo cargar el mapa (revisa la conexión)")); document.head.appendChild(s);
    }));
  },
  base(el, centro = [8.99, -79.52], z = 11) {
    const map = L.map(el, { zoomControl: true }).setView(centro, z);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    return map;
  },

  async render(root, vend = LS.get("map.v", ""), dia = LS.get("map.d", "hoy")) {
    LS.set("map.v", vend); LS.set("map.d", dia);
    root.innerHTML = `<div class="top"><div><div class="muted small">Tiendas, rutas y zonas</div><h1>Mapa</h1></div></div><div id="mp" class="muted">Cargando mapa…</div>`;
    const [_, cl, at, pf, zs] = await Promise.all([this.cargar(),
      sb.from("clientes").select("id, nombre, cadena, lat, lng, zona_id, activo, tipo_id").eq("activo", true),
      sb.from("asignacion_tiendas").select("vendedor_id, cliente_id, dias_semana, orden"),
      sb.from("perfiles").select("id, nombre, rol").order("nombre"),
      sb.from("zonas").select("*").eq("activo", true)]);
    const vendedoras = (pf.data || []).filter((p) => (at.data || []).some((a) => a.vendedor_id === p.id));
    const col = (id) => PALETA[Math.max(0, vendedoras.findIndex((v) => v.id === id)) % PALETA.length];
    const hoyD = diaSemana(), dNum = dia === "hoy" ? hoyD : dia === "todos" ? null : Number(dia);
    let asig = at.data || [];
    if (vend) asig = asig.filter((a) => a.vendedor_id === vend);
    if (dNum) asig = asig.filter((a) => (a.dias_semana || []).includes(dNum));
    const ids = new Set(asig.map((a) => a.cliente_id));
    const ord = (id) => asig.find((a) => a.cliente_id === id)?.orden ?? 999;
    const enRuta = !!(vend && dNum);
    const tiendas = (cl.data || []).filter((c) => (vend || dNum ? ids.has(c.id) : true)).sort((a, b) => (enRuta ? ord(a.id) - ord(b.id) : 0) || a.nombre.localeCompare(b.nombre));
    const conGps = tiendas.filter((t) => t.lat != null);
    $("#mp", root).outerHTML = `<div class="row wrap" style="margin-bottom:12px;gap:8px">
        <select class="in" id="mv" style="width:auto"><option value="">Todas las vendedoras</option>${vendedoras.map((v, i) => `<option value="${v.id}" ${v.id === vend ? "selected" : ""}>${esc(v.nombre)}</option>`).join("")}</select>
        <div class="steps" style="margin:0">${[["hoy", "Hoy"], ["todos", "Todos los días"], ...[1, 2, 3, 4, 5, 6].map((d) => [String(d), DIAS[d]])].map(([k, t]) => `<div class="step ${String(k) === String(dia) ? "on" : ""}" data-dia="${k}">${t}</div>`).join("")}</div></div>
      <div class="mapa-grid"><div class="card mapa-lista"><div class="small muted" style="margin-bottom:8px">${plur(tiendas.length, "tienda")} · ${conGps.length} con ubicación${tiendas.length - conGps.length ? ` · <b style="color:var(--durazno-t)">${tiendas.length - conGps.length} sin GPS</b>` : ""}</div>
        <div class="list" style="gap:0">${tiendas.map((t) => { const a = (at.data || []).filter((x) => x.cliente_id === t.id);
          return `<div class="mrow" data-t="${t.id}">${enRuta ? `<span class="num" style="background:${col(vend)}">${tiendas.indexOf(t) + 1}</span>` : `<span class="dot" style="background:${a[0] ? col(a[0].vendedor_id) : "#999"}"></span>`}<div class="grow"><div style="font-weight:500">${esc(t.nombre)}</div>
            <div class="tiny muted">${a.map((x) => esc((vendedoras.find((v) => v.id === x.vendedor_id)?.nombre || "").split(" ")[0]) + " " + (x.dias_semana || []).map((d) => DIAS_C[d]).join("")).join(" · ") || "Sin vendedora"}</div></div>${t.lat == null ? `<span class="pill p-durazno">Sin GPS</span>` : ""}</div>`; }).join("") || `<div class="muted small">No hay tiendas con ese filtro.</div>`}</div></div>
        <div class="card mapa-mapa" style="padding:0;overflow:hidden"><div id="mapa" style="height:100%;min-height:420px"></div></div></div>
      ${zs.data?.length ? `<div class="row wrap small" style="margin-top:8px;gap:12px">${zs.data.map((z) => `<span><span class="dot" style="background:${esc(z.color)}"></span> ${esc(z.nombre)}</span>`).join("")}</div>` : ""}`;
    $("#mv").onchange = (e) => M.render(root, e.target.value, dia);
    $$("[data-dia]", root).forEach((el) => (el.onclick = () => M.render(root, vend, el.dataset.dia)));
    const map = this.base($("#mapa")), capas = {}, b = [];
    (zs.data || []).filter((z) => z.poligono?.length > 2).forEach((z) => { const p = L.polygon(z.poligono, { color: z.color, weight: 2, fillOpacity: 0.12 }).addTo(map).bindTooltip(z.nombre); b.push(...z.poligono); });
    conGps.forEach((t) => {
      const a = (at.data || []).filter((x) => x.cliente_id === t.id);
      const mk = L.circleMarker([t.lat, t.lng], { radius: 7, color: "#fff", weight: 2, fillColor: a[0] ? col(a[0].vendedor_id) : "#999", fillOpacity: 1 }).addTo(map)
        .bindPopup(`<b>${esc(t.nombre)}</b><br>${esc(t.cadena || "")}<br>${a.map((x) => esc(vendedoras.find((v) => v.id === x.vendedor_id)?.nombre || "") + " · " + (x.dias_semana || []).map((d) => DIAS_C[d]).join("")).join("<br>")}`);
      capas[t.id] = mk; b.push([t.lat, t.lng]);
    });
    if (enRuta) {
      const linea = tiendas.filter((t) => t.lat != null).map((t) => [t.lat, t.lng]);
      if (linea.length > 1) L.polyline(linea, { color: col(vend), weight: 3, opacity: 0.8, dashArray: "6 6" }).addTo(map);
      tiendas.filter((t) => t.lat != null).forEach((t) => L.marker([t.lat, t.lng], { icon: L.divIcon({ className: "", html: `<span class="num" style="background:${col(vend)}">${tiendas.indexOf(t) + 1}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(map).on("click", () => capas[t.id]?.openPopup()));
    }
    if (b.length) map.fitBounds(b, { padding: [30, 30], maxZoom: 15 });
    setTimeout(() => map.invalidateSize(), 200);
    $$("[data-t]", root).forEach((el) => (el.onclick = () => { const mk = capas[el.dataset.t]; if (mk) { map.setView(mk.getLatLng(), 16); mk.openPopup(); } else toast("Esa tienda todavía no tiene ubicación"); }));
  },

  // Dibujar el polígono de una zona: toca el mapa para agregar puntos
  async dibujar(z, guardar) {
    await this.cargar();
    const el = document.createElement("div"); el.className = "full"; el.style.background = "#fff";
    el.innerHTML = `<div class="head" style="background:#fff;color:var(--tinta)"><button class="txtbtn" style="color:var(--tinta)" data-x>Cancelar</button><b>Zona: ${esc(z.nombre)}</b><button class="txtbtn" style="color:var(--azul)" data-ok>Guardar</button></div>
      <div id="dmap" style="flex:1"></div><div class="bar" style="background:#fff;color:var(--tinta)"><span class="small">Toca el mapa para marcar los bordes de la zona.</span><button class="btn sec sm" data-u>Deshacer</button><button class="btn sec sm" data-c>Borrar</button></div>`;
    document.body.appendChild(el);
    const { data: cl } = await sb.from("clientes").select("nombre, lat, lng").not("lat", "is", null);
    const map = this.base($("#dmap", el));
    (cl || []).forEach((t) => L.circleMarker([t.lat, t.lng], { radius: 5, color: "#fff", weight: 1, fillColor: "#5B6577", fillOpacity: 0.9 }).addTo(map).bindTooltip(t.nombre));
    let pts = (z.poligono || []).slice(), capa = null;
    const pintar = () => { if (capa) map.removeLayer(capa); capa = pts.length > 2 ? L.polygon(pts, { color: z.color }).addTo(map) : pts.length ? L.polyline(pts, { color: z.color, dashArray: "4" }).addTo(map) : null; };
    if (pts.length > 2) map.fitBounds(pts); else if (cl?.length) map.fitBounds(cl.map((t) => [t.lat, t.lng]), { maxZoom: 13 });
    pintar(); setTimeout(() => map.invalidateSize(), 200);
    map.on("click", (e) => { pts.push([+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)]); pintar(); });
    $("[data-u]", el).onclick = () => { pts.pop(); pintar(); };
    $("[data-c]", el).onclick = () => { pts = []; pintar(); };
    $("[data-x]", el).onclick = () => el.remove();
    $("[data-ok]", el).onclick = () => { if (pts.length && pts.length < 3) return toast("Marca al menos 3 puntos"); el.remove(); guardar(pts.length ? pts : null); };
  },
};
