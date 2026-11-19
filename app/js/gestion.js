// Pantallas de gestión: pedidos para operaciones, equipo del día y usuarios
const G = {
  // ---------------- PEDIDOS (supervisor / operaciones / admin) ----------------
  async pedidos(root, filtro) {
    const rol = DB.perfil.rol;
    const tabs = [["imprimir", "Por imprimir"], ["sinorden", "Sin orden escaneada"], ["impreso", "Impresos"], ["anulado", "Anulados"]];
    filtro = filtro || "imprimir";
    root.innerHTML = `<div class="top"><div><div class="muted small">Pedidos de las vendedoras</div><h1>Pedidos</h1></div></div>
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
      <div class="grow"><div class="t">${esc(p.tienda)}</div><div class="small muted">${esc(p.vendedor)} · ${fmtFechaHora(p.creado_at)} · ${plur(fmtNum(p.total_cajas), "caja")}${p.total_kg != null ? " · " + fmtKg(p.total_kg) : ""}${p.numero_orden ? " · Orden " + esc(p.numero_orden) : ""}</div>
      <div class="item-pie">${pillPedido(p.estado)}${p.documento && filtro !== "imprimir" && p.estado !== "impreso" ? ` <span class="pill p-lila">Orden ✓</span>` : ""}</div></div></div>`).join("") || `<div class="empty card flat"><div class="ic">${ic("ok", 34)}</div>No hay pedidos en esta lista.</div>`;
    $$("[data-id]", root).forEach((el) => (el.onclick = () => this.detalle(data.find((p) => p.id == el.dataset.id), () => this.pedidos(root, filtro))));
  },

  async detalle(p, recargar) {
    const rol = DB.perfil.rol;
    const puedeAprobar = false; // el flujo no lleva aprobación
    const puedeImprimir = DB.puede("pedidos_imprimir") && !!p.documento && ["propuesto", "aprobado", "orden_escaneada"].includes(p.estado);
    const [{ data: items }, { data: ev }] = await Promise.all([
      sb.from("pedido_items").select("*, productos(nombre, unidad_pedido, unidad_conteo, kg_por_pedido, unidades_por_pedido, peso_kg_unidad)").eq("pedido_id", p.id).order("id"),
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
    if (error) { $("#eq", root).textContent = error.message; return; }
    const enTienda = vis.filter((v) => v.estado === "abierta").length;
    const fuera = vis.filter((v) => v.checkin_dentro === false || v.checkout_dentro === false).length;
    const porImprimir = (ped || []).filter((p) => ["propuesto", "aprobado", "orden_escaneada"].includes(p.estado) && p.documento).length;
    const porVend = {};
    vis.forEach((v) => (porVend[v.vendedor] = porVend[v.vendedor] || []).push(v));
    $("#eq", root).outerHTML = `<div class="kpis">
        <div class="kpi"><div class="v">${vis.length}</div><div class="l">Visitas hoy</div></div>
        <div class="kpi"><div class="v">${enTienda}</div><div class="l">En tienda ahora</div></div>
        <div class="kpi"><div class="v" style="color:${fuera ? "var(--rosa-t)" : "inherit"}">${fuera}</div><div class="l">Fuera de la tienda (GPS)</div></div>
        <div class="kpi"><div class="v">${porImprimir}</div><div class="l">Órdenes por imprimir</div></div></div>
      ${Object.entries(porVend).map(([n, vs]) => {
        const ini = vs[0].checkin_at, fin = vs.filter((v) => v.checkout_at).slice(-1)[0]?.checkout_at;
        return `<div class="card"><div class="row" style="margin-bottom:10px"><div class="ava">${esc(iniciales(n))}</div><div class="grow"><h3>${esc(n)}</h3>
          <div class="small muted">Inicio ${fmtHora(ini)} · ${fin ? "último cierre " + fmtHora(fin) : "sin cierres"} · ${plur(vs.length, "visita")}</div></div></div>
          <div class="list solo-movil">${vs.map((v) => `<div class="inv fv-link" data-fv="${v.id}" role="button" tabindex="0"><div class="row"><b class="sp">${esc(v.tienda)}</b>${G.gps(v)}</div>
            <div class="small muted" style="margin-top:4px">${fmtHora(v.checkin_at)} → ${v.checkout_at ? fmtHora(v.checkout_at) : "<b style='color:var(--azul-osc)'>abierta</b>"}${v.minutos_en_tienda != null ? " · " + fmtNum(v.minutos_en_tienda, 0) + " min" : ""} · ${v.num_fotos} fotos · inventario ${v.con_inventario ? "✓" : "—"}</div></div>`).join("")}</div>
          <div class="scroll-x solo-escritorio"><table class="t"><tr><th>Tienda</th><th>Entrada</th><th>Salida</th><th>Min</th><th>GPS</th><th>Fotos</th><th>Inv.</th></tr>
          ${vs.map((v) => `<tr class="fv-link" data-fv="${v.id}"><td><b>${esc(v.tienda)}</b></td><td>${fmtHora(v.checkin_at)}</td><td>${v.checkout_at ? fmtHora(v.checkout_at) : `<span class="pill p-azul">Abierta</span>`}</td>
            <td>${v.minutos_en_tienda != null ? fmtNum(v.minutos_en_tienda, 0) : "–"}</td>
            <td>${G.gps(v)}</td>
            <td>${v.num_fotos}</td><td>${v.con_inventario ? "✓" : "–"}</td></tr>`).join("")}</table></div></div>`;
      }).join("") || `<div class="empty card flat"><div class="ic">${ic("reloj", 34)}</div>Todavía no hay visitas hoy.</div>`}`;
  },

  // ---------------- PROGRAMACIÓN (visitas programadas) ----------------
  async programacion(root, sel, vend) {
    const dias = proximosDias(7);
    sel = sel || dias[1].iso; // por defecto: mañana
    const dSel = dias.find((d) => d.iso === sel) || dias[1];
    root.innerHTML = `<div class="top"><div><div class="muted small">Visitas programadas</div><h1>Programación</h1></div></div><div id="pg" class="muted">Cargando…</div>`;
    const [{ data: asig, error }, { data: obj }, { data: vis }, { data: just }] = await Promise.all([
      sb.from("asignacion_tiendas").select("vendedor_id, cliente_id, dias_semana, orden, clientes(nombre, cadena, zona), perfiles(nombre)"),
      sb.from("objetivos").select("cliente_id, objetivo_usd, venta_usd, objetivo_kg, venta_kg").eq("mes", mesActual()),
      dSel.iso <= hoyISO() ? sb.from("v_visitas").select("vendedor_id, cliente_id, checkin_at, checkout_at, estado").eq("fecha", dSel.iso) : Promise.resolve({ data: [] }),
      sb.from("visitas_justificadas").select("vendedor_id, cliente_id, motivo, nota").eq("fecha", dSel.iso),
    ]);
    if (error) { $("#pg", root).textContent = error.message; return; }
    const vendedoras = [...new Map(asig.map((a) => [a.vendedor_id, a.perfiles?.nombre || "—"])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const O = {}; (obj || []).forEach((o) => { const x = (O[o.cliente_id] = O[o.cliente_id] || { o: 0, v: 0 }); x.o += Number((conDinero() ? o.objetivo_usd : o.objetivo_kg) || 0); x.v += Number((conDinero() ? o.venta_usd : o.venta_kg) || 0); });
    // Semana: tiendas por vendedora y día
    const semana = vendedoras.map(([id, n]) => ({ id, n, d: [1, 2, 3, 4, 5, 6].map((w) => asig.filter((a) => a.vendedor_id === id && (a.dias_semana || []).includes(w)).length),
      sin: asig.filter((a) => a.vendedor_id === id && !(a.dias_semana || []).length).length }));
    const delDia = asig.filter((a) => (a.dias_semana || []).includes(dSel.dia) && (!vend || a.vendedor_id === vend));
    const porV = {}; delDia.forEach((a) => (porV[a.vendedor_id] = porV[a.vendedor_id] || []).push(a));
    const estado = (a) => {
      const jj = (just || []).find((x) => x.vendedor_id === a.vendedor_id && x.cliente_id === a.cliente_id);
      const hecha = (vis || []).some((v) => v.vendedor_id === a.vendedor_id && v.cliente_id === a.cliente_id);
      if (jj && !hecha) return `<span class="pill p-gris" title="${esc(jj.nota || "")}">Justificada: ${esc(motivoNoVisita(jj.motivo))}</span>`;
      return estadoBase(a);
    };
    const puedeJust = DB.puede("rutas");
    const enlaceJust = (a) => {
      if (!puedeJust) return "";
      const jj = (just || []).find((x) => x.vendedor_id === a.vendedor_id && x.cliente_id === a.cliente_id);
      const hecha = (vis || []).some((v) => v.vendedor_id === a.vendedor_id && v.cliente_id === a.cliente_id);
      if (hecha) return "";
      return `<button type="button" class="just-lk" data-just="${a.vendedor_id}|${a.cliente_id}">${jj ? "Cambiar justificación" : "Justificar"}</button>`;
    };
    const estadoBase = (a) => {
      if (dSel.iso > hoyISO()) return `<span class="pill p-gris">Programada</span>`;
      const x = (vis || []).find((v) => v.vendedor_id === a.vendedor_id && v.cliente_id === a.cliente_id);
      if (x) return x.checkout_at ? `<span class="pill p-menta">✓ ${fmtHora(x.checkin_at)}–${fmtHora(x.checkout_at)}</span>` : `<span class="pill p-azul">En tienda desde ${fmtHora(x.checkin_at)}</span>`;
      return dSel.iso < hoyISO() ? `<span class="pill p-rosa">No visitada</span>` : `<span class="pill p-durazno">Pendiente</span>`;
    };
    const tit = dSel.etiqueta === "Hoy" || dSel.etiqueta === "Mañana" ? `${dSel.etiqueta} · ${DIAS[dSel.dia].toLowerCase()} ${new Date(dSel.iso + "T12:00:00").getDate()}` : DIAS[dSel.dia] + " " + new Date(dSel.iso + "T12:00:00").getDate();
    $("#pg", root).outerHTML = `
      <div class="steps">${dias.map((d) => `<div class="step ${d.iso === dSel.iso ? "on" : ""}" data-d="${d.iso}">${d.etiqueta}</div>`).join("")}</div>
      <select class="in" id="fv" style="margin-bottom:14px"><option value="">Todas las vendedoras</option>${vendedoras.map(([id, n]) => `<option value="${id}" ${id === vend ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
      <div class="kpis">
        <div class="kpi"><div class="v">${delDia.length}</div><div class="l">Visitas programadas · ${esc(tit)}</div></div>
        <div class="kpi"><div class="v">${Object.keys(porV).length}</div><div class="l">Vendedoras con ruta</div></div>
        ${dSel.iso <= hoyISO() ? `<div class="kpi"><div class="v">${delDia.filter((a) => (vis || []).some((v) => v.vendedor_id === a.vendedor_id && v.cliente_id === a.cliente_id)).length}</div><div class="l">Visitadas</div></div>` : ""}
      </div>
      ${Object.entries(porV).sort((a, b) => (a[1][0].perfiles?.nombre || "").localeCompare(b[1][0].perfiles?.nombre || "")).map(([vid, xs]) => `
        <details class="card acord" ${Object.keys(porV).length === 1 ? "open" : ""}><summary class="row"><div class="ava">${esc(iniciales(xs[0].perfiles?.nombre))}</div><div class="grow"><h3>${esc(xs[0].perfiles?.nombre || "—")}</h3><div class="small muted">${plur(xs.length, "tienda")} · ${esc(tit)}</div></div><span class="acord-f">${ic("chev", 18)}</span></summary>
        <div class="list" style="margin-top:10px">${xs.sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999) || a.clientes.nombre.localeCompare(b.clientes.nombre)).map((a) => { const o = O[a.cliente_id], pc = o ? pct(o.v, o.o) : null;
          return `<div class="row" style="padding:8px 0;border-top:1px solid var(--borde)"><div class="grow"><div style="font-weight:500">${esc(a.clientes.nombre)}</div><div class="tiny muted">${esc(a.clientes.cadena || "")}${o ? (conDinero() ? ` · objetivo ${fmtUsd(o.o)} · facturado ${fmtUsd(o.v)}` : ` · objetivo ${fmtKilos(o.o)} · vendido ${fmtKilos(o.v)}`) : ""}</div>${enlaceJust(a)}</div>
            ${pc != null ? `<span class="pill ${colorPct(pc)}">${pc}%</span>` : ""} ${estado(a)}</div>`; }).join("")}</div></details>`).join("") || `<div class="empty card flat"><div class="ic">${ic("ruta", 34)}</div>No hay visitas programadas para este día.</div>`}
      <h3 style="margin:22px 0 10px">Semana por vendedora</h3>
      <div class="card scroll-x lim5"><table class="t"><tr><th>Vendedora</th>${[1, 2, 3, 4, 5, 6].map((w) => `<th style="text-align:center">${DIAS_C[w]}</th>`).join("")}<th style="text-align:center">Total</th><th>Sin día</th></tr>
        ${semana.map((r) => `<tr><td>${esc(r.n)}</td>${r.d.map((c, i) => `<td style="text-align:center;${i + 1 === dSel.dia ? "background:var(--azul-cl);font-weight:600" : ""}">${c || "–"}</td>`).join("")}<td style="text-align:center"><b>${r.d.reduce((a, b) => a + b, 0)}</b></td><td>${r.sin ? `<span class="pill p-durazno">${r.sin}</span>` : "–"}</td></tr>`).join("")}</table></div>
      <p class="tiny muted">"Sin día" son tiendas asignadas a la vendedora que no tienen día de visita definido.</p>`;
    $$("[data-d]", root).forEach((el) => (el.onclick = () => G.programacion(root, el.dataset.d, vend)));
    $("#fv").onchange = (e) => G.programacion(root, dSel.iso, e.target.value || null);
    // Gerencia registra (o quita) la justificación por la vendedora: p. ej. la citó a la oficina
    $$("[data-just]", root).forEach((b) => (b.onclick = () => {
      const [vid, cid] = b.dataset.just.split("|"), a = asig.find((x) => x.vendedor_id === vid && String(x.cliente_id) === cid);
      const jj = (just || []).find((x) => x.vendedor_id === vid && String(x.cliente_id) === cid);
      const otras = delDia.filter((x) => x.vendedor_id === vid && String(x.cliente_id) !== cid && !(vis || []).some((v) => v.vendedor_id === vid && v.cliente_id === x.cliente_id) && !(just || []).some((y) => y.vendedor_id === vid && y.cliente_id === x.cliente_id));
      let sel = jj?.motivo || "", todas = false;
      modal("", (m, close) => {
        const sheet = $(".sheet", m);
        const pintar = (nota = jj?.nota || "") => {
          sheet.innerHTML = `<h2 style="margin-bottom:4px">Justificar visita</h2>
            <p class="muted small" style="margin:0 0 12px"><b>${esc(a.clientes.nombre)}</b> · ${esc(a.perfiles?.nombre || "")} · ${esc(tit)}. No contará en su cumplimiento de ruta y ella lo verá en su Ruta.</p>
            <div class="list">${MOTIVOS_NO_VISITA.map(([k, t]) => `<div class="check ${sel === k ? "on" : ""}" data-mot="${k}"><div class="box">✓</div><div>${esc(t)}</div></div>`).join("")}</div>
            <label class="f">${sel === "otro" ? "Escribe el motivo" : 'Comentario <span class="tiny muted">(opcional)</span>'}</label><input class="in" id="jn" maxlength="140" value="${esc(nota)}" placeholder="Ej.: reunión con gerencia a las 2 p. m.">
            ${!jj && otras.length ? `<div class="check ${todas ? "on" : ""}" data-todas style="margin-top:10px"><div class="box">✓</div><div>Aplicar también a ${otras.length === 1 ? "su otra tienda" : "sus otras " + otras.length + " tiendas"} sin visitar de ese día</div></div>` : ""}
            <div class="row" style="margin-top:16px"><button class="btn sec sp" data-no>${jj ? "Quitar justificación" : "Cancelar"}</button><button class="btn sp" data-ok>Guardar</button></div>`;
          $$("[data-mot]", sheet).forEach((el) => (el.onclick = () => { sel = el.dataset.mot; pintar($("#jn", sheet).value); }));
          const t = $("[data-todas]", sheet); if (t) t.onclick = () => { todas = !todas; pintar($("#jn", sheet).value); };
          $("[data-no]", sheet).onclick = async () => {
            if (jj) { const r = await sb.from("visitas_justificadas").delete().match({ vendedor_id: vid, cliente_id: a.cliente_id, fecha: dSel.iso }); if (r.error) return toast(r.error.message, 4000); toast("Justificación quitada"); }
            close(); if (jj) G.programacion(root, dSel.iso, vend);
          };
          $("[data-ok]", sheet).onclick = async () => {
            const nota = $("#jn", sheet).value.trim();
            if (!sel) return toast("Elige el motivo");
            if (sel === "otro" && !nota) return toast("Escribe el motivo");
            const filas = (todas ? [a, ...otras] : [a]).map((x) => ({ vendedor_id: vid, cliente_id: x.cliente_id, fecha: dSel.iso, motivo: sel, nota: nota || null }));
            const r = await sb.from("visitas_justificadas").upsert(filas, { onConflict: "vendedor_id,cliente_id,fecha" });
            if (r.error) return toast(r.error.message, 4000);
            close(); toast(filas.length === 1 ? "Visita justificada" : filas.length + " visitas justificadas"); G.programacion(root, dSel.iso, vend);
          };
        };
        pintar();
      });
    }));
  },

  // ---------------- OBJETIVOS ----------------
  // Velocímetro de avance: arco de 0 a 100 %, con una marca donde debería ir según el día del mes (ritmo)
  velocimetro(pc, esperado, tono, ancho = 150, oscuro = false) {
    const r = 64, L = Math.PI * r, v = Math.max(0, Math.min(100, pc || 0)), col = oscuro ? { ok: "#5FD39B", medio: "#FFD39A", bajo: "#FFB4AE", "": "#FFFFFF" }[tono] : { ok: "#0F7A4F", medio: "#B7791F", bajo: "#B3261E", "": "#2F5BEA" }[tono];
    const a = Math.PI * (1 - Math.max(0, Math.min(100, esperado || 0)) / 100), px = (k) => 80 + k * Math.cos(a), py = (k) => 76 - k * Math.sin(a);
    return `<svg class="velo" role="img" aria-label="${pc ?? 0} por ciento del objetivo" width="${ancho}" height="${Math.round(ancho * 0.6)}" viewBox="0 0 160 96">
      <path d="M16 76 A64 64 0 0 1 144 76" fill="none" stroke="${oscuro ? "rgba(255,255,255,.22)" : "#E9EDF5"}" stroke-width="14" stroke-linecap="round"></path>
      <path d="M16 76 A64 64 0 0 1 144 76" fill="none" stroke="${col}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${(v / 100) * L} ${L}"></path>
      ${esperado != null ? `<line x1="${px(r - 11)}" y1="${py(r - 11)}" x2="${px(r + 11)}" y2="${py(r + 11)}" stroke="${oscuro ? "#FFFFFF" : "#0B1B33"}" stroke-width="3" stroke-linecap="round"></line>` : ""}
      <text x="80" y="74" text-anchor="middle" fill="${oscuro ? "#FFFFFF" : "#0B1B33"}" font-size="30" font-weight="700">${pc ?? 0}%</text>
      <text x="80" y="92" text-anchor="middle" fill="${oscuro ? "#D6E0FF" : "#5B6577"}" font-size="10.5">del objetivo</text></svg>`;
  },

  async objetivos(root, sel) {
    root.innerHTML = `<div class="top"><div><div class="muted small">${new Date(mesActual() + "T12:00:00").toLocaleDateString("es-PA", { month: "long", year: "numeric" })}</div><h1>Objetivos de venta</h1></div></div><div id="ob" class="muted">Cargando…</div>`;
    const [{ data, error }, { data: prods }] = await Promise.all([
      sb.from("v_objetivos").select("*").eq("mes", mesActual()).limit(5000),
      sb.from("productos").select("*").order("nombre"),
    ]);
    if (error) { $("#ob", root).textContent = error.message; return; }
    if (!data.length) { $("#ob", root).outerHTML = `<div class="empty card flat"><div class="ic">${ic("ok", 34)}</div>Todavía no hay objetivos cargados para este mes.</div>`; return; }
    const grupo = (o) => o.vendedora || "Sin vendedora · " + (o.zona || "—");
    const sum = (xs, k) => xs.reduce((a, o) => a + Number(o[k] || 0), 0);
    // Gerencia (o quien tenga «Ver montos en dólares») mide en dólares y además ve los kilos; los demás ven solo kilos.
    const din = conDinero(), KO = din ? "objetivo_usd" : "objetivo_kg", KV = din ? "venta_usd" : "venta_kg", fM = din ? fmtUsd : fmtKilos;
    const corte = data.map((o) => o.corte).filter(Boolean).sort().pop();
    const G = {}; data.forEach((o) => (G[grupo(o)] = G[grupo(o)] || []).push(o));
    const prodCols = prods.filter((p) => data.some((o) => o.producto_id === p.id));
    // Ritmo: a la fecha del corte de facturación debería ir este porcentaje del mes. El color compara el avance contra ese ritmo.
    const m0 = mesActual(), dMes = new Date(Number(m0.slice(0, 4)), Number(m0.slice(5, 7)), 0).getDate(), esperado = corte ? Math.round((Number(corte.slice(8, 10)) / dMes) * 100) : null;
    const tonoDe = (pc) => { if (pc == null) return ""; if (pc >= 100) return "ok"; const r = esperado ? (pc / esperado) * 100 : 100; return r >= 95 ? "ok" : r >= 75 ? "medio" : "bajo"; };
    const etqDe = (pc) => ({ ok: pc >= 100 ? "Objetivo cumplido" : "Al ritmo del mes", medio: "Un poco atrás", bajo: "Atrás del ritmo", "": "Sin objetivo" }[tonoDe(pc)]);
    const grupos = Object.entries(G).map(([g, xs]) => ({ g, xs, obj: sum(xs, KO), ven: sum(xs, KV) })).sort((a, b) => (a.g.startsWith("Sin") - b.g.startsWith("Sin")) || b.obj - a.obj);
    const xsSel = sel && G[sel] ? G[sel] : data, obj = sum(xsSel, KO), ven = sum(xsSel, KV), pcT = pct(ven, obj), nT = new Set(xsSel.map((o) => o.cliente_id)).size;
    const prodDe = (xs, p) => { const x = xs.filter((o) => o.producto_id === p.id), ok = sum(x, "objetivo_kg"), vk = sum(x, "venta_kg"); return { n: p.nombre.replace(/^Queso /, ""), ok, vk, pc: pct(vk, ok), cv: cajas(vk, p), co: cajas(ok, p) }; };
    const barraP = (q) => `<div class="mb"><div class="mb-t"><span><b>${esc(q.n)}</b><span class="tiny muted"> · ${fmtNum(q.cv, 1)} de ${fmtNum(q.co, 0)} cajas</span></span><span class="mb-v ${tonoDe(q.pc)}">${q.pc ?? 0}%</span></div><div class="barra"><i class="${tonoDe(q.pc) || "ok"}" style="width:${Math.min(100, q.pc ?? 0)}%"></i></div></div>`;
    const cab = `<div class="met-fil"><select class="in" id="ob-v" aria-label="Vendedora"><option value="">Todas las vendedoras</option>${[...grupos].sort((a, b) => (a.g.startsWith("Sin") - b.g.startsWith("Sin")) || a.g.localeCompare(b.g)).map((r) => `<option value="${esc(r.g)}" ${r.g === sel ? "selected" : ""}>${esc(r.g)}</option>`).join("")}</select></div>
      <div class="card desemp panel met-h">${this.velocimetro(pcT, esperado, tonoDe(pcT), 168, true)}
        <div class="met-ht"><div class="lbl">${sel && G[sel] ? esc(sel) : "Toda la empresa"}</div><span class="desemp-tag ${tonoDe(pcT)}">${etqDe(pcT)}</span>
          <div class="met-cif"><b>${fM(ven)}</b> de ${fM(obj)}</div>${din ? `<div class="tiny desemp-cifras" style="margin-top:2px">${fmtKilos(sum(xsSel, "venta_kg"))} de ${fmtKilos(sum(xsSel, "objetivo_kg"))}</div>` : ""}</div>
        <div class="desemp-mini" style="width:100%"><div><span>${din ? "Facturado" : "Vendido"} al</span><b>${corte ? fmtFecha(corte + "T12:00:00") : "–"}</b></div><div><span>Ritmo esperado a esa fecha</span><b>${esperado ?? "–"}%</b></div><div><span>Falta para el objetivo</span><b>${fM(Math.max(0, obj - ven))}</b></div><div><span>Tiendas con objetivo</span><b>${nT}</b></div></div></div>
      <div class="met-pg">${prodCols.map((p) => { const q = prodDe(xsSel, p); return `<div class="card met-pc">${this.velocimetro(q.pc, esperado, tonoDe(q.pc), 124)}<b>${esc(q.n)}</b><span class="tiny muted">${fmtNum(q.cv, 1)} de ${fmtNum(q.co, 0)} cajas</span></div>`; }).join("")}</div>`;
    let cuerpo;
    if (sel && G[sel]) {
      const tiendas = [...new Set(xsSel.map((o) => o.cliente_id))].map((id) => { const t = xsSel.filter((o) => o.cliente_id === id), pc = pct(sum(t, KV), sum(t, KO)); return { t, n: t[0].tienda, pc, ven: sum(t, KV), obj: sum(t, KO) }; }).sort((a, b) => (a.pc ?? 0) - (b.pc ?? 0));
      cuerpo = `<div class="card"><h3 style="margin:0 0 2px">Avance por producto</h3>${prodCols.map((p) => prodDe(xsSel, p)).filter((q) => q.ok > 0).map(barraP).join("")}</div>
        <div class="card"><div class="row" style="margin-bottom:2px"><h3 class="sp" style="margin:0">Sus tiendas</h3><span class="tiny muted">de menor a mayor avance</span></div>
        ${R.paginar(tiendas.map((f) => `<div class="inv-f"><i class="sem-d ${tonoDe(f.pc) || "sin"}"></i><div class="grow"><b>${esc(f.n)}</b><div class="tiny muted">${prodCols.map((p) => prodDe(f.t, p)).filter((q) => q.ok > 0).map((q) => `${esc(q.n)} ${fmtNum(q.cv, 1)} de ${fmtNum(q.co, 0)} cj`).join(" · ")}</div></div><b class="inv-v ${tonoDe(f.pc)}">${f.pc ?? 0}%<small>${fM(f.ven)} de ${fM(f.obj)}</small></b></div>`), "mett")}</div>`;
    } else {
      // Lista corta (cuadro de 5 filas que se desliza): con muchas vendedoras no hay que bajar la página. El filtro de arriba o tocar una fila abre su tarjeta.
      cuerpo = `<div class="card"><div class="row" style="margin-bottom:2px"><h3 class="sp" style="margin:0">Por vendedora</h3><span class="tiny muted">de menor a mayor avance</span></div>
        ${R.paginar([...grupos].sort((a, b) => (a.g.startsWith("Sin") - b.g.startsWith("Sin")) || (pct(a.ven, a.obj) ?? 0) - (pct(b.ven, b.obj) ?? 0)).map((r) => { const pc = pct(r.ven, r.obj); return `<div class="inv-f met-v" data-g="${esc(r.g)}" role="button" tabindex="0"><i class="sem-d ${tonoDe(pc) || "sin"}"></i><div class="grow"><b>${esc(r.g)}</b><div class="tiny muted">${plur(new Set(r.xs.map((o) => o.cliente_id)).size, "tienda")} · ${fM(r.ven)} de ${fM(r.obj)}</div><div class="barra"><i class="${tonoDe(pc) || "ok"}" style="width:${Math.min(100, pc ?? 0)}%"></i></div></div><b class="inv-v ${tonoDe(pc)}">${pc ?? 0}%<small>ver ›</small></b></div>`; }), "metv")}</div>`;
    }
    $("#ob", root).outerHTML = cab + cuerpo + `<p class="tiny muted" style="margin:4px 2px 14px">La raya del velocímetro marca dónde debería ir el avance a la fecha del corte (${esperado ?? "–"}% del mes). Verde: al ritmo o cumplido. Ámbar: un poco atrás. Rojo: atrás del ritmo.</p>`;
    $("#ob-v", root).onchange = (e) => this.objetivos(root, e.target.value || undefined);
    $$(".met-v[data-g]", root).forEach((c) => (c.onclick = () => { this.objetivos(root, c.dataset.g); window.scrollTo({ top: 0 }); }));
    if (typeof LIM5 !== "undefined") LIM5.aplicar();
  },

  gps(v) {
    const d = Math.max(v.checkin_dist_m || 0, v.checkout_dist_m || 0);
    if (v.checkin_dentro === false || v.checkout_dentro === false) return `<span class="pill p-rosa">Fuera · ${fmtDist(d)}</span>`;
    if (v.checkin_dentro) return `<span class="pill p-menta">Dentro · ${fmtDist(Math.max(v.checkin_dist_m || 0, v.checkout_dist_m || 0))}</span>`;
    return `<span class="pill p-gris">Tienda sin ubicación</span>`;
  },

  // ---------------- USUARIOS (admin) ----------------

};
