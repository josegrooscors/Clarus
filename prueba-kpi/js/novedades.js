// Novedades: instructivo paso a paso que sale una vez al entrar después de una actualización. Al final la persona confirma («Entendido») y queda registrado.
// Para un instructivo nuevo basta cambiar `id` y `pasos`.
const NOV = {
  id: "2026-11-20-flujo",
  pasos: [
    { t: "Inventario: ahora solo cuentas la bodega", antes: "Contabas en una sola pantalla lo de la bodega y lo que estaba exhibido.", ahora: "En «Inventario» cuentas únicamente lo que está guardado en la bodega. Lo exhibido se cuenta en el paso siguiente.",
      como: ["Escribe cuánto hay en bodega de cada producto.", "Toca la cámara y toma una foto de ese producto en la bodega.", "Si no hay nada en bodega, toca «Sin existencia». Ahí no pide foto."],
      m: [["Queso Mozzarella · bodega", "4 barras"], ["Foto del producto", "Tomar foto", "azul"], ["Queso Muenster", "Sin existencia", "gris"]] },
    { t: "Exhibición: se cuenta mueble por mueble", antes: "Lo exhibido se contaba junto con la bodega, sin separar dónde estaba.", ahora: "En «Exhibición» aparece cada mueble de la tienda (nevera de empacados, vitrina deli…). Cuentas lo que hay en cada uno.",
      como: ["Toca el mueble que vas a revisar.", "Escribe cuánto hay de cada producto en ese mueble.", "Al final, toma la foto del mueble ya ordenado."],
      m: [["Nevera de empacados", "12 paquetes"], ["Vitrina deli", "3 barras"], ["Foto del mueble", "al final", "azul"]] },
    { t: "Pedido: una sola lista, lo sugerido arriba", antes: "Había dos botones: «Sugeridos» y «Por categoría», y tenías que cambiar entre ellos.", ahora: "Hay una sola lista. Clarus suma lo que contaste en bodega y en exhibición y te pone arriba lo que recomienda pedir.",
      como: ["Revisa la cantidad sugerida de cada producto.", "Cámbiala si la tienda necesita más o menos.", "Toca «Guardar»."],
      m: [["Queso Mozzarella", "Sugerido: 2 cajas", "azul"], ["Tienes: bodega 4 + exhibido 12", "", "gris"]] },
    { t: "Promociones: nuevo tipo «Descuento (%)»", antes: "No había cómo registrar una promoción de porcentaje de descuento.", ahora: "Si la tienda tiene el producto con un porcentaje de descuento, ya lo puedes registrar.",
      como: ["En «Gestión», toca «+ Agregar promoción».", "En el tipo, elige «Descuento (%)».", "Escribe el porcentaje, por ejemplo 15, y toma la foto."],
      m: [["Tipo de promoción", "Descuento (%)"], ["Descuento", "15 %"], ["Foto de la promoción", "Tomar foto", "azul"]] },
    { t: "Solo una visita abierta a la vez", antes: "Podías entrar a otra tienda dejando la anterior sin cerrar.", ahora: "Para entrar a otra tienda, primero tienes que cerrar la visita anterior. Clarus no te deja abrir dos.",
      como: ["Termina tu visita y toca «Hacer check-out».", "Si no pudiste terminar, toca «Cerrar sin terminar» y elige el motivo.", "Ya puedes entrar a la siguiente tienda."],
      m: [["Super 99 Brisas del Golf", "Visita abierta", "azul"], ["Xtra Los Pueblos", "Cierra la anterior", "ambar"]] },
  ],
  aplica() { return typeof DB !== "undefined" && !!DB.user && !!DB.perfil; }, // todo el equipo: campo, supervisión, operaciones y gerencia
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
      el.innerHTML = `<div class="nov-c"><div class="nov-k"><span class="nov-logo">${logo(24)}<b>clarus</b></span><span>Novedades · ${i + 1} de ${n}</span></div>
        <div class="nov-s"><h2>${esc(p.t)}</h2>
          <div class="nov-aa"><div><span>Antes</span><p>${esc(p.antes)}</p></div><div class="ahora"><span>Ahora</span><p>${esc(p.ahora)}</p></div></div>
          <div class="nov-h">Cómo se hace</div><ol class="nov-o">${p.como.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
          <div class="nov-h">Ejemplo</div><div class="nov-m">${p.m.map(([a, b, c]) => `<div class="nov-l"><b>${esc(a)}</b><span class="${c || ""}">${esc(b)}</span></div>`).join("")}</div></div>
        <div class="nov-f"><div class="nov-p" aria-hidden="true">${this.pasos.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
        <div class="nov-b">${i ? `<button class="btn sec" data-na>Atrás</button>` : ""}<button class="btn" data-ns>${ult ? (repaso ? "Cerrar" : "Entendido") : "Siguiente"}</button></div>${repaso ? `<button class="nov-x" data-nx>Cerrar</button>` : ""}</div></div>`;
      el.querySelector(".nov-s").scrollTop = 0;
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
