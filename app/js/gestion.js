// Pantallas de gestión: aprobación de pedidos, órdenes para operaciones, equipo del día y usuarios
const G = {
  // ---------------- PEDIDOS (supervisor / operaciones / admin) ----------------
  async pedidos(root, filtro) {
    const rol = DB.perfil.rol;
    const tabs = [["propuesto", "Por aprobar"], ["aprobado", "Esperando orden"], ["orden_escaneada", "Por imprimir"], ["impreso", "Impresos"], ["rechazado", "Rechazados"]];
    filtro = filtro || (rol === "operaciones" ? "orden_escaneada" : "propuesto");
    root.innerHTML = `<div class="top"><h1>Pedidos</h1></div>
      <div class="steps">${tabs.map(([k, t]) => `<div class="step ${k === filtro ? "on" : ""}" data-f="${k}">${t} <span data-n="${k}"></span></div>`).join("")}</div>
      <div class="list" id="lp"><div class="muted">Cargando…</div></div>`;
    $$("[data-f]", root).forEach((el) => (el.onclick = () => this.pedidos(root, el.dataset.f)));
    const { data: cnt } = await sb.from("pedidos").select("estado");
    const n = {}; (cnt || []).forEach((r) => (n[r.estado] = (n[r.estado] || 0) + 1));
    tabs.forEach(([k]) => { const s = $(`[data-n="${k}"]`, root); if (n[k] && ["propuesto", "orden_escaneada"].includes(k)) s.innerHTML = `<span class="badge">${n[k]}</span>`; else if (n[k]) s.textContent = "· " + n[k]; });
    const { data, error } = await sb.from("v_pedidos").select("*").eq("estado", filtro).order("creado_at", { ascending: filtro === "propuesto" || filtro === "orden_escaneada" }).limit(100);
    if (error) { $("#lp").innerHTML = esc(error.message); return; }
    $("#lp").innerHTML = data.map((p) => `<div class="item" data-id="${p.id}"><div class="ava">${esc(iniciales(p.vendedor))}</div>
      <div class="grow"><div class="t">${esc(p.tienda)}</div><div class="small muted">${esc(p.vendedor)} · ${fmtFechaHora(p.creado_at)} · ${fmtNum(p.total_cajas)} cajas${p.numero_orden ? " · Orden " + esc(p.numero_orden) : ""}</div></div>
      ${pillPedido(p.estado)}</div>`).join("") || `<div class="empty card flat"><div class="ic">${ic("ok", 34)}</div>No hay pedidos en esta lista.</div>`;
    $$("[data-id]", root).forEach((el) => (el.onclick = () => this.detalle(data.find((p) => p.id == el.dataset.id), () => this.pedidos(root, filtro))));
  },

  async detalle(p, recargar) {
    const rol = DB.perfil.rol;
    const puedeAprobar = ["admin", "supervisor"].includes(rol) && p.estado === "propuesto";
    const puedeImprimir = ["admin", "operaciones", "supervisor"].includes(rol) && p.estado === "orden_escaneada";
    const [{ data: items }, { data: ev }] = await Promise.all([
      sb.from("pedido_items").select("*, productos(nombre, unidad_pedido, unidad_conteo)").eq("pedido_id", p.id).order("id"),
      sb.from("pedido_eventos").select("*, perfiles(nombre)").eq("pedido_id", p.id).order("at"),
    ]);
    modal(`<div class="row"><h2 class="sp">${esc(p.tienda)}</h2>${pillPedido(p.estado)}</div>
      <div class="small muted" style="margin:4px 0 12px">Pedido #${p.id} · ${esc(p.vendedor)} · ${fmtFechaHora(p.creado_at)}</div>
      ${p.nota_vendedor ? `<p class="small"><b>Nota del vendedor:</b> ${esc(p.nota_vendedor)}</p>` : ""}
      <div class="scroll-x"><table class="t"><tr><th>Producto</th><th>Inv.</th><th>Sug.</th><th>Prop.</th><th>Aprobado</th></tr>
      ${(items || []).map((i) => `<tr><td>${esc(i.productos.nombre)}</td><td>${i.stock_unidades != null ? fmtNum(i.stock_unidades) : "–"}</td><td>${i.sugerido != null ? fmtNum(i.sugerido) : "–"}</td><td>${fmtNum(i.propuesto)}</td>
        <td>${puedeAprobar ? `<input class="in" style="width:80px;padding:8px" inputmode="decimal" data-i="${i.id}" value="${i.propuesto}">` : `<b>${i.aprobado != null ? fmtNum(i.aprobado) : "–"}</b>`}</td></tr>`).join("")}</table></div>
      ${puedeAprobar ? `<label class="f">Nota (opcional; obligatoria si rechazas)</label><input class="in" id="nrev">
        <div class="row" style="margin-top:14px"><button class="btn peligro sp" data-rech>Rechazar</button><button class="btn ok sp" data-apr>Aprobar</button></div>` : ""}
      ${p.documento ? `<button class="btn ${puedeImprimir ? "" : "sec"} block" style="margin-top:14px" data-pdf>${ic("doc", 18)} Abrir orden escaneada (PDF)</button>` : ""}
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
      sb.from("pedidos").select("estado"),
    ]);
    if (error) { $("#eq").textContent = error.message; return; }
    const enTienda = vis.filter((v) => v.estado === "abierta").length;
    const fuera = vis.filter((v) => v.checkin_dentro === false || v.checkout_dentro === false).length;
    const porAprobar = (ped || []).filter((p) => p.estado === "propuesto").length;
    const porVend = {};
    vis.forEach((v) => (porVend[v.vendedor] = porVend[v.vendedor] || []).push(v));
    $("#eq").outerHTML = `<div class="kpis">
        <div class="kpi"><div class="v">${vis.length}</div><div class="l">Visitas hoy</div></div>
        <div class="kpi"><div class="v">${enTienda}</div><div class="l">En tienda ahora</div></div>
        <div class="kpi"><div class="v" style="color:${fuera ? "var(--rosa-t)" : "inherit"}">${fuera}</div><div class="l">Fuera de la tienda (GPS)</div></div>
        <div class="kpi"><div class="v">${porAprobar}</div><div class="l">Pedidos por aprobar</div></div></div>
      ${Object.entries(porVend).map(([n, vs]) => {
        const ini = vs[0].checkin_at, fin = vs.filter((v) => v.checkout_at).slice(-1)[0]?.checkout_at;
        return `<div class="card"><div class="row" style="margin-bottom:10px"><div class="ava">${esc(iniciales(n))}</div><div class="grow"><h3>${esc(n)}</h3>
          <div class="small muted">Inicio ${fmtHora(ini)} · ${fin ? "último cierre " + fmtHora(fin) : "sin cierres"} · ${vs.length} visita(s)</div></div></div>
          <div class="scroll-x"><table class="t"><tr><th>Tienda</th><th>Entrada</th><th>Salida</th><th>Min</th><th>GPS</th><th>Fotos</th><th>Inv.</th></tr>
          ${vs.map((v) => `<tr><td>${esc(v.tienda)}</td><td>${fmtHora(v.checkin_at)}</td><td>${v.checkout_at ? fmtHora(v.checkout_at) : `<span class="pill p-azul">En tienda</span>`}</td>
            <td>${v.minutos_en_tienda != null ? fmtNum(v.minutos_en_tienda, 0) : "–"}</td>
            <td>${v.checkin_dentro === false || v.checkout_dentro === false ? `<span class="pill p-rosa">Fuera</span>` : v.checkin_dentro ? `<span class="pill p-menta">OK</span>` : `<span class="pill p-gris">s/coord.</span>`}</td>
            <td>${v.num_fotos}</td><td>${v.con_inventario ? "✓" : "–"}</td></tr>`).join("")}</table></div></div>`;
      }).join("") || `<div class="empty card flat"><div class="ic">${ic("reloj", 34)}</div>Todavía no hay visitas hoy.</div>`}`;
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
