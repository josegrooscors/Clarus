// Cierre del día de una vendedora: la tarjeta que abre el aviso «Yerenis cerró su día». También se abre desde el Resumen.
const CIERRE = {
  async datos(vid, fecha) {
    const { data, error } = await sb.rpc("cierre_dia", { p_vendedor: vid, p_fecha: fecha || null });
    if (error) throw error;
    if (!data || !data.vendedor) throw new Error("No se encontró el día de esa vendedora o no tienes acceso.");
    return data;
  },
  estado(r) {
    if (!r.agendadas) return ["gris", "Sin ruta este día"];
    if (r.pendientes === 0 && r.en_curso === 0 && r.abiertas === 0) return r.hechas ? ["menta", "Día cerrado"] : ["gris", "Día justificado"];
    return r.fecha < hoyISO() ? ["rosa", "Día sin cerrar"] : ["azul", "En ruta"];
  },
  areas(r) {
    const o = [];
    r.tiendas.filter((t) => t.estado === "pendiente").forEach((t) => o.push(["rosa", `No visitó ${t.nombre}.`]));
    if (r.abiertas) o.push(["rosa", `${plur(r.abiertas, "visita")} sin check-out.`]);
    if (r.fuera_radio) o.push(["rosa", `${plur(r.fuera_radio, "visita")} marcada${r.fuera_radio === 1 ? "" : "s"} fuera del radio de la tienda.`]);
    if (r.cortas) o.push(["durazno", `${plur(r.cortas, "visita")} de menos de 10 minutos.`]);
    if (r.agotados) o.push(["durazno", `${plur(r.agotados, "producto")} agotado${r.agotados === 1 ? "" : "s"} en tienda.`]);
    if (r.por_vencer) o.push(["durazno", `${plur(r.por_vencer, "producto")} por vencer.`]);
    return o;
  },
  pct(r) { const base = r.agendadas - r.justificadas; return base > 0 ? Math.round((r.hechas / base) * 100) : null; },
  html(r) {
    const [tono, txt] = CIERRE.estado(r), op = CIERRE.areas(r), pc = CIERRE.pct(r);
    const fecha = new Date(r.fecha + "T12:00:00").toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long" });
    const est = { hecha: ["p-menta", "Visitada"], en_curso: ["p-azul", "En tienda"], justificada: ["p-gris", "Justificada"], pendiente: ["p-rosa", "Sin visitar"] };
    const sec = (t, cuerpo, n = "") => `<section class="fv-sec"><h3>${t}${n !== "" ? ` <span class="muted">· ${n}</span>` : ""}</h3>${cuerpo}</section>`;
    return `<div class="fv-cab"><div class="grow"><div class="muted small">Cierre del día · ${esc(fecha)}</div><h2>${esc(r.vendedor)}</h2></div><button class="btn sm fv-comp" data-compartir disabled>${ic("compartir", 16)}<span>Preparando…</span></button><button class="x-btn" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="item-pie" style="margin:0 0 14px"><span class="pill p-${tono}">${esc(txt)}</span>${pc != null ? `<span class="pill ${colorPct(pc)}">${pc}% de la ruta</span>` : ""}${r.pedidos ? `<span class="pill p-menta">${plur(r.pedidos, "pedido")} · ${fmtKg(r.kg)}</span>` : ""}</div>
      <div class="fv-kpis"><div><b>${r.hechas} de ${r.agendadas}</b><span>Visitas agendadas</span></div><div><b>${r.primera ? fmtHora(r.primera) : "–"}</b><span>Primera entrada</span></div><div><b>${r.ultima ? fmtHora(r.ultima) : "–"}</b><span>Última salida</span></div></div>
      <div class="fv-kpis"><div><b>${r.min_prom != null ? FICHA.dur(r.min_prom) : "–"}</b><span>Promedio por tienda</span></div><div><b>${r.justificadas}</b><span>Justificadas</span></div><div><b>${r.fuera_agenda}</b><span>Fuera de agenda</span></div></div>
      ${op.length ? sec("Áreas de oportunidad", `<div class="fv-op">${op.map(([c, t]) => `<div class="fv-o ${c}">${ic("alerta", 16)}<span>${esc(t)}</span></div>`).join("")}</div>`, op.length) : r.agendadas ? `<div class="fv-o menta" style="margin:16px 0">${ic("ok", 16)}<span>Día completo, sin observaciones.</span></div>` : ""}
      ${sec("Visitas del día", r.visitas.length ? `<p class="tiny muted" style="margin:0 0 6px">Toca una tienda para ver su ficha: fotos, entrada y salida, inventario y pedido.</p><table class="fv-t cd-vis"><tr><th>Tienda</th><th>Entrada · salida</th><th>Tiempo</th></tr>${r.visitas.map((v) => `<tr class="fv-link" data-fv="${v.id}" role="button" tabindex="0"><td>${esc(v.tienda)}<div class="tiny" style="color:var(--azul)">Ver ficha ›</div>${v.agendada ? "" : `<div class="tiny muted">Fuera de agenda</div>`}</td><td>${fmtHora(v.entrada)}<br>${v.salida ? fmtHora(v.salida) : "en tienda"}${v.dentro ? "" : `<div class="tiny" style="color:var(--rosa-t)">Fuera del radio</div>`}</td><td>${v.min != null ? FICHA.dur(v.min) : "En curso"}</td></tr>`).join("")}</table>` : `<p class="muted small">No registró visitas.</p>`, r.visitas.length)}
      ${sec("Tiendas agendadas", r.tiendas.length ? `<table class="fv-t"><tr><th>Tienda</th><th>Estado</th></tr>${r.tiendas.map((t) => { const vz = r.visitas.find((v) => v.tienda === t.nombre); return `<tr ${vz ? `class="fv-link" data-fv="${vz.id}" role="button" tabindex="0"` : ""}><td>${esc(t.nombre)}</td><td><span class="pill ${est[t.estado][0]}">${est[t.estado][1]}</span>${t.estado === "justificada" && t.motivo ? `<div class="tiny muted">${esc(motivoNoVisita(t.motivo))}</div>` : ""}</td></tr>`; }).join("")}</table>` : `<p class="muted small">No tenía tiendas agendadas.</p>`, r.tiendas.length)}`;
  },
  async abrir(vid, fecha) {
    const m = modal(`<div class="muted" style="padding:30px 0;text-align:center">Cargando el cierre…</div>`);
    m.classList.add("fv");
    try {
      const r = await CIERRE.datos(vid, fecha);
      $(".sheet", m).innerHTML = CIERRE.html(r);
      $("[data-cerrar]", m).onclick = () => m.remove();
      const bc = $("[data-compartir]", m);
      CIERRE.imagen(r).then((blob) => {
        if (!bc.isConnected) return;
        const nombre = `Cierre ${r.vendedor} ${r.fecha}.jpg`.replace(/[\\/:*?"<>|]/g, " "), file = new File([blob], nombre, { type: "image/jpeg" });
        const puede = !!(navigator.canShare && navigator.canShare({ files: [file] }));
        bc.disabled = false; $("span", bc).textContent = puede ? "Compartir" : "Descargar";
        bc.onclick = async () => {
          if (puede) { try { await navigator.share({ files: [file], title: "Cierre del día · " + r.vendedor, text: `${r.vendedor} · ${r.hechas} de ${r.agendadas} visitas` }); return; } catch (e) { if (e.name === "AbortError") return; } }
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          toast("Imagen descargada");
        };
      }).catch(() => { if (bc.isConnected) $("span", bc).textContent = "No se pudo"; });
    } catch (e) {
      $(".sheet", m).innerHTML = `<div class="fv-cab"><h2 class="grow">Cierre del día</h2><button class="x-btn" data-cerrar>✕</button></div><p class="muted">${esc(e.message || "No se pudo cargar.")}</p>`;
      $("[data-cerrar]", m).onclick = () => m.remove();
    }
  },
  // La tarjeta como imagen (JPG) para compartirla con la vendedora
  async imagen(r) {
    const W = 1080, M = 56, AN = W - M * 2, TI = "#0B1B33", GR = "#5B6577", AZ = "#2F5BEA", BD = "#E3E8F0", FO = "#F7F9FC";
    try { await Promise.all([document.fonts.load('700 40px "Inter Tight"'), document.fonts.load('400 26px Inter'), document.fonts.load('600 26px Inter')]); } catch (e) {}
    const c = document.createElement("canvas"); c.width = W; c.height = 7000;
    const x = c.getContext("2d"); x.textBaseline = "top"; x.fillStyle = "#FFFFFF"; x.fillRect(0, 0, W, c.height);
    const F = (peso, px, tight) => (x.font = `${peso} ${px}px ${tight ? '"Inter Tight", ' : ""}Inter, sans-serif`);
    const partir = (t, ancho) => { const out = []; let l = ""; String(t).split(/\s+/).forEach((w) => { const p = l ? l + " " + w : w; if (x.measureText(p).width > ancho && l) { out.push(l); l = w; } else l = p; }); if (l) out.push(l); return out; };
    const texto = (t, px, y, o = {}) => { F(o.peso || 400, px, o.tight); x.fillStyle = o.color || TI; const ls = partir(t, o.ancho || AN); ls.forEach((l, i) => x.fillText(l, o.x ?? M, y + i * px * 1.35)); return y + ls.length * px * 1.35; };
    const caja = (X, Y, w, h, rad, color) => { x.fillStyle = color; x.beginPath(); x.roundRect(X, Y, w, h, rad); x.fill(); };
    caja(0, 0, W, 112, 0, FO);
    x.strokeStyle = AZ; x.lineWidth = 7; x.lineCap = "round"; x.beginPath(); x.arc(M + 22, 56, 19, Math.PI * 0.3, Math.PI * 1.7); x.stroke();
    x.fillStyle = TI; x.beginPath(); x.arc(M + 22, 56, 6, 0, 7); x.fill();
    F(700, 36, true); x.fillStyle = TI; x.fillText("clarus", M + 56, 36);
    F(500, 22); x.fillStyle = GR; x.textAlign = "right"; x.fillText("Cierre del día", W - M, 44); x.textAlign = "left";
    let y = 148; const pc = CIERRE.pct(r);
    y = texto(new Date(r.fecha + "T12:00:00").toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }), 26, y, { color: GR });
    y = texto(r.vendedor, 52, y + 4, { peso: 700, tight: true }) + 14;
    y = texto([CIERRE.estado(r)[1], pc != null ? pc + "% de la ruta" : null, r.pedidos ? `${plur(r.pedidos, "pedido")} · ${fmtKg(r.kg)}` : null].filter(Boolean).join("  ·  "), 24, y, { color: GR, peso: 500 }) + 22;
    const fila = (ks) => { const kw = (AN - 32) / 3; ks.forEach(([a, b], i) => { const X = M + i * (kw + 16); caja(X, y, kw, 124, 20, FO); F(700, 34, true); x.fillStyle = TI; x.fillText(String(a), X + 24, y + 24); F(400, 21); x.fillStyle = GR; x.fillText(b, X + 24, y + 76); }); y += 124 + 16; };
    fila([[`${r.hechas} de ${r.agendadas}`, "Visitas agendadas"], [r.primera ? fmtHora(r.primera) : "–", "Primera entrada"], [r.ultima ? fmtHora(r.ultima) : "–", "Última salida"]]);
    fila([[r.min_prom != null ? FICHA.dur(r.min_prom) : "–", "Promedio por tienda"], [r.justificadas, "Justificadas"], [r.fuera_agenda, "Fuera de agenda"]]);
    y += 24;
    const titulo = (t) => { y = texto(t, 30, y, { peso: 700, tight: true }) + 12; };
    const op = CIERRE.areas(r);
    titulo(op.length ? `Áreas de oportunidad · ${op.length}` : "Resultado");
    (op.length ? op : [["menta", r.agendadas ? "Día completo, sin observaciones." : "Sin ruta este día."]]).forEach(([tono, t]) => {
      const col = tono === "rosa" ? ["#FDE7E5", "#B3261E"] : tono === "menta" ? ["#E3F5EC", "#0F7A4F"] : ["#FFF3D6", "#8A5A00"];
      F(500, 25); const ls = partir(t, AN - 48), h = ls.length * 34 + 30;
      caja(M, y, AN, h, 16, col[0]); x.fillStyle = col[1]; ls.forEach((l, i) => x.fillText(l, M + 24, y + 16 + i * 34)); y += h + 10;
    });
    y += 26;
    const tabla = (cab, filas, anchos) => {
      const X = [M + 20]; anchos.slice(0, -1).forEach((a, i) => X.push(X[i] + (AN - 40) * a));
      caja(M, y, AN, 50, 12, FO); F(600, 21); x.fillStyle = GR; cab.forEach((t, i) => x.fillText(t, X[i], y + 14)); y += 58;
      filas.forEach((f) => { f.forEach((t, i) => { F(i === 0 ? 600 : 400, 24); x.fillStyle = TI; let s = String(t); const max = (AN - 40) * anchos[i] - 16; while (x.measureText(s).width > max && s.length > 4) s = s.slice(0, -2); x.fillText(s === String(t) ? s : s + "…", X[i], y + 8); }); y += 46; x.fillStyle = BD; x.fillRect(M, y - 2, AN, 1.5); });
      y += 30;
    };
    const est = { hecha: "Visitada", en_curso: "En tienda", justificada: "Justificada", pendiente: "Sin visitar" };
    if (r.tiendas.length) { titulo(`Tiendas agendadas · ${r.tiendas.length}`); tabla(["Tienda", "Estado"], r.tiendas.map((t) => [t.nombre, est[t.estado] + (t.estado === "justificada" && t.motivo ? ": " + motivoNoVisita(t.motivo) : "")]), [0.56, 0.44]); }
    if (r.visitas.length) { titulo(`Visitas del día · ${r.visitas.length}`); tabla(["Tienda", "Horario", "Tiempo"], r.visitas.map((v) => [v.tienda, `${fmtHora(v.entrada)}–${v.salida ? fmtHora(v.salida) : "…"}`, (v.min != null ? FICHA.dur(v.min) : "En curso") + (v.dentro ? "" : " · fuera del radio")]), [0.36, 0.34, 0.3]); }
    x.fillStyle = BD; x.fillRect(M, y, AN, 1.5); y += 22;
    F(400, 20); x.fillStyle = GR; x.fillText(`Generado con Clarus · ${new Date().toLocaleString("es-PA", { timeZone: "America/Panama", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}`, M, y); y += 60;
    const out = document.createElement("canvas"); out.width = W; out.height = Math.ceil(y); out.getContext("2d").drawImage(c, 0, 0);
    return await new Promise((ok, no) => out.toBlob((b) => (b ? ok(b) : no(new Error("sin imagen"))), "image/jpeg", 0.9));
  },
};
// Cualquier elemento con data-cierre="<id de vendedora>|<fecha>" abre el cierre del día.
document.addEventListener("click", (e) => { const el = e.target.closest("[data-cierre]"); if (el) { e.preventDefault(); const [v, f] = el.dataset.cierre.split("|"); CIERRE.abrir(v, f || null); } });
