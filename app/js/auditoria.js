// Clarus · Auditoría de espacio (share of shelf) por tienda.
// La vendedora registra los muebles REALES de la tienda y marca cada espacio: nuestro producto, competencia, otra categoría o vacío.
// Participación en la categoría = nuestros frentes ÷ (nuestros + competencia). La siguiente auditoría sale llena con la anterior.
const AUD = {
  DIAS: 30, // cada cuánto toca auditar una tienda

  ultima(cat, clienteId) { return (cat.ultAud || []).find((a) => a.cliente_id === clienteId) || null; },
  toca(cat, clienteId) {
    const u = this.ultima(cat, clienteId);
    return !u || (Date.now() - new Date(u.fecha + "T12:00:00").getTime()) / 864e5 >= this.DIAS;
  },
  mueblesTienda(cat, clienteId) {
    return (cat.tiendaMuebles || []).filter((m) => m.cliente_id === clienteId).sort((a, b) => a.orden - b.orden)
      .map((m) => ({ mueble: m.mueble, niveles: m.niveles, posiciones: m.posiciones, celdas: m.celdas || [], porNivel: m.por_nivel || null }));
  },
  productos(cat) {
    const out = {};
    (cat.productos || []).forEach((p, i) => (out[PL.claveProd(p)] = { nombre: p.nombre, color: PL.COLORES[i % PL.COLORES.length] }));
    out[PL.COMP] = { nombre: "Competencia", color: "#9AA6B8", comp: true };
    out[PL.OTRA] = { nombre: "Otra categoría", color: "#E7ECF2", comp: true, otra: true };
    return out;
  },

  // Tarjeta dentro del paso Gestión de la visita
  enVisita(v, cat) {
    const u = this.ultima(cat, v.cliente_id), toca = this.toca(cat, v.cliente_id), hecha = v.auditoria;
    const estado = hecha ? `<span class="pill p-menta">Hecha hoy · ${hecha.pct == null ? "–" : hecha.pct + "%"}</span>`
      : toca ? `<span class="pill p-durazno">Toca este mes</span>` : `<span class="pill p-gris">Al día</span>`;
    return `<div class="card aud-card ${toca && !hecha ? "pend" : ""}" style="margin-bottom:14px">
      <div class="aud-cab"><div class="grow"><b>Auditoría de espacio</b>
        <div class="tiny muted">${u ? `Última: ${fmtFecha(u.fecha + "T12:00:00")} · ${u.pct == null ? "sin categoría" : u.pct + "% de la categoría"}` : "Esta tienda aún no tiene auditoría."}</div></div>${estado}</div>
      <div class="tiny muted" style="margin:8px 0">Cuenta los espacios de cada mueble y marca los nuestros y los de la competencia. ${u ? "Sale llena con la anterior: solo corrige lo que cambió." : ""}</div>
      <button class="btn ${hecha || !toca ? "ghost" : ""} block" data-aud>${hecha ? "Revisar auditoría" : u ? "Actualizar auditoría" : "Hacer auditoría"}</button></div>`;
  },
  enlazarVisita(box, v, cat, volver) {
    const b = $("[data-aud]", box); if (b) b.onclick = () => this.editor(box, v, cat, volver);
  },

  // Editor de la auditoría (pantalla completa dentro del paso)
  editor(box, v, cat, volver) {
    const productos = this.productos(cat);
    let muebles = (v.audMuebles || this.mueblesTienda(cat, v.cliente_id)).map((m) => ({ ...m, celdas: JSON.parse(JSON.stringify(m.celdas || [])) }));
    if (!muebles.length) muebles = [{ mueble: "nevera", niveles: PL.TIPO.nevera.nv, posiciones: PL.ESPACIOS.nevera, celdas: [] }];
    let mi = 0, pincel = Object.keys(productos)[0], borrar = false;
    const m = () => muebles[mi];
    const ajustar = (x) => {
      const isla = x.mueble === "exhibidor";
      if (isla && (!x.porNivel || x.porNivel.length !== x.niveles)) x.porNivel = PL.piramide(x.niveles, x.posiciones);
      const c = [];
      for (let n = 0; n < x.niveles; n++) { c.push([]); const cant = isla ? x.porNivel[n] : x.posiciones; for (let p = 0; p < cant; p++) c[n].push(x.celdas?.[n]?.[p] || null); }
      if (isla) x.posiciones = Math.max(...x.porNivel);
      x.celdas = c;
    };
    muebles.forEach(ajustar);
    const guardarLocal = () => { v.audMuebles = muebles; Visita.set(v); };
    const todo = () => ({ celdas: muebles.flatMap((x) => x.celdas) });

    const pintar = () => {
      const x = m(), pl = { ...x, productos, nombre: "" };
      box.innerHTML = `<button class="btn ghost sm" data-volver>‹ Volver a Gestión</button>
        <h2 style="margin:12px 0 4px">Auditoría de espacio</h2><div class="small muted">${esc((cat.clientes || []).find((c) => c.id === v.cliente_id)?.nombre || "")}</div>
        <div class="card" style="margin-top:12px">${PL.barraEspacio(PL.espacio(todo()))}</div>
        <div class="card">
          <h3 class="sec-t" style="margin-top:0">Muebles de la tienda</h3>
          <div class="pl-mtabs">${muebles.map((y, i) => `<button type="button" class="pl-mtab ${i === mi ? "on" : ""}" data-mtab="${i}">${PL.icono(y.mueble, 22)}<span>${esc(PL.MUEBLES[y.mueble])}</span></button>`).join("")}<button type="button" class="pl-mtab mas" data-madd>+ Agregar mueble</button></div>
          <label class="f">Tipo de este mueble</label>
          <div class="pl-tipos">${Object.entries(PL.MUEBLES).map(([k, t]) => `<button type="button" class="pl-tipo ${k === x.mueble ? "on" : ""}" data-mueble="${k}">${PL.icono(k)}<span>${t}</span></button>`).join("")}</div>
          <div class="grid2c"><div><label class="f">Niveles</label><input class="in" type="number" min="1" max="${PL.TIPO[x.mueble].max}" id="anv" value="${x.niveles}"></div>
            ${x.mueble === "exhibidor" ? "<div></div>" : `<div><label class="f">Espacios por nivel</label><input class="in" type="number" min="1" max="30" id="aps" value="${x.posiciones}"></div>`}</div>
          ${x.mueble === "exhibidor" ? `<label class="f">Espacios por piso</label><div class="pl-pisos">${x.porNivel.map((q, n) => `<label class="tiny">Piso ${x.niveles - n}<input class="in" type="number" min="1" max="30" data-piso="${n}" value="${q}"></label>`).join("")}</div>` : ""}
        </div>
        <div class="card">
          <div class="small"><b>¿Qué hay en cada espacio?</b> Elige y toca los espacios (puedes arrastrar el dedo).</div>
          <div class="aud-pinceles">${Object.entries(productos).map(([k, c]) => `<button type="button" class="aud-pin ${pincel === k && !borrar ? "on" : ""}" data-pin="${k}"><span class="pl-dot ${c.otra ? "pl-otra" : c.comp ? "pl-comp" : ""}" style="${c.comp ? "" : `background:${c.color}`}"></span>${esc(c.nombre.replace(/^Queso /, ""))}</button>`).join("")}
            <button type="button" class="aud-pin ${borrar ? "on" : ""}" data-borrar>Vacío / borrar</button></div>
          <div class="row" style="margin:10px 0 8px"><b class="grow">${esc(PL.MUEBLES[x.mueble])}${muebles.length > 1 ? ` <span class="tiny muted">· ${mi + 1} de ${muebles.length}</span>` : ""}</b>
            <button class="btn ghost sm" data-limpiar>Vaciar</button>${muebles.length > 1 ? `<button class="btn ghost sm" data-mquitar>Quitar</button>` : ""}</div>
          ${PL.dibujo(pl, true)}
          <div style="margin-top:12px">${PL.barraEspacio(PL.espacio(pl))}</div>
        </div>
        <button class="btn block" data-guardar style="margin-top:4px">Guardar auditoría</button>`;
      $("[data-volver]", box).onclick = () => { guardarLocal(); volver(); };
      $$("[data-mtab]", box).forEach((b) => (b.onclick = () => { mi = +b.dataset.mtab; pintar(); }));
      $("[data-madd]", box).onclick = () => { muebles.push({ mueble: "nevera", niveles: PL.TIPO.nevera.nv, posiciones: PL.ESPACIOS.nevera, celdas: [] }); ajustar(muebles[muebles.length - 1]); mi = muebles.length - 1; guardarLocal(); pintar(); toast("Mueble nuevo: elige su tipo y cuenta sus espacios"); };
      $$("[data-mueble]", box).forEach((b) => (b.onclick = () => {
        const t = b.dataset.mueble, y = m(); if (t === y.mueble) return;
        const nuevo = { mueble: t, niveles: PL.TIPO[t].nv, posiciones: PL.ESPACIOS[t], celdas: [] }; ajustar(nuevo);
        if (y.celdas.flat().some(Boolean)) { muebles.push(nuevo); mi = muebles.length - 1; toast(`Se agregó ${PL.MUEBLES[t]} como otro mueble. El anterior conserva lo marcado.`); }
        else muebles[mi] = nuevo;
        guardarLocal(); pintar();
      }));
      $("#anv", box).onchange = (e) => {
        const y = m(), nv = Math.min(PL.TIPO[y.mueble].max, Math.max(1, Number(e.target.value) || 1)), dif = nv - y.niveles;
        y.celdas = dif > 0 ? [...Array(dif).fill(null), ...y.celdas] : y.celdas.slice(-dif); // se agregan o quitan arriba
        if (y.porNivel) y.porNivel = dif > 0 ? [...PL.piramide(nv, y.porNivel[y.porNivel.length - 1]).slice(0, dif), ...y.porNivel] : y.porNivel.slice(-dif);
        y.niveles = nv; ajustar(y); guardarLocal(); pintar();
      };
      const aps = $("#aps", box); if (aps) aps.onchange = () => { const y = m(); y.posiciones = Math.min(30, Math.max(1, Number(aps.value) || 1)); ajustar(y); guardarLocal(); pintar(); };
      $$("[data-piso]", box).forEach((el) => (el.onchange = () => { const y = m(); y.porNivel[+el.dataset.piso] = Math.min(30, Math.max(1, Number(el.value) || 1)); ajustar(y); guardarLocal(); pintar(); }));
      $$("[data-pin]", box).forEach((b) => (b.onclick = () => { pincel = b.dataset.pin; borrar = false; pintar(); }));
      $("[data-borrar]", box).onclick = () => { borrar = !borrar; pintar(); };
      $("[data-limpiar]", box).onclick = () => { m().celdas = []; ajustar(m()); guardarLocal(); pintar(); };
      const mq = $("[data-mquitar]", box); if (mq) mq.onclick = async () => {
        if (!(await confirmar(`Se quitará ${PL.MUEBLES[m().mueble]} de esta tienda.`, "Quitar mueble"))) return;
        muebles.splice(mi, 1); mi = Math.max(0, mi - 1); guardarLocal(); pintar();
      };
      // marcar espacios (toque o arrastre)
      let arr = false;
      const poner = (el) => { const y = m(), n = +el.dataset.n, p = +el.dataset.p; y.celdas[n][p] = borrar ? null : y.celdas[n][p] === pincel && !arr ? null : pincel; };
      $$(".pl-celda[data-n]", box).forEach((el) => {
        el.onpointerdown = (e) => { e.preventDefault(); poner(el); arr = true; pintar(); };
        el.onpointerenter = () => { if (!arr) return; const y = m(); y.celdas[+el.dataset.n][+el.dataset.p] = borrar ? null : pincel; el.className = "pl-celda " + (borrar ? "" : pincel === PL.COMP ? "comp" : pincel === PL.OTRA ? "otra" : "llena"); el.style.background = borrar || productos[pincel].comp ? "" : productos[pincel].color; };
      });
      document.onpointerup = () => { if (arr) { arr = false; guardarLocal(); pintar(); } };
      $("[data-guardar]", box).onclick = async () => {
        const e = PL.espacio(todo());
        if (!e.nuestro && !e.comp && !e.otra) return toast("Marca al menos los espacios de la categoría (nuestros y de la competencia)");
        const datos = muebles.map((y) => ({ mueble: y.mueble, niveles: y.niveles, posiciones: y.posiciones, celdas: y.celdas, ...(y.mueble === "exhibidor" ? { porNivel: y.porNivel } : {}) }));
        await DB.encolar({ t: "auditoria", lid: v.lid, id_local: "aud-" + v.lid + "-" + Date.now().toString(36), cliente_id: v.cliente_id, muebles: datos });
        // la próxima vez (aunque no haya señal) sale llena con esta
        const c = LS.get("cat");
        if (c) {
          c.tiendaMuebles = (c.tiendaMuebles || []).filter((x) => x.cliente_id !== v.cliente_id).concat(datos.map((y, i) => ({ cliente_id: v.cliente_id, orden: i, mueble: y.mueble, niveles: y.niveles, posiciones: y.posiciones, celdas: y.celdas, por_nivel: y.porNivel || null })));
          c.ultAud = (c.ultAud || []).filter((x) => x.cliente_id !== v.cliente_id).concat([{ cliente_id: v.cliente_id, fecha: hoyISO(), pct: e.pN, nuestro: e.nuestro, competencia: e.comp }]);
          LS.set("cat", c); Object.assign(cat, { tiendaMuebles: c.tiendaMuebles, ultAud: c.ultAud });
        }
        v.auditoria = { pct: e.pN }; delete v.audMuebles; Visita.set(v);
        toast(`Auditoría guardada ✓ · ${e.pN == null ? "sin categoría" : e.pN + "% de la categoría"}`);
        volver();
      };
    };
    pintar();
  },

  // ---------- Resumen: participación en la categoría ----------
  async enResumen(box, hasta, vend, asig) {
    const desde = new Date(new Date(hasta + "T12:00:00").getTime() - 90 * 864e5).toISOString().slice(0, 10);
    const { data, error } = await sb.rpc("participacion_espacio", { p_desde: desde, p_hasta: hasta });
    if (!box.isConnected) return;
    if (error) { box.innerHTML = `<div class="card small muted">${esc(error.message)}</div>`; return; }
    const rows = (data || []).filter((r) => !vend || r.vendedor_id === vend);
    const tiendasAsig = new Set(asig.map((a) => a.cliente_id));
    const suma = (xs) => { const n = xs.reduce((t, r) => t + r.nuestro, 0), c = xs.reduce((t, r) => t + r.competencia, 0); return { n, c, pct: n + c ? Math.round((100 * n) / (n + c)) : null }; };
    const g = suma(rows);
    const grupo = (k) => Object.entries(rows.reduce((o, r) => ((o[r[k] || "—"] = o[r[k] || "—"] || []).push(r), o), {})).map(([nombre, xs]) => ({ nombre, ...suma(xs), tiendas: xs.length })).sort((a, b) => (a.pct ?? 999) - (b.pct ?? 999));
    const flecha = (r) => r.pct_anterior == null || r.pct == null ? "" : r.pct > r.pct_anterior ? `<span class="par-flecha sube">▲ ${Math.round(r.pct - r.pct_anterior)}</span>` : r.pct < r.pct_anterior ? `<span class="par-flecha baja">▼ ${Math.round(r.pct_anterior - r.pct)}</span>` : `<span class="muted">=</span>`;
    const tabla = (xs, titulo) => `<table class="t"><tr><th>${titulo}</th><th>Tiendas</th><th>Nuestros</th><th>Competencia</th><th>Participación</th></tr>${xs.map((x) => `<tr><td><b>${esc(x.nombre)}</b></td><td>${x.tiendas}</td><td>${x.n}</td><td>${x.c}</td><td><span class="pill ${colorPct(x.pct)}">${x.pct ?? "–"}${x.pct == null ? "" : "%"}</span></td></tr>`).join("")}</table>`;
    box.innerHTML = `<h3 class="sec-t">Participación en la categoría</h3>
      ${rows.length ? `<div class="card"><div class="par-top"><span class="par-pct">${g.pct ?? "–"}${g.pct == null ? "" : "%"}</span><span class="muted">de los frentes de la categoría son nuestros</span></div>
          <div class="small muted" style="margin-top:6px">${g.n} frentes nuestros · ${g.c} de la competencia · ${rows.length} de ${tiendasAsig.size} tiendas auditadas en los últimos 90 días</div></div>
        <div class="grid2"><div class="card scroll-x"><h3>Por cadena</h3>${tabla(grupo("cadena"), "Cadena")}</div><div class="card scroll-x"><h3>Por vendedora</h3>${tabla(grupo("vendedor"), "Vendedora")}</div></div>
        <div class="card"><h3>Por tienda <span class="tiny muted">(de menor a mayor participación)</span></h3>
          ${R.paginar(rows.sort((a, b) => (a.pct ?? 999) - (b.pct ?? 999)).map((r) => `<div class="al-fila"><div class="al-t"><b>${esc(r.tienda)}</b><span class="tiny muted">${esc(r.vendedor || "")} · ${fmtFecha(r.fecha + "T12:00:00")} · ${r.nuestro} nuestros / ${r.competencia} competencia</span></div>
            <div class="row" style="gap:8px"><span class="pill ${colorPct(r.pct)}">${r.pct == null ? "–" : Math.round(r.pct) + "%"}</span>${flecha(r)}</div></div>`), "par")}</div>`
      : `<div class="card"><div class="empty"><div class="ic">${ic("resumen", 30)}</div>Aún no hay auditorías de espacio. Las vendedoras las hacen en el paso Gestión de la visita, una vez al mes por tienda.</div></div>`}`;
  },
};
