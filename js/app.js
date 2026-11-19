// Arranque, inicio de sesión, menú según rol y navegación
const App = {
  rutas() {
    const r = DB.perfil.rol;
    const m = [];
    if (r !== "admin") {
      // Cada pantalla aparece solo si el rol tiene el permiso (Configuración → Permisos).
      const p = (k) => DB.puede(k), ops = r === "operaciones" || r === "administracion";
      if (p("picking")) m.push(["picking", "caja", "Picking"]);
      if (ops && p("ver_pedidos")) m.push(["pedidos", "pedidos", "Pedidos"]);
      if (p("ver_resumen")) m.push(["resumen", "resumen", "Resumen"]);
      if (p("visitar")) m.push(["hoy", "ruta", "Ruta"]);
      if (r === "vendedor" && p("visitar")) m.push(["mis-pedidos", "pedidos", "Pedidos"]);
      if (p("ver_equipo")) m.push(["equipo", "equipo", "Visitas"]);
      if (p("ver_agenda")) m.push(["programacion", "reloj", "Programación"]);
      if (p("ver_metas")) m.push(["objetivos", "ok", "Objetivos"]);
      if (!ops && p("ver_pedidos")) m.push(["pedidos", "pedidos", "Pedidos"]);
      if (p("ver_mapa")) m.push(["mapa", "pin", "Mapa", true]);
      if (p("planogramas")) m.push(["planogramas", "planograma", "Planogramas", true]);
      if (r !== "vendedor" && p("visitar")) m.push(["mis-pedidos", "recibo", "Mis pedidos", true]);
      if (C.visible()) m.push(["config", "ajustes", "Configuración", true]);
      m.push(["mensajes", "msg", "Mensajes"], ["yo", "menu", "Más"]);
      return m;
    }
    if (r === "operaciones") m.push(["picking", "caja", "Picking"], ["pedidos", "pedidos", "Pedidos"]); // Operaciones entra directo a preparar pedidos
    if (r === "administracion") m.push(["picking", "caja", "Picking"], ["pedidos", "pedidos", "Pedidos"]); // Administración factura dentro de Picking
    if (r !== "vendedor") m.push(["resumen", "resumen", "Resumen"]);
    // Ruta y Mis pedidos son de quien visita tiendas: la vendedora y la supervisora siempre (la supervisora también ejecuta en tienda);
    // gerencia solo si tiene tiendas asignadas o una visita abierta.
    const conRuta = r === "vendedor" || r === "supervisor" || (LS.get("cat")?.ruta || []).length > 0 || !!Visita.get();
    if (conRuta && (r === "vendedor" || r === "admin" || r === "supervisor")) m.push(["hoy", "ruta", "Ruta"]);
    if (r === "vendedor") m.push(["mis-pedidos", "pedidos", "Pedidos"]);
    if (r === "operaciones" || r === "administracion") m.push(["objetivos", "ok", "Objetivos"]);
    else if (r !== "vendedor" && r !== "administracion") m.push(["equipo", "equipo", "Visitas"], ["programacion", "reloj", "Programación"], ["objetivos", "ok", "Objetivos"], ["pedidos", "pedidos", "Pedidos"], ["mapa", "pin", "Mapa", true]);
    if (r === "admin" || r === "supervisor") m.push(["planogramas", "planograma", "Planogramas", true]);
    if (r === "admin") m.push(["picking", "caja", "Picking", true]);
    if (conRuta && (r === "admin" || r === "supervisor")) m.push(["mis-pedidos", "recibo", "Mis pedidos", true]);
    if (C.visible()) m.push(["config", "ajustes", "Configuración", true]);
    m.push(["mensajes", "msg", "Mensajes"], ["yo", "menu", "Más"]); // "☰ Más" igual en celular y computadora
    return m;
  },

  // Barra inferior del celular: todos los botones del rol, con nombres cortos para que quepan completos.
  movil() {
    const corto = { programacion: "Agenda", mensajes: "Avisos", objetivos: "Metas", "mis-pedidos": "Pedidos", yo: "Más" };
    // Celular: máximo 5 botones (los principales + Yo). Avisos, Equipo, Agenda y lo demás quedan dentro de "Yo".
    const m = this.rutas().filter((x) => !x[3]).map(([k, i, t, d]) => [k, k === "yo" ? "menu" : i, corto[k] || t, d]);
    const prio = ["picking", "resumen", "hoy", "mis-pedidos", "pedidos", "objetivos", "facturacion"];
    if (!m.some((x) => x[0] === "hoy") && m.some((x) => x[0] === "equipo")) prio.splice(2, 0, "equipo"); // sin ruta propia, ese lugar lo ocupa Equipo
    const prim = m.filter((x) => prio.includes(x[0])).sort((a, b) => prio.indexOf(a[0]) - prio.indexOf(b[0])).slice(0, 4);
    const yo = m.filter((x) => x[0] === "yo");
    const nav = m.filter((x) => prim.includes(x)).concat(yo);
    const extra = m.filter((x) => !nav.includes(x)).sort((a, b) => (b[0] === "mensajes") - (a[0] === "mensajes"));
    return { nav, extra };
  },


  async render() {
    if (!DB.user) return this.login();
    if (DB.estado?.vencida) return this.vencido();
    const gen = (this._gen = (this._gen || 0) + 1); // cada pintado tiene número; si llega otro mientras carga, el viejo no muestra errores
    document.body.classList.remove("en-login");
    if (!LS.get("cat") && navigator.onLine && DB.perfil?.rol !== "vendedor") await DB.catalogos().catch(() => {}); // para saber si tiene tiendas asignadas antes de armar el menú
    let ruta = (location.hash || "").slice(1);
    const menu = this.rutas();
    if (Visita.get() && !ruta) ruta = "visita";
    const [base, sub] = ruta.split("/");
    if (base === "mensajes") ruta = "mensajes";
    if (base === "soporte") ruta = "soporte";
    if (base === "cierre") { const [, vidC, fC] = (location.hash.replace("#", "")).split("/"); location.hash = "#" + (menu.some((x) => x[0] === "resumen") ? "resumen" : menu[0][0]); if (vidC) setTimeout(() => CIERRE.abrir(vidC, fC || null), 400); return; }
    if (base === "ficha") { const idF = Number(sub); location.hash = "#" + (menu.some((x) => x[0] === "equipo") ? "equipo" : menu[0][0]); if (idF) setTimeout(() => FICHA.abrir(idF), 400); return; }
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
    // Al cambiar de pantalla se empieza arriba: sin esto, al venir de "Más" deslizado, Configuración abría ya bajada y no se veían ni el título ni las pestañas.
    const claveRuta = ruta + "/" + (sub || "");
    if (this._rutaAnt !== claveRuta) { this._rutaAnt = claveRuta; window.scrollTo(0, 0); }
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
      if (ruta === "resumen") await this.primerosPasos(root).catch(() => {});
      if (this.barraPrueba()) { root.insertAdjacentHTML("afterbegin", this.barraPrueba()); $("[data-contratar]", root).onclick = () => this.contratar(); }
      if ((ruta === "hoy" || ruta === "resumen") && MSG.bannerPush()) { root.insertAdjacentHTML("afterbegin", MSG.bannerPush()); MSG.enlazarBanner(root, () => App.render()); }
    } catch (e) {
      console.error(e);
      if (gen !== this._gen || !root.isConnected) return; // pantalla vieja: ya se está mostrando otra
      root.innerHTML = `<div class="empty card flat"><div class="ic">${ic("alerta", 34)}</div>${esc(e.message || e)}<br><button class="btn sec sm" style="margin-top:12px" onclick="App.render()">Reintentar</button></div>`;
    }
    // Logo de la empresa cliente arriba a la derecha (se vuelve a poner si la pantalla se redibuja)
    App.logoCliente(root);
    if (!root._obsLogo) { root._obsLogo = new MutationObserver(() => App.logoCliente(root)); root._obsLogo.observe(root, { childList: true }); }
    MSG.revisar();
    SOP.revisar();
    PEDN.revisar();
    App.conectarAvisos();
  },

  // Una vez por sesión: tiempo real (Soporte y comunicados llegan al instante) y registro de notificaciones
  // si el navegador ya dio permiso (como Gmail o Slack: no hay que tocar "Activar" en cada equipo).
  conectarAvisos() {
    if (!DB.user || this._avisos) return;
    this._avisos = true;
    MSG.activarPush(false).catch(() => {});
    try {
      sb.channel("clarus-avisos-" + DB.user.id)
        .on("postgres_changes", { event: "*", schema: "public", table: "soporte_tickets" }, () => SOP.revisar())
        .on("postgres_changes", { event: "*", schema: "public", table: "comunicado_destinos", filter: "user_id=eq." + DB.user.id }, () => MSG.revisar())
        .subscribe();
    } catch (e) { console.warn(e); }
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
    const items = this.movil().extra.concat(this.rutas().filter((x) => x[3])).map(([k, i, t]) => [k, i, k === "programacion" ? "Agenda" : t]);
    // Celular: primero el menú (lo que no cabe abajo); después la cuenta, sincronización y contraseña.
    root.innerHTML = `<div class="yo-cab"><div class="ava">${esc(iniciales(DB.perfil.nombre))}</div><div class="grow"><b>${esc(DB.perfil.nombre)}</b>
        <div class="small muted">${esc(DB.empresa?.nombre || "")} · ${esc(ROLES_TXT?.[DB.perfil.rol] || DB.perfil.rol)}</div></div></div>
      ${items.length ? `<div class="card solo-movil list yo-menu">${items.map(([k, i, t]) => `<a class="item" href="#${k}"><span class="ic" style="color:var(--azul);position:relative;display:flex">${ic(i)}</span><span class="grow">${k === "mensajes" ? "Avisos y comunicados" : t}</span>›</a>`).join("")}</div>` : ""}
      <h3 class="yo-sec">Cuenta y datos</h3>
      <div class="card"><div class="row"><span class="sp">Registros por enviar</span><b>${n}</b></div>
        ${err ? `<div class="small" style="color:var(--rosa-t);margin-top:6px">Último error: ${esc(err.error)}</div>` : ""}
        <button class="btn sec block" style="margin-top:12px" data-sync>Sincronizar ahora</button>
        <button class="btn ghost block" style="margin-top:8px" data-cat>Actualizar tiendas y productos</button></div>
      <div class="card"><label class="f" style="margin-top:0">Cambiar mi contraseña</label><input class="in" type="password" id="npw" placeholder="mínimo 6 caracteres">
        <button class="btn sec block" style="margin-top:10px" data-pw>Guardar contraseña</button></div>
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

  // Pantalla de inicio "Foco" (v0.12.0): blanca, lema protagonista y la lente como marca de agua. Fija: cabe en la pantalla y no abre el teclado sola en el celular.
  login(msg, usuario = "") {
    const lente = (w, color, punto) => `<svg aria-hidden="true" width="${w}" height="${w}" viewBox="0 0 48 48" fill="none"><path d="M37 13.5A17 17 0 1 0 37 34.5" stroke="${color}" stroke-width="${w > 100 ? 5 : 6}" stroke-linecap="round"/><circle cx="27" cy="21" r="${w > 100 ? 3.2 : 4.2}" fill="${punto}"/></svg>`;
    document.body.classList.add("en-login");
    $("#app").innerHTML = `<div class="foco">
      <div class="foco-agua">${lente(520, "#EAF0FE", "#EAF0FE")}</div>
      <div class="foco-in">
        <div class="foco-marca">${lente(30, "#2F5BEA", "#0B1B33")}<span>clarus</span></div>
        <div class="foco-lema"><span class="foco-eti">Ejecución en punto de venta</span><h1>Te hago ver lo que tú <b>no puedes ver.</b></h1>${visionSello()}</div>
        <form class="foco-form" id="lf" autocomplete="on" novalidate>
          <div class="foco-campo"><label for="lu">Usuario o correo</label>
            <input id="lu" name="username" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username" value="${esc(usuario)}"></div>
          <div class="foco-campo"><label for="lp">Contraseña</label>
            <div class="foco-pw"><input id="lp" name="password" type="password" autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false"><button type="button" id="lver">Mostrar</button></div></div>
          ${msg ? `<p class="foco-error">${esc(msg)}</p>` : ""}
          <div class="foco-acc"><a href="javascript:void 0" id="lolv">Olvidé mi contraseña</a>
            <button type="submit" class="foco-entrar" id="lb">Entrar<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div>
          <a href="javascript:void 0" class="foco-demo" id="ldemo">¿Tu empresa aún no usa Clarus?&nbsp;<b>Pruébalo gratis 15 días</b></a>
        </form>
      </div></div>`;
    $("#lver").onclick = () => { const p = $("#lp"); const ver = p.type === "password"; p.type = ver ? "text" : "password"; $("#lver").textContent = ver ? "Ocultar" : "Mostrar"; p.focus(); };
    $("#lolv").onclick = () => this.olvide($("#lu").value.trim());
    $("#ldemo").onclick = () => this.registro();
    $("#lf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const u = $("#lu").value;
      $("#lb").disabled = true; $("#lb").firstChild.textContent = "Entrando…";
      try { await DB.entrar(u, $("#lp").value); document.body.classList.remove("en-login"); location.hash = ""; this.render(); MSG.activarPush(false); }
      catch (err) { if (err.vencida) return this.vencido(); this.login(err.message, u); }
    });
    // Solo en computadora se pone el cursor en el campo; en el celular no se abre el teclado hasta que la persona toque.
    if (matchMedia("(hover: hover) and (pointer: fine)").matches) (usuario ? $("#lp") : $("#lu")).focus();
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
      <p class="small muted" style="margin-top:-4px">Escribe tu usuario o tu correo. Le avisamos a tu administrador para que te asigne una contraseña nueva.</p>
      <label class="f">Usuario o correo</label><input class="in" name="u" autocapitalize="none" autocorrect="off" spellcheck="false" value="${esc(usuario)}" placeholder="ej. doris">
      <label class="f">Mensaje (opcional)</label><input class="in" name="m" placeholder="Ej.: cambié de teléfono">
      <button class="btn block" style="margin-top:16px" data-ok>Pedir contraseña nueva</button>`, (m, close) => {
      const ok = $("[data-ok]", m);
      ok.onclick = async () => {
        const u = $("[name=u]", m).value.trim(); if (!u) return toast("Escribe tu usuario o correo");
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

  // Prueba gratis: se registra con su correo y entra de inmediato (15 días)
  registro() {
    modal(`<div class="demo-cab">${logo(34)}<div><h2 style="margin:0">Prueba Clarus gratis</h2><p class="small muted" style="margin:2px 0 0">15 días con todo incluido. Sin tarjeta.</p></div></div>
      <label class="f">Tu nombre</label><input class="in" name="nombre" autocomplete="name">
      <label class="f">Empresa</label><input class="in" name="empresa" autocomplete="organization">
      <label class="f">Correo</label><input class="in" name="correo" type="email" inputmode="email" autocomplete="email" autocapitalize="none">
      <label class="f">Contraseña</label><div style="position:relative"><input class="in" name="password" type="password" autocomplete="new-password" placeholder="mínimo 8 caracteres" style="padding-right:84px">
        <button type="button" class="btn ghost sm" data-ver style="position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0">Mostrar</button></div>
      <button class="btn block" style="margin-top:18px" data-ok>Crear mi cuenta y entrar</button>
      <p class="tiny muted" style="text-align:center;margin:10px 0 0">Entras con tu correo. Tú eres el administrador: creas tus tiendas, productos y vendedores.</p>
      <p class="small" style="text-align:center;margin:12px 0 0"><a href="javascript:void 0" data-demo style="color:var(--azul);font-weight:600;text-decoration:none">¿Prefieres que te lo mostremos? Agenda una demo</a></p>`, (m, close) => {
      const v = (n) => $(`[name=${n}]`, m).value.trim();
      $("[data-ver]", m).onclick = (e) => { const p = $("[name=password]", m); const ver = p.type === "password"; p.type = ver ? "text" : "password"; e.target.textContent = ver ? "Ocultar" : "Mostrar"; };
      $("[data-demo]", m).onclick = () => { close(); this.demo(); };
      const ok = $("[data-ok]", m);
      ok.onclick = async () => {
        if (!v("nombre") || !v("empresa")) return toast("Escribe tu nombre y tu empresa");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v("correo"))) return toast("Revisa tu correo");
        if ($("[name=password]", m).value.length < 8) return toast("La contraseña debe tener al menos 8 caracteres");
        ok.disabled = true; ok.textContent = "Creando tu cuenta…";
        try {
          await this.publico({ tipo: "registro", nombre: v("nombre"), empresa: v("empresa"), correo: v("correo"), password: $("[name=password]", m).value });
          await DB.entrar(v("correo"), $("[name=password]", m).value);
          close(); document.body.classList.remove("en-login"); LS.set("bienvenida", true); location.hash = "#resumen"; this.render();
        } catch (e) { ok.disabled = false; ok.textContent = "Crear mi cuenta y entrar"; toast(e.message, 5000); }
      };
    });
  },

  // Aviso arriba durante la prueba (solo administradores)
  barraPrueba() {
    const e = DB.estado;
    if (!e || e.plan !== "prueba" || DB.perfil?.rol !== "admin") return "";
    const d = e.dias ?? 0;
    return `<div class="prueba-barra"><span class="grow">${ic("reloj", 18)}<span><b>Prueba gratis</b> · ${d === 0 ? "termina hoy" : d === 1 ? "te queda 1 día" : `te quedan ${d} días`}</span></span><button class="btn sm" data-contratar>Contratar Clarus</button></div>`;
  },

  // Primeros pasos para una empresa nueva (se ocultan cuando ya cargó tiendas, productos y vendedores)
  async primerosPasos(root) {
    if (DB.estado?.plan !== "prueba" || DB.perfil?.rol !== "admin") return;
    const cuenta = (t, f) => { let q = sb.from(t).select("id", { count: "exact", head: true }); if (f) q = f(q); return q.then((r) => r.count || 0); };
    const [prod, tiendas, vend, asig] = await Promise.all([cuenta("productos"), cuenta("clientes"), cuenta("perfiles", (q) => q.eq("rol", "vendedor")), cuenta("asignacion_tiendas")]);
    const pasos = [["Agrega tus productos", "Nombre, peso y cómo se piden (caja, unidad…).", "#config", prod > 0, "productos"],
      ["Carga tus tiendas", "Una por una o importa tu mapa de Google My Maps con la ubicación.", "#config", tiendas > 0, "tiendas"],
      ["Crea a tus vendedores", "Cada uno entra con su usuario y contraseña.", "#config", vend > 0, "usuarios"],
      ["Arma sus rutas", "Asigna las tiendas y los días de visita de cada vendedor.", "#programacion", asig > 0, ""]];
    const hechos = pasos.filter((p) => p[3]).length;
    if (hechos === pasos.length) return;
    root.insertAdjacentHTML("afterbegin", `<div class="card pasos"><div class="row"><div class="grow"><b style="font-size:17px">${LS.get("bienvenida") ? `¡Bienvenido a Clarus, ${esc((DB.perfil?.nombre || "").split(" ")[0])}!` : "Primeros pasos"}</b>
      <div class="small muted">${hechos} de ${pasos.length} listos. Al terminar, tus vendedores ya pueden salir a ruta con Clarus en su teléfono.</div></div></div>
      <div class="pasos-l">${pasos.map(([t, d, h, ok, tab], i) => `<a class="paso ${ok ? "ok" : ""}" href="${h}" ${tab ? `data-cfgtab="${tab}"` : ""}><span class="paso-n">${ok ? ic("ok", 16) : i + 1}</span><span class="grow"><b>${t}</b><span class="tiny muted">${d}</span></span><span class="muted">›</span></a>`).join("")}</div></div>`);
    $$("[data-cfgtab]", root).forEach((a) => (a.onclick = () => LS.set("cfgTab", a.dataset.cfgtab)));
  },

  // Formulario para contratar (desde la prueba o cuando ya terminó)
  contratar() {
    modal(`<div class="demo-cab">${logo(34)}<div><h2 style="margin:0">Contratar Clarus</h2><p class="small muted" style="margin:2px 0 0">Te contactamos para activar tu cuenta. No pierdes nada de lo que cargaste.</p></div></div>
      <label class="f">WhatsApp / teléfono</label><input class="in" name="telefono" inputmode="tel" value="${esc(DB.perfil?.telefono || "")}">
      <label class="f">¿Cuántos usuarios necesitas?</label><select class="in" name="vendedores"><option value="">Elige…</option><option>1–5</option><option>6–15</option><option>16–50</option><option>Más de 50</option></select>
      <label class="f">Comentario (opcional)</label><textarea class="in" name="mensaje" rows="2"></textarea>
      <button class="btn block" style="margin-top:16px" data-ok>Quiero contratar</button>`, (m, close) => {
      const ok = $("[data-ok]", m);
      ok.onclick = async () => {
        ok.disabled = true; ok.textContent = "Enviando…";
        try {
          await this.publico({ tipo: "contratar", telefono: $("[name=telefono]", m).value.trim(), vendedores: $("[name=vendedores]", m).value, mensaje: $("[name=mensaje]", m).value.trim() });
          m.innerHTML = `<div class="login-ok">${logo(44)}<h2>¡Listo!</h2><p class="muted">Recibimos tu solicitud. Te contactaremos muy pronto para activar tu cuenta.</p><button class="btn block" data-c>Entendido</button></div>`;
          $("[data-c]", m).onclick = close;
        } catch (e) { ok.disabled = false; ok.textContent = "Quiero contratar"; toast(e.message, 4000); }
      };
    });
  },

  // Pantalla cuando la prueba terminó: los datos se guardan, pero no se puede usar hasta contratar
  vencido() {
    document.body.classList.add("en-login");
    const e = DB.estado || {};
    $("#app").innerHTML = `<div class="foco"><div class="foco-in">
      <div class="foco-marca">${logo(30)}<span>clarus</span></div>
      <div class="foco-lema"><span class="foco-eti">${esc(e.empresa || "")}</span><h1>Tu prueba gratis <b>terminó.</b></h1>
        <p class="muted" style="font-size:16px;margin:4px 0 0">Todo lo que cargaste sigue guardado. Contrata Clarus y sigues exactamente donde te quedaste.</p></div>
      <div class="foco-form"><button class="foco-entrar" style="justify-content:center" data-contratar>Quiero contratar</button>
        <a href="javascript:void 0" class="foco-demo" data-salir>Cerrar sesión</a></div></div></div>`;
    $("[data-contratar]").onclick = () => this.contratar();
    $("[data-salir]").onclick = async () => { await sb.auth.signOut(); localStorage.clear(); location.reload(); };
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
  try { await DB.iniciar(); } catch (e) { if (e.vencida) return App.vencido(); DB.user = null; await sb.auth.signOut().catch(() => {}); return App.login(e.message); }
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
