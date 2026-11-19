// Resumen (dashboard): efectividad de visitas, pedidos vs objetivo, alertas de agotados sin pedido
const R = {
  periodos: [["hoy", "Hoy"], ["semana", "Esta semana"], ["semana_pasada", "Semana pasada"], ["mes", "Mes actual"], ["mes_anterior", "Mes anterior"], ["rango", "Rango de fechas"]],

  rango(p) {
    const hoy = hoyISO(), d = new Date(hoy + "T12:00:00"), iso = (x) => x.toISOString().slice(0, 10);
    const lunes = new Date(d.getTime() - (((d.getDay() + 6) % 7) * 864e5));
    if (p === "hoy") return [hoy, hoy];
    if (p === "semana") return [iso(lunes), hoy];
    if (p === "rango") { const a = LS.get("res.d1", hoy.slice(0, 8) + "01"), b = LS.get("res.d2", hoy); return a <= b ? [a, b] : [b, a]; }
    if (p === "mes_anterior") { const f = new Date(hoy.slice(0, 8) + "01T12:00:00"); f.setDate(0); const fin = iso(f); return [fin.slice(0, 8) + "01", fin]; }
    if (p === "semana_pasada") return [iso(new Date(lunes.getTime() - 7 * 864e5)), iso(new Date(lunes.getTime() - 864e5))];
    return [hoy.slice(0, 8) + "01", hoy];
  },
  fechas(a, b) { const out = []; for (let t = new Date(a + "T12:00:00"); t.toISOString().slice(0, 10) <= b; t = new Date(t.getTime() + 864e5)) out.push(t.toISOString().slice(0, 10)); return out; },
  dia(iso) { return new Date(iso + "T12:00:00").getDay() || 7; },
  // Límites del período en hora de Panamá, para filtrar timestamps
  ts(a, b) { return [a + "T00:00:00-05:00", b + "T23:59:59-05:00"]; },

  async render(root, periodo = LS.get("res.p", "hoy"), vend = LS.get("res.v", "")) {
    LS.set("res.p", periodo); LS.set("res.v", vend);
    const gen = (root._resGen = (root._resGen || 0) + 1); // si se vuelve a pintar mientras carga, esta carga se descarta
    const [desde, hasta] = this.rango(periodo), [t0, t1] = this.ts(desde, hasta), hoy = hoyISO(), mes0 = hasta.slice(0, 8) + "01", finMes = hasta < hoy ? hasta : hoy; // mes del período elegido
    root.innerHTML = `<div class="top"><div><div class="muted small">${new Date().toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long" })}</div><h1>Resumen</h1></div></div>
      <div class="steps">${this.periodos.map(([k, t]) => `<div class="step ${k === periodo ? "on" : ""}" data-per="${k}">${t}</div>`).join("")}</div>
      ${periodo === "rango" ? `<div class="row" style="gap:8px;flex-wrap:wrap;margin:-4px 0 14px;align-items:flex-end">
        <div><label class="f" style="margin-top:0">Desde</label><input class="in" type="date" id="rd1" value="${desde}" max="${hoy}"></div>
        <div><label class="f" style="margin-top:0">Hasta</label><input class="in" type="date" id="rd2" value="${hasta}" max="${hoy}"></div>
        <button class="btn sm" id="rdok" style="height:44px">Aplicar</button></div>` : ""}
      <div id="rs" class="muted">Cargando…</div>`;
    $$("[data-per]", root).forEach((el) => (el.onclick = () => R.render(root, el.dataset.per, vend)));
    const rok = $("#rdok", root);
    if (rok) rok.onclick = () => { const a = $("#rd1", root).value, b = $("#rd2", root).value; if (!a || !b) return toast("Elige las dos fechas"); LS.set("res.d1", a); LS.set("res.d2", b); R.render(root, "rango", vend); };

    const [asigR, perfR, visR, pedR, itR, alR, objR, pedMesR, prodR, cliR, visMesR, justR, vencR] = await Promise.all([
      sb.from("asignacion_tiendas").select("vendedor_id, cliente_id, dias_semana, clientes(nombre, cadena)"),
      sb.from("perfiles").select("id, nombre, rol, activo").in("rol", ["vendedor", "supervisor"]).eq("activo", true),
      sb.from("v_visitas").select("id, vendedor_id, vendedor, cliente_id, tienda, fecha, checkin_at, checkout_at, minutos_en_tienda, estado, checkin_dentro, checkout_dentro").gte("fecha", desde).lte("fecha", hasta).limit(5000),
      sb.from("v_pedidos").select("id, visita_id, vendedor_id, cliente_id, creado_at, total_kg, estado, documento").neq("estado", "anulado").gte("creado_at", t0).lte("creado_at", t1).limit(5000),
      sb.from("pedido_items").select("producto_id, propuesto, pedidos!inner(creado_at, estado, vendedor_id), productos(nombre, kg_por_pedido, unidades_por_pedido, peso_kg_unidad)").neq("pedidos.estado", "anulado").gte("pedidos.creado_at", t0).lte("pedidos.creado_at", t1).limit(5000),
      sb.from("v_inventario_visita").select("*").gte("fecha", desde).lte("fecha", hasta).or("agotado.eq.true,bajo.eq.true").limit(2000),
      sb.from("objetivos").select("cliente_id, producto_id, objetivo_kg, objetivo_usd, venta_kg, venta_usd, corte").eq("mes", mes0),
      sb.from("v_pedidos").select("vendedor_id, cliente_id, creado_at, total_kg").neq("estado", "anulado").gte("creado_at", mes0 + "T00:00:00-05:00").lte("creado_at", t1).limit(5000),
      sb.from("productos").select("id, nombre, kg_por_pedido, unidad_conteo").eq("activo", true).order("nombre"),
      sb.from("clientes").select("id, modalidad").neq("modalidad", "pedido_tienda"),
      sb.from("v_visitas").select("vendedor_id, fecha").gte("fecha", mes0).lte("fecha", finMes).limit(10000),
      sb.from("visitas_justificadas").select("vendedor_id, cliente_id, fecha, motivo, nota, clientes(nombre)").gte("fecha", mes0 < desde ? mes0 : desde).lte("fecha", finMes > hasta ? finMes : hasta).limit(5000),
      sb.from("v_ultimo_vencimiento").select("cliente_id, producto_id, vence, unidades, fecha_visita, visita_id").lte("vence", new Date(Date.now() + 30 * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Panama" })).order("vence").limit(500),
    ]);
    if (gen !== root._resGen || !$("#rs", root)) return; // la pantalla cambió mientras cargaba
    const err = [asigR, perfR, visR, pedR, itR, alR, objR, pedMesR, prodR, cliR, visMesR].find((r) => r.error);
    if (err) { $("#rs", root).textContent = err.error.message; return; }
    // Clientes que no piden en tienda (El Machetazo: el cliente envía el pedido; Rey: resurtido automático) no cuentan para efectividad ni alertas sin pedido
    const sinPedTienda = new Set(cliR.data.map((c) => c.id)), pideEnTienda = (x) => !sinPedTienda.has(x.cliente_id);

    // Vendedoras = perfiles con tiendas asignadas
    const asigTodas = asigR.data;
    const vendedoras = perfR.data.filter((p) => asigTodas.some((a) => a.vendedor_id === p.id)).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const f = (xs, k = "vendedor_id") => (vend ? xs.filter((x) => (k.includes(".") ? x.pedidos.vendedor_id : x[k]) === vend) : xs);
    const asig = f(asigTodas), vis = f(visR.data), ped = f(pedR.data), items = f(itR.data, "pedidos.vendedor_id"), alertas = f(alR.data).filter(pideEnTienda), pedMes = f(pedMesR.data);
    const visPT = vis.filter(pideEnTienda);
    const misClientes = new Set(asig.map((a) => a.cliente_id));
    const obj = vend ? objR.data.filter((o) => misClientes.has(o.cliente_id)) : objR.data;

    // ---- Agenda: programadas vs realizadas (hasta hoy) ----
    const dias = this.fechas(desde, hasta < hoy ? hasta : hoy);
    const visKey = new Set(vis.map((v) => v.vendedor_id + "|" + v.cliente_id + "|" + v.fecha));
    // Justificadas (reunión en oficina, tienda cerrada, otro): salen de lo programado, salvo que al final sí se visitó
    const justTodas = justR.error ? [] : justR.data, justKey = new Map(justTodas.map((x) => [x.vendedor_id + "|" + x.cliente_id + "|" + x.fecha, x]));
    const prog = [], justif = [];
    dias.forEach((d) => { const w = this.dia(d); asig.forEach((a) => { if ((a.dias_semana || []).includes(w)) { const k = a.vendedor_id + "|" + a.cliente_id + "|" + d, hecha = visKey.has(k); if (justKey.has(k) && !hecha) justif.push({ ...a, fecha: d, j: justKey.get(k) }); else prog.push({ ...a, fecha: d, hecha }); } }); });
    const progN = prog.length, progOk = prog.filter((p) => p.hecha).length;
    const progKey = new Set(prog.map((p) => p.vendedor_id + "|" + p.cliente_id + "|" + p.fecha));
    const fueraAgenda = vis.filter((v) => !progKey.has(v.vendedor_id + "|" + v.cliente_id + "|" + v.fecha)).length;
    // Efectividad: visitas con pedido
    const pedKey = new Set(ped.map((p) => p.cliente_id + "|" + new Date(p.creado_at).toLocaleDateString("en-CA", { timeZone: "America/Panama" })));
    const visConPedido = visPT.filter((v) => ped.some((p) => p.visita_id === v.id) || pedKey.has(v.cliente_id + "|" + v.fecha)).length;
    const visitados = new Set(vis.map((v) => v.cliente_id));
    const sinVisita = [...new Map(prog.filter((p) => !visitados.has(p.cliente_id)).map((p) => [p.cliente_id, p])).values()];
    const conPedido = new Set(ped.map((p) => p.cliente_id));
    const sinPedido = [...new Map(asig.filter((a) => pideEnTienda(a) && !conPedido.has(a.cliente_id) && (periodo === "hoy" ? prog.some((p) => p.cliente_id === a.cliente_id) : true)).map((a) => [a.cliente_id, a])).values()];
    const abiertas = vis.filter((v) => v.estado === "abierta" && v.fecha < hoy).length;
    const minProm = (() => { const m = vis.filter((v) => v.minutos_en_tienda != null).map((v) => Number(v.minutos_en_tienda)); return m.length ? m.reduce((a, b) => a + b, 0) / m.length : null; })();

    // ---- Pedidos (kg) ----
    const kgPer = ped.reduce((a, p) => a + Number(p.total_kg || 0), 0);
    const kgProd = {}; items.forEach((i) => { kgProd[i.producto_id] = (kgProd[i.producto_id] || 0) + kgLinea(i.propuesto, i.productos); });
    const sinVenta = prodR.data.filter((p) => !kgProd[p.id]);
    // ---- Objetivo del mes ----
    const corte = obj.map((o) => o.corte).filter(Boolean).sort().pop();
    const objKg = obj.reduce((a, o) => a + Number(o.objetivo_kg || 0), 0), factKg = obj.reduce((a, o) => a + Number(o.venta_kg || 0), 0);
    const pedPost = pedMes.filter((p) => !corte || new Date(p.creado_at).toLocaleDateString("en-CA", { timeZone: "America/Panama" }) > corte).reduce((a, p) => a + Number(p.total_kg || 0), 0);
    const avance = factKg + pedPost, pcObj = pct(avance, objKg);
    // ---- Alertas ----
    const agotSinPed = alertas.filter((a) => a.agotado && !a.con_pedido), bajoSinPed = alertas.filter((a) => a.bajo && !a.con_pedido);
    R._alertas = [...agotSinPed, ...bajoSinPed];
    const porVisita = {}; [...agotSinPed, ...bajoSinPed].forEach((a) => (porVisita[a.visita_id] = porVisita[a.visita_id] || { ...a, prods: [] }).prods.push(a));
    // Motivo que dio la vendedora cuando cerró sin pedido (ej.: la empresa no tenía producto)
    const idsAl = Object.keys(porVisita).map(Number);
    if (idsAl.length) {
      const { data: mot } = await sb.from("visitas").select("id, sin_pedido_motivo, sin_pedido_nota").in("id", idsAl);
      if (gen !== root._resGen || !$("#rs", root)) return;
      (mot || []).forEach((m) => { if (porVisita[m.id]) Object.assign(porVisita[m.id], { motivo: m.sin_pedido_motivo, motivoNota: m.sin_pedido_nota }); });
    }

    // ---- Por vendedora ----
    const filasV = (vend ? vendedoras.filter((v) => v.id === vend) : vendedoras).map((u) => {
      const pg = prog.filter((p) => p.vendedor_id === u.id), vs = vis.filter((v) => v.vendedor_id === u.id), pd = ped.filter((p) => p.vendedor_id === u.id);
      return { u, prog: pg.length, ok: pg.filter((p) => p.hecha).length, vis: vs.length, visPT: vs.filter(pideEnTienda).length, ped: pd.length, kg: pd.reduce((a, p) => a + Number(p.total_kg || 0), 0),
        conPed: vs.filter(pideEnTienda).filter((v) => pd.some((p) => p.visita_id === v.id) || pd.some((p) => p.cliente_id === v.cliente_id && new Date(p.creado_at).toLocaleDateString("en-CA", { timeZone: "America/Panama" }) === v.fecha)).length,
        alertas: agotSinPed.filter((a) => a.vendedor_id === u.id).length };
    });
    const sinVisitas = filasV.filter((r) => r.prog > 0 && !r.vis), sinPedidos = filasV.filter((r) => r.vis > 0 && !r.ped), conVisitas = filasV.filter((r) => r.vis > 0);

    // ---- Gráficas por día ----
    const diasG = this.fechas(desde, hasta);
    const serie = diasG.map((d) => ({ d, prog: prog.filter((p) => p.fecha === d).length, ok: prog.filter((p) => p.fecha === d && p.hecha).length, vis: vis.filter((v) => v.fecha === d).length,
      kg: ped.filter((p) => new Date(p.creado_at).toLocaleDateString("en-CA", { timeZone: "America/Panama" }) === d).reduce((a, p) => a + Number(p.total_kg || 0), 0) }));

    const asistencia = R.asistencia(vend ? vendedoras.filter((v) => v.id === vend) : vendedoras, asigTodas, visMesR.data, mes0, hoy, justTodas);
    const kpi = (v, l, cls = "", sub = "") => `<div class="kpi ${cls}"><div class="v">${v}</div><div class="l">${l}</div>${sub ? `<div class="tiny muted" style="margin-top:4px">${sub}</div>` : ""}</div>`;
    const fCorta = (d) => new Date(d + "T12:00:00").toLocaleDateString("es-PA", { day: "numeric", month: "short" });
    const etPer = periodo === "rango" ? `del ${fCorta(desde)} al ${fCorta(hasta)}` : periodo === "mes_anterior" ? new Date(desde + "T12:00:00").toLocaleDateString("es-PA", { month: "long" }) : this.periodos.find((x) => x[0] === periodo)[1].toLowerCase();
    $("#rs", root).outerHTML = `
      <select class="in" id="rv" style="margin-bottom:14px"><option value="">Todas las vendedoras</option>${vendedoras.map((u) => `<option value="${u.id}" ${u.id === vend ? "selected" : ""}>${esc(u.nombre)}</option>`).join("")}</select>

      ${agotSinPed.length ? `<div class="card" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:var(--rosa);border-color:#F3C4C0">
        <span style="color:var(--rosa-t)">${ic("alerta", 28)}</span><div class="grow"><b style="color:var(--rosa-t)">Agotados sin pedido · ${esc(etPer)}</b>
        <div class="row" style="flex-wrap:wrap;gap:8px;margin:6px 0">${Object.entries(agotSinPed.reduce((m, a) => { const k = a.producto.replace(/^Queso /, ""); (m[k] = m[k] || new Set()).add(a.cliente_id); return m; }, {})).map(([p, t]) => `<span class="pill" style="background:#fff;color:var(--rosa-t);border:1px solid #F3C4C0">${esc(p)}: ${t.size} tienda${t.size === 1 ? "" : "s"}</span>`).join("")}</div>
        <div class="small">${plur(new Set(agotSinPed.map((a) => a.cliente_id)).size, "tienda")} en total · ${plur(agotSinPed.length, "conteo")} en ${plur(new Set(agotSinPed.map((a) => a.visita_id)).size, "visita")}. <a href="#alertas-res" onclick="event.preventDefault();document.getElementById('alertas-res').scrollIntoView({behavior:'smooth'})">Ver detalle abajo</a>.</div></div>
        ${DB.puede("avisar") ? `<button class="btn sm row" style="gap:6px" onclick="R.avisar('todas')">${ic("megafono", 17)} Avisar a las vendedoras</button>` : ""}</div>` : ""}

      <h3 class="sec-t">Pedidos y objetivo</h3>
      <div class="kpis">
        ${kpi(fmtNum(kgPer, 0) + " kg", "Pedidos capturados · " + esc(etPer), "", `${plur(ped.length, "pedido")}`)}
        ${prodR.data.map((p) => kpi(fmtNum(kgProd[p.id] || 0, 0) + " kg", esc(p.nombre), "", p.kg_por_pedido ? fmtNum((kgProd[p.id] || 0) / p.kg_por_pedido, 1) + " cajas" : "")).join("")}
        ${kpi(sinVenta.length, "Productos sin pedido · " + esc(etPer), sinVenta.length ? "alerta" : "", sinVenta.map((p) => esc(p.nombre)).join(", "))}
      </div>
      ${objKg ? `<div class="card"><div class="row"><div class="grow"><div class="small muted">Objetivo de ${new Date(mes0 + "T12:00:00").toLocaleDateString("es-PA", { month: "long" })}${vend ? "" : " · toda la empresa"}</div>
          <h2>${fmtNum(avance, 0)} kg <span class="muted" style="font-weight:500;font-size:15px">de ${fmtNum(objKg, 0)} kg</span></h2></div><span class="pill ${colorPct(pcObj)}" style="font-size:15px">${pcObj ?? 0}%</span></div>${barra(pcObj)}
        <div class="row small" style="margin-top:10px;flex-wrap:wrap;gap:16px"><span>Facturado${corte ? " al " + fmtFecha(corte + "T12:00:00") : ""}: <b>${fmtNum(factKg, 0)} kg</b></span><span>Pedidos capturados después: <b>${fmtNum(pedPost, 0)} kg</b></span><span>Falta: <b>${fmtNum(Math.max(0, objKg - avance), 0)} kg</b></span></div></div>` : ""}

      ${vendedoras.length ? `<h3 class="sec-t">Cierre del día por vendedora</h3><div class="card">${DB.puede("aviso_cierre") && MSG.pushPosible() && Notification.permission !== "granted" ? `<div class="cd-est mal" style="margin-bottom:10px">${ic("alerta", 16)}<span><b>Este dispositivo no recibe el aviso de cierre.</b> Actívalo en Más › Configuración › Permisos.</span></div>` : ""}
        <div class="tiny muted" style="margin-bottom:8px">Toca una vendedora para ver su tarjeta de hoy y compartirla.</div>
        <div class="list lim5">${(vend ? vendedoras.filter((u) => u.id === vend) : vendedoras).map((u) => { const pr = prog.filter((p) => p.vendedor_id === u.id && p.fecha === hoy), ok = pr.filter((p) => p.hecha).length;
          return `<div class="item" data-cierre="${u.id}|${hoy}" role="button" tabindex="0"><div class="ava">${esc(iniciales(u.nombre))}</div><div class="grow"><div class="t">${esc(u.nombre)}</div><div class="small muted">${pr.length ? `Hoy: ${ok} de ${pr.length} visitas agendadas` : "Ver su cierre de hoy"}</div></div><span class="pill ${!pr.length ? "p-gris" : ok === pr.length ? "p-menta" : "p-azul"}">${!pr.length ? "Ver" : ok === pr.length ? "Cerrado" : "En ruta"}</span></div>`; }).join("")}</div></div>` : ""}
      <h3 class="sec-t">Efectividad de visitas · ${esc(etPer)}</h3>
      <div class="kpis">
        ${kpi(progN, "Visitas programadas", "", dias.length < this.fechas(desde, hasta).length ? "hasta hoy" : "")}
        ${kpi(`${pct(progOk, progN) ?? 0}%`, "Cumplimiento de agenda", "", `${progOk} de ${progN} realizadas`)}
        ${kpi(vis.length, "Visitas realizadas", "", fueraAgenda ? `${fueraAgenda} fuera de agenda` : "")}
        ${kpi(`${pct(visConPedido, visPT.length) ?? 0}%`, "Efectividad (visitas con pedido)", "", `${visConPedido} de ${visPT.length}${vis.length > visPT.length ? ` · ${vis.length - visPT.length} sin pedido en tienda (Machetazo)` : ""}`)}
        ${kpi(sinVisita.length, "Clientes programados sin visita", sinVisita.length ? "alerta" : "")}
        ${kpi(sinPedido.length, "Clientes sin pedido", "", periodo === "hoy" ? "de la ruta de hoy" : "de sus tiendas asignadas")}
        ${kpi(minProm != null ? fmtNum(minProm, 0) + " min" : "–", "Tiempo promedio en tienda")}
        ${kpi(abiertas, "Visitas sin cerrar (días anteriores)", abiertas ? "alerta" : "")}
      </div>

      ${periodo === "hoy" ? "" : `<div class="grid2">
        <div class="card"><div class="row" style="flex-wrap:wrap;gap:8px"><h3 class="grow" style="margin:0">Agenda por día</h3>${R.leyenda([["#DCE5FB", "Programadas"], ["#2F5BEA", "Realizadas"]])}</div>${R.barras(serie, [["prog", "#DCE5FB"], ["ok", "#2F5BEA"]], (s) => `${s.ok}/${s.prog}`)}</div>
        <div class="card"><div class="row" style="flex-wrap:wrap;gap:8px"><h3 class="grow" style="margin:0">Pedidos por día</h3>${R.leyenda([["#2F5BEA", "Kilos"]])}</div>${R.barras(serie, [["kg", "#2F5BEA"]], (s) => fmtNum(s.kg, 0))}</div></div>`}

      <h3 class="sec-t" id="alertas-res">Alertas de inventario</h3>
      <div class="card">${Object.values(porVisita).length ? R.paginar(Object.values(porVisita).sort((a, b) => (b.prods.some((p) => p.agotado) - a.prods.some((p) => p.agotado)) || b.checkin_at.localeCompare(a.checkin_at)).map((a) => `
        <div class="al-fila"><div class="al-t fv-link" data-fv="${a.visita_id}" role="button" tabindex="0"><b>${esc(a.tienda)}</b><span class="tiny muted">${esc(a.vendedor)} · ${fmtFechaHora(a.checkin_at)} · <u>Ver visita</u></span></div>
          <div class="al-p">${a.prods.map((p) => `<span class="pill ${p.agotado ? "p-rosa" : "p-durazno"}">${esc(p.producto.replace(/^Queso /, ""))}: ${p.agotado ? "AGOTADO" : "bajo · " + fmtNum(p.kg, 1) + " kg"}</span>`).join("")}<span class="tiny" style="color:var(--rosa-t)">Sin pedido</span>${a.motivo ? `<span class="pill al-m ${a.motivo === "sin_stock" ? "p-gris" : "p-durazno"}">Motivo: ${esc((MOTIVOS_SIN_PEDIDO.find((m) => m[0] === a.motivo) || [, a.motivo])[1])}${a.motivoNota ? " · " + esc(a.motivoNota) : ""}</span>` : ""}</div>
          ${DB.puede("avisar") ? `<button class="btn sm al-b" onclick="R.avisar(${a.visita_id})">${ic("megafono", 15)} Avisar</button>` : ""}</div>`), "alertas")
        : `<div class="empty"><div class="ic">${ic("ok", 30)}</div>Sin alertas: no hay agotados ni inventario bajo sin pedido en ${esc(etPer)}.</div>`}
        <p class="tiny muted" style="margin:8px 0 0">Agotado: la vendedora lo marcó agotado o contó 0. Bajo: debajo del mínimo de la tienda o, si no hay mínimo, menos del 40% del objetivo semanal. "Sin pedido": no hubo pedido de ese producto en esa visita ni ese día.</p></div>

      ${(() => { // Producto por vencer: lo último que cada vendedora confirmó en cada tienda (próximos 30 días o ya vencido)
        const nomT = Object.fromEntries(asigTodas.map((a) => [a.cliente_id, a.clientes?.nombre])), filas = (vencR.error ? [] : vencR.data).filter((z) => (!vend || misClientes.has(z.cliente_id)) && nomT[z.cliente_id]);
        if (!filas.length) return "";
        const uds = filas.reduce((t, z) => t + Number(z.unidades || 0), 0);
        return `<h3 class="sec-t">Producto por vencer</h3><div class="card"><div class="tiny muted" style="margin-bottom:8px">Según la última visita a cada tienda: ${plur(filas.length, "producto")} en ${plur(new Set(filas.map((z) => z.cliente_id)).size, "tienda")}${uds ? " · " + fmtNum(uds, 0) + " unidades reportadas" : ""}.</div>
          ${R.paginar(filas.map((z) => { const pr = prodR.data.find((q) => q.id === z.producto_id), d = diasPara(z.vence);
            return `<div class="al-fila"><div class="al-t fv-link" data-fv="${z.visita_id}" role="button" tabindex="0"><b>${esc(nomT[z.cliente_id])}</b><span class="tiny muted">${esc((pr?.nombre || "Producto").replace(/^Queso /, ""))} · visto el ${fmtFecha(z.fecha_visita + "T12:00:00")} · <u>Ver visita</u></span></div>
              <div class="al-p"><span class="pill ${d < 0 ? "p-rosa" : d <= 15 ? "p-durazno" : "p-gris"}">${esc(d < 0 ? "Vencido" : faltan(z.vence))}</span>${z.unidades != null ? `<span class="tiny">${fmtNum(z.unidades, 0)} ${esc(plural(Number(z.unidades), pr?.unidad_conteo || "unidad"))}</span>` : ""}</div></div>`; }), "vencer")}</div>`;
      })()}

      <div id="r-espacio"></div>

      ${asistencia}

      <h3 class="sec-t">Por vendedora</h3>
      <div class="card scroll-x lim5"><table class="t"><tr><th>Vendedora</th><th>Estado</th><th>Programadas</th><th>Cumplimiento</th><th>Visitas</th><th>Con pedido</th><th>Pedidos (kg)</th><th>Agotados sin pedido</th></tr>
        ${filasV.map((r) => `<tr><td><b>${esc(r.u.nombre)}</b></td><td>${!r.vis && r.prog ? `<span class="pill p-rosa">Sin visitas</span>` : r.vis && !r.ped ? `<span class="pill p-durazno">Sin pedidos</span>` : r.vis ? `<span class="pill p-menta">Con pedidos</span>` : `<span class="pill">Sin ruta</span>`}</td>
          <td>${r.prog}</td><td><span class="pill ${colorPct(pct(r.ok, r.prog))}">${pct(r.ok, r.prog) ?? "–"}${r.prog ? "%" : ""}</span> <span class="tiny muted">${r.ok}/${r.prog}</span></td>
          <td>${r.vis}</td><td>${r.visPT ? pct(r.conPed, r.visPT) + "%" : "–"}</td><td>${fmtNum(r.kg, 0)}</td><td>${r.alertas ? `<span class="pill p-rosa">${r.alertas}</span>` : "–"}</td></tr>`).join("")}</table></div>
      <div class="kpis">
        ${kpi(conVisitas.length, "Usuarios con visitas")}
        ${kpi(sinVisitas.length, "Usuarios sin visitas", sinVisitas.length ? "alerta" : "", sinVisitas.map((r) => esc(r.u.nombre.split(" ")[0])).join(", "))}
        ${kpi(sinPedidos.length, "Usuarios sin pedidos", sinPedidos.length ? "alerta" : "", sinPedidos.map((r) => esc(r.u.nombre.split(" ")[0])).join(", "))}
      </div>

      <div class="grid2">
        <div class="card"><h3>Clientes programados sin visita</h3>${R.lista(sinVisita.map((p) => [p.clientes?.nombre, (vendedoras.find((u) => u.id === p.vendedor_id)?.nombre || "") + " · " + fmtFecha(p.fecha + "T12:00:00")]))}</div>
        ${justif.length ? `<div class="card"><h3>Visitas justificadas <span class="pill p-gris">${justif.length}</span></h3><div class="tiny muted" style="margin-bottom:6px">Programadas que la vendedora avisó que no haría. No cuentan en el cumplimiento.</div>${R.lista(justif.map((p) => [p.clientes?.nombre, (vendedoras.find((u) => u.id === p.vendedor_id)?.nombre || "") + " · " + fmtFecha(p.fecha + "T12:00:00") + " · " + motivoNoVisita(p.j.motivo) + (p.j.nota ? ": " + p.j.nota : "")]))}</div>` : ""}
        <div class="card"><h3>Clientes sin pedido</h3>${R.lista(sinPedido.map((a) => [a.clientes?.nombre, vendedoras.find((u) => u.id === a.vendedor_id)?.nombre || ""]))}</div>
      </div>`;
    $("#rv", root).onchange = (e) => R.render(root, periodo, e.target.value);
    const esp = $("#r-espacio", root); if (esp) AUD.enResumen(esp, hasta, vend, asig);
    R.pestanas(root);
  },

  // En celular el Resumen se ve por partes: Ventas · Visitas · Inventario · Espacio (en computadora sigue completo).
  // Cada bloque pertenece a la pestaña del título de sección que tiene encima.
  pestanas(root) {
    if (!esCel()) return;
    const rv = $("#rv", root); if (!rv || $("#rtabs", root)) return;
    const grupo = (t) => /pedidos y objetivo/i.test(t) ? "ventas" : /alertas|por vencer/i.test(t) ? "inventario" : /participaci/i.test(t) ? "espacio" : "visitas";
    let g = "inventario"; // lo que va antes del primer título es el aviso de agotados sin pedido
    let hayAlerta = false;
    for (let el = rv.nextElementSibling; el; el = el.nextElementSibling) {
      const tit = el.matches("h3.sec-t") ? el : el.id === "r-espacio" ? el : null;
      if (tit) g = el.id === "r-espacio" ? "espacio" : grupo(tit.textContent);
      else if (g === "inventario" && el.matches(".card") && !el.previousElementSibling?.matches("h3.sec-t")) hayAlerta = true;
      el.dataset.rt = g;
    }
    const tabs = [["ventas", "Ventas"], ["visitas", "Visitas"], ["inventario", "Inventario"], ["espacio", "Espacio"]];
    let act = LS.get("res.tab", "ventas"); if (!tabs.some((t) => t[0] === act)) act = "ventas";
    rv.insertAdjacentHTML("afterend", `<div class="rtabs" id="rtabs">${tabs.map(([k, t]) => `<button data-rt-b="${k}">${t}${k === "inventario" && hayAlerta ? `<i class="dot-n"></i>` : ""}</button>`).join("")}</div>`);
    const ver = (k) => { LS.set("res.tab", k); $$("[data-rt]", root).forEach((el) => (el.hidden = el.dataset.rt !== k)); $$("[data-rt-b]", root).forEach((b) => b.classList.toggle("on", b.dataset.rtB === k)); LIM5.aplicar(); };
    $$("[data-rt-b]", root).forEach((b) => (b.onclick = () => ver(b.dataset.rtB)));
    ver(act);
  },

  // Calendario de asistencia del mes: azul = asistió (tuvo visitas), rojo = falta (tenía ruta y no visitó), gris = sin ruta ese día
  asistencia(vendedoras, asig, visitas, mes0, hoy, just = []) {
    const d0 = new Date(mes0 + "T12:00:00"), nDias = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
    const dias = Array.from({ length: nDias }, (_, i) => { const iso = mes0.slice(0, 8) + String(i + 1).padStart(2, "0"); return { iso, n: i + 1, w: R.dia(iso) }; });
    const inicio = visitas.map((v) => v.fecha).sort()[0] || hoy; // antes de la primera visita en Clarus no hay datos (usaban Handy)
    const activos = new Set(visitas.map((v) => v.fecha));
    const cuenta = {}; visitas.forEach((v) => { const k = v.vendedor_id + "|" + v.fecha; cuenta[k] = (cuenta[k] || 0) + 1; });
    // Cada día es un cuadro con el número de visitas. Azul claro: cumplió su ruta (≥ 90 %). Ámbar: trabajó pero dejó programadas sin hacer ("5 ·1" = 5 hechas, 1 pendiente).
    // Rojo: tenía ruta y no visitó. "F": feriado o día libre (nadie registró visitas).
    const filas = vendedoras.map((u) => {
      const mias = asig.filter((a) => a.vendedor_id === u.id);
      let asis = 0, faltas = 0;
      const celdas = dias.map((d) => {
        const n = cuenta[u.id + "|" + d.iso] || 0, prog0 = mias.filter((a) => (a.dias_semana || []).includes(d.w)).length;
        const nj = Math.min(prog0, just.filter((x) => x.vendedor_id === u.id && x.fecha === d.iso).length), prog = prog0 - nj; // las justificadas no cuentan como programadas
        const fecha = new Date(d.iso + "T12:00:00").toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long" });
        let c = "fut", t = fecha, x = "";
        if (d.iso > hoy) { c = "fut"; x = prog || ""; t += prog ? ` · ${plur(prog, "visita")} programada${prog === 1 ? "" : "s"}` : " · sin ruta"; }
        else if (d.iso < inicio) { c = "libre"; t += " · antes de empezar a usar Clarus"; }
        else if (d.iso < hoy && !activos.has(d.iso)) { c = "libre"; x = "F"; t += " · feriado o día libre (nadie registró visitas)"; }
        else if (n) {
          const falt = Math.max(0, prog - n); asis++;
          if (!prog || n >= prog * 0.9) { c = "ok"; x = n; t += ` · cumplió su ruta: ${plur(n, "visita")}${prog ? " de " + prog : ""}`; }
          else { c = "parcial"; x = `${n}<i>·${falt}</i>`; t += ` · ${plur(n, "visita")}, ${falt} programada${falt === 1 ? "" : "s"} sin hacer`; }
        }
        else if (d.iso === hoy) { c = "hoy"; x = prog ? "0" : ""; t += prog ? ` · hoy, aún sin visitas (${prog} programadas)` : " · hoy, sin ruta"; }
        else if (!prog && nj && d.iso <= hoy) { c = "libre"; x = "J"; t += ` · ${plur(nj, "visita")} justificada${nj === 1 ? "" : "s"}, sin falta`; }
        else if (prog) { c = "falta"; x = "0"; faltas++; t += ` · FALTA: tenía ${plur(prog, "visita")} y no registró ninguna`; }
        else { c = "libre"; t += " · sin ruta"; }
        return `<td><span class="asi ${c}${d.iso === hoy ? " es-hoy" : ""}" title="${esc(t)}">${x}</span></td>`;
      }).join("");
      return `<tr><td class="asi-n">${esc(u.nombre)}</td>${celdas}<td class="asi-t"><b style="color:var(--azul-osc)">${asis}</b></td><td class="asi-t"><b style="color:${faltas ? "var(--rosa-t)" : "inherit"}">${faltas}</b></td></tr>`;
    }).join("");
    const mes = d0.toLocaleDateString("es-PA", { month: "long", year: "numeric" });
    setTimeout(() => { const h = document.querySelector(".asis th.hoyc"), sx = h?.closest(".scroll-x"); if (sx) sx.scrollLeft = Math.max(0, h.offsetLeft - sx.clientWidth + h.offsetWidth * 2.2); }, 60); // abre mostrando hoy y los días anteriores
    return `<h3 class="sec-t">Asistencia · ${esc(mes)}</h3>
      <div class="card"><div class="tiny muted" style="margin-bottom:8px">El número es la cantidad de visitas registradas ese día. «5 ·1» = 5 hechas y 1 programada sin hacer. «J» = no visitó, pero justificó sus tiendas.</div>
      <div class="scroll-x"><table class="asis"><tr><th class="asi-n">Vendedora</th>${dias.map((d) => `<th class="${d.iso === hoy ? "hoyc" : ""}"><div class="tiny muted">${DIAS_C[d.w]}</div>${d.n}</th>`).join("")}<th class="asi-t">Asist.</th><th class="asi-t">Faltas</th></tr>${filas}</table></div>
      <div class="asi-ley tiny muted"><span><span class="asi ok"></span> Cumplió</span><span><span class="asi parcial"></span> Dejó visitas sin hacer</span><span><span class="asi falta"></span> No asistió</span><span><span class="asi libre">F</span> Feriado o libre</span>${inicio > mes0 ? `<span>Registro en Clarus desde el ${new Date(inicio + "T12:00:00").toLocaleDateString("es-PA", { day: "numeric", month: "long" })}</span>` : ""}</div></div>`;
  },


  // Enviar a la vendedora un comunicado con «Entendido» por agotados/bajos sin pedido
  async avisar(sel) {
    const base = (R._alertas || []).filter((a) => (sel === "todas" ? a.agotado : a.visita_id === sel));
    if (!base.length) return toast("No hay alertas para avisar");
    const prods = [...new Set(base.map((a) => a.producto))];
    const guard = LS.get("aviso.prods", null);
    let elegidos = new Set(prods.filter((p) => !guard || guard.includes(p) || !LS.get("aviso.vistos", []).includes(p)));
    if (sel !== "todas") elegidos = new Set(prods);
    const corto = (p) => p.replace(/^Queso /, "");
    const fecha = (a) => new Date(a.checkin_at).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short" });
    const armar = () => {
      const porV = {};
      base.filter((a) => elegidos.has(a.producto)).forEach((a) => {
        const v = (porV[a.vendedor_id] = porV[a.vendedor_id] || { nombre: a.vendedor, t: {} });
        const k = a.cliente_id + "|" + a.fecha;
        (v.t[k] = v.t[k] || { tienda: a.tienda, fecha: fecha(a), prods: [] }).prods.push(corto(a.producto) + (a.agotado ? " AGOTADO" : " bajo"));
      });
      return Object.entries(porV).map(([uid, v]) => {
        const ts = Object.values(v.t), pn = (v.nombre || "").split(" ")[0];
        const titulo = ts.length === 1 ? `Pedido pendiente: ${ts[0].tienda}` : `Pedidos pendientes: ${ts.length} tiendas con agotados`;
        const cuerpo = `Hola ${pn}, en estas visitas registraste producto agotado o bajo y no se hizo pedido:\n\n${ts.map((t) => `• ${t.tienda} (${t.fecha}): ${t.prods.join(", ")}`).join("\n")}\n\nEsperamos tu pedido en la próxima visita a esta(s) tienda(s). Si hay alguna irregularidad, escríbenos por Soporte y explícanos la situación. Toca «Entendido» para confirmar que lo recibiste.`;
        return { uid, nombre: v.nombre, titulo, cuerpo, n: ts.length };
      });
    };
    modal(`<h2 class="row" style="gap:8px"><span style="color:var(--azul)">${ic("megafono", 24)}</span>Avisar a las vendedoras</h2>
      <p class="small muted" style="margin-top:4px">Le llega a su buzón de Clarus y al teléfono, con «Entendido». Si no confirma, se le recuerda cada hora (7 am a 7 pm).</p>
      ${prods.length > 1 ? `<label class="f">Productos a incluir</label><div class="row" style="flex-wrap:wrap;gap:6px">${prods.map((p) => `<button class="btn sm ${elegidos.has(p) ? "" : "sec"}" data-prod="${esc(p)}">${esc(corto(p))}</button>`).join("")}</div>
        <div class="tiny muted" style="margin-top:4px">Quita el producto que no tienes en inventario para pedir (p. ej. Muenster agotado en la empresa).</div>` : ""}
      <label class="f">Nota adicional (opcional)</label><textarea class="in" id="avn" rows="2" placeholder="Ej.: Hay inventario de Mozzarella en bodega para despacho mañana."></textarea>
      <div id="avp" style="margin-top:12px"></div>
      <button class="btn block" style="margin-top:14px" data-env>Enviar</button>`,
    (m, close) => {
      const pintar = () => {
        const msgs = armar();
        $("#avp", m).innerHTML = msgs.length ? `<div class="small"><b>${plur(msgs.length, "vendedora")}</b> recibirán un mensaje:</div>
          ${R.paginar(msgs.map((x) => `<details style="padding:6px 0;border-top:1px solid var(--borde)"><summary><b>${esc(x.nombre)}</b> · ${plur(x.n, "tienda")}</summary><div class="small" style="white-space:pre-wrap;margin-top:6px"><b>${esc(x.titulo)}</b>\n${esc(x.cuerpo)}</div></details>`))}`
          : `<div class="small muted">Con los productos elegidos no hay nada que avisar.</div>`;
        $("[data-env]", m).disabled = !msgs.length;
      };
      $$("[data-prod]", m).forEach((b) => (b.onclick = () => { const p = b.dataset.prod; elegidos.has(p) ? elegidos.delete(p) : elegidos.add(p); b.classList.toggle("sec", !elegidos.has(p)); pintar(); }));
      pintar();
      $("[data-env]", m).onclick = async (e) => {
        const msgs = armar(), nota = $("#avn", m).value.trim();
        if (sel === "todas") { LS.set("aviso.prods", [...elegidos]); LS.set("aviso.vistos", prods); }
        e.target.disabled = true; e.target.textContent = "Enviando…";
        try {
          for (const x of msgs) {
            const { data: c, error } = await sb.from("comunicados").insert({ titulo: x.titulo, cuerpo: x.cuerpo + (nota ? "\n\n" + nota : ""), requiere_ok: true, recordar_min: 60 }).select("id").single();
            if (error) throw error;
            const r2 = await sb.from("comunicado_destinos").insert({ comunicado_id: c.id, user_id: x.uid });
            if (r2.error) throw r2.error;
          }
          DB.funcion("avisos", {}).catch(() => {});
          close(); toast(`Aviso enviado a ${plur(msgs.length, "vendedora")} ✓`);
        } catch (err) { e.target.disabled = false; e.target.textContent = "Enviar"; toast(err.message || String(err)); }
      };
    });
  },

  lista(rows) {
    if (!rows.length) return `<div class="small muted" style="padding:8px 0">Ninguno ✓</div>`;
    return R.paginar(rows.map(([a, b]) => `<div style="padding:7px 0;border-top:1px solid var(--borde)"><div style="font-weight:500">${esc(a || "—")}</div><div class="tiny muted">${esc(b)}</div></div>`));
  },

  // Lista que muestra de 10 en 10 con botón "Ver 10 más"
  // En celular no hay botón: la lista queda en un cuadro de 5 filas que se desliza con el dedo (ver LIM5 en util.js).
  paginar(items, id = "p" + Math.random().toString(36).slice(2, 8), n = 10) {
    if (esCel() && items.length > 5) return `<div class="list pag lim5" data-pag="${id}" style="gap:0">${items.map((h) => `<div class="pag-i">${h}</div>`).join("")}</div>`;
    return `<div class="list pag" data-pag="${id}" style="gap:0">${items.map((h, i) => `<div class="pag-i" ${i >= n ? "hidden" : ""}>${h}</div>`).join("")}</div>
      ${items.length > n ? `<button class="btn ghost sm block" style="margin-top:10px" onclick="R.mas(this, ${n})">Ver ${Math.min(n, items.length - n)} más · quedan ${items.length - n}</button>` : ""}
      <div class="tiny muted" style="margin-top:6px">${items.length} en total</div>`;
  },
  mas(btn, n) {
    const ocultos = [...btn.previousElementSibling.querySelectorAll(".pag-i[hidden]")];
    ocultos.slice(0, n).forEach((el) => (el.hidden = false));
    const quedan = ocultos.length - n;
    if (quedan > 0) btn.textContent = `Ver ${Math.min(n, quedan)} más · quedan ${quedan}`; else btn.remove();
  },


  leyenda(items) { return `<div class="row tiny muted" style="gap:14px;flex-wrap:wrap">${items.map(([c, t]) => `<span class="row" style="gap:6px"><span style="width:12px;height:12px;border-radius:3px;background:${c};display:inline-block"></span>${t}</span>`).join("")}</div>`; },

  // Gráfica de barras (SVG): la primera serie atrás (clara), la segunda encima (oscura)
  barras(serie, claves, etiqueta) {
    if (!serie.length) return "";
    const W = Math.max(560, serie.length * 26), H = 200, pb = 22, pt = 18, max = Math.max(1, ...serie.flatMap((s) => claves.map(([k]) => Number(s[k]) || 0)));
    const gap = W / serie.length, bw = Math.min(gap * 0.5, 22);
    const lineas = [0.25, 0.5, 0.75, 1].map((f) => { const y = H - pb - (H - pb - pt) * f; return `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="#F1F3F7"/>`; }).join("");
    const bars = serie.map((s, i) => {
      const x0 = i * gap + (gap - bw) / 2;
      const r = claves.map(([k, c]) => { const v = Number(s[k]) || 0, h = ((H - pb - pt) * v) / max;
        return `<rect x="${x0}" y="${H - pb - h}" width="${bw}" height="${Math.max(h, v ? 2 : 0)}" rx="3" fill="${c}"><title>${esc(etiqueta(s))}</title></rect>`; }).join("");
      const d = new Date(s.d + "T12:00:00");
      return r + `<text x="${x0 + bw / 2}" y="${H - 10}" font-size="10" text-anchor="middle" fill="#9AA3B2">${serie.length > 10 ? d.getDate() : d.toLocaleDateString("es-PA", { weekday: "short" }).slice(0, 3)}</text>`
        + (claves.some(([k]) => Number(s[k])) ? `<text x="${x0 + bw / 2}" y="${H - pb - ((H - pb - pt) * Math.max(...claves.map(([k]) => Number(s[k]) || 0))) / max - 6}" font-size="9.5" font-weight="600" text-anchor="middle" fill="#5B6577">${etiqueta(s)}</text>` : "");
    }).join("");
    return `<div class="scroll-x" style="margin-top:10px"><svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:420px;max-height:240px">${lineas}${bars}</svg></div>`;
  },

};
