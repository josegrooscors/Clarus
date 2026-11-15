// Pantallas de gestión: pedidos para operaciones, equipo del día y usuarios
const G = {
  // ---------------- PEDIDOS (supervisor / operaciones / admin) ----------------
  async pedidos(root, filtro) {
    const rol = DB.perfil.rol;
    const tabs = [["imprimir", "Por imprimir"], ["sinorden", "Sin orden escaneada"], ["impreso", "Impresos"], ["anulado", "Anulados"]];
    filtro = filtro || "imprimir";
    root.innerHTML = `<div class="top"><h1>Pedidos</h1></div>
      <div class="steps">${tabs.map(([k, t]) => `<div class="step ${k === filtro ? "on" : ""}" data-f="${k}">${t} <span data-n="${k}"></span></div>`).join("")}</div>
      <div class="list" id="lp"><div class="muted">Cargando…</div></div>`;
    $$("[data-f]", root).forEach((el) => (el.onclick = () => this.pedidos(root, el.dataset.f)));
    const ACTIVOS = ["propuesto", "aprobado", "orden_escaneada"];
    const { data: cnt } = await sb.from("v_pedidos").select("estado, documento");
    const n = {};
    (cnt || []).forEach((r) => {
      const k = ACTIVOS.includes(r.estado) ? (r.documento ? "imprimir" : "sinorden") : r.estado;
      n[k] = (n[k] || 0) + 1;
    });
    tabs.forEach(([k]) => { const s = $(`[data-n="${k}"]`, root); if (n[k] && k === "imprimir") s.innerHTML = `<span class="badge">${n[k]}</span>`; else if (n[k]) s.textContent = "· " + n[k]; });
    let q = sb.from("v_pedidos").select("*");
    if (filtro === "imprimir") q = q.in("estado", ACTIVOS).not("documento", "is", null);
    else if (filtro === "sinorden") q = q.in("estado", ACTIVOS).is("documento", null);
    else q = q.eq("estado", filtro);
    const { data, error } = await q.order("creado_at", { ascending: filtro === "imprimir" }).limit(100);
    if (error) { $("#lp").innerHTML = esc(error.message); return; }
    $("#lp").innerHTML = data.map((p) => `<div class="item" data-id="${p.id}"><div class="ava">${esc(iniciales(p.vendedor))}</div>
      <div class="grow"><div class="t">${esc(p.tienda)}</div><div class="small muted">${esc(p.vendedor)} · ${fmtFechaHora(p.creado_at)} · ${fmtNum(p.total_cajas)} cajas · ${fmtKg(p.total_kg)}${p.numero_orden ? " · Orden " + esc(p.numero_orden) : ""}</div></div>
      ${pillPedido(p.estado)}${p.documento && filtro !== "imprimir" && p.estado !== "impreso" ? ` <span class="pill p-lila">Orden ✓</span>` : ""}</div>`).join("") || `<div class="empty card flat"><div class="ic">${ic("ok", 34)}</div>No hay pedidos en esta lista.</div>`;
    $$("[data-id]", root).forEach((el) => (el.onclick = () => this.detalle(data.find((p) => p.id == el.dataset.id), () => this.pedidos(root, filtro))));
  },

  async detalle(p, recargar) {
    const rol = DB.perfil.rol;
    const puedeAprobar = false; // el flujo no lleva aprobación
    const puedeImprimir = ["admin", "operaciones", "supervisor"].includes(rol) && !!p.documento && ["propuesto", "aprobado", "orden_escaneada"].includes(p.estado);
    const [{ data: items }, { data: ev }] = await Promise.all([
      sb.from("pedido_items").select("*, productos(nombre, unidad_pedido, unidad_conteo, unidades_por_pedido, peso_kg_unidad)").eq("pedido_id", p.id).order("id"),
      sb.from("pedido_eventos").select("*, perfiles(nombre)").eq("pedido_id", p.id).order("at"),
    ]);
    modal(`<div class="row"><h2 class="sp">${esc(p.tienda)}</h2>${pillPedido(p.estado)}</div>
      <div class="small muted" style="margin:4px 0 12px">Pedido #${p.id} · ${esc(p.vendedor)} · ${fmtFechaHora(p.creado_at)}</div>
      ${!p.documento && ["propuesto", "aprobado"].includes(p.estado) ? `<p class="small" style="color:var(--durazno-t)">La vendedora todavía no ha escaneado la orden de compra.</p>` : ""}
      ${p.nota_vendedor ? `<p class="small"><b>Nota del vendedor:</b> ${esc(p.nota_vendedor)}</p>` : ""}
      <div class="scroll-x"><table class="t"><tr><th>Producto</th><th>Inv.</th><th>Sug.</th><th>Cajas</th><th style="text-align:right">Kilos</th></tr>
      ${(items || []).map((i) => `<tr><td>${esc(i.productos.nombre)}</td><td>${i.stock_unidades != null ? fmtNum(i.stock_unidades) : "–"}</td><td>${i.sugerido != null ? fmtNum(i.sugerido) : "–"}</td><td><b>${fmtNum(i.propuesto)}</b></td><td style="text-align:right">${fmtKg(kgLinea(i.propuesto, i.productos))}</td></tr>`).join("")}
      <tr><td colspan="4"><b>Total</b></td><td style="text-align:right"><b>${fmtKg((items || []).reduce((a, i) => a + kgLinea(i.propuesto, i.productos), 0))}</b></td></tr></table></div>
      ${puedeAprobar ? `<label class="f">Nota (opcional; obligatoria si rechazas)</label><input class="in" id="nrev">
        <div class="row" style="margin-top:14px"><button class="btn peligro sp" data-rech>Rechazar</button><button class="btn ok sp" data-apr>Aprobar</button></div>` : ""}
      ${p.documento ? `<div class="row" style="margin-top:14px"><button class="btn ${puedeImprimir ? "" : "sec"} sp" data-pdf>${ic("doc", 18)} Abrir / imprimir</button><button class="btn sec sp" data-desc>Descargar PDF</button></div>` : ""}
      ${puedeImprimir ? `<button class="btn ok block" style="margin-top:10px" data-imp>Marcar como impreso</button>` : ""}
      <h3 style="margin:18px 0 6px">Historial</h3>
      ${(ev || []).map((e) => `<div class="row small" style="padding:4px 0"><span class="sp">${(ESTADOS_PEDIDO[e.estado] || [e.estado])[0]}${e.perfiles ? " · " + esc(e.perfiles.nombre) : ""}</span><span class="muted">${fmtFechaHora(e.at)}</span></div>`).join("")}`,
      (m, close) => {
        const act = async (estado) => {
          const nota = $("#nrev", m)?.value.trim();
          if (estado === "rechazado" && !nota) { toast("Escribe el motivo del rechazo"); return; }
          if (estado === "aprobado") {
            for (const inp of $$("[data-i]", m)) {
              const { error } = await sb.from("pedido_items").update({ aprobado: parseFloat(inp.value) || 0 }).eq("id", inp.dataset.i);
              if (error) { toast(error.message); return; }
            }
          }
          const { error } = await sb.from("pedidos").update({ estado, nota_revision: nota || null }).eq("id", p.id);
          if (error) { toast(error.message, 4000); return; }
          toast(estado === "aprobado" ? "Pedido aprobado ✓" : "Pedido rechazado"); close(); recargar();
        };
        $("[data-apr]", m) && ($("[data-apr]", m).onclick = () => act("aprobado"));
        $("[data-rech]", m) && ($("[data-rech]", m).onclick = () => act("rechazado"));
        $("[data-pdf]", m) && ($("[data-pdf]", m).onclick = async () => window.open(await DB.urlFirmada("documentos", p.documento), "_blank"));
        $("[data-desc]", m) && ($("[data-desc]", m).onclick = async () => {
          const { data, error } = await sb.storage.from("documentos").createSignedUrl(p.documento, 600, { download: `Orden-${p.numero_orden || p.id}-${(p.tienda || "").replace(/[^\w]+/g, "_")}.pdf` });
          if (error) return toast(error.message);
          location.href = data.signedUrl;
        });
        $("[data-imp]", m) && ($("[data-imp]", m).onclick = async () => {
          const { error } = await sb.from("pedidos").update({ estado: "impreso" }).eq("id", p.id);
          if (error) { toast(error.message, 4000); return; }
          toast("Marcado como impreso ✓"); close(); recargar();
        });
      });
  },

  // ---------------- EQUIPO (hoy) ----------------
  async equipo(root) {
    root.innerHTML = `<div class="top"><div><div class="muted small">${new Date().toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long" })}</div><h1>Equipo hoy</h1></div></div><div id="eq" class="muted">Cargando…</div>`;
    const [{ data: vis, error }, { data: ped }] = await Promise.all([
      sb.from("v_visitas").select("*").eq("fecha", hoyISO()).order("checkin_at"),
      sb.from("v_pedidos").select("estado, documento"),
    ]);
    if (error) { $("#eq").textContent = error.message; return; }
    const enTienda = vis.filter((v) => v.estado === "abierta").length;
    const fuera = vis.filter((v) => v.checkin_dentro === false || v.checkout_dentro === false).length;
    const porImprimir = (ped || []).filter((p) => ["propuesto", "aprobado", "orden_escaneada"].includes(p.estado) && p.documento).length;
    const porVend = {};
    vis.forEach((v) => (porVend[v.vendedor] = porVend[v.vendedor] || []).push(v));
    $("#eq").outerHTML = `<div class="kpis">
        <div class="kpi"><div class="v">${vis.length}</div><div class="l">Visitas hoy</div></div>
        <div class="kpi"><div class="v">${enTienda}</div><div class="l">En tienda ahora</div></div>
        <div class="kpi"><div class="v" style="color:${fuera ? "var(--rosa-t)" : "inherit"}">${fuera}</div><div class="l">Fuera de la tienda (GPS)</div></div>
        <div class="kpi"><div class="v">${porImprimir}</div><div class="l">Órdenes por imprimir</div></div></div>
      ${Object.entries(porVend).map(([n, vs]) => {
        const ini = vs[0].checkin_at, fin = vs.filter((v) => v.checkout_at).slice(-1)[0]?.checkout_at;
        return `<div class="card"><div class="row" style="margin-bottom:10px"><div class="ava">${esc(iniciales(n))}</div><div class="grow"><h3>${esc(n)}</h3>
          <div class="small muted">Inicio ${fmtHora(ini)} · ${fin ? "último cierre " + fmtHora(fin) : "sin cierres"} · ${vs.length} visita(s)</div></div></div>
          <div class="list solo-movil">${vs.map((v) => `<div class="inv"><div class="row"><b class="sp">${esc(v.tienda)}</b>${G.gps(v)}</div>
            <div class="small muted" style="margin-top:4px">${fmtHora(v.checkin_at)} → ${v.checkout_at ? fmtHora(v.checkout_at) : "<b style='color:var(--azul-osc)'>abierta</b>"}${v.minutos_en_tienda != null ? " · " + fmtNum(v.minutos_en_tienda, 0) + " min" : ""} · ${v.num_fotos} fotos · inventario ${v.con_inventario ? "✓" : "—"}</div></div>`).join("")}</div>
          <div class="scroll-x solo-escritorio"><table class="t"><tr><th>Tienda</th><th>Entrada</th><th>Salida</th><th>Min</th><th>GPS</th><th>Fotos</th><th>Inv.</th></tr>
          ${vs.map((v) => `<tr><td>${esc(v.tienda)}</td><td>${fmtHora(v.checkin_at)}</td><td>${v.checkout_at ? fmtHora(v.checkout_at) : `<span class="pill p-azul">Abierta</span>`}</td>
            <td>${v.minutos_en_tienda != null ? fmtNum(v.minutos_en_tienda, 0) : "–"}</td>
            <td>${G.gps(v)}</td>
            <td>${v.num_fotos}</td><td>${v.con_inventario ? "✓" : "–"}</td></tr>`).join("")}</table></div></div>`;
      }).join("") || `<div class="empty card flat"><div class="ic">${ic("reloj", 34)}</div>Todavía no hay visitas hoy.</div>`}`;
  },

  gps(v) {
    const d = Math.max(v.checkin_dist_m || 0, v.checkout_dist_m || 0);
    if (v.checkin_dentro === false || v.checkout_dentro === false) return `<span class="pill p-rosa">Fuera · ${fmtDist(d)}</span>`;
    if (v.checkin_dentro) return `<span class="pill p-menta">Dentro · ${fmtDist(Math.max(v.checkin_dist_m || 0, v.checkout_dist_m || 0))}</span>`;
    return `<span class="pill p-gris">Tienda sin ubicación</span>`;
  },

  // ---------------- USUARIOS (admin) ----------------
  async usuarios(root) {
    const roles = { admin: "Administrador", supervisor: "Supervisor", operaciones: "Operaciones", vendedor: "Vendedor" };
    root.innerHTML = `<div class="top"><h1>Usuarios</h1><button class="btn sm" data-nuevo>+ Nuevo</button></div><div class="list" id="lu"></div>`;
    const { data } = await sb.from("perfiles").select("*").order("nombre");
    $("#lu").innerHTML = (data || []).map((u) => `<div class="item" data-id="${u.id}"><div class="ava">${esc(iniciales(u.nombre))}</div>
      <div class="grow"><div class="t">${esc(u.nombre)}</div><div class="small muted">${roles[u.rol]}${u.telefono ? " · " + esc(u.telefono) : ""}</div></div>
      ${u.activo ? `<span class="pill p-menta">Activo</span>` : `<span class="pill p-gris">Inactivo</span>`}</div>`).join("");
    $("[data-nuevo]", root).onclick = () => modal(`<h2>Nuevo usuario</h2>
      <label class="f">Nombre completo</label><input class="in" name="nombre">
      <label class="f">Usuario (para entrar)</label><input class="in" name="usuario" autocapitalize="none" placeholder="ej. nilskya">
      <label class="f">Contraseña inicial</label><input class="in" name="password" placeholder="mínimo 6 caracteres">
      <label class="f">Rol</label><select class="in" name="rol">${Object.entries(roles).map(([k, t]) => `<option value="${k}" ${k === "vendedor" ? "selected" : ""}>${t}</option>`).join("")}</select>
      <label class="f">Teléfono</label><input class="in" name="telefono" inputmode="tel">
      <button class="btn block" style="margin-top:16px" data-ok>Crear usuario</button>`, (m, close) => {
      $("[data-ok]", m).onclick = async () => {
        const f = (n) => $(`[name=${n}]`, m).value.trim();
        try {
          const r = await DB.funcion("usuarios", { accion: "crear", nombre: f("nombre"), usuario: f("usuario"), password: f("password"), rol: f("rol"), telefono: f("telefono") });
          close(); toast(`Usuario creado: ${r.usuario}`, 3500); this.usuarios(root);
        } catch (e) { toast(e.message, 4000); }
      };
    });
    $$("[data-id]", root).forEach((el) => (el.onclick = () => {
      const u = data.find((x) => x.id === el.dataset.id);
      modal(`<h2>${esc(u.nombre)}</h2><div class="muted small">${roles[u.rol]}</div>
        <label class="f">Nueva contraseña</label><input class="in" name="pw" placeholder="mínimo 6 caracteres">
        <button class="btn sec block" style="margin-top:10px" data-pw>Cambiar contraseña</button>
        ${u.id !== DB.user.id ? `<button class="btn ${u.activo ? "peligro" : "ok"} block" style="margin-top:10px" data-act>${u.activo ? "Desactivar usuario" : "Activar usuario"}</button>` : ""}`, (m, close) => {
        $("[data-pw]", m).onclick = async () => { try { await DB.funcion("usuarios", { accion: "password", id: u.id, password: $("[name=pw]", m).value }); close(); toast("Contraseña cambiada ✓"); } catch (e) { toast(e.message, 4000); } };
        const a = $("[data-act]", m);
        if (a) a.onclick = async () => { try { await DB.funcion("usuarios", { accion: "activo", id: u.id, activo: !u.activo }); close(); this.usuarios(root); } catch (e) { toast(e.message, 4000); } };
      });
    }));
  },
};
