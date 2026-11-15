// Configuración: tiendas, productos, usuarios y permisos por rol (según el permiso de cada rol)
const ROLES_TXT = { admin: "Administrador", supervisor: "Supervisor", operaciones: "Operaciones", vendedor: "Vendedor" };
const PERMISOS_TXT = {
  tiendas: ["Tiendas", "Crear y editar tiendas, su dirección y ubicación"],
  ubicacion: ["Ubicación en visita", "Guardar el GPS de una tienda que aún no tiene ubicación, desde la visita"],
  rutas: ["Rutas", "Asignar tiendas y días de visita a cada vendedora"],
  productos: ["Productos", "Crear y editar productos, pesos y precios"],
  usuarios: ["Usuarios", "Crear usuarios, cambiar contraseñas y desactivar (no administradores)"],
};

// Convierte "9.02, -79.50" o un link de Google Maps con @lat,lng / q=lat,lng en coordenadas
function leerCoordenadas(t) {
  t = String(t || "").trim(); if (!t) return null;
  const m = t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || t.match(/[?&](?:q|query|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || t.match(/^(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

const C = {
  pestanas() {
    return [["tiendas", "Tiendas", DB.puede("tiendas") || DB.puede("rutas")], ["productos", "Productos", DB.puede("productos")],
      ["usuarios", "Usuarios", DB.puede("usuarios")], ["permisos", "Permisos", DB.perfil.rol === "admin"]].filter((x) => x[2]);
  },
  visible() { return this.pestanas().length > 0; },

  async config(root, tab) {
    const ps = this.pestanas();
    if (!ps.length) { root.innerHTML = `<div class="empty card flat">No tienes permisos de configuración.</div>`; return; }
    tab = ps.some((p) => p[0] === tab) ? tab : LS.get("cfgTab") && ps.some((p) => p[0] === LS.get("cfgTab")) ? LS.get("cfgTab") : ps[0][0];
    LS.set("cfgTab", tab);
    root.innerHTML = `<div class="top"><h1>Configuración</h1><span id="cfgAcc"></span></div>
      <div class="steps">${ps.map(([k, t]) => `<div class="step ${k === tab ? "on" : ""}" data-tab="${k}">${t}</div>`).join("")}</div><div id="cfg"></div>`;
    $$("[data-tab]", root).forEach((el) => (el.onclick = () => this.config(root, el.dataset.tab)));
    const box = $("#cfg", root);
    if (tab === "tiendas") return this.tiendas(box);
    if (tab === "productos") return this.productos(box);
    if (tab === "usuarios") return this.usuarios(box);
    if (tab === "permisos") return this.permisos(box);
  },

  // ---------------- TIENDAS ----------------
  async tiendas(box, q = "", filtro = "") {
    const [cl, at, pf] = await Promise.all([
      sb.from("clientes").select("*").order("nombre"),
      sb.from("asignacion_tiendas").select("*"),
      sb.from("perfiles").select("id, nombre, rol, activo").order("nombre"),
    ]);
    if (cl.error) throw cl.error;
    const tiendas = cl.data, asig = at.data || [], gente = pf.data || [];
    const zonas = [...new Set(tiendas.map((t) => t.zona).filter(Boolean))].sort();
    const nombreDe = (id) => (gente.find((g) => g.id === id)?.nombre || "?").split(" ")[0];
    const sinGps = tiendas.filter((t) => t.activo && t.lat == null).length;
    box.innerHTML = `<div class="row wrap" style="margin-bottom:10px">
        <input class="in sp" id="tq" placeholder="Buscar por nombre, cadena o código…" value="${esc(q)}" style="min-width:200px">
        <select class="in" id="tf" style="width:auto"><option value="">Todas (${tiendas.length})</option>
          <option value="sin-gps">Sin ubicación (${sinGps})</option><option value="sin-ruta">Sin vendedora</option><option value="inactivas">Inactivas</option>
          ${zonas.map((z) => `<option value="z:${esc(z)}">${esc(z)}</option>`).join("")}</select>
        ${DB.puede("tiendas") ? `<button class="btn" data-nueva>+ Nueva tienda</button>` : ""}</div>
      <div class="list" id="tl"></div>`;
    $("#tf", box).value = filtro;
    const pintar = () => {
      const qq = sinAcentos($("#tq", box).value.trim()), f = $("#tf", box).value;
      let xs = tiendas.filter((t) => (f === "inactivas" ? !t.activo : t.activo));
      if (f === "sin-gps") xs = xs.filter((t) => t.lat == null);
      if (f === "sin-ruta") xs = xs.filter((t) => !asig.some((a) => a.cliente_id === t.id));
      if (f.startsWith("z:")) xs = xs.filter((t) => t.zona === f.slice(2));
      if (qq) xs = xs.filter((t) => qq.split(/\s+/).every((w) => sinAcentos([t.nombre, t.cadena, t.codigo, t.zona].join(" ")).includes(w)));
      $("#tl", box).innerHTML = xs.slice(0, 150).map((t) => {
        const a = asig.filter((x) => x.cliente_id === t.id);
        return `<div class="item" data-t="${t.id}"><div class="ava">${esc(iniciales(t.cadena || t.nombre))}</div>
          <div class="grow"><div class="t">${esc(t.nombre)}</div><div class="small muted">${esc([t.codigo, t.cadena, t.zona].filter(Boolean).join(" · "))}</div>
          <div class="tiny muted">${a.length ? a.map((x) => `${esc(nombreDe(x.vendedor_id))} ${x.dias_semana.map((d) => DIAS_C[d]).join("")}`).join(" · ") : "Sin vendedora"}</div></div>
          ${t.lat == null ? `<span class="pill p-durazno">Sin GPS</span>` : `<span class="pill p-menta">GPS</span>`}</div>`;
      }).join("") + (xs.length > 150 ? `<div class="small muted">Mostrando 150 de ${xs.length}. Escribe para filtrar.</div>` : "") || `<div class="empty card flat">No hay tiendas con ese filtro.</div>`;
    };
    pintar();
    $("#tq", box).oninput = pintar; $("#tf", box).onchange = pintar;
    const recargar = () => this.tiendas(box, $("#tq", box)?.value || "", $("#tf", box)?.value || "");
    const nueva = $("[data-nueva]", box); if (nueva) nueva.onclick = () => this.tienda(null, { zonas, asig, gente }, recargar);
    $("#tl", box).onclick = (e) => { const it = e.target.closest("[data-t]"); if (it) this.tienda(tiendas.find((t) => t.id == it.dataset.t), { zonas, asig, gente }, recargar); };
  },

  tienda(t, { zonas, asig, gente }, recargar) {
    const editar = DB.puede("tiendas"), rutas = DB.puede("rutas");
    t = t || { nombre: "", activo: true, radio_m: 100 };
    let filas = asig.filter((a) => t.id && a.cliente_id === t.id).map((a) => ({ vendedor_id: a.vendedor_id, dias: [...a.dias_semana] }));
    const original = JSON.stringify(filas);
    const vendedoras = gente.filter((g) => g.activo && g.rol !== "operaciones");
    const dis = editar ? "" : "disabled";
    modal(`<h2>${t.id ? esc(t.nombre) : "Nueva tienda"}</h2>
      <label class="f">Nombre *</label><input class="in" name="nombre" value="${esc(t.nombre)}" ${dis}>
      <div class="grid2c"><div><label class="f">Código</label><input class="in" name="codigo" value="${esc(t.codigo || "")}" ${dis}></div>
        <div><label class="f">Cadena</label><input class="in" name="cadena" value="${esc(t.cadena || "")}" ${dis}></div></div>
      <label class="f">Zona o grupo</label><input class="in" name="zona" list="zl" value="${esc(t.zona || "")}" ${dis}><datalist id="zl">${zonas.map((z) => `<option value="${esc(z)}">`).join("")}</datalist>
      <label class="f">Dirección</label><input class="in" name="direccion" value="${esc(t.direccion || "")}" ${dis}>
      <label class="f">Ubicación (coordenadas o link de Google Maps)</label>
      <input class="in" name="gps" placeholder="9.0293, -79.5064" value="${t.lat != null ? t.lat + ", " + t.lng : ""}" ${dis}>
      ${editar ? `<div class="row wrap" style="margin-top:8px"><button class="btn sec sm" data-aqui>${ic("ruta", 16)} Usar mi ubicación actual</button>
        <span class="tiny muted sp">En Google Maps: mantén presionada la tienda y copia las coordenadas.</span></div>` : ""}
      <div class="grid2c"><div><label class="f">Radio permitido (m)</label><input class="in" name="radio" type="number" inputmode="numeric" value="${t.radio_m || 100}" ${dis}></div>
        <div><label class="f">Estado</label><select class="in" name="activo" ${dis}><option value="1">Activa</option><option value="0" ${t.activo ? "" : "selected"}>Inactiva</option></select></div></div>
      ${rutas ? `<h3 style="margin:20px 0 8px">Ruta: quién la visita y qué días</h3><div id="rf" class="list"></div>
        <button class="btn ghost sm" style="margin-top:8px" data-mas>+ Agregar vendedora</button>` : ""}
      <button class="btn block" style="margin-top:20px" data-ok>${t.id ? "Guardar cambios" : "Crear tienda"}</button>`, (m, close) => {
      const pintarRuta = () => {
        const rf = $("#rf", m); if (!rf) return;
        rf.innerHTML = filas.map((f, i) => `<div class="inv"><div class="row"><select class="in sp" data-v="${i}"><option value="">Elegir…</option>
            ${vendedoras.map((g) => `<option value="${g.id}" ${g.id === f.vendedor_id ? "selected" : ""}>${esc(g.nombre)}</option>`).join("")}</select>
            <button class="btn peligro sm" data-x="${i}" aria-label="Quitar">✕</button></div>
          <div class="dias">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<button class="dia ${f.dias.includes(d) ? "on" : ""}" data-i="${i}" data-d="${d}" aria-label="${DIAS[d]}">${DIAS_C[d]}</button>`).join("")}</div></div>`).join("")
          || `<div class="small muted">Ninguna vendedora visita esta tienda.</div>`;
        $$("[data-v]", rf).forEach((s) => (s.onchange = () => (filas[s.dataset.v].vendedor_id = s.value)));
        $$("[data-x]", rf).forEach((b) => (b.onclick = () => { filas.splice(b.dataset.x, 1); pintarRuta(); }));
        $$("[data-d]", rf).forEach((b) => (b.onclick = () => {
          const f = filas[b.dataset.i], d = Number(b.dataset.d);
          f.dias = f.dias.includes(d) ? f.dias.filter((x) => x !== d) : [...f.dias, d].sort(); pintarRuta();
        }));
      };
      pintarRuta();
      const mas = $("[data-mas]", m); if (mas) mas.onclick = () => { filas.push({ vendedor_id: "", dias: [1, 2, 3, 4, 5, 6] }); pintarRuta(); };
      const aqui = $("[data-aqui]", m);
      if (aqui) aqui.onclick = async () => {
        aqui.disabled = true; toast("Obteniendo ubicación…", 9000);
        try { const p = await ubicacion(); $("[name=gps]", m).value = `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`; toast(`Ubicación tomada (precisión ${p.precision} m)`); }
        catch (e) { toast(e.message, 4000); } finally { aqui.disabled = false; }
      };
      $("[data-ok]", m).onclick = async () => {
        const f = (n) => $(`[name=${n}]`, m).value.trim();
        const btn = $("[data-ok]", m);
        try {
          let id = t.id;
          if (editar) {
            if (!f("nombre")) return toast("Falta el nombre");
            const gps = f("gps") ? leerCoordenadas(f("gps")) : { lat: null, lng: null };
            if (!gps) return toast("No entiendo la ubicación. Escribe: 9.0293, -79.5064", 4000);
            const datos = { nombre: f("nombre"), codigo: f("codigo") || null, cadena: f("cadena") || null, zona: f("zona") || null,
              direccion: f("direccion") || null, lat: gps.lat, lng: gps.lng, radio_m: Math.max(20, Number(f("radio")) || 100), activo: f("activo") === "1" };
            btn.disabled = true;
            const r = id ? await sb.from("clientes").update(datos).eq("id", id).select("id").single() : await sb.from("clientes").insert(datos).select("id").single();
            if (r.error) throw new Error(r.error.code === "23505" ? "Ya existe una tienda con ese código" : r.error.message);
            id = r.data.id;
          }
          if (rutas && id && JSON.stringify(filas) !== original) {
            const ok = filas.filter((x) => x.vendedor_id && x.dias.length);
            if (new Set(ok.map((x) => x.vendedor_id)).size !== ok.length) throw new Error("Una vendedora aparece dos veces");
            const quitar = asig.filter((a) => a.cliente_id === id && !ok.some((x) => x.vendedor_id === a.vendedor_id));
            for (const a of quitar) { const r = await sb.from("asignacion_tiendas").delete().eq("cliente_id", id).eq("vendedor_id", a.vendedor_id); if (r.error) throw r.error; }
            if (ok.length) { const r = await sb.from("asignacion_tiendas").upsert(ok.map((x) => ({ cliente_id: id, vendedor_id: x.vendedor_id, dias_semana: x.dias }))); if (r.error) throw r.error; }
          }
          close(); toast(t.id ? "Tienda actualizada ✓" : "Tienda creada ✓"); DB.catalogos(true).catch(() => {}); recargar();
        } catch (e) { btn.disabled = false; toast(e.message, 4500); }
      };
    });
  },

  // ---------------- PRODUCTOS ----------------
  async productos(box) {
    const { data, error } = await sb.from("productos").select("*").order("nombre");
    if (error) throw error;
    box.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="sp muted small">${data.filter((p) => p.activo).length} productos activos</span><button class="btn" data-nuevo>+ Nuevo producto</button></div>
      <div class="list">${data.map((p) => `<div class="item" data-p="${p.id}"><div class="ava">${ic("caja", 20)}</div>
        <div class="grow"><div class="t">${esc(p.nombre)}</div><div class="small muted">${esc([p.sku && "SKU " + p.sku, p.categoria].filter(Boolean).join(" · "))}</div>
        <div class="tiny muted">${fmtNum(p.peso_kg_unidad, 2)} kg por ${esc(p.unidad_conteo)} · ${p.kg_por_pedido != null ? fmtNum(p.kg_por_pedido, 2) + " kg por " + esc(p.unidad_pedido) : fmtNum(p.unidades_por_pedido, 0) + " por " + esc(p.unidad_pedido)}${p.precio_kg != null ? " · $" + fmtNum(p.precio_kg, 2) + "/kg" : ""}</div></div>
        ${p.activo ? "" : `<span class="pill p-gris">Inactivo</span>`}</div>`).join("") || `<div class="empty card flat">Aún no hay productos.</div>`}</div>`;
    const abrir = (p) => this.producto(p, () => this.productos(box));
    $("[data-nuevo]", box).onclick = () => abrir(null);
    $$("[data-p]", box).forEach((el) => (el.onclick = () => abrir(data.find((p) => p.id == el.dataset.p))));
  },

  producto(p, recargar) {
    p = p || { nombre: "", unidad_conteo: "barra", peso_kg_unidad: 1, unidad_pedido: "caja", unidades_por_pedido: 1, activo: true };
    modal(`<h2>${p.id ? esc(p.nombre) : "Nuevo producto"}</h2>
      <label class="f">Nombre *</label><input class="in" name="nombre" value="${esc(p.nombre)}">
      <div class="grid2c"><div><label class="f">SKU / código</label><input class="in" name="sku" value="${esc(p.sku || "")}"></div>
        <div><label class="f">Categoría</label><input class="in" name="categoria" value="${esc(p.categoria || "")}"></div></div>
      <div class="grid2c"><div><label class="f">Se cuenta en</label><input class="in" name="unidad_conteo" value="${esc(p.unidad_conteo)}" placeholder="barra"></div>
        <div><label class="f">Kg por unidad</label><input class="in" name="peso" type="number" step="0.001" inputmode="decimal" value="${p.peso_kg_unidad ?? ""}"></div></div>
      <div class="grid2c"><div><label class="f">Se pide en</label><input class="in" name="unidad_pedido" value="${esc(p.unidad_pedido)}" placeholder="caja"></div>
        <div><label class="f">Kg por caja</label><input class="in" name="kgcaja" type="number" step="0.01" inputmode="decimal" value="${p.kg_por_pedido ?? ""}"></div></div>
      <div class="grid2c"><div><label class="f">Precio por kg ($)</label><input class="in" name="precio" type="number" step="0.01" inputmode="decimal" value="${p.precio_kg ?? ""}"></div>
        <div><label class="f">Estado</label><select class="in" name="activo"><option value="1">Activo</option><option value="0" ${p.activo ? "" : "selected"}>Inactivo</option></select></div></div>
      <button class="btn block" style="margin-top:20px" data-ok>${p.id ? "Guardar cambios" : "Crear producto"}</button>`, (m, close) => {
      $("[data-ok]", m).onclick = async () => {
        const f = (n) => $(`[name=${n}]`, m).value.trim(), num = (n) => (f(n) === "" ? null : Number(f(n)));
        if (!f("nombre")) return toast("Falta el nombre");
        if (!(num("peso") > 0)) return toast("Indica los kg por unidad");
        const kgc = num("kgcaja");
        const datos = { nombre: f("nombre"), sku: f("sku") || null, categoria: f("categoria") || null, unidad_conteo: f("unidad_conteo") || "barra",
          peso_kg_unidad: num("peso"), unidad_pedido: f("unidad_pedido") || "caja", kg_por_pedido: kgc,
          unidades_por_pedido: kgc ? Math.round((kgc / num("peso")) * 100) / 100 : p.unidades_por_pedido || 1, precio_kg: num("precio"), activo: f("activo") === "1" };
        const r = p.id ? await sb.from("productos").update(datos).eq("id", p.id) : await sb.from("productos").insert(datos);
        if (r.error) return toast(r.error.code === "23505" ? "Ya existe un producto con ese SKU" : r.error.message, 4500);
        close(); toast(p.id ? "Producto actualizado ✓" : "Producto creado ✓"); DB.catalogos(true).catch(() => {}); recargar();
      };
    });
  },

  // ---------------- USUARIOS ----------------
  async usuarios(box) {
    const esAdmin = DB.perfil.rol === "admin";
    const roles = Object.entries(ROLES_TXT).filter(([k]) => esAdmin || k !== "admin");
    const [{ data }, at] = await Promise.all([sb.from("perfiles").select("*").order("nombre"), sb.from("asignacion_tiendas").select("vendedor_id")]);
    const nT = (id) => (at.data || []).filter((a) => a.vendedor_id === id).length;
    box.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="sp muted small">${(data || []).filter((u) => u.activo).length} usuarios activos</span><button class="btn" data-nuevo>+ Nuevo usuario</button></div><div class="list" id="lu"></div>`;
    $("#lu", box).innerHTML = (data || []).map((u) => `<div class="item" data-id="${u.id}"><div class="ava">${esc(iniciales(u.nombre))}</div>
      <div class="grow"><div class="t">${esc(u.nombre)}</div><div class="small muted">${ROLES_TXT[u.rol]}${nT(u.id) ? " · " + nT(u.id) + " tiendas" : ""}${u.telefono ? " · " + esc(u.telefono) : ""}</div></div>
      ${u.activo ? `<span class="pill p-menta">Activo</span>` : `<span class="pill p-gris">Inactivo</span>`}</div>`).join("");
    const opciones = (sel) => roles.map(([k, t]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${t}</option>`).join("");
    $("[data-nuevo]", box).onclick = () => modal(`<h2>Nuevo usuario</h2>
      <label class="f">Nombre completo</label><input class="in" name="nombre">
      <label class="f">Usuario (para entrar)</label><input class="in" name="usuario" autocapitalize="none" placeholder="ej. nilskya">
      <label class="f">Contraseña inicial</label><input class="in" name="password" placeholder="mínimo 6 caracteres">
      <label class="f">Rol</label><select class="in" name="rol">${opciones("vendedor")}</select>
      <label class="f">Teléfono</label><input class="in" name="telefono" inputmode="tel">
      <p class="tiny muted">Después asígnale sus tiendas en la pestaña Tiendas.</p>
      <button class="btn block" style="margin-top:10px" data-ok>Crear usuario</button>`, (m, close) => {
      $("[data-ok]", m).onclick = async () => {
        const f = (n) => $(`[name=${n}]`, m).value.trim();
        try {
          const r = await DB.funcion("usuarios", { accion: "crear", nombre: f("nombre"), usuario: f("usuario"), password: f("password"), rol: f("rol"), telefono: f("telefono") });
          close(); toast(`Usuario creado: ${r.usuario}`, 3500); this.usuarios(box);
        } catch (e) { toast(e.message, 4000); }
      };
    });
    $$("[data-id]", box).forEach((el) => (el.onclick = () => {
      const u = data.find((x) => x.id === el.dataset.id);
      if (u.rol === "admin" && !esAdmin) return toast("Solo un administrador puede modificar a otro administrador");
      const yo = u.id === DB.user.id;
      modal(`<h2>${esc(u.nombre)}</h2>
        <label class="f">Nombre completo</label><input class="in" name="nombre" value="${esc(u.nombre)}">
        <div class="grid2c"><div><label class="f">Rol</label><select class="in" name="rol" ${yo ? "disabled" : ""}>${opciones(u.rol)}</select></div>
          <div><label class="f">Teléfono</label><input class="in" name="telefono" inputmode="tel" value="${esc(u.telefono || "")}"></div></div>
        <button class="btn block" style="margin-top:12px" data-ed>Guardar cambios</button>
        <label class="f" style="margin-top:20px">Nueva contraseña</label><input class="in" name="pw" placeholder="mínimo 6 caracteres">
        <button class="btn sec block" style="margin-top:10px" data-pw>Cambiar contraseña</button>
        ${!yo ? `<button class="btn ${u.activo ? "peligro" : "ok"} block" style="margin-top:10px" data-act>${u.activo ? "Desactivar usuario" : "Activar usuario"}</button>` : ""}`, (m, close) => {
        $("[data-ed]", m).onclick = async () => {
          try { await DB.funcion("usuarios", { accion: "editar", id: u.id, nombre: $("[name=nombre]", m).value, telefono: $("[name=telefono]", m).value.trim(), rol: $("[name=rol]", m).value }); close(); toast("Usuario actualizado ✓"); this.usuarios(box); }
          catch (e) { toast(e.message, 4000); }
        };
        $("[data-pw]", m).onclick = async () => { try { await DB.funcion("usuarios", { accion: "password", id: u.id, password: $("[name=pw]", m).value }); close(); toast("Contraseña cambiada ✓"); } catch (e) { toast(e.message, 4000); } };
        const a = $("[data-act]", m);
        if (a) a.onclick = async () => { try { await DB.funcion("usuarios", { accion: "activo", id: u.id, activo: !u.activo }); close(); this.usuarios(box); } catch (e) { toast(e.message, 4000); } };
      });
    }));
  },

  // ---------------- PERMISOS POR ROL (solo administrador) ----------------
  async permisos(box) {
    const { data, error } = await sb.from("permisos_rol").select("*");
    if (error) throw error;
    const roles = ["supervisor", "operaciones", "vendedor"];
    const tiene = (r, p) => !!(data || []).find((x) => x.rol === r && x.permiso === p)?.permitido;
    box.innerHTML = `<p class="small muted" style="margin-top:0">Elige qué puede hacer cada rol. El administrador siempre puede todo. Los cambios aplican la próxima vez que cada persona abra la app.</p>
      <div class="card flat scroll-x" style="padding:0"><table class="t perm"><tr><th>Permiso</th>${roles.map((r) => `<th>${ROLES_TXT[r]}</th>`).join("")}</tr>
      ${Object.entries(PERMISOS_TXT).map(([p, [t, d]]) => `<tr><td><b>${t}</b><div class="tiny muted">${d}</div></td>
        ${roles.map((r) => `<td><label class="sw"><input type="checkbox" data-r="${r}" data-p="${p}" ${tiene(r, p) ? "checked" : ""} aria-label="${t} — ${ROLES_TXT[r]}"><span></span></label></td>`).join("")}</tr>`).join("")}
      </table></div>`;
    $$("input[data-r]", box).forEach((el) => (el.onchange = async () => {
      const r = await sb.from("permisos_rol").upsert({ empresa_id: DB.perfil.empresa_id, rol: el.dataset.r, permiso: el.dataset.p, permitido: el.checked });
      if (r.error) { el.checked = !el.checked; return toast(r.error.message, 4000); }
      toast(`${PERMISOS_TXT[el.dataset.p][0]} · ${ROLES_TXT[el.dataset.r]}: ${el.checked ? "permitido" : "sin permiso"}`);
    }));
  },
};
