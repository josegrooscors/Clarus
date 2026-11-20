// Novedades: instructivo paso a paso que sale una vez al entrar después de una actualización. Al final la persona confirma («Entendido») y queda registrado.
// Para un instructivo nuevo basta cambiar `id` y `pasos`.
const NOV = {
  id: "2026-11-20-visita",
  pasos: [
    { t: "Inventario: solo la bodega", d: "Cuenta lo que hay en bodega. Toma una foto por producto, o marca «Sin existencia» si no hay.", m: [["Queso Mozzarella · bodega", "4 barras"], ["Foto del producto", "Tomar foto", "azul"], ["Queso Muenster", "Sin existencia", "gris"]] },
    { t: "Exhibición: por mueble", d: "Cuenta lo exhibido en cada mueble. Primero las cantidades; la foto va al final.", m: [["Nevera de empacados", "12 paq."], ["Vitrina deli", "3 barras"], ["Foto del mueble", "al final", "azul"]] },
    { t: "Pedido: lo sugerido primero", d: "Clarus calcula el pedido con lo que contaste en bodega y en exhibición. Revísalo, ajusta si hace falta y guarda.", m: [["Queso Mozzarella", "Sugerido: 2 cajas", "azul"], ["Bodega 4 + exhibido 12", "", "gris"], ["Otras categorías", "Elegir", "azul"]] },
    { t: "Promociones: descuento (%)", d: "En Gestión puedes registrar una promoción con su porcentaje de descuento.", m: [["Tipo de promoción", "Descuento (%)"], ["Descuento", "15 %"], ["Foto de la promoción", "Tomar foto", "azul"]] },
    { t: "Una visita abierta a la vez", d: "Para entrar a otra tienda, cierra la anterior. Si no terminaste, usa «Cerrar sin terminar» y elige el motivo.", m: [["Super 99 Brisas del Golf", "Visita abierta", "azul"], ["Xtra Los Pueblos", "Cierra la anterior", "ambar"], ["Cerrar sin terminar", "con motivo", "gris"]] },
  ],
  aplica() { return typeof DB !== "undefined" && DB.puede && DB.puede("visitar"); },
  // ¿Hay que mostrarlo? Si ya confirmó en otro teléfono, el servidor lo sabe.
  async debe() {
    if (!this.aplica() || LS.get("nov.ok", "") === this.id || this._abierto) return false;
    try { const { data } = await sb.from("novedades_vistas").select("novedad").eq("usuario_id", DB.user.id).eq("novedad", this.id).maybeSingle(); if (data) { LS.set("nov.ok", this.id); return false; } } catch (e) { /* sin señal: se muestra */ }
    return true;
  },
  async alEntrar() { if (this._revisado) return; this._revisado = true; if (await this.debe()) this.mostrar(); },
  async registrar() {
    LS.set("nov.ok", this.id);
    try { const { error } = await sb.from("novedades_vistas").upsert({ usuario_id: DB.user.id, novedad: this.id }, { onConflict: "usuario_id,novedad", ignoreDuplicates: true }); LS.set("nov.pend", error ? this.id : ""); } catch (e) { LS.set("nov.pend", this.id); }
  },
  async reintentar() { if (LS.get("nov.pend", "") === this.id && this.aplica()) await this.registrar(); },
  mostrar(repaso = false) {
    if (this._abierto) return; this._abierto = true;
    const n = this.pasos.length, el = document.createElement("div"); let i = 0;
    el.className = "nov"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Novedades");
    const cerrar = () => { el.remove(); this._abierto = false; document.body.style.overflow = ""; };
    const pinta = () => {
      const p = this.pasos[i], ult = i === n - 1;
      el.innerHTML = `<div class="nov-c"><div class="nov-k"><span>Novedades · ${i + 1} de ${n}</span>${repaso ? `<button class="nov-x" data-nx aria-label="Cerrar">Cerrar</button>` : ""}</div>
        <div class="nov-m">${p.m.map(([a, b, c]) => `<div class="nov-l"><b>${esc(a)}</b><span class="${c || ""}">${esc(b)}</span></div>`).join("")}</div>
        <h2>${esc(p.t)}</h2><p>${esc(p.d)}</p><span class="grow"></span>
        <div class="nov-p" aria-hidden="true">${this.pasos.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
        <div class="nov-b">${i ? `<button class="btn sec" data-na>Atrás</button>` : ""}<button class="btn" data-ns>${ult ? (repaso ? "Cerrar" : "Entendido") : "Siguiente"}</button></div></div>`;
      const a = el.querySelector("[data-na]"), x = el.querySelector("[data-nx]");
      if (a) a.onclick = () => { i--; pinta(); };
      if (x) x.onclick = cerrar;
      el.querySelector("[data-ns]").onclick = async () => { if (!ult) { i++; pinta(); return; } cerrar(); if (!repaso) { await this.registrar(); toast("Gracias. Lo puedes repasar en Más › Novedades"); } };
    };
    let x0 = null;
    el.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    el.addEventListener("touchend", (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (dx < -60 && i < n - 1) { i++; pinta(); } else if (dx > 60 && i > 0) { i--; pinta(); } }, { passive: true });
    document.body.appendChild(el); document.body.style.overflow = "hidden"; pinta();
  },
};
