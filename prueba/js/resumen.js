// Resumen (dashboard): efectividad de visitas, pedidos vs objetivo, alertas de agotados sin pedido
const R = {
  periodos: [["hoy", "Hoy"], ["ayer", "Ayer"], ["semana", "Esta semana"], ["semana_pasada", "Semana pasada"], ["mes", "Mes actual"], ["mes_anterior", "Mes anterior"], ["rango", "Rango de fechas"]],

  rango(p) {
    const hoy = hoyISO(), d = new Date(hoy + "T12:00:00"), iso = (x) => x.toISOString().slice(0, 10);
    const lunes = new Date(d.getTime() - (((d.getDay() + 6) % 7) * 864e5));
    if (p === "hoy") return [hoy, hoy];
    if (p === "ayer") { const a = iso(new Date(d.getTime() - 864e5)); return [a, a]; }
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

  async render(root, periodo, vend) {
    // Dos pantallas con los mismos datos: «Dashboard» (indicadores principales y lo que hay que atender) y «Resumen» (el detalle por vistas). Cada una recuerda su período y su filtro.
    const dash = R._modo === "dash", K = dash ? "dash" : "res", cad = dash ? LS.get("dash.c", "") : "";
    periodo = periodo ?? LS.get(K + ".p", dash ? "mes" : "hoy"); vend = vend ?? LS.get(K + ".v", "");
    LS.set(K + ".p", periodo); LS.set(K + ".v", vend);
    const gen = (root._resGen = (root._resGen || 0) + 1); // si se vuelve a pintar mientras carga, esta carga se descarta
    const [desde, hasta] = this.rango(periodo), [t0, t1] = this.ts(desde, hasta), hoy = hoyISO(), mes0 = hasta.slice(0, 8) + "01", finMes = hasta < hoy ? hasta : hoy; // mes del período elegido
    root.innerHTML = `<div class="top"><div><div class="muted small">${new Date().toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long" })}</div><h1>${dash ? "Dashboard" : "Resumen"}</h1></div></div>
      <div class="per-fil"><label><span>Período</span><select class="in" id="per" aria-label="Período">${this.periodos.map(([k, t]) => `<option value="${k}" ${k === periodo ? "selected" : ""}>${t}</option>`).join("")}</select></label></div>
      ${periodo === "rango" ? `<div class="per-rg">
        <label><span>Desde</span><input class="in" type="date" id="rd1" value="${desde}" max="${hoy}"></label>
        <label><span>Hasta</span><input class="in" type="date" id="rd2" value="${hasta}" max="${hoy}"></label>
        <button class="btn sm" id="rdok">Aplicar</button></div>` : ""}
      <div id="rs" class="muted">Cargando…</div>`;
    $("#per", root).onchange = (e) => R.render(root, e.target.value, vend);
    const rok = $("#rdok", root);
    if (rok) rok.onclick = () => { const a = $("#rd1", root).value, b = $("#rd2", root).value; if (!a || !b) return toast("Elige las dos fechas"); LS.set("res.d1", a); LS.set("res.d2", b); R.render(root, "rango", vend); };

    const hace = (n) => new Date(Date.now() - n * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Panama" });
    const [asigR, perfR, visR, pedR, itR, alR, objR, pedMesR, prodR, cliR, visMesR, justR, vencR, visHoyR, facR, invR, ped30R] = await Promise.all([
      sb.from("asignacion_tiendas").select("vendedor_id, cliente_id, dias_semana, clientes(nombre, cadena)"),
      sb.from("perfiles").select("id, nombre, rol, activo").in("rol", ["vendedor", "supervisor"]).eq("activo", true),
      sb.from("v_visitas").select("id, vendedor_id, vendedor, cliente_id, tienda, fecha, checkin_at, checkout_at, minutos_en_tienda, estado, checkin_dentro, checkout_dentro, num_fotos, con_inventario").gte("fecha", desde).lte("fecha", hasta).limit(5000),
      sb.from("v_pedidos").select("id, visita_id, vendedor_id, cliente_id, creado_at, total_kg, estado, documento").neq("estado", "anulado").gte("creado_at", t0).lte("creado_at", t1).limit(5000),
      sb.from("pedido_items").select("producto_id, propuesto, pedidos!inner(creado_at, estado, vendedor_id, cliente_id), productos(nombre, kg_por_pedido, unidades_por_pedido, peso_kg_unidad)").neq("pedidos.estado", "anulado").gte("pedidos.creado_at", t0).lte("pedidos.creado_at", t1).limit(5000),
      sb.from("v_inventario_visita").select("*").gte("fecha", desde).lte("fecha", hasta).or("agotado.eq.true,bajo.eq.true").limit(2000),
      sb.from("objetivos").select("cliente_id, producto_id, objetivo_kg, objetivo_usd, venta_kg, venta_usd, corte").eq("mes", mes0),
      sb.from("v_pedidos").select("vendedor_id, cliente_id, creado_at, total_kg").neq("estado", "anulado").gte("creado_at", mes0 + "T00:00:00-05:00").lte("creado_at", t1).limit(5000),
      sb.from("productos").select("id, nombre, kg_por_pedido, unidad_conteo").eq("activo", true).order("nombre"),
      sb.from("clientes").select("id, nombre, modalidad, cadena").limit(5000),
      sb.from("v_visitas").select("vendedor_id, fecha").gte("fecha", mes0).lte("fecha", finMes).limit(10000),
      sb.from("visitas_justificadas").select("vendedor_id, cliente_id, fecha, motivo, nota, foto_path, foto_at, dist_m, dentro, clientes(nombre)").gte("fecha", mes0 < desde ? mes0 : desde).lte("fecha", finMes > hasta ? finMes : hasta).limit(5000),
      sb.from("v_ultimo_vencimiento").select("cliente_id, producto_id, vence, unidades, fecha_visita, visita_id").lte("vence", new Date(Date.now() + 30 * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Panama" })).order("vence").limit(500),
      sb.from("v_visitas").select("id, vendedor_id, cliente_id, tienda, checkin_at, checkout_at").eq("fecha", hoy).limit(2000),
      sb.rpc("facturacion_desde", { p_desde: MERMA.meses(mes0 < hoy.slice(0, 8) + "01" ? mes0 : hoy.slice(0, 8) + "01", 6)[0] }), // venta facturada y merma por tienda y producto (Tablero Comercial)
      sb.from("v_inventario_visita").select("visita_id, vendedor_id, vendedor, cliente_id, tienda, fecha, checkin_at, producto_id, unidades, kg, agotado").gte("fecha", hace(30)).order("checkin_at", { ascending: false }).limit(5000),
      sb.from("v_pedidos").select("cliente_id, creado_at").neq("estado", "anulado").gte("creado_at", hace(30) + "T00:00:00-05:00").limit(5000),
    ]);
    if (gen !== root._resGen || !$("#rs", root)) return; // la pantalla cambió mientras cargaba
    const err = [asigR, perfR, visR, pedR, itR, alR, objR, pedMesR, prodR, cliR, visMesR].find((r) => r.error);
    if (err) { $("#rs", root).textContent = err.error.message; return; }
    // Clientes que no piden en tienda (El Machetazo: el cliente envía el pedido; Rey: resurtido automático) no cuentan para efectividad ni alertas sin pedido
    const sinPedTienda = new Set(cliR.data.filter((c) => c.modalidad && c.modalidad !== "pedido_tienda").map((c) => c.id)), pideEnTienda = (x) => !sinPedTienda.has(x.cliente_id);

    // Vendedoras = perfiles con tiendas asignadas
    const asigTodas = asigR.data;
    const vendedoras = perfR.data.filter((p) => asigTodas.some((a) => a.vendedor_id === p.id)).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const f = (xs, k = "vendedor_id") => (vend ? xs.filter((x) => (k.includes(".") ? x.pedidos.vendedor_id : x[k]) === vend) : xs);
    // Filtro por cadena (solo en el Dashboard): se queda con lo de las tiendas de esa cadena
    const cadDe = Object.fromEntries(cliR.data.map((c) => [c.id, (c.cadena || "").trim() || "Sin cadena"])), cadenas = [...new Set(Object.values(cadDe))].sort((a, b) => a.localeCompare(b));
    const fc = (xs, de = (x) => x.cliente_id) => (cad ? xs.filter((x) => cadDe[de(x)] === cad) : xs);
    const asig = fc(f(asigTodas)), vis = fc(f(visR.data)), ped = fc(f(pedR.data)), items = fc(f(itR.data, "pedidos.vendedor_id"), (x) => x.pedidos.cliente_id), alertas = fc(f(alR.data)).filter(pideEnTienda), pedMes = fc(f(pedMesR.data));
    const visPT = vis.filter(pideEnTienda);
    const misClientes = new Set(asig.map((a) => a.cliente_id));
    const obj = fc(vend ? objR.data.filter((o) => misClientes.has(o.cliente_id)) : objR.data);

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
    // ---------- Equipo hoy: cómo va cada vendedora en este momento (no depende del período elegido) ----------
    const wHoy = this.dia(hoy), visHoy = visHoyR.error ? [] : visHoyR.data, minAhora = JORNADA.min(), horaAhora = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Panama", hour: "numeric", hour12: false }).format(new Date()));
    const equipo = vendedoras.map((u) => {
      const ag = asigTodas.filter((a) => a.vendedor_id === u.id && (a.dias_semana || []).includes(wHoy)), vs = visHoy.filter((v) => v.vendedor_id === u.id).sort((a, b) => a.checkin_at.localeCompare(b.checkin_at));
      if (!ag.length && !vs.length) return null;
      const hechas = ag.filter((a) => vs.some((v) => v.cliente_id === a.cliente_id && v.checkout_at)).length, justs = ag.filter((a) => justKey.has(u.id + "|" + a.cliente_id + "|" + hoy) && !vs.some((v) => v.cliente_id === a.cliente_id)).length;
      const abierta = vs.find((v) => !v.checkout_at), ult = vs.filter((v) => v.checkout_at).slice(-1)[0], fueraAg = vs.filter((v) => !ag.some((a) => a.cliente_id === v.cliente_id)).length;
      const av = ag.length ? `${hechas} de ${ag.length}` : plur(vs.length, "visita") + " fuera de agenda";
      const [est, tono, txt] = abierta ? ["ruta", "p-azul", `En ${abierta.tienda} · ${av}`]
        : ag.length && hechas + justs >= ag.length ? (hechas ? ["cerro", "p-menta", `Cerró a las ${fmtHora(ult.checkout_at)} · ${av}`] : ["just", "p-gris", `${plur(justs, "tienda")} justificada${justs === 1 ? "" : "s"}`])
        : vs.length ? ["ruta", "p-azul", `Última: ${ult ? ult.tienda : vs[0].tienda} · ${av}`]
        : minAhora <= 480 ? ["espera", "p-gris", `${plur(ag.length, "tienda")} por visitar`]
        : JORNADA.fin(hoy, null, false) ? ["falta", "p-rosa", `No visitó ${ag.length === 1 ? "su tienda" : "sus " + ag.length + " tiendas"}`]
        : ["falta", minAhora <= 510 ? "p-durazno" : "p-rosa", `Sin entrada (era a las 8:00) · ${plur(ag.length, "tienda")} por visitar`];
      // Para el panel: dónde está ahora, su avance y lo que hizo fuera de agenda
      const ahora = abierta ? `En ${abierta.tienda} desde las ${fmtHora(abierta.checkin_at)}` : est === "cerro" ? `Cerró su día a las ${fmtHora(ult.checkout_at)}` : ult ? `Salió de ${ult.tienda} a las ${fmtHora(ult.checkout_at)}` : "";
      const det = [ag.length ? `${hechas} de ${ag.length - justs} visitas` : plur(vs.length, "visita"), vs.length ? "entró " + fmtHora(vs[0].checkin_at) : "", fueraAg ? (ag.length ? `${fueraAg} fuera de agenda` : "todas fuera de agenda") : "", justs && ag.length ? plur(justs, "justificada") : ""].filter(Boolean).join(" · ");
      return { u, est, tono, txt, conVis: vs.length > 0, ahora, det, enTienda: !!abierta, pcA: ag.length - justs > 0 ? Math.round((hechas / (ag.length - justs)) * 100) : null, nVis: vs.length };
    }).filter(Boolean);
    const eqN = (k) => equipo.filter((e) => e.est === k).length, ETQ = { ruta: "En ruta", cerro: "Día cerrado", just: "Justificado", espera: "Por iniciar", falta: "Sin entrada" };
    const ordenEq = { falta: 0, espera: 1, ruta: 2, just: 3, cerro: 4 };
    equipo.sort((a, b) => ordenEq[a.est] - ordenEq[b.est] || a.u.nombre.localeCompare(b.u.nombre));

    // ---------- Ejecución del equipo completo y de cada persona (misma fórmula que la hoja individual) ----------
    const EJ = (() => {
      const minDia = (iso) => JORNADA.min(iso), prom = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
      const de = (pg, vs) => { const dr = [...new Set(pg.map((x) => x.fecha))], dv = new Set(vs.map((v) => v.fecha)), ce = vs.filter((v) => v.checkout_at);
        return { dias: dr.length, asis: dr.filter((d) => dv.has(d)).length, n: pg.length, ok: pg.filter((x) => x.hecha).length, cer: ce.length, fot: ce.filter((v) => Number(v.num_fotos) > 0).length, inv: ce.filter((v) => v.con_inventario).length, vis: vs.length }; };
      const nota = (x) => { const ps = [pct(x.asis, x.dias), pct(x.ok, x.n), pct(x.fot, x.cer), pct(x.inv, x.cer)].filter((q) => q != null); return ps.length ? Math.round(prom(ps)) : null; };
      const pers = vendedoras.map((u) => { const x = de(prog.filter((q) => q.vendedor_id === u.id), vis.filter((v) => v.vendedor_id === u.id)); return { u, ...x, nota: nota(x) }; }).filter((x) => x.dias || x.vis);
      const tot = pers.reduce((t, x) => { ["dias", "asis", "n", "ok", "cer", "fot", "inv", "vis"].forEach((k) => (t[k] += x[k])); return t; }, { dias: 0, asis: 0, n: 0, ok: 0, cer: 0, fot: 0, inv: 0, vis: 0 });
      const jor = {}; vis.forEach((v) => { const k = v.vendedor_id + "|" + v.fecha, x = (jor[k] = jor[k] || { e: 1e9, s: -1 }); x.e = Math.min(x.e, minDia(v.checkin_at)); if (v.checkout_at) x.s = Math.max(x.s, minDia(v.checkout_at)); });
      const js = Object.values(jor), tm = vis.filter((v) => v.minutos_en_tienda != null).map((v) => Number(v.minutos_en_tienda));
      return { pers, tot, nota: nota(tot), e: prom(js.map((x) => x.e)), s: prom(js.filter((x) => x.s >= 0).map((x) => x.s)), t: prom(tm), cortas: vis.filter((v) => v.checkout_at && Number(v.minutos_en_tienda) < 10).length,
        tarde: js.filter((x) => x.e > 480).length, jornadas: js.length };
    })();

    // ---------- Hoja de la vendedora elegida: calificación de ejecución y sus indicadores, contra el promedio del equipo ----------
    const hoja = vend ? (() => {
      const u = vendedoras.find((x) => x.id === vend); if (!u) return null;
      const minDia = (iso) => { const d = new Date(iso), p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Panama", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(d); return (Number(p.find((x) => x.type === "hour").value) % 24) * 60 + Number(p.find((x) => x.type === "minute").value); };
      const prom = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
      const jornada = (vs) => { const m = {}; vs.forEach((v) => { const k = v.vendedor_id + "|" + v.fecha, x = (m[k] = m[k] || { e: 1e9, s: -1 }); x.e = Math.min(x.e, minDia(v.checkin_at)); if (v.checkout_at) x.s = Math.max(x.s, minDia(v.checkout_at)); }); const ds = Object.values(m); return { e: prom(ds.map((x) => x.e)), s: prom(ds.filter((x) => x.s >= 0).map((x) => x.s)) }; };
      const tiempo = (vs) => prom(vs.filter((v) => v.minutos_en_tienda != null).map((v) => Number(v.minutos_en_tienda)));
      const hhmm = (m) => (m == null ? "–" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`); // 24 h, como en el tablero de Handy: cabe y no se confunde mañana con tarde
      const diasRuta = [...new Set(prog.map((x) => x.fecha))], diasVis = new Set(vis.map((v) => v.fecha)), asis = diasRuta.filter((d) => diasVis.has(d)).length;
      const cerradas = vis.filter((v) => v.checkout_at), conFotos = cerradas.filter((v) => Number(v.num_fotos) > 0).length, conInv = cerradas.filter((v) => v.con_inventario).length;
      const pAsis = pct(asis, diasRuta.length), pRuta = pct(progOk, progN), pFot = pct(conFotos, cerradas.length), pInv = pct(conInv, cerradas.length);
      const partes = [pAsis, pRuta, pFot, pInv].filter((x) => x != null), nota = partes.length ? Math.round(prom(partes)) : null;
      const jv = jornada(vis), je = jornada(visR.data), tv = tiempo(vis), te = tiempo(visR.data), cortas = cerradas.filter((v) => Number(v.minutos_en_tienda) < 10).length;
      const sem = (x) => (x == null ? "" : x >= 90 ? "ok" : x >= 70 ? "medio" : "bajo");
      const porProd = prodR.data.map((pr) => { const os = obj.filter((o) => o.producto_id === pr.id), o = os.reduce((t, x) => t + Number(x.objetivo_kg || 0), 0), v = os.reduce((t, x) => t + Number(x.venta_kg || 0), 0); return { n: pr.nombre.replace(/^Queso /, ""), o, v }; }).filter((x) => x.o > 0);
      return { u, nota, sem, pAsis, asis, diasRuta: diasRuta.length, pRuta, pFot, conFotos, pInv, conInv, cerradas: cerradas.length, tv, te, cortas, jv, je, hhmm, porProd };
    })() : null;

    // ---------- Venta facturada y merma (notas de crédito), del Tablero Comercial ----------
    const fac = facR.error || !facR.data ? [] : facR.data.filas || [], facCorte = facR.data?.corte, din = conDinero();
    const nomCli = Object.fromEntries(cliR.data.map((c) => [c.id, c.nombre]));
    const facV = fc(vend ? fac.filter((x) => misClientes.has(x[1])) : fac, (x) => x[1]);
    const mTot = MERMA.de(facV, mes0), mSerie = MERMA.meses(mes0, 6).map((m) => ({ mes: m, ...MERMA.suma(facV, (x) => x[0] === m) }));
    const vendDe = {}; asigTodas.forEach((a) => (vendDe[a.cliente_id] = vendDe[a.cliente_id] || []).push(a.vendedor_id));
    const mVend = vend ? [] : [...vendedoras.map((u) => ({ n: u.nombre, id: u.id, ...MERMA.de(fac, mes0, (x) => (vendDe[x[1]] || []).includes(u.id)) })), { n: "Tiendas sin responsable", ...MERMA.de(fac, mes0, (x) => !vendDe[x[1]]) }].filter((x) => x.mes.m || x.mes.v || x.ant.m).sort((a, b) => (b.mes.p ?? -1) - (a.mes.p ?? -1));
    const mProd = [...prodR.data.map((p) => ({ n: p.nombre.replace(/^Queso /, ""), ...MERMA.de(facV, mes0, (x) => x[2] === p.id) })), { n: "Sin detalle de producto", ...MERMA.de(facV, mes0, (x) => x[2] === 0) }].filter((x) => x.mes.m || x.ant.m);
    const mTiendas = [...new Set(facV.map((x) => x[1]))].map((id) => ({ id, ...MERMA.de(facV, mes0, (x) => x[1] === id) })).filter((x) => x.mes.m > 0 || x.ant.m > 0).sort((a, b) => b.mes.m - a.mes.m || b.ant.m - a.ant.m);

    // ---------- Inventario en tiendas: último conteo (30 días) de cada tienda contra la regla de reposición ----------
    // Compra mensual = promedio de los 3 últimos meses cerrados. Alerta = el mayor entre media caja y 50 % de la compra mensual (40 % si compra 4 cajas o más). Cerca = menos de 1.5 veces la alerta.
    const mesHoy = hoy.slice(0, 8) + "01", cerrados = MERMA.meses(mesHoy, 4).slice(0, 3), compra = {};
    fac.forEach((x) => { if (x[2] && cerrados.includes(x[0])) compra[x[1] + "|" + x[2]] = (compra[x[1] + "|" + x[2]] || 0) + Number(x[3] || 0) / 3; });
    const ultInv = {}; (invR.error ? [] : invR.data).forEach((x) => { const k = x.cliente_id + "|" + x.producto_id; if (!ultInv[k]) ultInv[k] = x; });
    const pedUlt = {}; (ped30R.error ? [] : ped30R.data).forEach((p) => { const d = new Date(p.creado_at).toLocaleDateString("en-CA", { timeZone: "America/Panama" }); if (!pedUlt[p.cliente_id] || d > pedUlt[p.cliente_id]) pedUlt[p.cliente_id] = d; });
    const invT = [...new Map(asig.map((a) => [a.cliente_id, a])).values()].map((a) => {
      const ps = prodR.data.map((p) => { const x = ultInv[a.cliente_id + "|" + p.id]; if (!x) return null;
        const caja = Number(p.kg_por_pedido) || 0, cm = compra[a.cliente_id + "|" + p.id] || 0, kg = Number(x.kg || 0), al = Math.max(caja / 2, (caja && cm >= 4 * caja ? 0.4 : 0.5) * cm), agot = !!x.agotado || kg === 0;
        const est = agot || kg < al ? "bajo" : kg < al * 1.5 ? "medio" : "ok";
        return { n: p.nombre.replace(/^Queso /, ""), x, kg, caja, est, agot, sug: est === "bajo" && caja ? Math.max(1, Math.ceil((Math.max(caja, cm) - kg) / caja)) : 0 }; }).filter(Boolean);
      const base = { id: a.cliente_id, tienda: a.clientes?.nombre || nomCli[a.cliente_id] || "Tienda", vendedor: vendedoras.find((u) => u.id === a.vendedor_id)?.nombre || "" };
      if (!ps.length) return { ...base, ps, est: "sin" };
      const fecha = ps.map((q) => q.x.fecha).sort().pop();
      return { ...base, ps, fecha, visita: ps.find((q) => q.x.fecha === fecha).x.visita_id, est: ps.some((q) => q.est === "bajo") ? "bajo" : ps.some((q) => q.est === "medio") ? "medio" : "ok",
        kg: ps.reduce((t, q) => t + q.kg, 0), cj: ps.reduce((t, q) => t + (q.caja ? q.kg / q.caja : 0), 0), sug: ps.reduce((t, q) => t + q.sug, 0), agotSinPed: ps.some((q) => q.agot) && !(pedUlt[a.cliente_id] >= fecha) };
    });
    const invN = (k) => invT.filter((t) => t.est === k).length, invCon = invT.filter((t) => t.est !== "sin"), inv7 = invCon.filter((t) => t.fecha >= hace(7));
    const invSin7 = invT.filter((t) => pideEnTienda({ cliente_id: t.id }) && !(t.fecha >= hace(7)));
    const ordInv = { bajo: 0, medio: 1, ok: 2, sin: 3 };
    invT.sort((a, b) => ordInv[a.est] - ordInv[b.est] || (b.sug || 0) - (a.sug || 0) || a.tienda.localeCompare(b.tienda));

    const nomCortos = (rs) => { const n = rs.map((r) => esc(r.u.nombre.split(" ")[0])); return n.length > 3 ? n.slice(0, 3).join(", ") + " y " + (n.length - 3) + " más" : n.join(", "); }; // nunca una lista que crece con el equipo
    const kpiIc = (l) => (/inventario|conteo|agotado/i.test(l) ? "caja" : /producto/i.test(l) ? "etiqueta" : /pedido/i.test(l) ? "pedidos" : /cliente|tienda/i.test(l) ? "pin" : /sin cerrar/i.test(l) ? "reloj" : "equipo");
    const kpi = (v, l, cls = "", sub = "") => `<div class="kpi ki ${cls}"><span class="ki-c">${ic(kpiIc(l), 18)}</span><div class="ki-t"><div class="v">${v}</div><div class="l">${l}</div>${sub ? `<div class="tiny muted" style="margin-top:2px">${sub}</div>` : ""}</div></div>`;
    const fCortaD = (d) => new Date(d + "T12:00:00").toLocaleDateString("es-PA", { day: "numeric", month: "short" });
    const fCorta = (d) => new Date(d + "T12:00:00").toLocaleDateString("es-PA", { day: "numeric", month: "short" });
    const etPer = periodo === "rango" ? `del ${fCorta(desde)} al ${fCorta(hasta)}` : periodo === "mes_anterior" ? new Date(desde + "T12:00:00").toLocaleDateString("es-PA", { month: "long" }) : this.periodos.find((x) => x[0] === periodo)[1].toLowerCase();
    const etPer0 = () => (periodo === "hoy" ? "hoy" : periodo === "ayer" ? "ayer" : periodo === "semana" ? "esta semana" : periodo === "mes" ? "este mes" : "en el período");
    // ================= DASHBOARD: indicadores principales, lo que hay que atender, tendencias y dónde mejorar =================
    let porProc = null;
    if (dash && DB.puede("ver_pedidos")) { const q = await sb.from("pedidos").select("id", { count: "exact", head: true }).in("estado", ["propuesto", "aprobado", "orden_escaneada"]).not("id_local", "like", "handy-%"); if (gen !== root._resGen || !$("#rs", root)) return; porProc = q.error ? null : q.count || 0; }
    const dashHtml = !dash ? "" : (() => {
      const sem = (q) => (q == null ? "" : q >= 90 ? "ok" : q >= 70 ? "medio" : "bajo"), metas = DB.puede("ver_metas"), lim = MERMA.lim();
      // Cobertura: tiendas del plan del período que ya se visitaron
      const planT = new Set(prog.map((x) => x.cliente_id)), visT = new Set(prog.filter((x) => x.hecha).map((x) => x.cliente_id)), pCob = pct(visT.size, planT.size);
      // Objetivo del mes contra el ritmo esperado a la fecha de corte
      const dM = new Date(Number(mes0.slice(0, 4)), Number(mes0.slice(5, 7)), 0).getDate(), espObj = mes0 < hoy.slice(0, 8) + "01" ? 100 : Math.round((Number((corte || hoy).slice(8, 10)) / dM) * 100);
      const tObj = pcObj == null ? "" : pcObj >= 100 ? "ok" : (pcObj / (espObj || 100)) * 100 >= 95 ? "ok" : (pcObj / (espObj || 100)) * 100 >= 75 ? "medio" : "bajo";
      const pMer = mTot.mes.p, efec = pct(visConPedido, visPT.length);
      const g4 = [
        R.velo(pCob, sem(pCob), "Cobertura", pCob != null ? pCob + "%" : "–", planT.size ? `${visT.size} de ${plur(planT.size, "tienda")}` : "sin tiendas en el plan"),
        R.velo(EJ.nota, sem(EJ.nota), "Ejecución", EJ.nota != null ? EJ.nota + "%" : "–", "meta 90%", 90),
        metas ? R.velo(pcObj, tObj, "Objetivo de venta", pcObj != null ? pcObj + "%" : "–", objKg ? `ritmo esperado ${espObj}%` : "sin objetivo cargado", objKg ? espObj : null)
              : R.velo(efec, sem(efec), "Visitas con pedido", efec != null ? efec + "%" : "–", `${visConPedido} de ${visPT.length} visitas`),
        R.velo(pMer == null ? null : Math.min(100, (pMer / (lim * 2)) * 100), MERMA.tono(pMer), "Merma", MERMA.fp(pMer), fac.length ? `límite ${fmtNum(lim, 0)}% · ${MERMA.nombreMes(mes0)}` : "sin facturación cargada", 50),
      ].join("");
      // Por atender: solo lo que tiene pendientes, lo más grave primero
      const tAg = new Set(agotSinPed.map((x) => x.cliente_id)).size;
      const at = [
        [tAg, (tAg === 1 ? "Tienda con agotados sin pedido" : "Tiendas con agotados sin pedido"), "Producto en cero y sin pedido después del conteo", "bajo", "tab:inventario"],
        [sinVisita.length, (sinVisita.length === 1 ? "Tienda del plan sin visitar" : "Tiendas del plan sin visitar"), etPer0(), "bajo", "tab:equipo"],
        [invSin7.length, (invSin7.length === 1 ? "Tienda sin conteo" : "Tiendas sin conteo") + " en 7 días", "Con ruta y que piden en tienda", "medio", "tab:inventario"],
        [abiertas, (abiertas === 1 ? "Visita sin cerrar" : "Visitas sin cerrar"), "De días anteriores", "medio", "tab:equipo"],
        [porProc || 0, (porProc === 1 ? "Pedido por procesar" : "Pedidos por procesar"), "Nuevos, sin imprimir ni facturar", "azul", "ruta:pedidos"],
      ].filter((x) => x[0] > 0);
      const nAt = at.reduce((t, x) => t + x[0], 0);
      const fAt = at.map(([n, t, sub, c, ir]) => `<button type="button" class="dsh-at" data-ir="${ir}"><span class="dsh-n ${c}">${n > 999 ? "999+" : n}</span><span class="grow"><b>${esc(t)}</b><span class="tiny muted">${esc(sub)}</span></span><span class="dsh-ver">Ver ›</span></button>`).join("");
      // Tendencias
      const sems = {}; pedMes.forEach((x) => { const d = Number(new Date(x.creado_at).toLocaleDateString("en-CA", { timeZone: "America/Panama" }).slice(8, 10)), k = Math.min(4, Math.floor((d - 1) / 7)); sems[k] = (sems[k] || 0) + Number(x.total_kg || 0); });
      const nSem = Math.min(4, Math.floor((Number((hasta < hoy ? hasta : hoy).slice(8, 10)) - 1) / 7)), serieP = [...Array(nSem + 1)].map((_, i) => [Math.round(sems[i] || 0), "S" + (i + 1) + (i === nSem && mes0 === hoy.slice(0, 8) + "01" ? " (en curso)" : "")]);
      const serieM = mSerie.map((x) => [x.p, MERMA.nombreMes(x.mes, false).replace(".", ""), MERMA.tono(x.p)]);
      // Dónde mejorar
      const fila = (n, sub, pc, val, c, attr = "") => `<div class="inv-f dsh-rk ${attr ? "met-v" : ""}" ${attr}><i class="sem-d ${c || "sin"}"></i><div class="grow"><b>${esc(n)}</b><div class="tiny muted">${esc(sub)}</div><div class="barra"><i class="${c || "ok"}" style="width:${Math.max(0, Math.min(100, pc ?? 0))}%"></i></div></div><b class="inv-v ${c}">${val}${attr ? "<small>ver ›</small>" : ""}</b></div>`;
      const tObjDe = (q) => (q == null ? "" : q >= 100 ? "ok" : (q / (espObj || 100)) * 100 >= 95 ? "ok" : (q / (espObj || 100)) * 100 >= 75 ? "medio" : "bajo");
      const grupo = (clave, nombre) => { const m = {}; obj.forEach((o) => { const k = clave(o), x = (m[k] = m[k] || { o: 0, v: 0, t: new Set() }); x.o += Number(o.objetivo_kg || 0); x.v += Number(o.venta_kg || 0); x.t.add(o.cliente_id); }); return Object.entries(m).filter(([, x]) => x.o > 0).map(([k, x]) => ({ n: nombre(k), ...x, pc: pct(x.v, x.o) })).sort((a, b) => a.pc - b.pc || a.n.localeCompare(b.n)); };
      const rCad = metas ? grupo((o) => cadDe[o.cliente_id] || "Sin cadena", (k) => k) : [], rProd = metas ? grupo((o) => o.producto_id, (k) => (prodR.data.find((q) => String(q.id) === String(k))?.nombre || "Producto").replace(/^Queso /, "")) : [];
      const rRep = [...EJ.pers].sort((a, b) => (a.nota ?? 999) - (b.nota ?? 999) || a.u.nombre.localeCompare(b.u.nombre));
      // Puntaje de tienda (0 a 100): promedio de lo que se conoce de ella: cobertura de sus visitas, inventario, merma contra el límite y avance de su objetivo
      const objT = {}; obj.forEach((o) => { const x = (objT[o.cliente_id] = objT[o.cliente_id] || { o: 0, v: 0 }); x.o += Number(o.objetivo_kg || 0); x.v += Number(o.venta_kg || 0); });
      const invDe = Object.fromEntries(invT.map((t) => [t.id, t]));
      const rTie = [...new Map(asig.map((a) => [a.cliente_id, a])).values()].map((a) => { const id = a.cliente_id, ps = [], mot = [];
        const pg = prog.filter((x) => x.cliente_id === id); if (pg.length) { const c = pct(pg.filter((x) => x.hecha).length, pg.length); ps.push(c); if (c < 100) mot.push([c, `${pg.filter((x) => x.hecha).length} de ${plur(pg.length, "visita")} del plan`]); }
        const iv = invDe[id]; if (iv && iv.est !== "sin") { const c = { ok: 100, medio: 60, bajo: 20 }[iv.est]; ps.push(c); if (c < 100) mot.push([c, iv.ps.some((q) => q.agot) ? "producto agotado" : iv.est === "bajo" ? "inventario bajo" : "inventario cerca de la alerta"]); }
        const me = MERMA.suma(facV, (x) => x[0] === mes0 && x[1] === id); if (me.p != null) { const c = me.p <= lim ? 100 : me.p <= lim * 1.5 ? 60 : 20; ps.push(c); if (c < 100) mot.push([c, "merma " + MERMA.fp(me.p)]); }
        const ob = objT[id]; if (metas && ob && ob.o > 0) { const q = pct(ob.v, ob.o), c = Math.min(100, Math.round((q / (espObj || 100)) * 100)); ps.push(c); if (c < 95) mot.push([c, `venta ${q}% del objetivo`]); }
        return { id, n: a.clientes?.nombre || nomCli[id] || "Tienda", k: ps.length, pts: ps.length ? Math.round(ps.reduce((t, x) => t + x, 0) / ps.length) : null, mot: mot.sort((x, y) => x[0] - y[0]).slice(0, 2).map((x) => x[1]).join(" · "), rep: (vendedoras.find((u) => u.id === a.vendedor_id)?.nombre || "").split(" ")[0] };
      }).filter((t) => t.k >= 2).sort((a, b) => a.pts - b.pts || a.n.localeCompare(b.n));
      const semP = (q) => (q == null ? "" : q >= 85 ? "ok" : q >= 60 ? "medio" : "bajo");
      const rk = [
        ["tienda", "Tienda", "Por tienda", "puntaje de 0 a 100", rTie.map((t) => fila(t.n, (t.mot || "todo en orden") + (t.rep && !vend ? " · " + t.rep : ""), t.pts, t.pts + " pts", semP(t.pts)))],
        ["cadena", "Cadena", "Por cadena", "avance del objetivo", rCad.map((x) => fila(x.n, `${plur(x.t.size, "tienda")} · ${fmtNum(x.v, 0)} de ${fmtNum(x.o, 0)} kg`, x.pc, x.pc + "%", tObjDe(x.pc)))],
        ["producto", "Producto", "Por producto", "avance del objetivo", rProd.map((x) => fila(x.n, `${fmtNum(x.v, 0)} de ${fmtNum(x.o, 0)} kg`, x.pc, x.pc + "%", tObjDe(x.pc)))],
        ["rep", "Representante", "Por representante", "ejecución · toca para ver su hoja", rRep.map((r) => fila(r.u.nombre, `${r.n ? `Ruta ${r.ok} de ${r.n}` : "Sin ruta"} · asistió ${r.asis} de ${r.dias} ${r.dias === 1 ? "día" : "días"}`, r.nota, (r.nota ?? "–") + (r.nota == null ? "" : "%"), sem(r.nota), `data-rep="${r.u.id}" role="button" tabindex="0"`))],
      ].filter((x) => x[4].length);
      const kAct = rk.some((x) => x[0] === LS.get("dash.rk", "tienda")) ? LS.get("dash.rk", "tienda") : rk[0]?.[0];
      return `<div data-g="dash" class="dsh">
        <div class="dsh-g4">${g4}</div>
        <div class="dsh-2">
          <div class="card dsh-c"><div class="dsh-h"><h3>Por atender</h3><span class="tiny muted">${nAt ? plur(nAt, "pendiente") : etPer0()}</span></div>${fAt || `<div class="fv-o menta" style="margin-top:6px">${ic("ok", 16)}<span>Nada pendiente en este período.</span></div>`}</div>
          <div class="dsh-col">
            <div class="card dsh-c"><div class="dsh-h"><h3>Pedidos por semana</h3><span class="tiny muted">kg pedidos · ${esc(MERMA.nombreMes(mes0))}</span></div>${serieP.some((x) => x[0]) ? R.barritas(serieP, (v) => fmtNum(v, 0)) : `<div class="small muted">Sin pedidos este mes.</div>`}</div>
            ${serieM.some((x) => x[0] != null) ? `<div class="card dsh-c"><div class="dsh-h"><h3>Merma · 6 meses</h3><span class="tiny muted">% de la venta · límite ${fmtNum(lim, 0)}%</span></div>${R.barritas(serieM, (v) => (v == null ? "–" : fmtNum(v, 1)), 64)}</div>` : ""}
          </div>
        </div>
        ${rk.length ? `<div class="dsh-h dsh-ht"><h3>Dónde mejorar</h3><span class="tiny muted">lo más urgente primero</span></div>
        <div class="dsh-tabs" role="tablist">${rk.map(([k, t]) => `<button type="button" role="tab" data-dk-b="${k}" class="${k === kAct ? "on" : ""}">${t}</button>`).join("")}</div>
        <div class="dsh-rks">${rk.map(([k, , t, sub, fs]) => `<div class="card dsh-c ${k === kAct ? "on" : ""}" data-dk="${k}"><div class="dsh-h"><h3>${t}</h3><span class="tiny muted">${sub}</span></div>${R.paginar(fs, "dsh" + k, 5)}</div>`).join("")}</div>` : ""}
      </div>`;
    })();

    $("#rs", root).outerHTML = `
      <select class="in" id="rv" style="margin-bottom:14px"><option value="">Todo el equipo</option>${vendedoras.map((u) => `<option value="${u.id}" ${u.id === vend ? "selected" : ""}>${esc(u.nombre)}</option>`).join("")}</select>

      ${agotSinPed.length ? `<div class="card av rojo" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <span style="color:var(--rosa-t)">${ic("alerta", 28)}</span><div class="grow"><b style="color:var(--rosa-t)">Agotados sin pedido · ${esc(etPer)}</b>
        <div class="row" style="flex-wrap:wrap;gap:8px;margin:6px 0">${Object.entries(agotSinPed.reduce((m, a) => { const k = a.producto.replace(/^Queso /, ""); (m[k] = m[k] || new Set()).add(a.cliente_id); return m; }, {})).map(([p, t]) => `<span class="pill" style="background:#fff;color:var(--rosa-t);border:1px solid #F3C4C0">${esc(p)}: ${t.size} tienda${t.size === 1 ? "" : "s"}</span>`).join("")}</div>
        <div class="small">${plur(new Set(agotSinPed.map((a) => a.cliente_id)).size, "tienda")} en total · ${plur(agotSinPed.length, "conteo")} en ${plur(new Set(agotSinPed.map((a) => a.visita_id)).size, "visita")}. <a href="#alertas-res" onclick="event.preventDefault();document.getElementById('alertas-res').scrollIntoView({behavior:'smooth'})">Ver detalle abajo</a>.</div></div>
        ${DB.puede("avisar") ? `<button class="btn sm row" style="gap:6px" onclick="R.avisar('todas')">${ic("megafono", 17)} Avisar al equipo</button>` : ""}</div>` : ""}

      <h3 class="sec-t" data-g="equipo">Equipo hoy</h3>
      ${equipo.length ? `<div class="card desemp panel noche"><div class="lbl">Equipo hoy · ${new Date(hoy + "T12:00:00").toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "short" })}</div>
        <div class="desemp-top"><span class="desemp-pct">${equipo.filter((e) => e.conVis).length} de ${equipo.length}</span><span class="desemp-tag ${eqN("falta") ? "bajo" : eqN("ruta") + eqN("espera") ? "" : "ok"}">${eqN("falta") ? "Hay ausencias" : eqN("ruta") + eqN("espera") ? "En curso" : "Día completo"}</span></div>
        <div class="desemp-sub">personas con visitas registradas hoy</div>
        <div class="barra"><i class="${eqN("falta") ? "medio" : "ok"}" style="width:${Math.round((equipo.filter((e) => e.conVis).length / equipo.length) * 100)}%"></i></div>
        <div class="eqh-ch"><span>${eqN("ruta")} en ruta</span><span>${eqN("cerro")} ${eqN("cerro") === 1 ? "cerró" : "cerraron"} su día</span>${eqN("just") ? `<span>${plur(eqN("just"), "justificada")}</span>` : ""}${eqN("espera") ? `<span>${eqN("espera")} por iniciar</span>` : ""}${eqN("falta") ? `<span class="mal">${eqN("falta")} sin entrada</span>` : ""}</div>
        ${(() => { const act = equipo.filter((e) => e.conVis).sort((a, b) => b.enTienda - a.enTienda || a.u.nombre.localeCompare(b.u.nombre)); if (!act.length) return "";
          return `<div class="eqh-r"><div class="eqh-t">En campo hoy · toca para ver el detalle</div>${act.slice(0, 5).map((e) => `<div class="eqh-f" data-cierre="${e.u.id}|${hoy}" role="button" tabindex="0"><div class="grow"><b>${esc(e.u.nombre)}</b><span class="eqh-s">${e.enTienda ? `<i class="eqh-p"></i>` : ""}${esc(e.ahora)}</span>${e.pcA != null ? `<div class="barra"><i class="${e.pcA >= 100 ? "ok" : ""}" style="width:${Math.min(100, e.pcA)}%"></i></div>` : ""}<span class="eqh-s">${esc(e.det)}</span></div><b class="eqh-v">${e.pcA != null ? e.pcA + "%" : e.nVis}<small>${e.pcA != null ? "de su ruta" : e.nVis === 1 ? "visita" : "visitas"}</small></b></div>`).join("")}${act.length > 5 ? `<div class="eqh-s" style="margin-top:8px">Y ${act.length - 5} más en «Avance por persona».</div>` : ""}</div>`; })()}</div>
        <button type="button" class="btn sec block" style="margin-bottom:12px" onclick="document.getElementById('r-asis')?.scrollIntoView({behavior:'smooth',block:'start'})">Ver asistencia del mes</button>
        <div class="card">${DB.puede("aviso_cierre") && MSG.pushPosible() && Notification.permission !== "granted" ? `<div class="cd-est mal" style="margin-bottom:10px">${ic("alerta", 16)}<span><b>Este dispositivo no recibe el aviso de cierre.</b> Actívalo en Más › Configuración › Permisos.</span></div>` : ""}
          <div class="row" style="margin-bottom:8px"><h3 class="sp" style="margin:0">Avance por persona</h3><span class="tiny muted">toca la tarjeta para ver su cierre</span></div>
          <div class="eq-dia"><button type="button" class="on" data-eqd="${hoy}">Hoy</button><button type="button" data-eqd="${hace(1)}">Ayer</button><label class="eq-otro"><span>Otro día</span><input type="date" id="eq-f" max="${hoy}" value="" aria-label="Elegir otro día"></label></div>
          <select class="in" id="eq-p" aria-label="Elegir persona" style="margin:10px 0 8px"></select>
          <div class="list" id="eq-lista">${equipo.map((e) => `<div class="item eq-f" data-cierre="${e.u.id}|${hoy}" role="button" tabindex="0"><div class="ava">${esc(iniciales(e.u.nombre))}</div><div class="grow"><div class="t">${esc(e.u.nombre)}</div><div class="small muted">${esc(e.txt)}</div></div><span class="pill ${e.tono}">${ETQ[e.est]}</span></div>`).join("")}</div></div>`
        : `<div class="empty card flat">Hoy nadie del equipo tiene tiendas agendadas.</div>`}

      <h3 class="sec-t" data-g="vendedora">${hoja ? "Hoja de " + esc(hoja.u.nombre) : "Ejecución del equipo"}</h3>
      ${hoja ? (() => { const h = hoja, C = 2 * Math.PI * 50, cl = h.sem(h.nota), col = { ok: "#4FD3D8", medio: "#FFB27A", bajo: "#FF7F87", "": "#FFFFFF" }[cl];
        const frase = h.nota == null ? "Sin visitas en este período" : h.nota >= 90 ? "Ejecución excelente en punto de venta" : h.nota >= 70 ? "Ejecución aceptable, con puntos por mejorar" : "Ejecución por debajo de lo esperado";
        const tj = (lbl, val, subt, c) => `<div class="sem-t"><span class="sem-l"><i class="sem-d ${c}"></i>${lbl}</span><b class="sem-v ${c}">${val}</b><span class="tiny muted">${subt}</span></div>`;
        const tT = h.tv == null ? "" : h.tv >= 30 ? "ok" : h.tv >= 15 ? "medio" : "bajo", tEn = h.jv.e == null ? "" : h.jv.e <= 480 ? "ok" : h.jv.e <= 510 ? "medio" : "bajo", jor = h.jv.s == null || h.jv.e == null ? null : h.jv.s - h.jv.e, tSa = jor == null ? "" : jor >= 480 ? "ok" : jor >= 450 ? "medio" : "bajo", tE = [tEn, tSa].includes("bajo") ? "bajo" : [tEn, tSa].includes("medio") ? "medio" : tEn || tSa; // jornada de la empresa: entrada a más tardar a las 8:00 y 8 horas desde la entrada
        return `<div class="card desemp panel hoja"><svg class="aro" role="img" aria-label="${h.nota ?? 0} por ciento de ejecución" width="112" height="112" viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="12"></circle><circle cx="60" cy="60" r="50" fill="none" stroke="${col}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${((h.nota ?? 0) / 100) * C} ${C}" transform="rotate(-90 60 60)"></circle><text x="60" y="69" text-anchor="middle" fill="#fff" font-size="28" font-weight="700">${h.nota ?? "–"}${h.nota == null ? "" : "%"}</text></svg>
            <div class="hoja-t"><div class="lbl">Ejecución · ${esc(etPer)}</div><b>${frase}</b><span>Promedio de asistencia, ruta cumplida, reporte con fotos e inventario.</span></div></div>
          <div class="sem-g">
            ${tj("Asistencia", h.diasRuta ? `${h.asis} de ${h.diasRuta} ${h.diasRuta === 1 ? "día" : "días"}` : "–", h.pAsis != null ? h.pAsis + "% de sus días con ruta" : "sin ruta en el período", h.sem(h.pAsis))}
            ${tj("Ruta cumplida", h.pRuta != null ? h.pRuta + "%" : "–", `${progOk} de ${progN} visitas agendadas`, h.sem(h.pRuta))}
            ${tj("Reporte con fotos", h.pFot != null ? h.pFot + "%" : "–", `${h.conFotos} de ${h.cerradas} visitas`, h.sem(h.pFot))}
            ${tj("Inventario físico", h.pInv != null ? h.pInv + "%" : "–", `${h.conInv} de ${h.cerradas} visitas`, h.sem(h.pInv))}
            ${tj("Tiempo por tienda", h.tv != null ? FICHA.dur(h.tv) : "–", `equipo ${h.te != null ? FICHA.dur(h.te) : "–"}${h.cortas ? ` · ${plur(h.cortas, "visita")} de menos de 10 min` : ""}`, tT)}
            ${tj("Entrada · salida", `${h.hhmm(h.jv.e)} · ${h.hhmm(h.jv.s)}`, `${jor != null ? "jornada de " + FICHA.dur(jor) + " · " : ""}regla: entrar hasta las 08:00 y 8 horas · equipo ${h.hhmm(h.je.e)} · ${h.hhmm(h.je.s)}`, tE)}
          </div>
          ${mTot.mes.m || mTot.ant.m ? `<div class="card"><div class="row" style="gap:10px"><div class="grow"><b>Merma de sus tiendas · ${MERMA.nombreMes(mes0)}</b><div class="tiny muted">${din ? fmtUsd(mTot.mes.m) + " en notas de crédito · " : ""}3 meses anteriores: ${MERMA.fp(mTot.ant.p)} · límite ${fmtNum(MERMA.lim(), 0)}%</div></div><span class="pill ${MERMA.pill(mTot.mes.p)}" style="font-size:15px">${MERMA.fp(mTot.mes.p)}</span></div></div>` : ""}
          ${DB.puede("ver_metas") && h.porProd.length ? `<div class="card"><h3 style="margin:0 0 8px">Venta del mes</h3>${h.porProd.map((x) => { const pc = pct(x.v, x.o) ?? 0; return `<div class="mb"><div class="mb-t"><span><b>${esc(x.n)}</b></span><span class="mb-v">${pc}%</span></div><div class="barra"><i class="${pc >= 100 ? "ok" : ""}" style="width:${Math.min(100, pc)}%"></i></div><div class="tiny muted" style="margin-top:4px">${fmtNum(x.v, 0)} de ${fmtNum(x.o, 0)} kg · ${x.v >= x.o ? "objetivo cumplido" : "faltan " + fmtNum(x.o - x.v, 0) + " kg"}</div></div>`; }).join("")}<p class="tiny muted" style="margin:8px 0 0">Facturado${corte ? " al " + fmtFecha(corte + "T12:00:00") : ""}. Los pedidos posteriores se ven en Ventas.</p></div>` : ""}`; })()
        : (() => { const E = EJ, x = E.tot, sem = (q) => (q == null ? "" : q >= 90 ? "ok" : q >= 70 ? "medio" : "bajo"), C = 2 * Math.PI * 50, cl = sem(E.nota), col = { ok: "#4FD3D8", medio: "#FFB27A", bajo: "#FF7F87", "": "#FFFFFF" }[cl];
        if (!E.pers.length) return `<div class="card flat"><div class="small muted">Nadie del equipo tenía ruta ni registró visitas en este período.</div></div>`;
        const frase = E.nota == null ? "Sin visitas en este período" : E.nota >= 90 ? "Ejecución excelente en punto de venta" : E.nota >= 70 ? "Ejecución aceptable, con puntos por mejorar" : "Ejecución por debajo de lo esperado";
        const tj = (lbl, val, subt, c) => `<div class="sem-t"><span class="sem-l"><i class="sem-d ${c}"></i>${lbl}</span><b class="sem-v ${c}">${val}</b><span class="tiny muted">${subt}</span></div>`;
        const hhmm = (m) => (m == null ? "–" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`);
        const pA = pct(x.asis, x.dias), pR = pct(x.ok, x.n), pF = pct(x.fot, x.cer), pI = pct(x.inv, x.cer), jor = E.s == null || E.e == null ? null : E.s - E.e;
        const tT = E.t == null ? "" : E.t >= 30 ? "ok" : E.t >= 15 ? "medio" : "bajo", tE = E.e == null ? "" : E.tarde ? (E.tarde / E.jornadas > 0.2 ? "bajo" : "medio") : "ok";
        const orden = [...E.pers].sort((a, b) => (a.nota ?? 999) - (b.nota ?? 999) || a.u.nombre.localeCompare(b.u.nombre));
        return `<div class="card desemp panel hoja"><svg class="aro" role="img" aria-label="${E.nota ?? 0} por ciento de ejecución del equipo" width="112" height="112" viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="12"></circle><circle cx="60" cy="60" r="50" fill="none" stroke="${col}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${((E.nota ?? 0) / 100) * C} ${C}" transform="rotate(-90 60 60)"></circle><text x="60" y="69" text-anchor="middle" fill="#fff" font-size="28" font-weight="700">${E.nota ?? "–"}${E.nota == null ? "" : "%"}</text></svg>
            <div class="hoja-t"><div class="lbl">Todo el equipo · ${esc(etPer)}</div><b>${frase}</b><span>${plur(E.pers.length, "persona")} · promedio de asistencia, ruta cumplida, reporte con fotos e inventario.</span></div></div>
          <div class="sem-g">
            ${tj("Asistencia", pA != null ? pA + "%" : "–", `${x.asis} de ${x.dias} ${x.dias === 1 ? "día" : "días"} con ruta`, sem(pA))}
            ${tj("Ruta cumplida", pR != null ? pR + "%" : "–", `${x.ok} de ${x.n} visitas agendadas`, sem(pR))}
            ${tj("Reporte con fotos", pF != null ? pF + "%" : "–", `${x.fot} de ${x.cer} visitas`, sem(pF))}
            ${tj("Inventario físico", pI != null ? pI + "%" : "–", `${x.inv} de ${x.cer} visitas`, sem(pI))}
            ${tj("Tiempo por tienda", E.t != null ? FICHA.dur(E.t) : "–", E.cortas ? `${plur(E.cortas, "visita")} de menos de 10 min` : "promedio del equipo", tT)}
            ${tj("Entrada · salida", `${hhmm(E.e)} · ${hhmm(E.s)}`, `${jor != null ? "jornada de " + FICHA.dur(jor) + " · " : ""}${E.tarde ? plur(E.tarde, "entrada") + " después de las 08:00" : "todas las entradas a tiempo"}`, tE)}
          </div>
          <div class="card"><div class="row" style="align-items:baseline;gap:8px;margin-bottom:4px"><h3 class="grow" style="margin:0">Por persona</h3><span class="tiny muted">toca para ver su hoja</span></div>
          ${R.paginar(orden.map((r) => { const c = sem(r.nota); return `<div class="inv-f met-v" data-eqv="${r.u.id}" role="button" tabindex="0"><i class="sem-d ${c || "sin"}"></i><div class="grow"><b>${esc(r.u.nombre)}</b><div class="tiny muted">${r.n ? `Ruta ${r.ok} de ${r.n}` : "Sin ruta"} · asistió ${r.asis} de ${r.dias} ${r.dias === 1 ? "día" : "días"}</div><div class="barra"><i class="${c || "ok"}" style="width:${Math.min(100, r.nota ?? 0)}%"></i></div></div><b class="inv-v ${c}">${r.nota ?? "–"}${r.nota == null ? "" : "%"}<small>ver ›</small></b></div>`; }), "eqv")}</div>`; })()}

      <h3 class="sec-t">Pedidos y objetivo</h3>
      ${objKg && DB.puede("ver_metas") ? (() => { // Panel principal de Ventas (solo quien puede ver Metas; la supervisión no ve el objetivo de la empresa): objetivo del mes, en el azul de la marca
        const dHoy = Number(hoy.slice(8, 10)), dMes = new Date(Number(mes0.slice(0, 4)), Number(mes0.slice(5, 7)), 0).getDate(), esperado = (dHoy / dMes) * 100, ritmo = esperado ? ((pcObj ?? 0) / esperado) * 100 : 100;
        const cl = ritmo >= 95 ? "ok" : ritmo >= 75 ? "medio" : "bajo", tag = ritmo >= 95 ? "Al ritmo del mes" : ritmo >= 75 ? "Un poco atrás" : "Atrás del ritmo";
        return `<div class="card desemp panel"><div class="lbl">Objetivo de ${new Date(mes0 + "T12:00:00").toLocaleDateString("es-PA", { month: "long" })}${vend ? "" : " · toda la empresa"}</div>
          <div class="desemp-top"><span class="desemp-pct">${pcObj ?? 0}%</span><span class="desemp-tag ${cl}">${tag}</span></div>
          <div class="desemp-sub"><b>${fmtNum(avance, 0)} kg</b> de ${fmtNum(objKg, 0)} kg</div>
          <div class="barra"><i class="${cl}" style="width:${Math.min(100, pcObj ?? 0)}%"></i></div>
          <div class="tiny desemp-cifras">Va el ${Math.round(esperado)}% del mes (día ${dHoy} de ${dMes})</div>
          <div class="desemp-mini"><div><span>Facturado${corte ? " al " + fmtFecha(corte + "T12:00:00") : ""}</span><b>${fmtNum(factKg, 0)} kg</b></div><div><span>Pedidos capturados después</span><b>${fmtNum(pedPost, 0)} kg</b></div><div><span>Falta para el objetivo</span><b>${fmtNum(Math.max(0, objKg - avance), 0)} kg</b></div></div></div>`; })() : ""}
      <div class="kpis">
        ${kpi(fmtNum(kgPer, 0) + " kg", "Pedidos capturados · " + esc(etPer), "", `${plur(ped.length, "pedido")}`)}
        ${prodR.data.map((p) => kpi(fmtNum(kgProd[p.id] || 0, 0) + " kg", esc(p.nombre), "", p.kg_por_pedido ? fmtNum((kgProd[p.id] || 0) / p.kg_por_pedido, 1) + " cajas" : "")).join("")}
        ${kpi(sinVenta.length, "Productos sin pedido · " + esc(etPer), sinVenta.length ? "alerta" : "", sinVenta.map((p) => esc(p.nombre)).join(", "))}
      </div>
      ${(() => { // Vista Merma: notas de crédito por merma sobre la venta facturada, del mes del período elegido
        const mesN = MERMA.nombreMes(mes0), lim = MERMA.lim(), p = mTot.mes.p, cl = MERMA.tono(p), prev = mSerie[4], cab = `<h3 class="sec-t" data-g="merma">Merma · ${esc(mesN)}</h3>`;
        if (!facV.length) return cab + `<div class="empty card flat">Todavía no hay facturación ni notas de crédito cargadas para ${vend ? "sus tiendas" : "este período"}.</div>`;
        const barra = (x) => `<div class="barra"><i class="${MERMA.tono(x) || "ok"}" style="width:${Math.min(100, ((x || 0) / (lim * 2)) * 100)}%"></i></div>`;
        const fila = (n, x, sub) => `<div class="mb"><div class="mb-t"><span><b>${esc(n)}</b>${sub ? `<span class="tiny muted"> · ${sub}</span>` : ""}</span><span class="mb-v ${MERMA.tono(x.mes.p)}">${MERMA.fp(x.mes.p)}${din ? ` <small>· ${fmtUsd(x.mes.m)}</small>` : ""}</span></div>${barra(x.mes.p)}<div class="tiny muted" style="margin-top:4px">3 meses anteriores: ${MERMA.fp(x.ant.p)}${din ? " · " + fmtUsd(x.ant.m) : ""}</div></div>`;
        const totDet = mProd.reduce((t, x) => t + x.ant.m + x.mes.m, 0);
        return cab + `<div class="card desemp panel indigo"><div class="lbl">Merma de ${esc(mesN)}${vend ? "" : " · toda la empresa"}</div>
          <div class="desemp-top"><span class="desemp-pct">${MERMA.fp(p)}</span><span class="desemp-tag ${cl}">${MERMA.etq(p)}</span></div>
          <div class="desemp-sub">${din ? `<b>${fmtUsd(mTot.mes.m)}</b> en notas de crédito sobre ${fmtUsd(mTot.mes.v)} facturados` : "de la venta facturada"}</div>
          ${barra(p)}
          <div class="tiny desemp-cifras">Límite ${fmtNum(lim, 0)}% de la venta${facCorte ? " · datos al " + fmtFecha(facCorte + "T12:00:00") : ""}</div>
          <div class="desemp-mini"><div><span>3 meses anteriores</span><b>${MERMA.fp(mTot.ant.p)}</b></div><div><span>${esc(MERMA.nombreMes(prev.mes))}</span><b>${MERMA.fp(prev.p)}</b></div><div><span>Tiendas con merma en ${esc(mesN)}</span><b>${mTiendas.filter((t) => t.mes.m > 0).length}</b></div></div></div>
          <div class="card"><h3 style="margin:0 0 2px">Últimos 6 meses</h3>${mSerie.map((x) => `<div class="mb"><div class="mb-t"><span><b style="text-transform:capitalize">${esc(MERMA.nombreMes(x.mes))}</b>${x.mes === mesHoy ? `<span class="tiny muted"> · en curso</span>` : ""}</span><span class="mb-v ${MERMA.tono(x.p)}">${MERMA.fp(x.p)}</span></div>${barra(x.p)}${din ? `<div class="tiny muted" style="margin-top:4px">${fmtUsd(x.m)} de merma sobre ${fmtUsd(x.v)} facturados</div>` : ""}</div>`).join("")}</div>
          ${mVend.length ? `<div class="card"><div class="row" style="margin-bottom:2px"><h3 class="sp" style="margin:0">Por persona</h3><span class="tiny muted">de mayor a menor</span></div>${mVend.map((x) => fila(x.n, x)).join("")}</div>` : ""}
          <div class="card"><h3 style="margin:0 0 4px">Por tienda</h3><div class="tiny muted" style="margin-bottom:6px">${plur(mTiendas.length, "tienda")} con merma en ${esc(mesN)} o en los 3 meses anteriores. Primero las de más merma este mes.</div>
            ${mTiendas.length ? R.paginar(mTiendas.map((t) => `<div class="inv-f"><i class="sem-d ${MERMA.tono(t.mes.p ?? (t.mes.m ? lim * 2 : null)) || "sin"}"></i><div class="grow"><b>${esc(nomCli[t.id] || "Tienda")}</b><div class="tiny muted">${esc((vendDe[t.id] || []).map((id) => vendedoras.find((u) => u.id === id)?.nombre.split(" ")[0]).filter(Boolean).join(", ") || "Sin responsable")} · 3 meses ant. ${MERMA.fp(t.ant.p)}${din ? " (" + fmtUsd(t.ant.m) + ")" : ""}</div></div><b class="inv-v ${MERMA.tono(t.mes.p)}">${t.mes.m ? (t.mes.p != null ? MERMA.fp(t.mes.p) : "sin venta") : "0%"}${din && t.mes.m ? `<small>${fmtUsd2(t.mes.m)}</small>` : ""}</b></div>`), "mermat") : `<div class="small muted">Ninguna ✓</div>`}</div>
          ${mProd.length ? `<div class="card"><h3 style="margin:0 0 2px">Por producto · ${esc(mesN)} y 3 meses anteriores</h3>${mProd.map((x) => { const pt = totDet ? Math.round(((x.mes.m + x.ant.m) / totDet) * 100) : 0; return `<div class="mb"><div class="mb-t"><span><b>${esc(x.n)}</b></span><span class="mb-v">${pt}%${din ? ` <small>· ${fmtUsd(x.mes.m + x.ant.m)}</small>` : ""}</span></div><div class="barra"><i style="width:${pt}%"></i></div></div>`; }).join("")}<div class="tiny muted" style="margin-top:6px">Parte de la merma total que corresponde a cada producto.</div>
            <p class="tiny muted" style="margin:8px 0 0">«Sin detalle de producto»: notas de crédito que en el estado de cuenta llegan sin indicar el producto (así vienen las de octubre y noviembre).</p></div>` : ""}
          <p class="tiny muted" style="margin:0 2px 14px">Merma = notas de crédito por merma y por diferencia de peso o entrega, sobre la venta facturada de la tienda. Fuente: Tablero Comercial. Verde hasta ${fmtNum(lim, 0)}%, ámbar hasta ${fmtNum(lim * 1.5, 1)}%, rojo después.</p>`;
      })()}
      <h3 class="sec-t" data-g="equipo">Efectividad de visitas · ${esc(etPer)}</h3>
      ${(() => { // Panel principal de Visitas: cumplimiento de agenda, en azul noche
        const pc = pct(progOk, progN), enCurso = hasta >= hoy, cl = pc == null ? "" : pc >= 90 ? "ok" : pc >= 70 ? "medio" : "bajo";
        const tag = pc == null ? "Sin agenda" : pc >= 90 ? "Excelente" : enCurso ? "En curso" : pc >= 70 ? "Puede mejorar" : "Atención";
        const ef = pct(visConPedido, visPT.length);
        return `<div class="card desemp panel noche"><div class="lbl">Cumplimiento de agenda · ${esc(etPer)}</div>
          <div class="desemp-top"><span class="desemp-pct">${pc ?? 0}%</span><span class="desemp-tag ${pc != null && pc < 90 && enCurso ? "" : cl}">${tag}</span></div>
          <div class="desemp-sub"><b>${progOk} de ${progN}</b> visitas programadas realizadas${dias.length < this.fechas(desde, hasta).length ? " (hasta hoy)" : ""}</div>
          <div class="barra"><i class="${cl || "ok"}" style="width:${Math.min(100, pc ?? 0)}%"></i></div>
          <div class="desemp-mini"><div><span>Visitas realizadas</span><b>${vis.length}${fueraAgenda ? ` <small>· ${fueraAgenda} fuera de agenda</small>` : ""}</b></div>
            <div><span>Efectividad (visitas con pedido)</span><b>${ef ?? 0}% <small>· ${visConPedido} de ${visPT.length}</small></b></div>
            <div><span>Tiempo promedio en tienda</span><b>${minProm != null ? fmtNum(minProm, 0) + " min" : "–"}</b></div></div></div>`; })()}
      <div class="kpis">
        ${kpi(sinVisita.length, "Clientes programados sin visita", sinVisita.length ? "alerta" : "")}
        ${kpi(sinPedido.length, "Clientes sin pedido", "", periodo === "hoy" ? "de la ruta de hoy" : "de sus tiendas asignadas")}
        ${kpi(abiertas, "Visitas sin cerrar (días anteriores)", abiertas ? "alerta" : "")}
      </div>
      ${periodo === "hoy" ? "" : `<div class="grid2">
        <div class="card"><div class="row" style="flex-wrap:wrap;gap:8px"><h3 class="grow" style="margin:0">Agenda por día</h3>${R.leyenda([["#DCE5FB", "Programadas"], ["#2F5BEA", "Realizadas"]])}</div>${R.barras(serie, [["prog", "#DCE5FB"], ["ok", "#2F5BEA"]], (s) => `${s.ok}/${s.prog}`)}</div>
        <div class="card"><div class="row" style="flex-wrap:wrap;gap:8px"><h3 class="grow" style="margin:0">Pedidos por día</h3>${R.leyenda([["#2F5BEA", "Kilos"]])}</div>${R.barras(serie, [["kg", "#2F5BEA"]], (s) => fmtNum(s.kg, 0))}</div></div>`}

      <h3 class="sec-t" data-g="inventario">Inventario en tiendas · hoy</h3>
      ${invCon.length ? `<div class="card desemp panel noche"><div class="lbl">Inventario en tiendas${vend ? "" : " · todas las rutas"}</div>
          <div class="desemp-top"><span class="desemp-pct">${inv7.length} de ${invT.length}</span><span class="desemp-tag ${invN("bajo") ? "bajo" : invN("medio") ? "medio" : "ok"}">${invN("bajo") ? plur(invN("bajo"), "tienda") + " por reponer" : invN("medio") ? "Reponer pronto" : "Saludable"}</span></div>
          <div class="desemp-sub">tiendas con conteo en los últimos 7 días</div>
          <div class="barra3">${["ok", "medio", "bajo"].map((k) => (invN(k) ? `<i class="${k}" style="flex:${invN(k)}"></i>` : "")).join("")}</div>
          <div class="desemp-mini"><div><span><i class="sem-d ok"></i>Saludables</span><b>${invN("ok")}</b></div><div><span><i class="sem-d medio"></i>Cerca de la alerta · reponer pronto</span><b>${invN("medio")}</b></div><div><span><i class="sem-d bajo"></i>Bajo la alerta</span><b>${invN("bajo")}</b></div>${invN("sin") ? `<div><span><i class="sem-d sin"></i>Sin conteo en 30 días</span><b>${invN("sin")}</b></div>` : ""}</div></div>
        <div class="kpis">
          ${kpi(fmtNum(invCon.reduce((t, x) => t + x.cj, 0), 1) + " cajas", "Inventario total contado", "", fmtNum(invCon.reduce((t, x) => t + x.kg, 0), 0) + " kg en " + plur(invCon.length, "tienda"))}
          ${kpi(invCon.reduce((t, x) => t + x.sug, 0) + " cajas", "Pedido sugerido", invN("bajo") ? "alerta" : "", "para volver a un mes de inventario")}
          ${kpi(invSin7.length, "Sin conteo en más de 7 días", invSin7.length ? "alerta" : "", "tiendas con ruta que piden en tienda")}
          ${kpi(invCon.filter((x) => x.agotSinPed).length, "Agotados sin pedido", invCon.some((x) => x.agotSinPed) ? "alerta" : "", "producto en cero y sin pedido después del conteo")}
        </div>
        <div class="card" id="inv-tiendas"><div class="row" style="margin-bottom:2px"><h3 class="sp" style="margin:0">Inventario por tienda</h3><span class="tiny muted">las más urgentes primero</span></div>
          ${R.paginar(invT.map((t) => { const sub = t.est === "sin" ? "Sin conteo en los últimos 30 días" : t.ps.map((q) => `${q.n} ${q.agot ? "agotado" : q.caja ? fmtNum(q.kg / q.caja, 1) + " cj" : fmtNum(q.kg, 1) + " kg"}`).join(" · ") + " · contado " + (t.fecha === hoy ? "hoy" : "el " + fCortaD(t.fecha));
            return `<div class="inv-f ${t.visita ? "fv-link" : ""}" ${t.visita ? `data-fv="${t.visita}" role="button" tabindex="0"` : ""}><i class="sem-d ${t.est}"></i><div class="grow"><b>${esc(t.tienda)}</b><div class="tiny muted">${esc(sub)}${t.vendedor && !vend ? " · " + esc(t.vendedor.split(" ")[0]) : ""}</div></div><b class="inv-v ${t.est}">${t.est === "sin" ? "–" : t.sug ? `pedir ${t.sug} cj` : fmtNum(t.cj, 1) + " cj"}</b></div>`; }), "invt")}
          <p class="tiny muted" style="margin:8px 0 0">Último conteo de cada tienda en 30 días. Bajo la alerta: menos de media caja o de la mitad de lo que la tienda compra al mes (40% si compra 4 cajas o más), según lo facturado en los 3 últimos meses cerrados. Cerca: menos de 1.5 veces esa alerta. Toca una tienda para ver la visita.</p></div>`
        : `<div class="empty card flat">No hay conteos de inventario en los últimos 30 días${vend ? " para esta persona" : ""}.</div>`}
      <h3 class="sec-t" id="alertas-res">Alertas de inventario</h3>
      <div class="card">${Object.values(porVisita).length ? R.paginar(Object.values(porVisita).sort((a, b) => (b.prods.some((p) => p.agotado) - a.prods.some((p) => p.agotado)) || b.checkin_at.localeCompare(a.checkin_at)).map((a) => `
        <div class="al-fila"><div class="al-t fv-link" data-fv="${a.visita_id}" role="button" tabindex="0"><b>${esc(a.tienda)}</b><span class="tiny muted">${esc(a.vendedor)} · ${fmtFechaHora(a.checkin_at)} · <u>Ver visita</u></span></div>
          <div class="al-p">${a.prods.map((p) => `<span class="pill ${p.agotado ? "p-rosa" : "p-durazno"}">${esc(p.producto.replace(/^Queso /, ""))}: ${p.agotado ? "AGOTADO" : "bajo · " + fmtNum(p.kg, 1) + " kg"}</span>`).join("")}<span class="tiny" style="color:var(--rosa-t)">Sin pedido</span>${a.motivo ? `<span class="pill al-m ${a.motivo === "sin_stock" ? "p-gris" : "p-durazno"}">Motivo: ${esc((MOTIVOS_SIN_PEDIDO.find((m) => m[0] === a.motivo) || [, a.motivo])[1])}${a.motivoNota ? " · " + esc(a.motivoNota) : ""}</span>` : ""}</div>
          ${DB.puede("avisar") ? `<button class="btn sm al-b" onclick="R.avisar(${a.visita_id})">${ic("megafono", 15)} Avisar</button>` : ""}</div>`), "alertas")
        : `<div class="empty"><div class="ic">${ic("ok", 30)}</div>Sin alertas: no hay agotados ni inventario bajo sin pedido en ${esc(etPer)}.</div>`}
        <p class="tiny muted" style="margin:8px 0 0">Agotado: en la visita se marcó agotado o contó 0. Bajo: debajo del mínimo de la tienda o, si no hay mínimo, menos del 40% del objetivo semanal. "Sin pedido": no hubo pedido de ese producto en esa visita ni ese día.</p></div>

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

      ${vend ? "" : `<h3 class="sec-t" data-g="vendedora">Visitas y pedidos</h3>
      <div class="kpis">
        ${kpi(conVisitas.length, "Personas con visitas")}
        ${kpi(sinVisitas.length, "Personas sin visitas", sinVisitas.length ? "alerta" : "", nomCortos(sinVisitas))}
        ${kpi(sinPedidos.length, "Personas sin pedidos", sinPedidos.length ? "alerta" : "", nomCortos(sinPedidos))}
      </div>`}

      <div class="grid2" data-g="equipo">
        <div class="card"><h3>Clientes programados sin visita</h3>${R.lista(sinVisita.map((p) => [p.clientes?.nombre, (vendedoras.find((u) => u.id === p.vendedor_id)?.nombre || "") + " · " + fmtFecha(p.fecha + "T12:00:00")]))}</div>
        ${justif.length ? `<div class="card"><h3>Visitas justificadas <span class="pill p-gris">${justif.length}</span></h3><div class="tiny muted" style="margin-bottom:6px">Programadas que la persona avisó que no haría. No cuentan en el cumplimiento.</div>${R.paginar(justif.map((p) => `<div style="padding:7px 0;border-top:1px solid var(--borde)"><div style="font-weight:500">${esc(p.clientes?.nombre || "—")}</div><div class="tiny muted">${esc((vendedoras.find((u) => u.id === p.vendedor_id)?.nombre || "") + " · " + fmtFecha(p.fecha + "T12:00:00") + " · " + motivoNoVisita(p.j.motivo) + (p.j.nota ? ": " + p.j.nota : ""))}</div>${p.j.foto_path ? `<a href="#" class="tiny" data-jfoto="${esc(p.j.foto_path)}" data-jt="${esc((p.clientes?.nombre || "") + " · " + fmtHora(p.j.foto_at) + (p.j.dist_m != null ? " · " + (p.j.dentro ? "en la tienda" : "a " + fmtDist(p.j.dist_m) + " de la tienda") : " · sin ubicación"))}">Ver foto de la tienda cerrada ›</a>${p.j.dentro === false ? ` <span class="pill p-rosa">Fuera del radio</span>` : ""}` : p.j.motivo === "tienda_cerrada" ? `<span class="pill p-durazno">Sin foto</span>` : ""}</div>`))}</div>` : ""}
        <div class="card"><h3>Clientes sin pedido</h3>${R.lista(sinPedido.map((a) => [a.clientes?.nombre, vendedoras.find((u) => u.id === a.vendedor_id)?.nombre || ""]))}</div>
      </div>
      ${dashHtml}`;
    // Equipo: ver cómo le fue a cada una hoy, ayer o cualquier otro día (tocar la fila abre su cierre de ese día)
    const eqL = $("#eq-lista", root);
    if (eqL) { const hoyHtml = eqL.innerHTML, marca = (f) => { $$("[data-eqd]", root).forEach((b) => b.classList.toggle("on", b.dataset.eqd === f)); const i = $("#eq-f", root); i.value = f === hoy || f === hace(1) ? "" : f; i.parentElement.classList.toggle("on", !!i.value); };
      const ver = (f) => { marca(f); if (f === hoy) { eqL.innerHTML = hoyHtml; return; } R.equipoDia(eqL, f, vendedoras, asigTodas, justTodas); };
      $$("[data-eqd]", root).forEach((b) => (b.onclick = () => ver(b.dataset.eqd)));
      $("#eq-f", root).onchange = (e) => { if (e.target.value) ver(e.target.value > hoy ? hoy : e.target.value); };
      // Nunca una lista que crece con el equipo: se elige la persona en el filtro (orden alfabético) y se ve solo su tarjeta. Abre en la primera que necesita atención.
      const selP = $("#eq-p", root); let elegida = "";
      const filtra = () => { const its = $$(".item", eqL); selP.hidden = !its.length; if (!its.length) return;
        const noms = its.map((it) => it.querySelector(".t")?.textContent || ""), ord = [...noms].sort((a, b) => a.localeCompare(b));
        if (!noms.includes(elegida)) elegida = noms[0];
        selP.innerHTML = ord.map((n) => `<option ${n === elegida ? "selected" : ""}>${esc(n)}</option>`).join("");
        its.forEach((it, i) => (it.hidden = noms[i] !== elegida)); };
      selP.onchange = () => { elegida = selP.value; filtra(); };
      new MutationObserver(filtra).observe(eqL, { childList: true }); filtra();
    }
    $$("[data-eqv]", root).forEach((c) => (c.onclick = () => { LS.set("res.tab", "vendedora"); R.render(root, periodo, c.dataset.eqv); window.scrollTo({ top: 0 }); }));
    $("#rv", root).onchange = (e) => { if (e.target.value) LS.set("res.tab", "vendedora"); R.render(root, periodo, e.target.value); };
    const esp = $("#r-espacio", root); if (esp) AUD.enResumen(esp, hasta, vend, asig);
    R.pestanas(root);
    if (dash) {
      const rv = $("#rv", root), w = document.createElement("div"); w.className = "dsh-fil"; rv.before(w);
      w.innerHTML = `<label><span>Equipo</span></label><label><span>Cadena</span><select class="in" id="rc"><option value="">Todas</option>${cadenas.map((c) => `<option ${c === cad ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>`;
      w.firstElementChild.append(rv); rv.style.marginBottom = "0";
      rv.options[0].textContent = "Todos"; // el rótulo ya dice «Equipo»
      rv.onchange = (e) => R.render(root, periodo, e.target.value);
      $("#rc", root).onchange = (e) => { LS.set("dash.c", e.target.value); R.render(root, periodo, vend); };
      $$("[data-ir]", root).forEach((b) => (b.onclick = () => { const [t, k] = b.dataset.ir.split(":"); if (t === "tab") { LS.set("res.tab", k); LS.set("res.p", periodo === "rango" ? "mes" : periodo); LS.set("res.v", vend); location.hash = "#resumen"; } else location.hash = "#" + k; }));
      $$("[data-rep]", root).forEach((c) => (c.onclick = () => { LS.set("res.tab", "vendedora"); LS.set("res.v", c.dataset.rep); LS.set("res.p", periodo === "rango" ? "mes" : periodo); location.hash = "#resumen"; }));
      $$("[data-dk-b]", root).forEach((b) => (b.onclick = () => { LS.set("dash.rk", b.dataset.dkB); $$("[data-dk-b]", root).forEach((x) => x.classList.toggle("on", x === b)); $$("[data-dk]", root).forEach((x) => x.classList.toggle("on", x.dataset.dk === b.dataset.dkB)); LIM5.aplicar(); }));
    }
  },

  // Velocímetro en tarjeta clara: valor grande al centro y, si se pide, la marca de la meta, el ritmo o el límite
  velo(pc, tono, titulo, valor, sub, marca = null) {
    const L = Math.PI * 48, v = Math.max(0, Math.min(100, pc || 0)), col = { ok: "#12A3A8", medio: "#F0633B", bajo: "#B3261E", "": "#C5CCD8" }[tono || ""], a = Math.PI * (1 - Math.max(0, Math.min(100, marca ?? 0)) / 100);
    const x = (k) => (60 + k * Math.cos(a)).toFixed(1), y = (k) => (62 - k * Math.sin(a)).toFixed(1);
    return `<div class="dsh-g"><span class="dsh-gt">${titulo}</span><svg role="img" aria-label="${titulo}: ${valor}" viewBox="0 0 120 70"><path d="M12 62 A48 48 0 0 1 108 62" fill="none" stroke="#E9EDF5" stroke-width="11" stroke-linecap="round"></path>${pc == null ? "" : `<path d="M12 62 A48 48 0 0 1 108 62" fill="none" stroke="${col}" stroke-width="11" stroke-linecap="round" stroke-dasharray="${(v / 100) * L} ${L}"></path>`}${marca != null ? `<line x1="${x(39)}" y1="${y(39)}" x2="${x(57)}" y2="${y(57)}" stroke="#0B1B33" stroke-width="2.5" stroke-linecap="round"></line>` : ""}<text x="60" y="60" text-anchor="middle" font-weight="700" font-size="${String(valor).length > 4 ? 19 : 22}" fill="#0B1B33">${valor}</text></svg><span class="dsh-gs ${tono || ""}">${sub}</span></div>`;
  },
  // Barras verticales simples: [valor, etiqueta, tono]
  barritas(serie, fmt, alto = 96) {
    const mx = Math.max(...serie.map((x) => Number(x[0]) || 0), 1);
    return `<div class="dsh-bars" style="--alto:${alto}px">${serie.map(([v, e, t], i) => `<div><b>${fmt(v)}</b><i class="${t || (i === serie.length - 1 ? "act" : "")}" style="height:${Math.max(2, Math.round(((Number(v) || 0) / mx) * alto))}px"></i><span>${esc(e)}</span></div>`).join("")}</div>`;
  },

  // Cómo le fue a cada vendedora en un día anterior: visitas hechas de las agendadas y su horario. La fila abre el cierre de ese día.
  async equipoDia(el, fecha, vendedoras, asig, just) {
    el.innerHTML = `<div class="small muted" style="padding:10px 0">Cargando…</div>`; el.dataset.f = fecha;
    const { data, error } = await sb.from("v_visitas").select("id, vendedor_id, cliente_id, tienda, checkin_at, checkout_at").eq("fecha", fecha).order("checkin_at").limit(2000);
    if (el.dataset.f !== fecha || !el.isConnected) return; // eligió otro día mientras cargaba
    if (error) { el.innerHTML = `<div class="small" style="color:var(--rosa-t);padding:10px 0">${esc(error.message)}</div>`; return; }
    const w = R.dia(fecha), filas = vendedoras.map((u) => {
      const ag = asig.filter((a) => a.vendedor_id === u.id && (a.dias_semana || []).includes(w)), vs = data.filter((v) => v.vendedor_id === u.id);
      if (!ag.length && !vs.length) return null;
      const nj = ag.filter((a) => just.some((x) => x.vendedor_id === u.id && x.cliente_id === a.cliente_id && x.fecha === fecha) && !vs.some((v) => v.cliente_id === a.cliente_id)).length, prog = ag.length - nj;
      const hechas = ag.filter((a) => vs.some((v) => v.cliente_id === a.cliente_id)).length, sal = vs.filter((v) => v.checkout_at).map((v) => v.checkout_at).sort().pop();
      const [o, tono, etq, txt] = vs.length ? [hechas >= prog ? 2 : 1, hechas >= prog ? "p-menta" : "p-durazno", hechas >= prog ? "Completo" : "Parcial", `${ag.length ? `${hechas} de ${prog} visitas` : plur(vs.length, "visita") + " fuera de agenda"} · ${fmtHora(vs[0].checkin_at)}${sal ? " a " + fmtHora(sal) : ""}`]
        : prog ? [0, "p-rosa", "Sin visitas", `Tenía ${plur(prog, "tienda")} y no registró ninguna`] : [3, "p-gris", "Justificado", `${plur(nj, "tienda")} justificada${nj === 1 ? "" : "s"}`];
      return { u, o, html: `<div class="item eq-f" data-cierre="${u.id}|${fecha}" role="button" tabindex="0"><div class="ava">${esc(iniciales(u.nombre))}</div><div class="grow"><div class="t">${esc(u.nombre)}</div><div class="small muted">${esc(txt)}</div></div><span class="pill ${tono}">${etq}</span></div>` };
    }).filter(Boolean).sort((a, b) => a.o - b.o || a.u.nombre.localeCompare(b.u.nombre));
    const tit = new Date(fecha + "T12:00:00").toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long" });
    el.innerHTML = `<div class="tiny muted" style="padding:2px 0 6px;text-transform:capitalize">${esc(tit)}</div>` + (filas.map((x) => x.html).join("") || `<div class="small muted" style="padding:10px 0">Ese día nadie del equipo tenía tiendas agendadas ni registró visitas.</div>`);
  },

  // El Resumen se ve por vistas: Campo (clave "equipo") · Equipo (clave "vendedora") · Inventario · Merma · Ventas. Cada bloque pertenece a la vista de su título (data-g) o a la del título que tiene encima.
  pestanas(root) {
    const rv = $("#rv", root); if (!rv || $("#rtabs", root)) return;
    const grupo = (t) => /pedidos y objetivo/i.test(t) ? "ventas" : /alertas|por vencer|participaci/i.test(t) ? "inventario" : "equipo";
    let g = "inventario"; // lo que va antes del primer título es el aviso de agotados sin pedido
    let hayAlerta = false;
    for (let el = rv.nextElementSibling; el; el = el.nextElementSibling) {
      if (el.dataset.g) g = el.dataset.g;
      else if (el.id === "r-espacio") g = "inventario";
      else if (el.matches("h3.sec-t")) g = grupo(el.textContent);
      else if (g === "inventario" && el.matches(".card") && !el.previousElementSibling?.matches("h3.sec-t") && el.previousElementSibling === rv) hayAlerta = true;
      el.dataset.rt = g;
    }
    if (R._modo === "dash") { $$("[data-rt]", root).forEach((el) => (el.hidden = el.dataset.rt !== "dash")); LIM5.aplicar(); return; }
    const pt = $("#inv-tiendas", root);
    if (pt) for (let el = $("#alertas-res", root), sig; el && el.id !== "r-espacio" && !el.dataset.g && (el.id === "alertas-res" || !el.matches("h3.sec-t") || /por vencer/i.test(el.textContent)); el = sig) { sig = el.nextElementSibling; pt.before(el); }
    const tabs = [["equipo", "Campo"], ["vendedora", "Equipo"], ["inventario", "Inventario"], ["merma", "Merma"], ["ventas", "Ventas"]];
    let act = LS.get("res.tab", "equipo"); if (!tabs.some((t) => t[0] === act)) act = "equipo";
    rv.insertAdjacentHTML("afterend", `<div class="rtabs" id="rtabs">${tabs.map(([k, t]) => `<button data-rt-b="${k}">${t}${k === "inventario" && hayAlerta ? `<i class="dot-n"></i>` : ""}</button>`).join("")}</div>`);
    const ver = (k) => { LS.set("res.tab", k); $$("[data-rt]", root).forEach((el) => (el.hidden = el.dataset.rt !== k)); $$("[data-rt-b]", root).forEach((b) => b.classList.toggle("on", b.dataset.rtB === k)); LIM5.aplicar(); };
    $$("[data-rt-b]", root).forEach((b) => (b.onclick = () => { ver(b.dataset.rtB); window.scrollTo({ top: 0 }); }));
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
        const abre = (n || c === "falta") && d.iso <= hoy; // días con visitas o con falta: se puede abrir el cierre de ese día
        return `<td><span class="asi ${c}${d.iso === hoy ? " es-hoy" : ""}${abre ? " toca" : ""}" title="${esc(t)}"${abre ? ` data-cierre="${u.id}|${d.iso}" role="button" tabindex="0"` : ""}>${x}</span></td>`;
      }).join("");
      return `<tr><td class="asi-n">${esc(u.nombre)}</td>${celdas}<td class="asi-t"><b style="color:var(--azul-osc)">${asis}</b></td><td class="asi-t"><b style="color:${faltas ? "var(--rosa-t)" : "inherit"}">${faltas}</b></td></tr>`;
    }).join("");
    const mes = d0.toLocaleDateString("es-PA", { month: "long", year: "numeric" });
    setTimeout(() => { const h = document.querySelector(".asis th.hoyc"), sx = h?.closest(".scroll-x"); if (sx) sx.scrollLeft = Math.max(0, h.offsetLeft - sx.clientWidth + h.offsetWidth * 2.2); }, 60); // abre mostrando hoy y los días anteriores
    return `<h3 class="sec-t" id="r-asis" data-g="equipo">Asistencia · ${esc(mes)}</h3>
      <div class="card"><div class="tiny muted" style="margin-bottom:8px">El número es la cantidad de visitas registradas ese día. «5 ·1» = 5 hechas y 1 programada sin hacer. «J» = no visitó, pero justificó sus tiendas. <b>Toca un día para ver el cierre de esa persona.</b></div>
      <div class="scroll-x"><table class="asis"><tr><th class="asi-n">Persona</th>${dias.map((d) => `<th class="${d.iso === hoy ? "hoyc" : ""}"><div class="tiny muted">${DIAS_C[d.w]}</div>${d.n}</th>`).join("")}<th class="asi-t">Asist.</th><th class="asi-t">Faltas</th></tr>${filas}</table></div>
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
    modal(`<h2 class="row" style="gap:8px"><span style="color:var(--azul)">${ic("megafono", 24)}</span>Avisar al equipo</h2>
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

// Foto de una tienda cerrada (justificación): cualquier elemento con data-jfoto="<ruta en el almacén>" la abre
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-jfoto]"); if (!el) return; e.preventDefault();
  const m = modal(`<div class="muted" style="padding:30px 0;text-align:center">Cargando la foto…</div>`);
  const { data, error } = await sb.storage.from("fotos").createSignedUrl(el.dataset.jfoto, 600);
  $(".sheet", m).innerHTML = error || !data?.signedUrl ? `<p class="muted">No se pudo abrir la foto.</p><button class="btn block" data-x>Cerrar</button>`
    : `<div class="row" style="margin-bottom:10px"><div class="grow"><b>Tienda cerrada</b><div class="tiny muted">${esc(el.dataset.jt || "")}</div></div><button class="x-btn" data-x aria-label="Cerrar">✕</button></div><img src="${data.signedUrl}" alt="Foto de la tienda cerrada" style="width:100%;border-radius:12px;display:block">`;
  $("[data-x]", m).onclick = () => m.remove();
});
