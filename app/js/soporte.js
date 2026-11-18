// Soporte: botón flotante para escribirle al administrador en vez de WhatsApp (luego: soporte de Clarus para cada empresa)
const SOP = {
  CATS: [["tecnico", "Problema técnico"], ["duda", "Duda de uso"], ["pedido", "Pedido"], ["otro", "Otro"]],
  esAgente: () => DB.perfil?.rol === "admin",
  timer: null,
  ultN: null,

  hace(t) {
    const m = Math.max(0, Math.round((Date.now() - new Date(t)) / 60000));
    return m < 1 ? "ahora" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + " min" : ""}` : fmtFecha(t);
  },
  sinLeer(t) {
    if (this.esAgente() && t.user_id !== DB.user.id) return !t.ultimo_de_soporte && t.estado !== "resuelto" && (!t.leido_soporte_at || t.leido_soporte_at < t.ultimo_at);
    return t.ultimo_de_soporte && (!t.leido_usuario_at || t.leido_usuario_at < t.ultimo_at);
  },

  // Botón flotante con contador
  boton() {
    if (!DB.user || $(".fab-sop")) return;
    document.body.insertAdjacentHTML("beforeend", `<a class="fab-sop" href="#soporte" title="Soporte" aria-label="Soporte">${logo(30)}<span class="fab-n" hidden></span></a>`);
  },
  async revisar() {
    this.boton();
    const fab = $(".fab-sop"); if (!fab) return;
    fab.hidden = location.hash.startsWith("#soporte");
    if (!navigator.onLine) return;
    const { data } = await sb.from("soporte_tickets").select("id, user_id, estado, ultimo_at, ultimo_de_soporte, leido_usuario_at, leido_soporte_at").neq("estado", "resuelto").limit(500);
    const n = (data || []).filter((t) => this.sinLeer(t)).length, el = $(".fab-n", fab);
    el.hidden = !n; el.textContent = n > 9 ? "9+" : n;
    if (this.ultN != null && n > this.ultN) {
      const txt = this.esAgente() ? "Nueva consulta en Soporte" : "Soporte te respondió";
      toast(txt, 6000);
      MSG.notificar(txt, this.esAgente() ? "Toca para verla y responder." : "Toca para leer la respuesta.", "./#soporte", "soporte");
      fab.classList.add("fab-pulso"); setTimeout(() => fab.classList.remove("fab-pulso"), 4000);
    }
    this.ultN = n;
  },

  // ---------- Lista ----------
  async render(root, id) {
    clearInterval(this.timer);
    if (id) return this.chat(root, Number(id));
    const ag = this.esAgente();
    let tab = ag ? LS.get("sop.tab", "pendientes") : "todas";
    const pintar = async () => {
      root.innerHTML = `<div class="top"><div><div class="muted small">${ag ? "Buzón de soporte" : "¿Algún problema o duda? Escríbenos aquí."}</div><h1>Soporte</h1></div>${!ag ? `<button class="btn sm" data-nueva>+ Nueva consulta</button>` : ""}</div>
        ${ag ? `<div id="sk"></div><div class="steps">${[["pendientes", "Por responder"], ["respondidos", "Respondidos"], ["resueltos", "Resueltos"]].map(([k, t]) => `<div class="step ${k === tab ? "on" : ""}" data-tab="${k}">${t}</div>`).join("")}</div>`
          : `<div class="card flat small" style="background:var(--azul-cl);border-color:var(--azul-med)">En vez de WhatsApp, escribe aquí: queda registrado y te avisamos en el teléfono cuando te respondan. Si es algo de la app, adjunta una captura de pantalla.</div>`}
        ${MSG.bannerPush()}<div id="sl" class="muted">Cargando…</div>`;
      MSG.enlazarBanner(root, pintar);
      $$("[data-tab]", root).forEach((el) => (el.onclick = () => { tab = el.dataset.tab; LS.set("sop.tab", tab); pintar(); }));
      const nb = $("[data-nueva]", root); if (nb) nb.onclick = () => this.nueva();
      let q = sb.from("v_soporte").select("*").order("ultimo_at", { ascending: false }).limit(200);
      if (ag) q = tab === "pendientes" ? q.eq("estado", "abierto").order("ultimo_at", { ascending: true }) : tab === "respondidos" ? q.eq("estado", "respondido") : q.eq("estado", "resuelto");
      const { data, error } = await q;
      if (error) { $("#sl", root).textContent = error.message; return; }
      if (ag) {
        const { data: mes } = await sb.from("soporte_tickets").select("creado_at, primera_respuesta_at, estado").gte("creado_at", new Date(Date.now() - 30 * 864e5).toISOString());
        const resp = (mes || []).filter((t) => t.primera_respuesta_at).map((t) => (new Date(t.primera_respuesta_at) - new Date(t.creado_at)) / 60000);
        const prom = resp.length ? resp.reduce((a, b) => a + b, 0) / resp.length : null;
        const pend = (mes || []).filter((t) => t.estado === "abierto").length;
        $("#sk").innerHTML = `<div class="kpis">
          <div class="kpi ${pend ? "alerta" : ""}"><div class="v">${tab === "pendientes" ? data.length : pend}</div><div class="l">Por responder</div></div>
          <div class="kpi"><div class="v">${prom == null ? "–" : prom < 60 ? Math.round(prom) + " min" : fmtNum(prom / 60, 1) + " h"}</div><div class="l">Tiempo promedio de primera respuesta</div><div class="tiny muted" style="margin-top:4px">últimos 30 días · ${(mes || []).length} consulta(s)</div></div></div>`;
      }
      $("#sl", root).outerHTML = data.length ? `<div class="card list">${data.map((t) => {
          const espera = ag && t.estado === "abierto" ? (Date.now() - new Date(t.ultimo_at)) / 60000 : 0;
          return `<a class="item" href="#soporte/${t.id}"><div class="ava">${ag ? esc(iniciales(t.usuario)) : ic("soporte", 22)}</div>
            <div class="grow"><div class="t" style="${this.sinLeer(t) ? "font-weight:700" : ""}">${ag ? esc(t.usuario) + " · " : ""}${esc(t.asunto)}</div>
              <div class="small muted">${esc(this.CATS.find((c) => c[0] === t.categoria)?.[1] || "")} · ${this.hace(t.ultimo_at)}</div>
              <div style="margin-top:6px">${ag && t.estado === "abierto" ? `<span class="pill ${espera > 60 ? "p-rosa" : espera > 15 ? "p-durazno" : "p-azul"}">Esperando ${this.hace(t.ultimo_at).replace("hace ", "")}</span>`
              : `<span class="pill ${t.estado === "resuelto" ? "p-menta" : t.estado === "respondido" ? "p-azul" : "p-durazno"}">${t.estado === "resuelto" ? "Resuelto" : t.estado === "respondido" ? "Respondido" : "Enviado"}</span>`}</div></div>
            ${this.sinLeer(t) ? `<span class="dot-n"></span>` : ""}</a>`;
        }).join("")}</div>`
        : `<div class="empty card flat"><div class="ic">${ic("soporte", 34)}</div>${ag ? (tab === "pendientes" ? "No hay consultas por responder ✓" : "No hay consultas aquí.") : "Aún no tienes consultas."}</div>`;
    };
    await pintar();
    this.timer = setInterval(() => location.hash === "#soporte" && document.visibilityState === "visible" ? pintar() : null, 30000);
  },

  // Bienvenida automática (no cuenta como respuesta): saluda por nombre y dice cuándo se responde
  bienvenida(t, nombre) {
    const pn = (nombre || "").split(" ")[0];
    const d = new Date(new Date(t.creado_at).toLocaleString("en-US", { timeZone: "America/Panama" })), h = d.getHours(), dom = d.getDay() === 0;
    const enHorario = !dom && h >= 7 && h < 19;
    return `¡Hola${pn ? ", " + pn : ""}! 👋 Gracias por escribir a Soporte Clarus.\n\nRecibimos tu consulta y ${enHorario ? "te respondemos lo antes posible por aquí mismo." : "te respondemos en el próximo horario de atención (lunes a sábado, 7 am a 7 pm)."} Te va a sonar el teléfono cuando tengas la respuesta.\n\nSi estás en una visita y no puedes avanzar, cuéntanos en qué tienda estás y en qué paso te quedaste. Una captura de pantalla nos ayuda mucho.`;
  },

  // ---------- Nueva consulta ----------
  nueva() {
    let cat = "tecnico", foto = null;
    modal(`<h2>Nueva consulta</h2>
      <label class="f">Tema</label><div class="row" style="flex-wrap:wrap;gap:6px">${this.CATS.map(([k, t]) => `<button class="btn sm ${k === cat ? "" : "sec"}" data-cat="${k}">${t}</button>`).join("")}</div>
      <label class="f">¿Qué pasa?</label><textarea class="in" id="st" rows="5" placeholder="Ej.: No me deja tomar la foto de bodega en Super 99 Vía Porras"></textarea>
      <label class="btn ghost block sm" style="margin-top:10px">📎 Adjuntar captura de pantalla<input type="file" accept="image/*" id="sf" hidden></label>
      <div id="sfp" class="small muted" style="margin-top:6px"></div>
      <button class="btn block" style="margin-top:14px" data-env>Enviar</button>`,
    (m, close) => {
      $$("[data-cat]", m).forEach((b) => (b.onclick = () => { cat = b.dataset.cat; $$("[data-cat]", m).forEach((x) => x.classList.toggle("sec", x !== b)); }));
      $("#sf", m).onchange = (e) => { foto = e.target.files[0] || null; $("#sfp", m).textContent = foto ? "Captura lista ✓ " + foto.name : ""; };
      $("[data-env]", m).onclick = async (e) => {
        const texto = $("#st", m).value.trim();
        if (!texto && !foto) return toast("Escribe qué pasa");
        e.target.disabled = true; e.target.textContent = "Enviando…";
        try {
          const n = await DB.pendientes().catch(() => "?");
          const diag = `Clarus ${CLARUS.version} · ${navigator.userAgent.match(/\(([^)]+)\)/)?.[1] || ""} · ${/Chrome\/[\d]+/.exec(navigator.userAgent)?.[0] || ""} · pantalla ${screen.width}×${screen.height} · ${navigator.onLine ? "en línea" : "sin señal"} · ${n} por enviar · notificaciones ${("Notification" in window) ? Notification.permission : "no"} · ruta ${location.hash || "#"}`;
          const asunto = (texto.split("\n")[0] || "Captura de pantalla").slice(0, 80);
          const { data: t, error } = await sb.from("soporte_tickets").insert({ categoria: cat, asunto, diagnostico: diag }).select("id").single();
          if (error) throw error;
          await this.enviar(t.id, texto, foto);
          close(); toast("Consulta enviada ✓"); location.hash = "#soporte/" + t.id;
        } catch (err) { e.target.disabled = false; e.target.textContent = "Enviar"; toast(err.message || String(err)); }
      };
    });
  },

  async subirFoto(file) {
    const img = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    const path = `${DB.perfil.empresa_id}/${DB.user.id}/soporte/${uid()}.jpg`;
    const { error } = await sb.storage.from("fotos").upload(path, blob, { contentType: "image/jpeg" });
    if (error) throw error;
    return path;
  },
  async enviar(tid, texto, foto) {
    const adjunto = foto ? await this.subirFoto(foto) : null;
    const { data, error } = await sb.from("soporte_mensajes").insert({ ticket_id: tid, texto: texto || "", adjunto }).select("id").single();
    if (error) throw error;
    DB.funcion("avisos", { soporte: data.id }).catch(() => {});
  },

  // ---------- Conversación ----------
  async chat(root, id) {
    clearInterval(this.timer);
    const ag = this.esAgente();
    const [{ data: t }, { data: ms, error }] = await Promise.all([
      sb.from("v_soporte").select("*").eq("id", id).maybeSingle(),
      sb.from("soporte_mensajes").select("id, autor_id, texto, adjunto, creado_at, perfiles!soporte_mensajes_autor_id_fkey(nombre)").eq("ticket_id", id).order("creado_at"),
    ]);
    if (!t || error) { root.innerHTML = `<div class="empty card flat">No encontré esta consulta.</div><a class="btn sec" href="#soporte">Volver</a>`; return; }
    const soyDueno = t.user_id === DB.user.id;
    await sb.from("soporte_tickets").update(soyDueno ? { leido_usuario_at: new Date().toISOString() } : { leido_soporte_at: new Date().toISOString() }).eq("id", id);
    const urls = {};
    await Promise.all(ms.filter((m) => m.adjunto).map(async (m) => { try { urls[m.id] = await DB.urlFirmada("fotos", m.adjunto); } catch {} }));
    root.innerHTML = `<a href="#soporte" class="small" style="text-decoration:none">‹ Soporte</a>
      <div class="row" style="margin:8px 0 4px;align-items:flex-start"><div class="grow"><h2>${esc(t.asunto)}</h2>
        <div class="small muted">${ag && !soyDueno ? esc(t.usuario) + " · " : ""}${esc(this.CATS.find((c) => c[0] === t.categoria)?.[1] || "")} · abierta ${fmtFecha(t.creado_at)} ${fmtHora(t.creado_at)}</div></div>
        <span class="pill ${t.estado === "resuelto" ? "p-menta" : t.estado === "respondido" ? "p-azul" : "p-durazno"}">${t.estado === "resuelto" ? "Resuelto" : t.estado === "respondido" ? "Respondido" : "Esperando respuesta"}</span></div>
      ${ag && !soyDueno && t.diagnostico ? `<details class="small muted" style="margin-bottom:8px"><summary>Datos del teléfono</summary>${esc(t.diagnostico)}</details>` : ""}
      <div class="chat" id="ch">${ms.map((m, i) => {
        const mio = m.autor_id === DB.user.id;
        return `<div class="burb ${mio ? "mia" : ""}">${!mio ? `<div class="tiny" style="font-weight:600;margin-bottom:2px">${esc(m.autor_id === t.user_id ? m.perfiles?.nombre || "" : "Soporte · " + (m.perfiles?.nombre || ""))}</div>` : ""}
          ${m.texto ? `<div class="msg-cuerpo" style="font-size:14.5px">${esc(m.texto)}</div>` : ""}
          ${urls[m.id] ? `<a href="${urls[m.id]}" target="_blank" rel="noopener"><img src="${urls[m.id]}" alt="captura" class="burb-img"></a>` : ""}
          <div class="tiny burb-h">${fmtFecha(m.creado_at)} ${fmtHora(m.creado_at)}</div></div>${i === 0 ? `
          <div class="burb auto"><div class="row tiny" style="gap:6px;font-weight:600;margin-bottom:4px">${logo(16)} Soporte Clarus${!soyDueno ? " · mensaje automático" : ""}</div>
          <div class="msg-cuerpo" style="font-size:14.5px">${esc(this.bienvenida(t, t.usuario))}</div></div>` : ""}`;
      }).join("")}</div>
      ${t.estado === "resuelto" && !ag ? `<p class="small muted" style="text-align:center">Marcada como resuelta. Si sigue el problema, escribe y se reabre.</p>` : ""}
      <div class="chat-in"><label class="btn ghost sm" title="Adjuntar captura" style="padding:0 10px">📎<input type="file" accept="image/*" id="cf" hidden></label>
        <textarea class="in" id="cm" rows="1" placeholder="${ag && !soyDueno ? "Responder…" : "Escribe un mensaje…"}"></textarea><button class="btn sm" data-env>Enviar</button></div>
      <div id="cfp" class="tiny muted"></div>
      ${ag && !soyDueno && t.asunto === "Olvidé mi contraseña" && t.estado !== "resuelto" ? `<button class="btn block" style="margin-top:10px" data-clave="${t.user_id}">Asignar contraseña nueva</button>` : ""}
      ${ag && !soyDueno ? `<button class="btn ${t.estado === "resuelto" ? "sec" : "ghost"} sm" style="margin-top:10px" data-res>${t.estado === "resuelto" ? "Reabrir" : "✓ Marcar resuelto"}</button>` : ""}`;
    const ch = $("#ch", root); ch.scrollTop = ch.scrollHeight; window.scrollTo(0, document.body.scrollHeight);
    let foto = null;
    $("#cf", root).onchange = (e) => { foto = e.target.files[0] || null; $("#cfp", root).textContent = foto ? "Captura lista ✓" : ""; };
    const ta = $("#cm", root);
    ta.oninput = () => { ta.style.height = "auto"; ta.style.height = Math.min(140, ta.scrollHeight) + "px"; };
    $("[data-env]", root).onclick = async (e) => {
      const texto = ta.value.trim();
      if (!texto && !foto) return;
      e.target.disabled = true;
      try { await this.enviar(id, texto, foto); this.chat(root, id); }
      catch (err) { e.target.disabled = false; toast(err.message || String(err)); }
    };
    const bc = $("[data-clave]", root); if (bc) bc.onclick = () => { LS.set("cfgTab", "usuarios"); LS.set("abrirUsuario", bc.dataset.clave); location.hash = "#config"; };
    const rs = $("[data-res]", root);
    if (rs) rs.onclick = async () => {
      const { data: fr } = await sb.from("soporte_tickets").select("estado").eq("id", id).maybeSingle();
      const res = (fr?.estado || t.estado) !== "resuelto";
      const { error: e2 } = await sb.from("soporte_tickets").update(res ? { estado: "resuelto", resuelto_at: new Date().toISOString() } : { estado: "abierto", resuelto_at: null }).eq("id", id);
      if (e2) return toast(e2.message);
      toast(res ? "Marcada como resuelta ✓" : "Reabierta"); this.chat(root, id);
    };
    this.revisar();
    const n0 = ms.length;
    this.timer = setInterval(async () => {
      if (location.hash !== "#soporte/" + id) return clearInterval(this.timer);
      if (document.visibilityState !== "visible" || ta.value) return;
      const { count } = await sb.from("soporte_mensajes").select("id", { count: "exact", head: true }).eq("ticket_id", id);
      if (count !== n0) this.chat(root, id);
    }, 15000);
  },
};

// Revisa el buzón de soporte cada minuto mientras la app está abierta
setInterval(() => document.visibilityState === "visible" && DB.user && SOP.revisar(), 20000); // respaldo si el tiempo real se corta
