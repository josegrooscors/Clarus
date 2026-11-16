// Arranque, inicio de sesión, menú según rol y navegación
const App = {
  rutas() {
    const r = DB.perfil.rol;
    const m = [];
    if (r === "operaciones") m.push(["picking", "caja", "Picking"], ["pedidos", "pedidos", "Pedidos"]); // Operaciones entra directo a preparar pedidos
    if (r === "administracion") m.push(["picking", "caja", "Picking"], ["pedidos", "pedidos", "Pedidos"]); // Administración factura dentro de Picking
    if (r !== "vendedor") m.push(["resumen", "resumen", "Resumen"]);
    if (r === "vendedor" || r === "admin" || r === "supervisor") m.push(["hoy", "ruta", "Ruta"]);
    if (r === "vendedor") m.push(["mis-pedidos", "pedidos", "Pedidos"]);
    if (r === "operaciones" || r === "administracion") m.push(["objetivos", "ok", "Objetivos"]);
    else if (r !== "vendedor" && r !== "administracion") m.push(["equipo", "equipo", "Equipo"], ["programacion", "reloj", "Programación"], ["objetivos", "ok", "Objetivos"], ["pedidos", "pedidos", "Pedidos"], ["mapa", "pin", "Mapa", true]);
    if (r === "admin" || r === "supervisor") m.push(["planogramas", "planograma", "Planogramas", true]);
    if (r === "admin") m.push(["picking", "caja", "Picking", true]);
    if (r === "admin" || r === "supervisor") m.push(["mis-pedidos", "recibo", "Mis pedidos", true]);
    if (C.visible()) m.push(["config", "ajustes", "Configuración", true]);
    m.push(["mensajes", "msg", "Mensajes"], ["yo", "yo", "Yo"]);
    return m;
  },

  // Barra inferior del celular: todos los botones del rol, con nombres cortos para que quepan completos.
  movil() {
    const corto = { programacion: "Agenda", mensajes: "Avisos", objetivos: "Metas", "mis-pedidos": "Pedidos" };
    return { nav: this.rutas().filter((x) => !x[3]).map(([k, i, t, d]) => [k, i, corto[k] || t, d]), extra: [] };
  },


  async render() {
    if (!DB.user) return this.login();
    let ruta = (location.hash || "").slice(1);
    const menu = this.rutas();
    if (Visita.get() && !ruta) ruta = "visita";
    const [base, sub] = ruta.split("/");
    if (base === "mensajes") ruta = "mensajes";
    if (base === "soporte") ruta = "soporte";
    if (base === "facturacion") { location.hash = "#picking" + (sub ? "/" + sub : ""); return; }
    if (["planogramas", "picking"].includes(base)) ruta = base;
    if (!ruta || (ruta !== "visita" && ruta !== "soporte" && !menu.some((x) => x[0] === ruta))) ruta = menu[0][0];
    const app = $("#app");
    const link = ([k, i, t]) => `<a href="#${k}" class="${k === ruta || (ruta === "visita" && k === "hoy") ? "on" : ""}"><span class="ic">${ic(i)}</span><span class="lbl">${t}</span></a>`.replace("<a ", `<a title="${t}" `);
    const navHtml = menu.map(link).join("");
    const movil = this.movil().nav.map(link).join("");
    const lema = `Te hago ver lo que tú <b>no puedes ver.</b>`;
    app.innerHTML = `<header class="barra-marca"><div class="brand">${logo(24)}clarus</div><span class="lema-c">${lema}</span></header>
      <div class="shell"><nav class="side"><div class="brand">${logo(30)}<span class="lbl">clarus</span><button class="side-tog" id="sideTog" title="Ocultar / mostrar menú" aria-label="Ocultar menú">${ic("chev", 16)}</button></div><p class="lema-side">${lema}</p>${menu.filter((x) => x[0] !== "mensajes").map(link).join("")}
        <a href="#mensajes" class="side-msg ${ruta === "mensajes" ? "on" : ""}" title="Mensajes"><span class="ic">${ic("msg", 26)}</span></a></nav>
      <main class="main" id="main"></main></div><nav class="nav">${movil}</nav>`;
    document.body.classList.toggle("side-min", !!LS.get("sideMin", false));
    $("#sideTog").onclick = () => { const v = !document.body.classList.contains("side-min"); document.body.classList.toggle("side-min", v); LS.set("sideMin", v); };
    const root = $("#main");
    try {
      if (ruta === "resumen") await R.render(root);
      else if (ruta === "hoy") await V.hoy(root);
      else if (ruta === "visita") await V.visita(root);
      else if (ruta === "mis-pedidos") await V.pedidos(root);
      else if (ruta === "pedidos") await G.pedidos(root);
      else if (ruta === "equipo") await G.equipo(root);
      else if (ruta === "objetivos") await G.objetivos(root);
      else if (ruta === "mapa") await M.render(root);
      else if (ruta === "programacion") await G.programacion(root);
      else if (ruta === "config") await C.config(root);
      else if (ruta === "mensajes") await MSG.render(root, sub);
      else if (ruta === "soporte") await SOP.render(root, sub);
      else if (ruta === "planogramas") await PL.render(root, sub);
      else if (ruta === "picking") await PK.render(root, sub);
      else if (ruta === "yo") await this.yo(root);
      if ((ruta === "hoy" || ruta === "resumen") && MSG.bannerPush()) { root.insertAdjacentHTML("afterbegin", MSG.bannerPush()); MSG.enlazarBanner(root, () => App.render()); }
    } catch (e) {
      console.error(e);
      root.innerHTML = `<div class="empty card flat"><div class="ic">${ic("alerta", 34)}</div>${esc(e.message || e)}<br><button class="btn sec sm" style="margin-top:12px" onclick="App.render()">Reintentar</button></div>`;
    }
    // Logo de la empresa cliente arriba a la derecha (se vuelve a poner si la pantalla se redibuja)
    App.logoCliente(root);
    if (!root._obsLogo) { root._obsLogo = new MutationObserver(() => App.logoCliente(root)); root._obsLogo.observe(root, { childList: true }); }
    MSG.revisar();
    SOP.revisar();
  },

  logoCliente(root) {
    const top = $(".top", root);
    if (top && DB.empresa?.logo_url && !$(".logo-cliente", top)) top.insertAdjacentHTML("beforeend", `<img class="logo-cliente" src="${esc(DB.empresa.logo_url)}" alt="${esc(DB.empresa.nombre || "")}" title="${esc(DB.empresa.nombre || "")}">`);
  },

  async syncPill() {
    const el = $("#syncpill"); if (!el) return;
    const n = await DB.pendientes();
    el.innerHTML = !navigator.onLine ? `<span class="sync p-durazno">Sin señal${n ? " · " + n + " por enviar" : ""}</span>`
      : n ? `<span class="sync p-azul">Enviando ${n}…</span>` : "";
  },

  async yo(root) {
    const n = await DB.pendientes();
    const ops = await IDB.ops();
    const err = ops.find((o) => o.error);
    root.innerHTML = `<div class="top"><h1>Mi cuenta</h1></div>
      <div class="card"><div class="row"><div class="ava">${esc(iniciales(DB.perfil.nombre))}</div><div class="grow"><h2>${esc(DB.perfil.nombre)}</h2>
        <div class="small muted">${esc(DB.empresa?.nombre || "")} · ${esc(DB.perfil.rol)}</div></div></div></div>
      <div class="card"><div class="row"><span class="sp">Registros por enviar</span><b>${n}</b></div>
        ${err ? `<div class="small" style="color:var(--rosa-t);margin-top:6px">Último error: ${esc(err.error)}</div>` : ""}
        <button class="btn sec block" style="margin-top:12px" data-sync>Sincronizar ahora</button>
        <button class="btn ghost block" style="margin-top:8px" data-cat>Actualizar tiendas y productos</button></div>
      <div class="card"><label class="f" style="margin-top:0">Cambiar mi contraseña</label><input class="in" type="password" id="npw" placeholder="mínimo 6 caracteres">
        <button class="btn sec block" style="margin-top:10px" data-pw>Guardar contraseña</button></div>
      ${this.movil().extra.concat(this.rutas().filter((x) => x[3])).length ? `<div class="card solo-movil list">${this.movil().extra.concat(this.rutas().filter((x) => x[3])).map(([k, i, t]) => [k, i, k === "programacion" ? "Agenda" : t]).map(([k, i, t]) => `<a class="item" href="#${k}"><span style="color:var(--azul)">${ic(i)}</span><span class="grow">${t}</span>›</a>`).join("")}</div>` : ""}
      <button class="btn peligro block" data-salir>Cerrar sesión</button>
      <div class="pie-marca">${logo(28)}<p>Te hago ver lo que tú <b>no puedes ver.</b></p><span class="tiny muted">Clarus ${CLARUS.version}</span></div>`;
    $("[data-sync]", root).onclick = async () => { await DB.sincronizar(); toast("Sincronizado"); this.yo(root); };
    $("[data-cat]", root).onclick = async () => { try { await DB.catalogos(true); toast("Datos actualizados ✓"); } catch (e) { toast(e.message); } };
    $("[data-pw]", root).onclick = async () => {
      const pw = $("#npw").value; if (pw.length < 6) return toast("Mínimo 6 caracteres");
      const { error } = await sb.auth.updateUser({ password: pw });
      toast(error ? error.message : "Contraseña actualizada ✓");
    };
    $("[data-salir]", root).onclick = () => DB.salir();
  },

  // Ilustración de la pantalla de inicio: ruta de la vendedora → tienda, y la lente de Clarus mostrando el anaquel.
  escena() {
    return `<svg class="login-escena" viewBox="0 0 420 190" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <g stroke="#C9D6F2" stroke-width="1.5" fill="#F3F6FD">
        <path d="M6 158V92h40v66M46 158V70h34v88M332 158V84h36v74M368 158V100h46v58"/>
        <path d="M14 104h8M28 104h8M14 118h8M28 118h8M54 84h8M66 84h8M54 98h8M66 98h8M54 112h8M66 112h8M340 98h8M354 98h8M340 112h8M354 112h8M378 114h8M394 114h8M378 128h8M394 128h8" fill="none"/>
      </g>
      <g fill="#FFFFFF" stroke="#D7E1F7" stroke-width="1.5"><path d="M92 40c0-8 12-10 16-4 2-8 16-8 18 1 7-1 10 7 4 10H94c-3 0-4-4-2-7Z"/><path d="M286 28c0-6 9-8 12-3 2-6 12-6 13 1 5-1 7 5 3 7h-26c-2 0-3-3-2-5Z"/></g>
      <path d="M0 158h420" stroke="#C9D6F2" stroke-width="1.5"/>
      <!-- camión -->
      <g stroke="#7E9CEB" stroke-width="1.8" fill="#FFFFFF">
        <path d="M84 150v-34h50v34Z"/><path d="M134 126h18l10 12v12h-28Z"/><path d="M140 130h10l6 8h-16Z" fill="#EAF0FE"/>
        <circle cx="98" cy="152" r="7"/><circle cx="148" cy="152" r="7"/>
      </g>
      <circle cx="98" cy="152" r="2" fill="#7E9CEB"/><circle cx="148" cy="152" r="2" fill="#7E9CEB"/>
      <!-- ruta de la vendedora -->
      <path d="M118 96c0-22 30-22 44-30s34-6 44-2" stroke="#2F5BEA" stroke-width="1.8" stroke-dasharray="4 5"/>
      <circle cx="118" cy="100" r="9" fill="#2F5BEA"/><circle cx="118" cy="97" r="3" fill="#fff"/><path d="M112.5 105.5c1.5-3 9.5-3 11 0" stroke="#fff" stroke-width="1.6"/>
      <!-- tienda -->
      <g stroke="#7E9CEB" stroke-width="1.8">
        <path d="M184 158V96h92v62" fill="#FFFFFF"/>
        <path d="M178 96l8-16h88l8 16Z" fill="#EAF0FE"/>
        <path d="M178 96c0 6 10 6 10 0 0 6 10 6 10 0 0 6 10 6 10 0 0 6 10 6 10 0 0 6 10 6 10 0 0 6 10 6 10 0 0 6 10 6 10 0 0 6 10 6 10 0 0 6 10 6 10 0 0 6 10 6 10 0" fill="#FFFFFF"/>
        <rect x="196" y="62" width="68" height="16" rx="3" fill="#FFFFFF"/>
        <path d="M194 158v-40h30v40M236 118h30v26h-30Z" fill="#F3F6FD"/>
      </g>
      <text x="230" y="73.5" text-anchor="middle" font-family="Inter Tight, Inter, sans-serif" font-size="8.5" font-weight="700" fill="#2F5BEA" letter-spacing=".6">MINI SÚPER</text>
      <g fill="#C9D6F2"><rect x="198" y="124" width="7" height="6" rx="1"/><rect x="208" y="124" width="7" height="6" rx="1"/><rect x="198" y="138" width="7" height="6" rx="1"/><rect x="208" y="138" width="7" height="6" rx="1"/></g>
      <!-- pin de ubicación -->
      <path d="M216 40c-7 0-12 5-12 11 0 8 12 18 12 18s12-10 12-18c0-6-5-11-12-11Z" fill="#2F5BEA"/><circle cx="216" cy="51" r="4" fill="#fff"/>
      <!-- lente de Clarus sobre el anaquel -->
      <g>
        <circle cx="251" cy="131" r="21" fill="#FFFFFF" fill-opacity=".92"/>
        <g fill="#2F5BEA"><rect x="240" y="122" width="7" height="7" rx="1.5"/><rect x="249" y="122" width="7" height="7" rx="1.5"/><rect x="258" y="122" width="5" height="7" rx="1.5" fill-opacity=".5"/>
          <rect x="240" y="133" width="7" height="7" rx="1.5" fill-opacity=".5"/><rect x="249" y="133" width="7" height="7" rx="1.5"/></g>
        <path d="M268.5 119.5A21 21 0 1 0 268.5 142.5" stroke="#2F5BEA" stroke-width="5" stroke-linecap="round"/>
        <circle cx="262" cy="136" r="3.2" fill="#0B1B33"/>
      </g>
      <!-- árbol y farol -->
      <g stroke="#9DB5F5" stroke-width="1.6"><circle cx="302" cy="128" r="14" fill="#F3F6FD"/><path d="M302 158v-26M302 140l-6-6M302 136l6-6"/><path d="M318 158V110c0-4 4-6 8-6h6"/><path d="M328 104h8" stroke-width="3"/></g>
    </svg>`;
  },

  login(msg, usuario = "") {
    $("#app").innerHTML = `<div class="login-fondo"><div class="login">
      <div class="brand">${logo(46)}clarus</div>
      <p class="lema">Te hago ver lo que tú <b>no puedes ver.</b></p>
      <form class="card" id="lf" autocomplete="on" novalidate>
        <label class="f" style="margin-top:0" for="lu">Usuario</label>
        <input class="in" id="lu" name="username" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username" value="${esc(usuario)}">
        <label class="f" for="lp">Contraseña</label>
        <div style="position:relative"><input class="in" id="lp" name="password" type="password" autocomplete="current-password" style="padding-right:84px">
          <button type="button" id="lver" class="btn ghost sm" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0">Mostrar</button></div>
        <div class="login-olvido"><a href="javascript:void 0" id="lolv">¿Olvidaste tu contraseña?</a></div>
        <button type="submit" class="btn block" style="margin-top:14px" id="lb">Entrar</button>
        ${msg ? `<p class="small" style="color:var(--rosa-t)">${esc(msg)}</p>` : ""}</form>
      <div class="login-demo"><span>¿Tu empresa aún no usa Clarus?</span><a href="javascript:void 0" id="ldemo">Solicita una demostración</a></div>
      </div>${this.escena()}<div class="login-pie">Clarus ${esc(CLARUS.version)} · Ejecución en punto de venta</div></div>`;
    $("#lver").onclick = () => { const p = $("#lp"); const ver = p.type === "password"; p.type = ver ? "text" : "password"; $("#lver").textContent = ver ? "Ocultar" : "Mostrar"; p.focus(); };
    $("#lolv").onclick = () => this.olvide($("#lu").value.trim());
    $("#ldemo").onclick = () => this.demo();
    $("#lf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const u = $("#lu").value;
      $("#lb").disabled = true; $("#lb").textContent = "Entrando…";
      try { await DB.entrar(u, $("#lp").value); location.hash = ""; this.render(); MSG.activarPush(false); }
      catch (err) { this.login(err.message, u); }
    });
    (usuario ? $("#lp") : $("#lu")).focus();
  },

  async publico(body) {
    const { data, error } = await sb.functions.invoke("publico", { body });
    if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch {} throw new Error(m); }
    if (data?.error) throw new Error(data.error);
    return data;
  },

  // "Olvidé mi contraseña": los usuarios entran con usuario (no correo), así que la solicitud le llega al administrador de su empresa.
  olvide(usuario) {
    modal(`<h2>¿Olvidaste tu contraseña?</h2>
      <p class="small muted" style="margin-top:-4px">Escribe tu usuario. Le avisamos a tu administrador para que te asigne una contraseña nueva.</p>
      <label class="f">Usuario</label><input class="in" name="u" autocapitalize="none" autocorrect="off" spellcheck="false" value="${esc(usuario)}" placeholder="ej. doris">
      <label class="f">Mensaje (opcional)</label><input class="in" name="m" placeholder="Ej.: cambié de teléfono">
      <button class="btn block" style="margin-top:16px" data-ok>Pedir contraseña nueva</button>`, (m, close) => {
      const ok = $("[data-ok]", m);
      ok.onclick = async () => {
        const u = $("[name=u]", m).value.trim(); if (!u) return toast("Escribe tu usuario");
        ok.disabled = true; ok.textContent = "Enviando…";
        try {
          await this.publico({ tipo: "clave", usuario: u, mensaje: $("[name=m]", m).value });
          m.innerHTML = `<div class="login-ok">${ic("ok", 40)}<h2>Solicitud enviada</h2><p class="muted">Si el usuario <b>${esc(u)}</b> existe, tu administrador ya recibió el aviso y te dará una contraseña nueva.</p><button class="btn block" data-c>Entendido</button></div>`;
          $("[data-c]", m).onclick = close;
        } catch (e) { ok.disabled = false; ok.textContent = "Pedir contraseña nueva"; toast(e.message, 4000); }
      };
      setTimeout(() => $(usuario ? "[name=m]" : "[name=u]", m).focus(), 50);
    });
  },

  // Formulario de interesados (para promocionar Clarus)
  demo() {
    modal(`<div class="demo-cab">${logo(34)}<div><h2 style="margin:0">Conoce Clarus</h2><p class="small muted" style="margin:2px 0 0">Te mostramos cómo ver lo que pasa en cada punto de venta.</p></div></div>
      <ul class="demo-lista"><li>Rutas, visitas con GPS y fotos de exhibición</li><li>Inventario, agotados y pedidos en el momento</li><li>Planogramas, picking y avance contra objetivo</li></ul>
      <label class="f">Tu nombre</label><input class="in" name="nombre" autocomplete="name">
      <label class="f">Empresa</label><input class="in" name="empresa" autocomplete="organization">
      <div class="grid2c"><div><label class="f">WhatsApp / teléfono</label><input class="in" name="telefono" inputmode="tel" autocomplete="tel"></div>
        <div><label class="f">Correo</label><input class="in" name="correo" type="email" inputmode="email" autocomplete="email"></div></div>
      <div class="grid2c"><div><label class="f">Rubro</label><select class="in" name="rubro"><option value="">Elige…</option><option>Consumo masivo / alimentos</option><option>Bebidas</option><option>Farmacia y cuidado personal</option><option>Food service</option><option>Distribuidora</option><option>Otro</option></select></div>
        <div><label class="f">Vendedores en calle</label><select class="in" name="vendedores"><option value="">Elige…</option><option>1–5</option><option>6–15</option><option>16–50</option><option>Más de 50</option></select></div></div>
      <label class="f">¿Qué te gustaría resolver? (opcional)</label><textarea class="in" name="mensaje" rows="2" placeholder="Ej.: saber qué tiendas están sin producto"></textarea>
      <button class="btn block" style="margin-top:16px" data-ok>Solicitar demostración</button>
      <p class="tiny muted" style="text-align:center;margin:10px 0 0">Te contactamos en menos de 24 horas hábiles.</p>`, (m, close) => {
      const ok = $("[data-ok]", m);
      ok.onclick = async () => {
        const v = (n) => $(`[name=${n}]`, m).value.trim();
        if (!v("nombre") || !v("empresa")) return toast("Escribe tu nombre y tu empresa");
        if (!v("telefono") && !v("correo")) return toast("Déjanos un teléfono o un correo");
        ok.disabled = true; ok.textContent = "Enviando…";
        try {
          await this.publico({ tipo: "demo", nombre: v("nombre"), empresa: v("empresa"), telefono: v("telefono"), correo: v("correo"), rubro: v("rubro"), vendedores: v("vendedores"), mensaje: v("mensaje") });
          m.innerHTML = `<div class="login-ok">${logo(44)}<h2>¡Gracias, ${esc(v("nombre").split(" ")[0])}!</h2><p class="muted">Recibimos tu solicitud. Te contactaremos pronto para agendar la demostración.</p><button class="btn block" data-c>Listo</button></div>`;
          $("[data-c]", m).onclick = close;
        } catch (e) { ok.disabled = false; ok.textContent = "Solicitar demostración"; toast(e.message, 4000); }
      };
    });
  },
};

window.addEventListener("hashchange", () => App.render());
window.addEventListener("clarus-sync", () => App.syncPill());
window.addEventListener("online", () => App.syncPill());
window.addEventListener("offline", () => App.syncPill());

(async () => {
  try { await DB.iniciar(); } catch (e) { DB.user = null; await sb.auth.signOut().catch(() => {}); return App.login(e.message); }
  App.render();
  DB.sincronizar();
  if (DB.user) {
    MSG.activarPush(false);
    const antes = JSON.stringify(DB.permisos);
    DB.catalogos().then(() => { if (JSON.stringify(DB.permisos) !== antes) App.render(); }).catch(() => {});
  }
})();

// Actualización automática: si sale una versión nueva, se instala y la app se recarga sola una vez
if ("serviceWorker" in navigator) {
  const habiaSW = !!navigator.serviceWorker.controller;
  let recargado = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (habiaSW && !recargado && !Visita.get()) { recargado = true; location.reload(); } });
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
    reg.update().catch(() => {});
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && reg.update().catch(() => {}));
  }).catch(() => {});
}
