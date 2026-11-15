// Arranque, inicio de sesión, menú según rol y navegación
const App = {
  rutas() {
    const r = DB.perfil.rol;
    const m = [];
    if (r !== "vendedor") m.push(["resumen", "resumen", "Resumen"]);
    if (r === "vendedor" || r === "admin" || r === "supervisor") m.push(["hoy", "ruta", "Ruta"]);
    if (r === "vendedor") m.push(["mis-pedidos", "pedidos", "Pedidos"]);
    if (r !== "vendedor") m.push(["equipo", "equipo", "Equipo"], ["programacion", "reloj", "Programación"], ["objetivos", "ok", "Objetivos"], ["pedidos", "pedidos", "Pedidos"], ["mapa", "pin", "Mapa", true]);
    if (r === "admin" || r === "supervisor") m.push(["mis-pedidos", "recibo", "Mis pedidos", true]);
    if (C.visible()) m.push(["config", "ajustes", "Configuración", true]);
    m.push(["mensajes", "msg", "Mensajes"], ["yo", "yo", "Yo"]);
    return m;
  },

  async render() {
    if (!DB.user) return this.login();
    let ruta = (location.hash || "").slice(1);
    const menu = this.rutas();
    if (Visita.get() && !ruta) ruta = "visita";
    const [base, sub] = ruta.split("/");
    if (base === "mensajes") ruta = "mensajes";
    if (base === "soporte") ruta = "soporte";
    if (!ruta || (ruta !== "visita" && ruta !== "soporte" && !menu.some((x) => x[0] === ruta))) ruta = menu[0][0];
    const app = $("#app");
    const link = ([k, i, t]) => `<a href="#${k}" class="${k === ruta || (ruta === "visita" && k === "hoy") ? "on" : ""}"><span class="ic">${ic(i)}</span>${t}</a>`;
    const navHtml = menu.map(link).join("");
    const movil = menu.filter((x) => !x[3]).map((x) => link(x[0] === "programacion" ? [x[0], x[1], "Agenda"] : x[0] === "mensajes" ? [x[0], x[1], "Avisos"] : x)).join("");
    const lema = `Te hago ver lo que tú <b>no puedes ver.</b>`;
    app.innerHTML = `<header class="barra-marca"><div class="brand">${logo(24)}clarus</div><span class="lema-c">${lema}</span></header>
      <div class="shell"><nav class="side"><div class="brand">${logo(30)}clarus</div><p class="lema-side">${lema}</p>${navHtml}</nav>
      <main class="main" id="main"></main></div><nav class="nav">${movil}</nav>`;
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
      else if (ruta === "yo") await this.yo(root);
      if (ruta === "hoy" && MSG.bannerPush()) { root.insertAdjacentHTML("afterbegin", MSG.bannerPush()); MSG.enlazarBanner(root, () => App.render()); }
    } catch (e) {
      console.error(e);
      root.innerHTML = `<div class="empty card flat"><div class="ic">${ic("alerta", 34)}</div>${esc(e.message || e)}<br><button class="btn sec sm" style="margin-top:12px" onclick="App.render()">Reintentar</button></div>`;
    }
    MSG.revisar();
    SOP.revisar();
  },

  async syncPill() {
    const el = $("#syncpill"); if (!el) return;
    const n = await DB.pendientes();
    el.innerHTML = !navigator.onLine ? `<span class="sync p-durazno">Sin señal${n ? " · " + n + " por enviar" : ""}</span>`
      : n ? `<span class="sync p-azul">Enviando ${n}…</span>` : `<span class="sync p-menta">✓ Al día</span>`;
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
      ${this.rutas().filter((x) => x[3]).length ? `<div class="card solo-movil list">${this.rutas().filter((x) => x[3]).map(([k, i, t]) => `<a class="item" href="#${k}"><span style="color:var(--azul)">${ic(i)}</span><span class="grow">${t}</span>›</a>`).join("")}</div>` : ""}
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

  login(msg, usuario = "") {
    $("#app").innerHTML = `<div class="login">
      <div class="brand">${logo(46)}clarus</div>
      <p class="lema">Te hago ver lo que tú <b>no puedes ver.</b></p>
      <form class="card" id="lf" autocomplete="on" novalidate>
        <label class="f" style="margin-top:0" for="lu">Usuario</label>
        <input class="in" id="lu" name="username" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username" value="${esc(usuario)}">
        <label class="f" for="lp">Contraseña</label>
        <div style="position:relative"><input class="in" id="lp" name="password" type="password" autocomplete="current-password" style="padding-right:84px">
          <button type="button" id="lver" class="btn ghost sm" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0">Mostrar</button></div>
        <button type="submit" class="btn block" style="margin-top:18px" id="lb">Entrar</button>
        ${msg ? `<p class="small" style="color:var(--rosa-t)">${esc(msg)}</p>` : ""}</form></div>`;
    $("#lver").onclick = () => { const p = $("#lp"); const ver = p.type === "password"; p.type = ver ? "text" : "password"; $("#lver").textContent = ver ? "Ocultar" : "Mostrar"; p.focus(); };
    $("#lf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const u = $("#lu").value;
      $("#lb").disabled = true; $("#lb").textContent = "Entrando…";
      try { await DB.entrar(u, $("#lp").value); location.hash = ""; this.render(); MSG.activarPush(false); }
      catch (err) { this.login(err.message, u); }
    });
    (usuario ? $("#lp") : $("#lu")).focus();
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

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
