// Conexión con Supabase, caché local y cola de sincronización (funciona sin señal)
const sb = supabase.createClient(CLARUS.url, CLARUS.key, { auth: { persistSession: true, autoRefreshToken: true } });

const LS = {
  get(k, d = null) { try { const v = localStorage.getItem("clarus." + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("clarus." + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem("clarus." + k); } catch {} },
};

// ---------- IndexedDB: cola de operaciones y archivos ----------
const IDB = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open("clarus", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("ops", { keyPath: "k", autoIncrement: true }); r.result.createObjectStore("blobs"); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (store, mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(store, mode); const s = t.objectStore(store); const out = fn(s); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); };
  return {
    addOp: (op) => tx("ops", "readwrite", (s) => s.add(op)),
    ops: () => tx("ops", "readonly", (s) => s.getAll()),
    delOp: (k) => tx("ops", "readwrite", (s) => s.delete(k)),
    putOp: (op) => tx("ops", "readwrite", (s) => s.put(op)),
    putBlob: (key, b) => tx("blobs", "readwrite", (s) => s.put(b, key)),
    getBlob: (key) => tx("blobs", "readonly", (s) => s.get(key)),
    delBlob: (key) => tx("blobs", "readwrite", (s) => s.delete(key)),
  };
})();

const DB = {
  user: null, perfil: null, empresa: null, permisos: LS.get("permisos", []),
  // El administrador puede todo; los demás roles, según la tabla de permisos
  puede(p) { return this.perfil?.rol === "admin" || this.permisos.includes(p); },

  async iniciar() {
    const { data } = await sb.auth.getSession();
    this.user = data.session?.user || null;
    if (!this.user) return false;
    this.perfil = LS.get("perfil");
    this.estado = LS.get("estado");
    if (navigator.onLine) {
      // Plan de la empresa (prueba gratis / activo). Si la prueba venció, el servidor ya no entrega datos.
      const { data: est } = await sb.rpc("estado_cuenta");
      if (est) { this.estado = est; LS.set("estado", est); }
    }
    if (this.estado?.vencida) { const e = new Error("Tu prueba terminó"); e.vencida = true; throw e; }
    if (navigator.onLine) {
      const { data: p, error } = await sb.from("perfiles").select("*, empresas(*)").eq("id", this.user.id).maybeSingle();
      if (error && !this.perfil) throw error;
      if (p) { this.perfil = p; LS.set("perfil", p); }
    }
    if (!this.perfil) throw new Error("Tu usuario no tiene perfil asignado. Contacta al administrador.");
    if (!this.perfil.activo) throw new Error("Tu usuario está desactivado.");
    this.empresa = this.perfil.empresas;
    return true;
  },

  async entrar(usuario, password) {
    const u = usuario.trim().toLowerCase();
    const email = u.includes("@") ? u : `${u}@${CLARUS.dominio}`;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message.includes("Invalid") ? "Usuario o contraseña incorrectos" : error.message);
    return this.iniciar();
  },

  async salir() {
    const pend = (await IDB.ops()).length;
    if (pend && !(await confirmar(`Tienes ${pend} registro(s) sin sincronizar. Si sales ahora se pueden perder.`, "Salir igual"))) return;
    await sb.auth.signOut(); localStorage.clear(); location.reload();
  },

  // ---------- Catálogos con caché para trabajar sin señal ----------
  async catalogos(forzar = false) {
    const c = LS.get("cat");
    if (c && !forzar && (!navigator.onLine || Date.now() - c.at < 10 * 60 * 1000)) return c;
    if (!navigator.onLine) return c || { clientes: [], productos: [], ruta: [], tareas: [], ap: [] };
    const [cl, pr, ru, ta, ap, ob, pm, pls, plt] = await Promise.all([
      sb.from("clientes").select("*").eq("activo", true).order("nombre"),
      sb.from("productos").select("*").eq("activo", true).order("nombre"),
      sb.from("asignacion_tiendas").select("*").eq("vendedor_id", this.user.id),
      sb.from("tareas_catalogo").select("*").eq("activo", true).order("orden"),
      sb.from("asignacion_productos").select("*"),
      sb.from("objetivos").select("cliente_id, producto_id, objetivo_kg, objetivo_usd, venta_kg, venta_usd, corte").eq("mes", mesActual()),
      sb.from("permisos_rol").select("permiso").eq("rol", this.perfil.rol).eq("permitido", true),
      sb.from("planogramas").select("*").eq("activo", true),
      sb.from("planograma_tiendas").select("planograma_id, cliente_id"),
    ]);
    const err = [cl, pr, ru, ta, ap].find((r) => r.error);
    if (err) { if (c) return c; throw err.error; }
    if (!pm.error) { this.permisos = pm.data.map((x) => x.permiso); LS.set("permisos", this.permisos); }
    const out = { at: Date.now(), clientes: cl.data, productos: pr.data, ruta: ru.data, tareas: ta.data, ap: ap.data, obj: ob.error ? [] : ob.data, planos: pls.error ? [] : pls.data, planoTiendas: plt.error ? [] : plt.data };
    LS.set("cat", out);
    return out;
  },

  // ---------- Cola de sincronización ----------
  ids: LS.get("ids", {}),
  setId(lid, id) { this.ids[lid] = id; LS.set("ids", this.ids); },
  async encolar(op) { await IDB.addOp({ ...op, creado: Date.now() }); this.sincronizar(); },
  async pendientes() { return (await IDB.ops()).length; },

  _sync: null,
  sincronizar() {
    if (this._sync) return this._sync;
    this._sync = (async () => {
      try {
        if (!navigator.onLine) return;
        const ops = await IDB.ops();
        for (const op of ops) {
          try { await this.ejecutar(op); await IDB.delOp(op.k); }
          catch (e) {
            console.warn("sync", op.t, e);
            if (e && (e.code === "P0001" || e.permanente)) { // regla de negocio: no se puede reintentar
              await IDB.delOp(op.k); const av = LS.get("avisos", []); av.unshift({ at: Date.now(), msg: e.message }); LS.set("avisos", av.slice(0, 20));
              toast(e.message, 5000); continue;
            }
            op.intentos = (op.intentos || 0) + 1; op.error = String(e.message || e);
            await IDB.putOp(op);
            break; // mantener el orden: se reintenta luego
          }
        }
      } finally { this._sync = null; window.dispatchEvent(new Event("clarus-sync")); }
    })();
    return this._sync;
  },

  async idVisita(lid) {
    if (this.ids[lid]) return this.ids[lid];
    const { data } = await sb.from("visitas").select("id").eq("id_local", lid).maybeSingle();
    if (data) { this.setId(lid, data.id); return data.id; }
    throw new Error("Visita aún no sincronizada");
  },

  async subir(bucket, blobKey, lid, ext, tipo) {
    const blob = await IDB.getBlob(blobKey);
    if (!blob) throw new Error("Archivo no encontrado en el teléfono");
    const path = `${this.perfil.empresa_id}/${this.user.id}/${lid}/${blobKey}.${ext}`;
    const { error } = await sb.storage.from(bucket).upload(path, blob, { contentType: tipo, upsert: true });
    if (error && !/exists/i.test(error.message)) throw error;
    return path;
  },

  async ejecutar(op) {
    const d = op.data || {};
    const ok = (r) => { if (r.error && r.error.code !== "23505") throw r.error; return r; };
    switch (op.t) {
      case "visita_in": {
        const r = await sb.from("visitas").insert({ id_local: op.lid, cliente_id: d.cliente_id, checkin_at: d.at, checkin_lat: d.lat, checkin_lng: d.lng, checkin_precision_m: d.precision }).select("id").maybeSingle();
        ok(r); if (r.data) this.setId(op.lid, r.data.id); else await this.idVisita(op.lid);
        return;
      }
      case "visita_out": {
        const id = await this.idVisita(op.lid);
        ok(await sb.from("visitas").update({ checkout_at: d.at, checkout_lat: d.lat, checkout_lng: d.lng, checkout_precision_m: d.precision, comentario: d.comentario || null }).eq("id", id));
        return;
      }
      case "alertas": {
        const id = await this.idVisita(op.lid);
        ok(await sb.from("visita_alertas").upsert({ visita_id: id, cliente_id: op.cliente_id, alertas: op.alertas, confirmado_at: op.at }, { onConflict: "visita_id" }));
        if (op.comunicados?.length) ok(await sb.from("comunicado_destinos").update({ ok_at: op.at, leido_at: op.at }).in("comunicado_id", op.comunicados).eq("user_id", this.user.id).is("ok_at", null));
        return;
      }
      case "planos": {
        const id = await this.idVisita(op.lid);
        ok(await sb.from("planograma_revisiones").upsert(op.rows.map((x) => ({ visita_id: id, planograma_id: x.planograma_id, cumple: x.cumple })), { onConflict: "visita_id,planograma_id" }));
        return;
      }
      case "gestiones": {
        const id = await this.idVisita(op.lid);
        ok(await sb.from("gestiones").upsert(op.rows.map((x) => ({ visita_id: id, tarea_id: x.tarea_id, hecho: x.hecho, nota: x.nota || null }))));
        return;
      }
      case "inventario": {
        const id = await this.idVisita(op.lid);
        const del = op.rows.filter((x) => x.unidades == null);
        const up = op.rows.filter((x) => x.unidades != null);
        if (up.length) ok(await sb.from("inventarios").upsert(up.map((x) => ({ visita_id: id, producto_id: x.producto_id, ubicacion: x.ubicacion, unidades: x.unidades, agotado: !!x.agotado })), { onConflict: "visita_id,producto_id,ubicacion" }));
        for (const x of del) await sb.from("inventarios").delete().match({ visita_id: id, producto_id: x.producto_id, ubicacion: x.ubicacion });
        return;
      }
      case "foto": {
        const id = await this.idVisita(op.lid);
        const path = await this.subir("fotos", op.blob, op.lid, "jpg", "image/jpeg");
        ok(await sb.from("fotos").insert({ id_local: op.blob, visita_id: id, tipo: d.tipo, storage_path: path, tomada_at: d.at, lat: d.lat, lng: d.lng }));
        await IDB.delBlob(op.blob);
        return;
      }
      case "promo": {
        const id = await this.idVisita(op.lid);
        let foto_id = null;
        if (op.blob) {
          const path = await this.subir("fotos", op.blob, op.lid, "jpg", "image/jpeg");
          const f = ok(await sb.from("fotos").insert({ id_local: op.blob, visita_id: id, tipo: "promocion", storage_path: path, tomada_at: d.at, lat: d.lat, lng: d.lng }).select("id").maybeSingle());
          foto_id = f.data?.id || (await sb.from("fotos").select("id").eq("id_local", op.blob).single()).data.id;
        }
        ok(await sb.from("promociones").insert({ id_local: op.plid, visita_id: id, producto_id: d.producto_id || null, tipo: d.tipo, precio_regular: d.precio_regular || null, precio_oferta: d.precio_oferta || null, vigencia_hasta: d.vigencia_hasta || null, nota: d.nota || null, foto_id }));
        if (op.blob) await IDB.delBlob(op.blob);
        return;
      }
      case "pedido": {
        const visita_id = op.lid ? await this.idVisita(op.lid) : null;
        let r = await sb.from("pedidos").insert({ id_local: op.plid, visita_id, cliente_id: d.cliente_id, nota_vendedor: d.nota || null }).select("id").maybeSingle();
        ok(r);
        const pid = r.data?.id || (await sb.from("pedidos").select("id").eq("id_local", op.plid).single()).data.id;
        ok(await sb.from("pedido_items").upsert(op.items.map((x) => ({ pedido_id: pid, producto_id: x.producto_id, stock_unidades: x.stock, sugerido: x.sugerido, propuesto: x.propuesto })), { onConflict: "pedido_id,producto_id" }));
        return;
      }
      case "pedido_editar":
      case "pedido_anular": {
        const { data: p } = await sb.from("pedidos").select("id, estado").eq("id_local", op.plid).maybeSingle();
        if (!p) throw new Error("Pedido aún no sincronizado");
        if (p.estado !== "propuesto") { const e = new Error("El pedido ya fue revisado por el supervisor y no se pudo cambiar"); e.permanente = true; throw e; }
        if (op.t === "pedido_anular") { ok(await sb.from("pedidos").update({ estado: "anulado" }).eq("id", p.id)); return; }
        ok(await sb.from("pedidos").update({ nota_vendedor: op.nota || null }).eq("id", p.id));
        const ids = op.items.map((x) => x.producto_id);
        ok(await sb.from("pedido_items").delete().eq("pedido_id", p.id).not("producto_id", "in", `(${ids.join(",")})`));
        ok(await sb.from("pedido_items").upsert(op.items.map((x) => ({ pedido_id: p.id, producto_id: x.producto_id, stock_unidades: x.stock, sugerido: x.sugerido, propuesto: x.propuesto })), { onConflict: "pedido_id,producto_id" }));
        return;
      }
      case "orden": {
        let pid = op.pedido_id;
        if (!pid) { const { data: q } = await sb.from("pedidos").select("id").eq("id_local", op.plid).maybeSingle(); if (!q) throw new Error("Pedido aún no sincronizado"); pid = q.id; }
        const path = await this.subir("documentos", op.blob, "pedido-" + pid, "pdf", "application/pdf");
        ok(await sb.from("pedido_documentos").insert({ id_local: op.blob, pedido_id: pid, storage_path: path, paginas: d.paginas, tomado_at: d.at, lat: d.lat, lng: d.lng }));
        const { data: p } = await sb.from("pedidos").select("estado").eq("id", pid).single();
        const cambios = { numero_orden: d.numero_orden || null, escaneado_at: d.at };
        if (p && p.estado === "aprobado") cambios.estado = "orden_escaneada";
        if (p && ["propuesto", "aprobado", "orden_escaneada"].includes(p.estado)) ok(await sb.from("pedidos").update(cambios).eq("id", pid));
        await IDB.delBlob(op.blob);
        return;
      }
    }
    throw new Error("Operación desconocida " + op.t);
  },

  async urlFirmada(bucket, path, seg = 3600) {
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, seg);
    if (error) throw error;
    return data.signedUrl;
  },

  async funcion(nombre, body) {
    const { data, error } = await sb.functions.invoke(nombre, { body });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); msg = j.error || msg; } catch {}
      throw new Error(msg);
    }
    return data;
  },
};

window.addEventListener("online", () => DB.sincronizar());
setInterval(() => DB.sincronizar(), 30000);
