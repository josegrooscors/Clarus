// Mensajería: comunicados de la gerencia, programados, con "Entendido" y recordatorios hasta confirmar
const MSG = {
  VAPID: "BE1S097QkhQCxtnSzrM4Zkql_5qHPCeABiCXzHUubEQNv__aHttY1LYWFPgfUkn5AYq6D9tspkFtg2UrCIYAZ5Q",
  mios: [],

  // ---------- Datos ----------
  async cargarMios() {
    const { data, error } = await sb.from("comunicado_destinos")
      .select("comunicado_id, leido_at, ok_at, comunicados!inner(id, titulo, cuerpo, requiere_ok, programado_at, anulado, perfiles(nombre))")
      .eq("user_id", DB.user.id).eq("comunicados.anulado", false).lte("comunicados.programado_at", new Date().toISOString());
    if (error) throw error;
    this.mios = (data || []).map((d) => ({ ...d.comunicados, autor: d.comunicados.perfiles?.nombre, leido_at: d.leido_at, ok_at: d.ok_at }))
      .sort((a, b) => b.programado_at.localeCompare(a.programado_at));
    return this.mios;
  },
  pendiente: (m) => !m.leido_at || (m.requiere_ok && !m.ok_at),
  porConfirmar: (m) => m.requiere_ok && !m.ok_at,

  // Contador en el menú y aviso que se repite hasta tocar "Entendido"
  async revisar() {
    if (!DB.user || !navigator.onLine) return;
    try { await this.cargarMios(); } catch { return; }
    const n = this.mios.filter(this.pendiente).length;
    $$('a[href="#mensajes"] .ic').forEach((el) => {
      el.querySelector(".badge-ic")?.remove();
      if (n) el.insertAdjacentHTML("beforeend", `<span class="badge-ic">${n > 9 ? "9+" : n}</span>`);
    });
    const p = this.mios.find(this.porConfirmar);
    const pospuesto = LS.get("msg.pospuesto", 0) > Date.now();
    if (p && !pospuesto && !$(".modal.msg-aviso") && !location.hash.startsWith("#mensajes/" + p.id) && !location.hash.startsWith("#visita")) this.aviso(p);
  },

  aviso(m) {
    modal(`<div class="row" style="gap:10px;margin-bottom:6px"><span style="color:var(--azul)">${ic("msg", 26)}</span><div class="grow"><div class="tiny muted">Comunicado de ${esc(m.autor || "la gerencia")} · ${fmtFecha(m.programado_at)}</div><h2>${esc(m.titulo)}</h2></div></div>
      <div class="msg-cuerpo">${esc(m.cuerpo)}</div>
      <button class="btn block" style="margin-top:16px" data-ok>Entendido</button>
      <button class="btn ghost block sm" style="margin-top:8px" data-luego>Recordármelo en 15 min</button>`,
    (el, close) => {
      el.classList.add("msg-aviso");
      el.addEventListener("click", (e) => { if (e.target === el) e.stopImmediatePropagation(); }, true); // no se cierra tocando afuera
      this.marcar(m, false);
      $("[data-ok]", el).onclick = async () => { await this.marcar(m, true); close(); toast("Confirmado ✓"); this.revisar(); };
      $("[data-luego]", el).onclick = () => { LS.set("msg.pospuesto", Date.now() + 15 * 60000); close(); };
    });
  },

  async marcar(m, ok) {
    const ahora = new Date().toISOString(), cambios = {};
    if (!m.leido_at) cambios.leido_at = m.leido_at = ahora;
    if (ok && !m.ok_at) cambios.ok_at = m.ok_at = ahora;
    if (!Object.keys(cambios).length) return;
    await sb.from("comunicado_destinos").update(cambios).eq("comunicado_id", m.id).eq("user_id", DB.user.id);
  },

  // ---------- Notificaciones del teléfono ----------
  pushPosible: () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
  async activarPush(pedir = false) {
    if (!this.pushPosible()) return "no";
    if (Notification.permission === "denied") return "denegado";
    if (Notification.permission !== "granted") {
      if (!pedir) return "pendiente";
      if ((await Notification.requestPermission()) !== "granted") return "denegado";
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: this.b64(this.VAPID) });
      const j = sub.toJSON();
      await sb.from("push_suscripciones").upsert({ endpoint: j.endpoint, user_id: DB.user.id, p256dh: j.keys.p256dh, auth: j.keys.auth, agente: navigator.userAgent.slice(0, 200) });
      return "ok";
    } catch (e) { console.warn(e); return "error"; }
  },
  b64(s) { const p = "=".repeat((4 - (s.length % 4)) % 4), r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); },
  bannerPush() {
    if (!this.pushPosible() || Notification.permission === "granted") return "";
    if (Notification.permission === "denied") return `<div class="card flat small" style="background:var(--durazno);border-color:#F6DDBB">Las notificaciones están bloqueadas. Actívalas en Chrome: ⋮ › Configuración › Notificaciones › Clarus.</div>`;
    return `<div class="card flat row" style="background:var(--azul-cl);border-color:var(--azul-med)"><span style="color:var(--azul)">${ic("msg", 24)}</span><div class="grow small"><b>Activa las notificaciones</b><br>Para que te suene el teléfono cuando llegue un comunicado.</div><button class="btn sm" data-push>Activar</button></div>`;
  },
  enlazarBanner(root, re) {
    const b = $("[data-push]", root); if (!b) return;
    b.onclick = async () => { const r = await this.activarPush(true); toast(r === "ok" ? "Notificaciones activadas ✓" : r === "denegado" ? "No diste permiso" : "Este teléfono no permite notificaciones"); re(); };
  },

  // ---------- Pantallas ----------
  async render(root, id) {
    if (id) return this.detalle(root, Number(id));
    const gestor = DB.perfil.rol !== "vendedor";
    let tab = gestor ? LS.get("msg.tab", "enviados") : "recibidos";
    const pintar = async () => {
      root.innerHTML = `<div class="top"><div><div class="muted small">Comunicados</div><h1>Mensajes</h1></div>${gestor ? `<button class="btn sm" data-nuevo>+ Nuevo comunicado</button>` : ""}</div>
        ${this.bannerPush()}
        ${gestor ? `<div class="steps">${[["enviados", "Enviados"], ["programados", "Programados"], ["recibidos", "Recibidos"]].map(([k, t]) => `<div class="step ${k === tab ? "on" : ""}" data-tab="${k}">${t}</div>`).join("")}</div>` : ""}
        <div id="ml" class="muted">Cargando…</div>`;
      this.enlazarBanner(root, pintar);
      $$("[data-tab]", root).forEach((el) => (el.onclick = () => { tab = el.dataset.tab; LS.set("msg.tab", tab); pintar(); }));
      const nb = $("[data-nuevo]", root); if (nb) nb.onclick = () => this.nuevo(() => pintar());
      if (tab === "recibidos") {
        await this.cargarMios();
        $("#ml").outerHTML = this.mios.length ? `<div class="card list">${this.mios.map((m) => `<a class="item" href="#mensajes/${m.id}">
            <div class="ava" style="color:var(--azul)">${ic("msg", 22)}</div>
            <div class="grow"><div class="t" style="${this.pendiente(m) ? "font-weight:700" : ""}">${esc(m.titulo)}</div><div class="small muted">${esc(m.autor || "")} · ${fmtFecha(m.programado_at)}</div></div>
            ${this.porConfirmar(m) ? `<span class="pill p-rosa">Por confirmar</span>` : !m.leido_at ? `<span class="pill p-azul">Nuevo</span>` : m.requiere_ok ? `<span class="pill p-menta">Entendido ✓</span>` : ""}</a>`).join("")}</div>`
          : `<div class="empty card flat"><div class="ic">${ic("msg", 34)}</div>No tienes comunicados.</div>`;
        return;
      }
      const ahora = new Date().toISOString();
      let q = sb.from("v_comunicados").select("*").eq("anulado", false).order("programado_at", { ascending: tab === "programados" }).limit(100);
      q = tab === "programados" ? q.gt("programado_at", ahora) : q.lte("programado_at", ahora);
      const { data, error } = await q;
      if (error) { $("#ml").textContent = error.message; return; }
      $("#ml").outerHTML = data.length ? `<div class="card list">${data.map((c) => {
          const pc = c.requiere_ok ? pct(c.confirmados, c.destinatarios) : pct(c.leidos, c.destinatarios);
          return `<a class="item" href="#mensajes/${c.id}"><div class="ava" style="color:var(--azul)">${ic("msg", 22)}</div>
            <div class="grow"><div class="t">${esc(c.titulo)}</div><div class="small muted">${tab === "programados" ? "Sale el " : ""}${fmtFecha(c.programado_at)} ${fmtHora(c.programado_at)} · ${c.destinatarios} destinatario(s)</div>
            ${tab === "enviados" ? `<div style="margin-top:6px">${barra(pc)}</div>` : ""}</div>
            ${tab === "enviados" ? `<span class="pill ${colorPct(pc)}">${c.requiere_ok ? c.confirmados : c.leidos}/${c.destinatarios} ${c.requiere_ok ? "confirmaron" : "leyeron"}</span>` : `<span class="pill p-azul">Programado</span>`}</a>`;
        }).join("")}</div>`
        : `<div class="empty card flat"><div class="ic">${ic("msg", 34)}</div>${tab === "programados" ? "No hay comunicados programados." : "Aún no has enviado comunicados."}</div>`;
    };
    await pintar();
  },

  async detalle(root, id) {
    const gestor = DB.perfil.rol !== "vendedor";
    root.innerHTML = `<div class="muted">Cargando…</div>`;
    await this.cargarMios().catch(() => {});
    const mio = this.mios.find((m) => m.id === id);
    let c = mio, dest = null;
    if (gestor) {
      const [{ data: cc }, { data: dd }] = await Promise.all([sb.from("v_comunicados").select("*").eq("id", id).maybeSingle(),
        sb.from("comunicado_destinos").select("user_id, leido_at, ok_at, recordatorios, perfiles(nombre)").eq("comunicado_id", id)]);
      if (cc) { c = { ...cc, ...(mio ? { leido_at: mio.leido_at, ok_at: mio.ok_at } : {}) }; dest = (dd || []).sort((a, b) => (a.perfiles?.nombre || "").localeCompare(b.perfiles?.nombre || "")); }
    }
    if (!c) { root.innerHTML = `<div class="empty card flat">Este comunicado no existe o fue anulado.</div><a class="btn sec" href="#mensajes">Volver</a>`; return; }
    if (mio) await this.marcar(mio, false);
    const futuro = c.programado_at > new Date().toISOString();
    root.innerHTML = `<a href="#mensajes" class="small" style="text-decoration:none">‹ Mensajes</a>
      <div class="card" style="margin-top:10px"><div class="tiny muted">${esc(c.autor || "")} · ${fmtFecha(c.programado_at)} ${fmtHora(c.programado_at)}${futuro ? " · programado" : ""}</div>
        <h1 style="margin:6px 0 12px">${esc(c.titulo)}</h1><div class="msg-cuerpo">${esc(c.cuerpo)}</div>
        ${mio && mio.requiere_ok ? (mio.ok_at ? `<div class="pill p-menta" style="margin-top:16px">Entendido ✓ · ${fmtHora(mio.ok_at)}</div>` : `<button class="btn block" style="margin-top:16px" data-ok>Entendido</button>`) : ""}</div>
      ${dest ? `<h3 class="sec-t">Quién lo ${c.requiere_ok ? "confirmó" : "leyó"}</h3><div class="card list">${dest.map((d) => `<div class="item"><div class="ava">${esc(iniciales(d.perfiles?.nombre || "?"))}</div>
          <div class="grow"><div class="t">${esc(d.perfiles?.nombre || "")}</div><div class="small muted">${d.recordatorios ? d.recordatorios + " recordatorio(s) enviados" : ""}</div></div>
          ${d.ok_at ? `<span class="pill p-menta">Entendido · ${fmtHora(d.ok_at)}</span>` : d.leido_at ? `<span class="pill p-durazno">${c.requiere_ok ? "Leído, sin confirmar" : "Leído · " + fmtHora(d.leido_at)}</span>` : `<span class="pill p-rosa">${futuro ? "Pendiente de envío" : "No lo ha abierto"}</span>`}</div>`).join("")}</div>
        <button class="btn peligro sm" data-anular>${futuro ? "Cancelar envío" : "Retirar comunicado"}</button>` : ""}`;
    const ok = $("[data-ok]", root);
    if (ok) ok.onclick = async () => { await this.marcar(mio, true); toast("Confirmado ✓"); this.detalle(root, id); this.revisar(); };
    const an = $("[data-anular]", root);
    if (an) an.onclick = async () => {
      if (!(await confirmar(futuro ? "Se cancela y no se envía." : "Deja de aparecer y de recordarse a las vendedoras.", futuro ? "Cancelar envío" : "Retirar"))) return;
      const { error } = await sb.from("comunicados").update({ anulado: true }).eq("id", id);
      if (error) return toast(error.message);
      toast("Listo"); location.hash = "#mensajes";
    };
  },

  async nuevo(listo) {
    const { data: us } = await sb.from("perfiles").select("id, nombre, rol").eq("activo", true).neq("id", DB.user.id).order("nombre");
    const vend = (us || []).filter((u) => u.rol === "vendedor"), otros = (us || []).filter((u) => u.rol !== "vendedor");
    const hoy = new Date(Date.now() + 60 * 60000), local = new Date(hoy.getTime() - hoy.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    modal(`<h2>Nuevo comunicado</h2>
      <label class="f">Título</label><input class="in" id="ct" maxlength="90" placeholder="Ej.: Nueva promoción en Super 99">
      <label class="f">Mensaje</label><textarea class="in" id="cb" rows="6" placeholder="Escribe la instrucción o la información"></textarea>
      <label class="f">Para</label>
      <div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:6px"><button class="btn sec sm" data-sel="v">Todas las vendedoras</button><button class="btn sec sm" data-sel="t">Todo el equipo</button><button class="btn ghost sm" data-sel="n">Ninguno</button></div>
      <div class="list" id="cu" style="max-height:220px;overflow:auto">${[...vend, ...otros].map((u) => `<div class="check ${u.rol === "vendedor" ? "on" : ""}" data-u="${u.id}" data-r="${u.rol}"><div class="box">✓</div><div class="grow">${esc(u.nombre)}</div><span class="tiny muted">${esc(u.rol)}</span></div>`).join("")}</div>
      <label class="f">Cuándo</label>
      <div class="row" style="gap:6px"><button class="btn sm sp" data-cuando="ya">Enviar ahora</button><button class="btn sec sm sp" data-cuando="prog">Programar</button></div>
      <input class="in" type="datetime-local" id="cf" value="${local}" style="margin-top:8px;display:none">
      <div class="check on" id="cok" style="margin-top:12px"><div class="box">✓</div><div class="grow">Pedir «Entendido»<div class="tiny muted">Si no lo confirman, se les recuerda en la app y en el teléfono hasta que lo hagan (7 am a 7 pm).</div></div></div>
      <div id="crec"><label class="f">Recordar cada</label><select class="in" id="cr"><option value="30">30 minutos</option><option value="60" selected>1 hora</option><option value="120">2 horas</option><option value="240">4 horas</option></select></div>
      <button class="btn block" style="margin-top:16px" data-enviar>Enviar comunicado</button>`,
    (m, close) => {
      let cuando = "ya";
      $$("[data-u]", m).forEach((el) => (el.onclick = () => el.classList.toggle("on")));
      $$("[data-sel]", m).forEach((b) => (b.onclick = () => $$("[data-u]", m).forEach((el) => el.classList.toggle("on", b.dataset.sel === "t" || (b.dataset.sel === "v" && el.dataset.r === "vendedor")))));
      $$("[data-cuando]", m).forEach((b) => (b.onclick = () => {
        cuando = b.dataset.cuando;
        $$("[data-cuando]", m).forEach((x) => x.classList.toggle("sec", x !== b));
        $("#cf", m).style.display = cuando === "prog" ? "" : "none";
        $("[data-enviar]", m).textContent = cuando === "prog" ? "Programar comunicado" : "Enviar comunicado";
      }));
      $("#cok", m).onclick = () => { $("#cok", m).classList.toggle("on"); $("#crec", m).style.display = $("#cok", m).classList.contains("on") ? "" : "none"; };
      $("[data-enviar]", m).onclick = async (e) => {
        const titulo = $("#ct", m).value.trim(), cuerpo = $("#cb", m).value.trim();
        const ids = $$("[data-u].on", m).map((el) => el.dataset.u);
        if (!titulo) return toast("Falta el título");
        if (!ids.length) return toast("Elige a quién va dirigido");
        let prog = new Date();
        if (cuando === "prog") { prog = new Date($("#cf", m).value); if (isNaN(prog) || prog < new Date()) return toast("Elige una fecha y hora futura"); }
        e.target.disabled = true;
        try {
          const { data: c, error } = await sb.from("comunicados").insert({ titulo, cuerpo, requiere_ok: $("#cok", m).classList.contains("on"), recordar_min: Number($("#cr", m).value), programado_at: prog.toISOString() }).select("id").single();
          if (error) throw error;
          const r2 = await sb.from("comunicado_destinos").insert(ids.map((u) => ({ comunicado_id: c.id, user_id: u })));
          if (r2.error) { await sb.from("comunicados").delete().eq("id", c.id); throw r2.error; }
          if (cuando === "ya") DB.funcion("avisos", {}).catch(() => {});
          close(); toast(cuando === "ya" ? `Enviado a ${ids.length} persona(s) ✓` : `Programado para el ${fmtFecha(prog.toISOString())} ${fmtHora(prog.toISOString())} ✓`);
          LS.set("msg.tab", cuando === "ya" ? "enviados" : "programados"); listo && listo();
        } catch (err) { e.target.disabled = false; toast(err.message || String(err)); }
      };
    });
  },
};

// Revisa comunicados al abrir, al volver a la app y cada 5 minutos
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && MSG.revisar());
setInterval(() => document.visibilityState === "visible" && MSG.revisar(), 5 * 60000);
if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.tipo === "push") MSG.revisar(); });
