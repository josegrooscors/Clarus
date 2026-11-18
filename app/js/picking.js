// Picking: todo el flujo en una sola sección.
// Operaciones: elige pedidos → arma una ruta con su transporte → pesa cada caja desde el teléfono → envía a Administración.
// Administración (y admin): en la pestaña "Por facturar" abre la ruta enviada y marca cada pedido como Facturada.
const PK = {
  sel: new Set(),
  ESTADOS: { armando: ["Pesando", "p-durazno"], enviado: ["En administración", "p-azul"], facturado: ["Facturado", "p-menta"], anulado: ["Anulado", "p-gris"] },
  factura: () => ["admin", "administracion"].includes(DB.perfil?.rol),
  fCorta: (d) => new Date(d + "T12:00:00").toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short" }),

  // ---------- Operaciones ----------
  async render(root, id) {
    if (id) return this.despacho(root, Number(id));
    let tab = LS.get("pk.tab", DB.perfil?.rol === "administracion" ? "facturar" : "preparar"), agrupar = LS.get("pk.agrupar", "vendedor");
    const pintar = async () => {
      root.innerHTML = `<div class="top"><div><div class="muted small">Preparación, despacho y facturación</div><h1>Picking</h1></div></div>
        <div class="steps">${[["preparar", "Por preparar"], ["rutas", "Rutas de despacho"], ["facturar", "Por facturar"]].map(([k, t]) => `<div class="step ${k === tab ? "on" : ""}" data-tab="${k}">${t}</div>`).join("")}</div>
        <div id="pkc" class="muted">Cargando…</div>`;
      $$("[data-tab]", root).forEach((el) => (el.onclick = () => { tab = el.dataset.tab; LS.set("pk.tab", tab); pintar(); }));
      if (tab === "rutas") return this.listaRutas($("#pkc", root));
      if (tab === "facturar") return this.listaRutas($("#pkc", root), true);
      const desde = new Date(Date.now() - 21 * 864e5).toISOString();
      const [{ data: peds, error }, { data: items }, { data: asig }] = await Promise.all([
        sb.from("v_pedidos").select("id, cliente_id, tienda, cadena, vendedor_id, vendedor, creado_at, estado, numero_orden, documento, nota_vendedor, id_local")
          .is("despacho_id", null).is("facturado_at", null).not("estado", "in", "(anulado,rechazado)").gte("creado_at", desde).or("id_local.is.null,id_local.not.like.handy-*").order("creado_at").limit(500),
        sb.from("pedido_items").select("pedido_id, producto_id, propuesto, aprobado, productos(nombre, kg_por_pedido, unidades_por_pedido, peso_kg_unidad)").gt("propuesto", 0),
        sb.from("asignacion_tiendas").select("cliente_id, orden, clientes(zona)"),
      ]);
      if (error) { $("#pkc", root).textContent = error.message; return; }
      const it = {}; (items || []).forEach((x) => (it[x.pedido_id] = it[x.pedido_id] || []).push(x));
      const zona = {}, ord = {}; (asig || []).forEach((a) => { zona[a.cliente_id] = a.clientes?.zona || "Sin grupo"; ord[a.cliente_id] = a.orden ?? 999; });
      const lista = peds.filter((p) => it[p.id]);
      this.sel = new Set([...this.sel].filter((x) => lista.some((p) => p.id === x)));
      const grupos = {};
      lista.forEach((p) => { const g = agrupar === "vendedor" ? p.vendedor || "Sin vendedora" : zona[p.cliente_id] || "Sin grupo"; (grupos[g] = grupos[g] || []).push(p); });
      const cajas = (p) => it[p.id].map((x) => `${fmtNum(Number(x.aprobado ?? x.propuesto), 1)} ${esc(x.productos.nombre.replace(/^Queso /, ""))}`).join(" · ");
      $("#pkc", root).outerHTML = `<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:12px"><span class="small muted">Agrupar por</span>
          ${[["vendedor", "Vendedora"], ["zona", "Grupo de ruta"]].map(([k, t]) => `<button class="btn sm ${agrupar === k ? "" : "sec"}" data-agr="${k}">${t}</button>`).join("")}</div>
        ${lista.length ? Object.entries(grupos).sort((a, b) => a[0].localeCompare(b[0])).map(([g, ps]) => `<div class="card pk-grupo">
          <div class="check pk-todos ${ps.every((p) => this.sel.has(p.id)) ? "on" : ""}" data-grupo="${esc(g)}"><div class="box">✓</div><b class="grow">${esc(g)}</b><span class="tiny muted">${plur(ps.length, "pedido")}</span></div>
          ${R.paginar(ps.sort((a, b) => (ord[a.cliente_id] ?? 999) - (ord[b.cliente_id] ?? 999)).map((p) => `<div class="check pk-ped ${this.sel.has(p.id) ? "on" : ""}" data-ped="${p.id}"><div class="box">✓</div>
            <div class="grow"><div class="t">${esc(p.tienda)}</div><div class="tiny muted">${esc(p.vendedor || "")} · ${fmtFecha(p.creado_at)} ${fmtHora(p.creado_at)}${p.documento ? " · orden escaneada" : ""}</div></div>
            <span class="small"><b>${cajas(p)}</b></span></div>`))}</div>`).join("")
        : `<div class="empty card flat"><div class="ic">${ic("caja", 34)}</div>No hay pedidos por preparar.</div>`}
        <div class="pk-barra" id="pkb"></div>`;
      const barra = () => {
        const ps = lista.filter((p) => this.sel.has(p.id));
        const kg = ps.reduce((a, p) => a + it[p.id].reduce((b, x) => b + kgLinea(x.aprobado ?? x.propuesto, x.productos), 0), 0);
        $("#pkb").innerHTML = ps.length ? `<div class="grow"><b>${plur(ps.length, "pedido")}</b> · ${plur(new Set(ps.map((p) => p.cliente_id)).size, "tienda")} · ≈ ${fmtKg(kg)}</div><button class="btn" data-crear>Crear ruta de despacho</button>` : "";
        $("#pkb").hidden = !ps.length;
        const b = $("[data-crear]"); if (b) b.onclick = () => this.crear(ps, ord, agrupar === "vendedor" ? null : zona);
      };
      $$("[data-agr]").forEach((b) => (b.onclick = () => { agrupar = b.dataset.agr; LS.set("pk.agrupar", agrupar); pintar(); }));
      $$("[data-ped]").forEach((el) => (el.onclick = () => { const id2 = +el.dataset.ped; this.sel.has(id2) ? this.sel.delete(id2) : this.sel.add(id2); el.classList.toggle("on"); barra(); }));
      $$("[data-grupo]").forEach((el) => (el.onclick = () => {
        const ps = grupos[el.dataset.grupo], todos = ps.every((p) => this.sel.has(p.id));
        ps.forEach((p) => (todos ? this.sel.delete(p.id) : this.sel.add(p.id))); pintar();
      }));
      barra();
    };
    await pintar();
  },

  async crear(ps, ord, zona) {
    const manana = new Date(Date.now() + 864e5 - 5 * 3600e3).toISOString().slice(0, 10);
    const nombres = [...new Set(ps.map((p) => (zona ? zona[p.cliente_id] : (p.vendedor || "").split(" ")[0])))].filter(Boolean).join(" + ");
    const { data: tr } = await sb.from("transportes").select("id, nombre").eq("activo", true).order("nombre");
    const ops = (lista, sel) => `<option value="">Elige el transporte…</option>${lista.map((t) => `<option value="${t.id}" ${t.id === sel ? "selected" : ""}>${esc(t.nombre)}</option>`).join("")}<option value="nuevo">+ Agregar transporte nuevo</option>`;
    let transportes = tr || [];
    modal(`<h2>Nueva ruta de despacho</h2>
      <label class="f">Transporte</label><select class="in" id="dt">${ops(transportes, LS.get("pk.transp") ? Number(LS.get("pk.transp")) : null)}</select>
      <div id="dtn" class="row" style="gap:6px;margin-top:6px;display:${transportes.length ? "none" : "flex"}"><input class="in sp" id="dtnn" placeholder="Nombre de la empresa de transporte"><button class="btn sm" id="dtna">Agregar</button></div>
      <label class="f">Nombre de la ruta</label><input class="in" id="dn" value="${esc(nombres || "Ruta")}">
      <label class="f">Fecha de entrega</label><input class="in" type="date" id="df" value="${manana}">
      <p class="small muted">${plur(ps.length, "pedido")} en ${plur(new Set(ps.map((p) => p.cliente_id)).size, "tienda")}. El orden sigue la ruta de cada vendedora.</p>
      <button class="btn block" data-ok>Crear y empezar a pesar</button>`, (m, close) => {
      const sel = $("#dt", m);
      sel.onchange = () => { $("#dtn", m).style.display = sel.value === "nuevo" ? "flex" : "none"; if (sel.value === "nuevo") $("#dtnn", m).focus(); };
      $("#dtna", m).onclick = async () => {
        const n = $("#dtnn", m).value.trim(); if (!n) return;
        const { data: t, error } = await sb.from("transportes").insert({ nombre: n }).select("id, nombre").single();
        if (error) return toast(error.code === "23505" ? "Ese transporte ya existe" : error.message);
        transportes = [...transportes, t].sort((a, b) => a.nombre.localeCompare(b.nombre));
        sel.innerHTML = ops(transportes, t.id); $("#dtn", m).style.display = "none"; toast("Transporte agregado ✓");
      };
      $("[data-ok]", m).onclick = async (e) => {
        const transporte_id = Number(sel.value) || null;
        if (!transporte_id) { toast("Elige el transporte de la ruta"); sel.focus(); return; }
        const nombre = $("#dn", m).value.trim() || "Ruta", fecha = $("#df", m).value;
        e.target.disabled = true;
        const { data: d, error } = await sb.from("despachos").insert({ nombre, fecha, transporte_id }).select("id").single();
        if (error) { e.target.disabled = false; return toast(error.message); }
        LS.set("pk.transp", String(transporte_id));
        const orden = [...ps].sort((a, b) => (ord[a.cliente_id] ?? 999) - (ord[b.cliente_id] ?? 999) || a.tienda.localeCompare(b.tienda));
        for (let i = 0; i < orden.length; i++) {
          const r = await sb.from("pedidos").update({ despacho_id: d.id, despacho_orden: i + 1 }).eq("id", orden[i].id);
          if (r.error) { toast(r.error.message); break; }
        }
        this.sel.clear(); close(); toast("Ruta creada ✓"); location.hash = "#picking/" + d.id;
      };
    });
  },

  async listaRutas(box, facturacion = false) {
    let q = sb.from("despachos").select("*, transportes(nombre), pedidos(id, facturado_at, pedido_items(propuesto, aprobado), pedido_pesos(id))").order("fecha", { ascending: false }).order("id", { ascending: false }).limit(60);
    q = facturacion ? q.eq("estado", "enviado") : q.neq("estado", "anulado");
    const { data, error } = await q;
    if (error) { box.textContent = error.message; return; }
    const base = "#picking/";
    box.outerHTML = data.length ? `<div class="card">${R.paginar(data.map((d) => {
      const peds = d.pedidos || [], cajas = peds.reduce((a, p) => a + p.pedido_items.reduce((b, x) => b + Math.round(Number(x.aprobado ?? x.propuesto)), 0), 0);
      const pesadas = peds.reduce((a, p) => a + p.pedido_pesos.length, 0), fact = peds.filter((p) => p.facturado_at).length;
      const [et, cl] = this.ESTADOS[d.estado];
      return `<a class="item" href="${base}${d.id}" style="text-decoration:none;color:inherit"><div class="ava" style="color:var(--azul)">${ic("caja", 22)}</div>
        <div class="grow"><div class="t">${esc(d.nombre)}</div><div class="small muted">${d.transportes ? `<b>${esc(d.transportes.nombre)}</b> · ` : ""}Entrega ${this.fCorta(d.fecha)} · ${plur(peds.length, "pedido")} · ${facturacion ? `${fact}/${peds.length} facturados` : `${pesadas}/${cajas} cajas pesadas`}</div></div>
        <span class="pill ${cl}">${et}</span></a>`;
    }))}</div>` : `<div class="empty card flat"><div class="ic">${ic(facturacion ? "factura" : "caja", 34)}</div>${facturacion ? "No hay rutas pendientes de facturar." : "Aún no hay rutas de despacho."}</div>`;
  },

  async cargar(id) {
    const [{ data: d }, { data: peds, error }] = await Promise.all([
      sb.from("despachos").select("*, transportes(nombre, contacto, telefono)").eq("id", id).maybeSingle(),
      sb.from("pedidos").select("id, cliente_id, despacho_orden, facturado_at, factura_num, nota_vendedor, numero_orden, clientes(nombre, direccion, zona), perfiles!pedidos_vendedor_id_fkey(nombre), pedido_items(producto_id, propuesto, aprobado, productos(nombre, kg_por_pedido, precio_kg, unidades_por_pedido, peso_kg_unidad)), pedido_pesos(id, producto_id, kg)")
        .eq("despacho_id", id).order("despacho_orden"),
    ]);
    if (error) throw error;
    return { d, peds: peds || [] };
  },

  async despacho(root, id) {
    let datos;
    try { datos = await this.cargar(id); } catch (e) { root.innerHTML = `<div class="empty card flat">${esc(e.message)}</div>`; return; }
    const { d, peds } = datos;
    if (!d) { root.innerHTML = `<div class="empty card flat">No encontré la ruta.</div><a class="btn sec" href="#picking">Volver</a>`; return; }
    if (d.estado !== "armando") return this.facturacion(root, id, datos);
    const editable = true;
    const totalCajas = peds.reduce((a, p) => a + p.pedido_items.reduce((b, x) => b + Math.round(Number(x.aprobado ?? x.propuesto)), 0), 0);
    const pesadas = peds.reduce((a, p) => a + p.pedido_pesos.length, 0);
    const kgReal = peds.reduce((a, p) => a + p.pedido_pesos.reduce((b, x) => b + Number(x.kg), 0), 0);
    const [et, cl] = this.ESTADOS[d.estado];
    root.innerHTML = `<a href="#picking" class="small no-print" style="text-decoration:none">‹ Picking</a>
      <div class="top"><div><div class="muted small">${d.transportes ? `Transporte <b>${esc(d.transportes.nombre)}</b> · ` : ""}Entrega ${this.fCorta(d.fecha)}</div><h1>${esc(d.nombre)}</h1></div><span class="pill ${cl}">${et}</span></div>
      <div class="kpis"><div class="kpi"><div class="v">${peds.length}</div><div class="l">Tiendas / pedidos</div></div>
        <div class="kpi ${pesadas < totalCajas ? "" : "ok"}"><div class="v">${pesadas}/${totalCajas}</div><div class="l">Cajas pesadas</div></div>
        <div class="kpi"><div class="v">${fmtNum(kgReal, 2)} kg</div><div class="l">Peso real</div></div></div>
      ${peds.map((p, i) => `<div class="card pk-tienda" data-p="${p.id}">
        <div class="row"><span class="pk-n">${i + 1}</span><div class="grow"><b>${esc(p.clientes?.nombre || "")}</b><div class="tiny muted">${esc(p.perfiles?.nombre || "")}${p.clientes?.zona ? " · " + esc(p.clientes.zona) : ""}${p.numero_orden ? " · OC " + esc(p.numero_orden) : ""}</div></div>
          ${editable ? `<button class="btn ghost sm no-print" data-quitar="${p.id}" title="Sacar de la ruta">Quitar</button>` : ""}</div>
        ${p.nota_vendedor ? `<div class="small muted" style="margin-top:4px">Nota: ${esc(p.nota_vendedor)}</div>` : ""}
        ${p.pedido_items.map((x) => {
          const pesos = p.pedido_pesos.filter((w) => w.producto_id === x.producto_id), cj = Math.round(Number(x.aprobado ?? x.propuesto));
          return `<div class="pk-prod"><div class="row"><b class="grow">${esc(x.productos.nombre)}</b><span class="small">Pedido: <b>${plur(fmtNum(Number(x.aprobado ?? x.propuesto), 1), "caja")}</b></span></div>
            <div class="pk-pesos">${pesos.map((w, j) => `<span class="pk-peso">Caja ${j + 1}: <b>${fmtNum(Number(w.kg), 2)} kg</b>${editable ? `<button class="no-print" data-borrar="${w.id}" aria-label="Borrar">×</button>` : ""}</span>`).join("")}
              ${editable ? `<span class="pk-in no-print"><input class="in" type="text" inputmode="decimal" placeholder="Peso caja ${pesos.length + 1} (kg)" data-peso="${p.id}:${x.producto_id}"><button class="btn sm" data-add="${p.id}:${x.producto_id}">+ Caja</button></span>` : ""}</div>
            <div class="tiny ${pesos.length === cj ? "" : "muted"}" style="margin-top:4px">${pesos.length}/${plur(cj, "caja")} · ${fmtNum(pesos.reduce((a, w) => a + Number(w.kg), 0), 2)} kg</div></div>`;
        }).join("")}</div>`).join("")}
      <div class="row no-print" style="gap:8px;flex-wrap:wrap;margin-top:8px">
        <button class="btn ghost" onclick="window.print()">Imprimir hoja de picking</button>
        ${editable ? `<button class="btn" data-enviar ${pesadas ? "" : "disabled"}>Enviar a administración</button><button class="btn peligro ghost" data-anular>Deshacer ruta</button>` : ""}</div>`;
    if (!editable) return;
    const guardar = async (key, input) => {
      const [pid, prod] = key.split(":").map(Number);
      const kg = Number(String(input.value).replace(",", "."));
      if (!(kg > 0 && kg < 200)) { toast("Escribe el peso en kg, ej.: 21.9"); input.focus(); return; }
      const { error } = await sb.from("pedido_pesos").insert({ pedido_id: pid, producto_id: prod, kg });
      if (error) return toast(error.message);
      toast(`Caja de ${fmtNum(kg, 2)} kg ✓`);
      await this.despacho(root, id);
      const nuevo = $(`[data-peso="${key}"]`, root); if (nuevo) nuevo.focus();
    };
    $$("[data-add]", root).forEach((b) => (b.onclick = () => guardar(b.dataset.add, $(`[data-peso="${b.dataset.add}"]`, root))));
    $$("[data-peso]", root).forEach((inp) => (inp.onkeydown = (e) => { if (e.key === "Enter") guardar(inp.dataset.peso, inp); }));
    $$("[data-borrar]", root).forEach((b) => (b.onclick = async () => { const { error } = await sb.from("pedido_pesos").delete().eq("id", b.dataset.borrar); if (error) return toast(error.message); this.despacho(root, id); }));
    $$("[data-quitar]", root).forEach((b) => (b.onclick = async () => {
      if (!(await confirmar("El pedido vuelve a 'Por preparar' y se borran sus pesos.", "Quitar"))) return;
      await sb.from("pedido_pesos").delete().eq("pedido_id", b.dataset.quitar);
      const { error } = await sb.from("pedidos").update({ despacho_id: null, despacho_orden: null }).eq("id", b.dataset.quitar);
      if (error) return toast(error.message); this.despacho(root, id);
    }));
    const env = $("[data-enviar]", root);
    if (env) env.onclick = async () => {
      if (pesadas < totalCajas && !(await confirmar(`Faltan ${plur(totalCajas - pesadas, "caja")} por pesar. ¿Enviar igual?`, "Enviar"))) return;
      const { error } = await sb.from("despachos").update({ estado: "enviado", enviado_at: new Date().toISOString() }).eq("id", id);
      if (error) return toast(error.message);
      toast("Enviado a administración ✓"); this.despacho(root, id);
    };
    const an = $("[data-anular]", root);
    if (an) an.onclick = async () => {
      if (!(await confirmar("Los pedidos vuelven a 'Por preparar' y se borran los pesos.", "Deshacer ruta"))) return;
      for (const p of peds) { await sb.from("pedido_pesos").delete().eq("pedido_id", p.id); await sb.from("pedidos").update({ despacho_id: null, despacho_orden: null }).eq("id", p.id); }
      await sb.from("despachos").update({ estado: "anulado" }).eq("id", id);
      toast("Ruta deshecha"); location.hash = "#picking";
    };
  },

  // ---------- Ruta enviada: Administración marca Facturada (dentro de Picking) ----------
  async facturacion(root, id, datos) {
    if (!datos) { try { datos = await this.cargar(Number(id)); } catch (e) { root.innerHTML = `<div class="empty card flat">${esc(e.message)}</div>`; return; } }
    const { d, peds } = datos;
    if (!d) { root.innerHTML = `<div class="empty card flat">No encontré la ruta.</div>`; return; }
    const puede = this.factura() && d.estado === "enviado";
    const kgP = (p) => p.pedido_pesos.reduce((a, w) => a + Number(w.kg), 0);
    const usdP = (p) => p.pedido_pesos.reduce((a, w) => a + Number(w.kg) * Number(p.pedido_items.find((x) => x.producto_id === w.producto_id)?.productos?.precio_kg || 0), 0);
    const fact = peds.filter((p) => p.facturado_at).length;
    root.innerHTML = `<a href="#picking" class="small no-print" style="text-decoration:none">‹ Picking</a>
      <div class="top"><div><div class="muted small">${d.transportes ? `Transporte <b>${esc(d.transportes.nombre)}</b>${d.transportes.telefono ? " · " + esc(d.transportes.telefono) : ""} · ` : ""}Entrega ${this.fCorta(d.fecha)}${d.enviado_at ? " · enviado " + fmtFecha(d.enviado_at) + " " + fmtHora(d.enviado_at) : ""}</div><h1>${esc(d.nombre)}</h1></div><span class="pill ${this.ESTADOS[d.estado][1]}">${this.ESTADOS[d.estado][0]}</span></div>
      <div class="kpis"><div class="kpi"><div class="v">${fact}/${peds.length}</div><div class="l">Pedidos facturados</div></div>
        <div class="kpi"><div class="v">${fmtNum(peds.reduce((a, p) => a + kgP(p), 0), 2)} kg</div><div class="l">Peso real total</div></div>
        <div class="kpi"><div class="v">${fmtUsd(peds.reduce((a, p) => a + usdP(p), 0))}</div><div class="l">Monto aprox. (precio lista)</div></div></div>
      <div class="card scroll-x"><table class="t"><tr><th>#</th><th>Tienda</th><th>Producto · cajas (kg)</th><th>Kg</th><th>Monto aprox.</th><th class="no-print">${this.factura() ? "Factura" : "Estado"}</th></tr>
        ${peds.map((p, i) => `<tr><td>${i + 1}</td><td><b>${esc(p.clientes?.nombre || "")}</b><div class="tiny muted">${esc(p.perfiles?.nombre || "")}${p.numero_orden ? " · OC " + esc(p.numero_orden) : ""}</div></td>
          <td class="small">${p.pedido_items.map((x) => { const ws = p.pedido_pesos.filter((w) => w.producto_id === x.producto_id); return `${esc(x.productos.nombre.replace(/^Queso /, ""))}: ${ws.length ? ws.map((w) => fmtNum(Number(w.kg), 2)).join(" + ") : "<span class='muted'>sin pesar</span>"}`; }).join("<br>")}</td>
          <td><b>${fmtNum(kgP(p), 2)}</b></td><td>${fmtUsd(usdP(p))}</td>
          <td class="no-print">${p.facturado_at ? `<span class="pill p-menta">Facturado${p.factura_num ? " #" + esc(p.factura_num) : ""}</span>` : puede ? `<div class="row" style="gap:6px"><input class="in" style="width:110px;padding:6px 8px" placeholder="N.º factura" data-num="${p.id}"><button class="btn sm" data-fact="${p.id}">Facturada</button></div>` : `<span class="pill p-azul">Por facturar</span>`}</td></tr>`).join("")}</table></div>
      <div class="row no-print" style="gap:8px;flex-wrap:wrap"><button class="btn ghost" onclick="window.print()">Imprimir</button>
        ${d.estado === "enviado" && !peds.some((p) => p.facturado_at) && DB.perfil?.rol !== "administracion" ? `<button class="btn ghost" data-reabrir>Volver a pesar</button>` : ""}</div>`;
    const re = $("[data-reabrir]", root);
    if (re) re.onclick = async () => { const { error } = await sb.from("despachos").update({ estado: "armando", enviado_at: null }).eq("id", d.id); if (error) return toast(error.message); this.despacho(root, d.id); };
    $$("[data-fact]", root).forEach((b) => (b.onclick = async () => {
      const num = $(`[data-num="${b.dataset.fact}"]`, root).value.trim();
      const { error } = await sb.from("pedidos").update({ facturado_at: new Date().toISOString(), facturado_por: DB.user.id, factura_num: num || null }).eq("id", b.dataset.fact);
      if (error) return toast(error.message);
      const quedan = peds.filter((p) => !p.facturado_at && String(p.id) !== b.dataset.fact).length;
      if (!quedan) await sb.from("despachos").update({ estado: "facturado" }).eq("id", d.id);
      toast("Facturado ✓"); this.facturacion(root, id);
    }));
  },
};
