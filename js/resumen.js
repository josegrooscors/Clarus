// Resumen (dashboard): efectividad de visitas, pedidos vs objetivo, alertas de agotados sin pedido
const R = {
  periodos: [["hoy", "Hoy"], ["semana", "Esta semana"], ["semana_pasada", "Semana pasada"], ["mes", "Mes actual"]],

  rango(p) {
    const hoy = hoyISO(), d = new Date(hoy + "T12:00:00"), iso = (x) => x.toISOString().slice(0, 10);
    const lunes = new Date(d.getTime() - (((d.getDay() + 6) % 7) * 864e5));
    if (p === "hoy") return [hoy, hoy];
    if (p === "semana") return [iso(lunes), hoy];
    if (p === "semana_pasada") return [iso(new Date(lunes.getTime() - 7 * 864e5)), iso(new Date(lunes.getTime() - 864e5))];
    return [hoy.slice(0, 8) + "01", hoy];
  },
  fechas(a, b) { const out = []; for (let t = new Date(a + "T12:00:00"); t.toISOString().slice(0, 10) <= b; t = new Date(t.getTime() + 864e5)) out.push(t.toISOString().slice(0, 10)); return out; },
  dia(iso) { return new Date(iso + "T12:00:00").getDay() || 7; },
  // Límites del período en hora de Panamá, para filtrar timestamps
  ts(a, b) { return [a + "T00:00:00-05:00", b + "T23:59:59-05:00"]; },

  async render(root, periodo = LS.get("res.p", "hoy"), vend = LS.get("res.v", "")) {
    LS.set("res.p", periodo); LS.set("res.v", vend);
    const [desde, hasta] = this.rango(periodo), [t0, t1] = this.ts(desde, hasta), hoy = hoyISO(), mes0 = hoy.slice(0, 8) + "01";
    root.innerHTML = `<div class="top"><div><div class="muted small">${new Date().toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long" })}</div><h1>Resumen</h1></div></div>
      <div class="steps">${this.periodos.map(([k, t]) => `<div class="step ${k === periodo ? "on" : ""}" data-per="${k}">${t}</div>`).join("")}</div>
      <div id="rs" class="muted">Cargando…</div>`;
    $$("[data-per]", root).forEach((el) => (el.onclick = () => R.render(root, el.dataset.per, vend)));

    const [asigR, perfR, visR, pedR, itR, alR, objR, pedMesR, prodR] = await Promise.all([
      sb.from("asignacion_tiendas").select("vendedor_id, cliente_id, dias_semana, clientes(nombre, cadena)"),
      sb.from("perfiles").select("id, nombre, rol, activo").in("rol", ["vendedor", "supervisor"]).eq("activo", true),
      sb.from("v_visitas").select("id, vendedor_id, vendedor, cliente_id, tienda, fecha, checkin_at, checkout_at, minutos_en_tienda, estado, checkin_dentro, checkout_dentro").gte("fecha", desde).lte("fecha", hasta).limit(5000),
      sb.from("v_pedidos").select("id, visita_id, vendedor_id, cliente_id, creado_at, total_kg, estado, documento").neq("estado", "anulado").gte("creado_at", t0).lte("creado_at", t1).limit(5000),
      sb.from("pedido_items").select("producto_id, propuesto, pedidos!inner(creado_at, estado, vendedor_id), productos(nombre, kg_por_pedido, unidades_por_pedido, peso_kg_unidad)").neq("pedidos.estado", "anulado").gte("pedidos.creado_at", t0).lte("pedidos.creado_at", t1).limit(5000),
      sb.from("v_inventario_visita").select("*").gte("fecha", desde).lte("fecha", hasta).or("agotado.eq.true,bajo.eq.true").limit(2000),
      sb.from("objetivos").select("cliente_id, producto_id, objetivo_kg, objetivo_usd, venta_kg, venta_usd, corte").eq("mes", mes0),
      sb.from("v_pedidos").select("vendedor_id, cliente_id, creado_at, total_kg").neq("estado", "anulado").gte("creado_at", mes0 + "T00:00:00-05:00").limit(5000),
      sb.from("productos").select("id, nombre, kg_por_pedido").eq("activo", true).order("nombre"),
    ]);
    const err = [asigR, perfR, visR, pedR, itR, alR, objR, pedMesR, prodR].find((r) => r.error);
    if (err) { $("#rs").textContent = err.error.message; return; }

    // Vendedoras = perfiles con tiendas asignadas
    const asigTodas = asigR.data;
    const vendedoras = perfR.data.filter((p) => asigTodas.some((a) => a.vendedor_id === p.id)).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const f = (xs, k = "vendedor_id") => (vend ? xs.filter((x) => (k.includes(".") ? x.pedidos.vendedor_id : x[k]) === vend) : xs);
    const asig = f(asigTodas), vis = f(visR.data), ped = f(pedR.data), items = f(itR.data, "pedidos.vendedor_id"), alertas = f(alR.data), pedMes = f(pedMesR.data);
    const misClientes = new Set(asig.map((a) => a.cliente_id));
    const obj = vend ? objR.data.filter((o) => misClientes.has(o.cliente_id)) : objR.data;

    // ---- Agenda: programadas vs realizadas (hasta hoy) ----
    const dias = this.fechas(desde, hasta < hoy ? hasta : hoy);
    const visKey = new Set(vis.map((v) => v.vendedor_id + "|" + v.cliente_id + "|" + v.fecha));
    const prog = [];
    dias.forEach((d) => { const w = this.dia(d); asig.forEach((a) => { if ((a.dias_semana || []).includes(w)) prog.push({ ...a, fecha: d, hecha: visKey.has(a.vendedor_id + "|" + a.cliente_id + "|" + d) }); }); });
    const progN = prog.length, progOk = prog.filter((p) => p.hecha).length;
    const progKey = new Set(prog.map((p) => p.vendedor_id + "|" + p.cliente_id + "|" + p.fecha));
    const fueraAgenda = vis.filter((v) => !progKey.has(v.vendedor_id + "|" + v.cliente_id + "|" + v.fecha)).length;
    // Efectividad: visitas con pedido
    const pedKey = new Set(ped.map((p) => p.cliente_id + "|" + new Date(p.creado_at).toLocaleDateString("en-CA", { timeZone: "America/Panama" })));
    const visConPedido = vis.filter((v) => ped.some((p) => p.visita_id === v.id) || pedKey.has(v.cliente_id + "|" + v.fecha)).length;
    const visitados = new Set(vis.map((v) => v.cliente_id));
    const sinVisita = [...new Map(prog.filter((p) => !visitados.has(p.cliente_id)).map((p) => [p.cliente_id, p])).values()];
    const conPedido = new Set(ped.map((p) => p.cliente_id));
    const sinPedido = [...new Map(asig.filter((a) => !conPedido.has(a.cliente_id) && (periodo === "hoy" ? prog.some((p) => p.cliente_id === a.cliente_id) : true)).map((a) => [a.cliente_id, a])).values()];
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
    const porVisita = {}; [...agotSinPed, ...bajoSinPed].forEach((a) => (porVisita[a.visita_id] = porVisita[a.visita_id] || { ...a, prods: [] }).prods.push(a));

    // ---- Por vendedora ----
    const filasV = (vend ? vendedoras.filter((v) => v.id === vend) : vendedoras).map((u) => {
      const pg = prog.filter((p) => p.vendedor_id === u.id), vs = vis.filter((v) => v.vendedor_id === u.id), pd = ped.filter((p) => p.vendedor_id === u.id);
      return { u, prog: pg.length, ok: pg.filter((p) => p.hecha).length, vis: vs.length, ped: pd.length, kg: pd.reduce((a, p) => a + Number(p.total_kg || 0), 0),
        conPed: vs.filter((v) => pd.some((p) => p.visita_id === v.id) || pd.some((p) => p.cliente_id === v.cliente_id && new Date(p.creado_at).toLocaleDateString("en-CA", { timeZone: "America/Panama" }) === v.fecha)).length,
        alertas: agotSinPed.filter((a) => a.vendedor_id === u.id).length };
    });
    const sinVisitas = filasV.filter((r) => r.prog > 0 && !r.vis), sinPedidos = filasV.filter((r) => r.vis > 0 && !r.ped), conVisitas = filasV.filter((r) => r.vis > 0);

    // ---- Gráficas por día ----
    const diasG = this.fechas(desde, hasta);
    const serie = diasG.map((d) => ({ d, prog: prog.filter((p) => p.fecha === d).length, ok: prog.filter((p) => p.fecha === d && p.hecha).length, vis: vis.filter((v) => v.fecha === d).length,
      kg: ped.filter((p) => new Date(p.creado_at).toLocaleDateString("en-CA", { timeZone: "America/Panama" }) === d).reduce((a, p) => a + Number(p.total_kg || 0), 0) }));

    const kpi = (v, l, cls = "", sub = "") => `<div class="kpi ${cls}"><div class="v">${v}</div><div class="l">${l}</div>${sub ? `<div class="tiny muted" style="margin-top:4px">${sub}</div>` : ""}</div>`;
    const etPer = this.periodos.find((x) => x[0] === periodo)[1].toLowerCase();
    $("#rs").outerHTML = `
      <select class="in" id="rv" style="margin-bottom:14px"><option value="">Todas las vendedoras</option>${vendedoras.map((u) => `<option value="${u.id}" ${u.id === vend ? "selected" : ""}>${esc(u.nombre)}</option>`).join("")}</select>

      ${agotSinPed.length ? `<a class="card" href="#alertas-res" style="display:flex;gap:12px;align-items:center;text-decoration:none;color:inherit;background:var(--rosa);border-color:#F3C4C0">
        <span style="color:var(--rosa-t)">${ic("alerta", 28)}</span><div class="grow"><b style="color:var(--rosa-t)">${agotSinPed.length} producto(s) agotado(s) sin pedido</b><div class="small">En ${new Set(agotSinPed.map((a) => a.visita_id)).size} visita(s) de ${etPer}. Ver detalle abajo.</div></div></a>` : ""}

      <h3 class="sec-t">Efectividad de visitas · ${esc(etPer)}</h3>
      <div class="kpis">
        ${kpi(progN, "Visitas programadas", "", dias.length < this.fechas(desde, hasta).length ? "hasta hoy" : "")}
        ${kpi(`${pct(progOk, progN) ?? 0}%`, "Cumplimiento de agenda", "", `${progOk} de ${progN} realizadas`)}
        ${kpi(vis.length, "Visitas realizadas", "", fueraAgenda ? `${fueraAgenda} fuera de agenda` : "")}
        ${kpi(`${pct(visConPedido, vis.length) ?? 0}%`, "Efectividad (visitas con pedido)", "", `${visConPedido} de ${vis.length}`)}
        ${kpi(sinVisita.length, "Clientes programados sin visita", sinVisita.length ? "alerta" : "")}
        ${kpi(sinPedido.length, "Clientes sin pedido", "", periodo === "hoy" ? "de la ruta de hoy" : "de sus tiendas asignadas")}
        ${kpi(minProm != null ? fmtNum(minProm, 0) + " min" : "–", "Tiempo promedio en tienda")}
        ${kpi(abiertas, "Visitas sin cerrar (días anteriores)", abiertas ? "alerta" : "")}
      </div>

      <h3 class="sec-t">Pedidos y objetivo</h3>
      <div class="kpis">
        ${kpi(fmtNum(kgPer, 0) + " kg", "Pedidos capturados · " + esc(etPer), "", `${ped.length} pedido(s)`)}
        ${prodR.data.map((p) => kpi(fmtNum(kgProd[p.id] || 0, 0) + " kg", esc(p.nombre), "", p.kg_por_pedido ? fmtNum((kgProd[p.id] || 0) / p.kg_por_pedido, 1) + " cajas" : "")).join("")}
        ${kpi(sinVenta.length, "Productos sin pedido · " + esc(etPer), sinVenta.length ? "alerta" : "", sinVenta.map((p) => esc(p.nombre)).join(", "))}
      </div>
      ${objKg ? `<div class="card"><div class="row"><div class="grow"><div class="small muted">Objetivo de ${new Date(mes0 + "T12:00:00").toLocaleDateString("es-PA", { month: "long" })}${vend ? "" : " · toda la empresa"}</div>
          <h2>${fmtNum(avance, 0)} kg <span class="muted" style="font-weight:500;font-size:15px">de ${fmtNum(objKg, 0)} kg</span></h2></div><span class="pill ${colorPct(pcObj)}" style="font-size:15px">${pcObj ?? 0}%</span></div>${barra(pcObj)}
        <div class="row small" style="margin-top:10px;flex-wrap:wrap;gap:16px"><span>Facturado${corte ? " al " + fmtFecha(corte + "T12:00:00") : ""}: <b>${fmtNum(factKg, 0)} kg</b></span><span>Pedidos capturados después: <b>${fmtNum(pedPost, 0)} kg</b></span><span>Falta: <b>${fmtNum(Math.max(0, objKg - avance), 0)} kg</b></span></div></div>` : ""}

      ${periodo === "hoy" ? "" : `<div class="grid2">
        <div class="card"><h3>Agenda por día</h3><div class="tiny muted" style="margin-bottom:8px">Programadas vs realizadas</div>${R.barras(serie, [["prog", "#C9D6F2"], ["ok", "var(--azul)"]], (s) => `${s.ok}/${s.prog}`)}</div>
        <div class="card"><h3>Pedidos por día (kg)</h3><div class="tiny muted" style="margin-bottom:8px">&nbsp;</div>${R.barras(serie, [["kg", "var(--azul)"]], (s) => fmtNum(s.kg, 0))}</div>
      </div>`}

      <h3 class="sec-t" id="alertas-res">Alertas de inventario</h3>
      <div class="card">${Object.values(porVisita).length ? `<div class="list">${Object.values(porVisita).sort((a, b) => (b.prods.some((p) => p.agotado) - a.prods.some((p) => p.agotado)) || b.checkin_at.localeCompare(a.checkin_at)).map((a) => `
        <div class="row" style="padding:8px 0;border-top:1px solid var(--borde);align-items:flex-start"><div class="grow"><b>${esc(a.tienda)}</b><div class="tiny muted">${esc(a.vendedor)} · ${fmtFechaHora(a.checkin_at)}</div></div>
          <div style="text-align:right">${a.prods.map((p) => `<div><span class="pill ${p.agotado ? "p-rosa" : "p-durazno"}">${esc(p.producto.replace(/^Queso /, ""))}: ${p.agotado ? "AGOTADO" : "bajo · " + fmtNum(p.kg, 1) + " kg"}</span></div>`).join("")}<div class="tiny" style="color:var(--rosa-t);margin-top:4px">Sin pedido</div></div></div>`).join("")}</div>`
        : `<div class="empty"><div class="ic">${ic("ok", 30)}</div>Sin alertas: no hay agotados ni inventario bajo sin pedido en ${esc(etPer)}.</div>`}
        <p class="tiny muted" style="margin:8px 0 0">Agotado: la vendedora lo marcó agotado o contó 0. Bajo: debajo del mínimo de la tienda o, si no hay mínimo, menos del 40% del objetivo semanal. "Sin pedido": no hubo pedido de ese producto en esa visita ni ese día.</p></div>

      <h3 class="sec-t">Por vendedora</h3>
      <div class="card scroll-x"><table class="t"><tr><th>Vendedora</th><th>Programadas</th><th>Cumplimiento</th><th>Visitas</th><th>Con pedido</th><th>Pedidos (kg)</th><th>Agotados sin pedido</th></tr>
        ${filasV.map((r) => `<tr><td><b>${esc(r.u.nombre)}</b>${!r.vis && r.prog ? ` <span class="pill p-rosa">Sin visitas</span>` : r.vis && !r.ped ? ` <span class="pill p-durazno">Sin pedidos</span>` : ""}</td>
          <td>${r.prog}</td><td><span class="pill ${colorPct(pct(r.ok, r.prog))}">${pct(r.ok, r.prog) ?? "–"}${r.prog ? "%" : ""}</span> <span class="tiny muted">${r.ok}/${r.prog}</span></td>
          <td>${r.vis}</td><td>${r.vis ? pct(r.conPed, r.vis) + "%" : "–"}</td><td>${fmtNum(r.kg, 0)}</td><td>${r.alertas ? `<span class="pill p-rosa">${r.alertas}</span>` : "–"}</td></tr>`).join("")}</table></div>
      <div class="kpis">
        ${kpi(conVisitas.length, "Usuarios con visitas")}
        ${kpi(sinVisitas.length, "Usuarios sin visitas", sinVisitas.length ? "alerta" : "", sinVisitas.map((r) => esc(r.u.nombre.split(" ")[0])).join(", "))}
        ${kpi(sinPedidos.length, "Usuarios sin pedidos", sinPedidos.length ? "alerta" : "", sinPedidos.map((r) => esc(r.u.nombre.split(" ")[0])).join(", "))}
      </div>

      <div class="grid2">
        <div class="card"><h3>Clientes programados sin visita</h3>${R.lista(sinVisita.map((p) => [p.clientes?.nombre, (vendedoras.find((u) => u.id === p.vendedor_id)?.nombre || "") + " · " + fmtFecha(p.fecha + "T12:00:00")]))}</div>
        <div class="card"><h3>Clientes sin pedido</h3>${R.lista(sinPedido.map((a) => [a.clientes?.nombre, vendedoras.find((u) => u.id === a.vendedor_id)?.nombre || ""]))}</div>
      </div>`;
    $("#rv").onchange = (e) => R.render(root, periodo, e.target.value);
  },

  lista(rows, max = 12) {
    if (!rows.length) return `<div class="small muted" style="padding:8px 0">Ninguno ✓</div>`;
    return `<div class="list" style="gap:0">${rows.slice(0, max).map(([a, b]) => `<div style="padding:7px 0;border-top:1px solid var(--borde)"><div style="font-weight:500">${esc(a || "—")}</div><div class="tiny muted">${esc(b)}</div></div>`).join("")}</div>${rows.length > max ? `<div class="tiny muted" style="margin-top:6px">y ${rows.length - max} más</div>` : ""}`;
  },

  // Gráfica de barras simple (SVG)
  barras(serie, claves, etiqueta) {
    if (!serie.length) return "";
    const W = Math.max(280, serie.length * 34), H = 150, pb = 26, pt = 18, max = Math.max(1, ...serie.flatMap((s) => claves.map(([k]) => Number(s[k]) || 0)));
    const bw = (W / serie.length) * 0.62, gap = W / serie.length;
    const bars = serie.map((s, i) => {
      const x0 = i * gap + (gap - bw) / 2;
      const r = claves.map(([k, c], j) => { const v = Number(s[k]) || 0, h = ((H - pb - pt) * v) / max, w = claves.length > 1 ? bw : bw;
        return `<rect x="${x0}" y="${H - pb - h}" width="${w}" height="${Math.max(h, v ? 2 : 0)}" rx="3" fill="${c}"/>`; }).join("");
      const d = new Date(s.d + "T12:00:00");
      return r + `<text x="${x0 + bw / 2}" y="${H - 8}" font-size="10" text-anchor="middle" fill="#8C95A3">${serie.length > 10 ? d.getDate() : d.toLocaleDateString("es-PA", { weekday: "short" }).slice(0, 3)}</text>`
        + (claves.some(([k]) => Number(s[k])) ? `<text x="${x0 + bw / 2}" y="${H - pb - ((H - pb - pt) * Math.max(...claves.map(([k]) => Number(s[k]) || 0))) / max - 4}" font-size="10" text-anchor="middle" fill="#3B4556">${etiqueta(s)}</text>` : "");
    }).join("");
    return `<div class="scroll-x"><svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:${Math.min(W, 600)}px;max-height:180px">${bars}</svg></div>`;
  },
};
