// Utilidades generales
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const fmtNum = (n, d = 1) => (n == null || isNaN(n) ? "–" : Number(n).toLocaleString("es-PA", { maximumFractionDigits: d }));
const fmtHora = (t) => (t ? new Date(t).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" }) : "–");
const fmtFecha = (t) => (t ? new Date(t).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short" }) : "–");
const fmtFechaHora = (t) => (t ? fmtFecha(t) + " · " + fmtHora(t) : "–");
const minutos = (a, b) => (a && b ? Math.round((new Date(b) - new Date(a)) / 60000) : null);
// Singular o plural según la cantidad: plur(1, "tienda") → "1 tienda", plur(4, "tienda") → "4 tiendas".
const plur = (n, palabra) => `${n} ${palabra}${Number(n) === 1 ? "" : "s"}`;
const iniciales = (s) => String(s || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
// Vencimientos: días que faltan (negativo = ya venció) y texto legible
const diasPara = (iso) => Math.round((new Date(iso + "T12:00:00") - new Date(hoyISO() + "T12:00:00")) / 864e5);
const fmtDia = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("es-PA", { day: "numeric", month: "long", year: "numeric" });
const faltan = (iso) => { const d = diasPara(iso); return d < 0 ? `venció hace ${plur(-d, "día")}` : d === 0 ? "vence hoy" : `faltan ${plur(d, "día")}`; };
const hoyISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
const diaSemana = () => { const d = new Date().getDay(); return d === 0 ? 7 : d; }; // 1=lunes

function toast(msg, ms = 2600) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}

function modal(html, onMount) {
  const m = document.createElement("div");
  m.className = "modal"; m.innerHTML = `<div class="sheet">${html}</div>`;
  m.addEventListener("click", (e) => { if (e.target === m) m.remove(); });
  document.body.appendChild(m);
  onMount && onMount(m, () => m.remove());
  return m;
}

function confirmar(texto, okTxt = "Confirmar", noTxt = "Cancelar", titulo = "¿Seguro?") {
  return new Promise((res) => {
    modal(`<h2 style="margin-bottom:8px">${esc(titulo)}</h2><p class="muted">${esc(texto)}</p>
      <div class="row" style="margin-top:16px"><button class="btn sec sp" data-no>${esc(noTxt)}</button><button class="btn sp" data-si>${esc(okTxt)}</button></div>`,
      (m, close) => {
        $("[data-no]", m).onclick = () => { close(); res(false); };
        $("[data-si]", m).onclick = () => { close(); res(true); };
      });
  });
}

// Ubicación con alta precisión
function ubicacion(timeout = 20000) {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("Este teléfono no permite ubicación"));
    let best = null, done = false;
    const fin = () => { if (done) return; done = true; navigator.geolocation.clearWatch(w); best ? res(best) : rej(new Error("No se pudo obtener la ubicación. Activa el GPS.")); };
    const w = navigator.geolocation.watchPosition(
      (p) => {
        const c = { lat: p.coords.latitude, lng: p.coords.longitude, precision: Math.round(p.coords.accuracy) };
        if (!best || c.precision < best.precision) best = c;
        if (best.precision <= 25) fin();
      },
      (e) => { if (e.code === 1) { done = true; navigator.geolocation.clearWatch(w); rej(new Error("Permite el acceso a la ubicación para continuar")); } },
      { enableHighAccuracy: true, maximumAge: 0, timeout }
    );
    setTimeout(fin, 9000); // como máximo 9 s esperando mejor precisión
  });
}

function distanciaM(a, b) {
  const R = 6371000, r = (x) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const ESTADOS_PEDIDO = {
  propuesto: ["Enviado", "p-azul"],
  aprobado: ["Aprobado", "p-azul"],
  rechazado: ["Rechazado", "p-rosa"],
  orden_escaneada: ["Orden escaneada", "p-lila"],
  impreso: ["Impreso", "p-menta"],
  anulado: ["Anulado", "p-gris"],
};
const pillPedido = (e) => { const [t, c] = ESTADOS_PEDIDO[e] || [e, "p-gris"]; return `<span class="pill ${c}">${t}</span>`; };

// Íconos de línea (estilo minimalista)
const MODALIDADES = [["pedido_tienda", "Pedido en tienda (lo levanta la vendedora)"], ["pedido_cliente", "El cliente envía su pedido (solo visita y servicio)"], ["resurtido_auto", "Resurtido automático (sin vendedora)"]];
const ICONOS = {
  planograma: '<rect x="3.5" y="3" width="17" height="18" rx="2"/><path d="M3.5 9h17M3.5 15h17M9 3v18M15 3v18"/>',
  caja: '<path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9"/>',
  factura: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  megafono: '<path d="M3 10.5v3a1.5 1.5 0 0 0 1.5 1.5H7l6 4V5L7 9H4.5A1.5 1.5 0 0 0 3 10.5z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  chev: '<path d="M15 6l-6 6 6 6"/>',
  soporte: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.6"/><path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  compartir: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.6M8.2 13.2l7.6 4.6"/>',
  msg: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z"/><path d="M8 8.5h8M8 11.5h5"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.6"/>',
  tablero: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-6"/><circle cx="12" cy="17" r="1.2"/>',
  resumen: '<rect x="3" y="3" width="7.5" height="9" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="5" rx="1.5"/><rect x="13.5" y="11" width="7.5" height="10" rx="1.5"/><rect x="3" y="15" width="7.5" height="6" rx="1.5"/>',
  ruta: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  equipo: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.5 3.5 5.2"/>',
  pedidos: '<rect x="5" y="3.5" width="14" height="17.5" rx="2.5"/><path d="M9 3.5V2.5h6v1M9 9h6M9 13h6M9 17h3"/>',
  recibo: '<path d="M6 2.5h12v19l-3-2-3 2-3-2-3 2z"/><path d="M9 7.5h6M9 11.5h6M9 15.5h4"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  yo: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6"/>',
  camara: '<path d="M4 7.5h3l2-2.5h6l2 2.5h3a1.5 1.5 0 0 1 1.5 1.5v9.5A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 4 7.5z"/><circle cx="12" cy="13.5" r="3.8"/>',
  doc: '<path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5z"/><path d="M14 2.5v5h5M8.5 13h7M8.5 17h5"/>',
  caja: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
  etiqueta: '<path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  luna: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  senal: '<path d="M2 8.5a15 15 0 0 1 20 0M5 12a10.5 10.5 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/>',
  alerta: '<path d="M12 3 2 20h20z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
};
const ic = (n, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[n] || ""}</svg>`;
const sinAcentos = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const plural = (n, u) => (Number(n) === 1 ? u : /[aeiou]$/i.test(u) ? u + "s" : u + "es");
const fmtDist = (m) => (m == null ? "–" : m < 1000 ? Math.round(m) + " m" : (m / 1000).toLocaleString("es-PA", { maximumFractionDigits: 1 }) + " km");

// Kilos de una línea de pedido: cantidad × unidades por caja × kg por unidad
const kgLinea = (q, p) => (Number(q) || 0) * (p?.kg_por_pedido != null ? Number(p.kg_por_pedido) : (Number(p?.unidades_por_pedido) || 1) * (Number(p?.peso_kg_unidad) || 0));
const fmtKg = (k) => fmtNum(k, 2) + " kg";

const mesActual = () => hoyISO().slice(0, 7) + "-01";
// Montos en dólares solo para quien tiene el permiso «Ver montos en dólares» (gerencia siempre). El resto ve kilos.
const conDinero = () => DB.puede("ver_dinero");
const fmtKilos = (n) => fmtNum(n, 0) + " kg";
const fmtUsd = (n) => "$" + Number(n || 0).toLocaleString("es-PA", { maximumFractionDigits: 0 });
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
const colorPct = (p) => (p == null ? "p-gris" : p >= 100 ? "p-menta" : p >= 60 ? "p-azul" : p >= 30 ? "p-durazno" : "p-rosa");
const barra = (p) => `<div class="barra"><i class="${(p || 0) >= 100 ? "ok" : ""}" style="width:${Math.min(100, p || 0)}%"></i></div>`;
// Logo de Clarus: un lente abierto con el punto de enfoque
// Clarus Vision: la lente del logo con un destello (la tecnología de visión artificial de Clarus).
const visionIc = (s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 32 32" aria-hidden="true"><circle cx="14.5" cy="17.5" r="10" fill="none" stroke="#2F5BEA" stroke-width="3.4" stroke-dasharray="52 11" stroke-linecap="round" transform="rotate(35 14.5 17.5)"/><circle cx="17" cy="15" r="2.9" fill="#0B1B33"/><path d="M26 1.5c.5 3.4 1.6 4.5 5 5-3.4.5-4.5 1.6-5 5-.5-3.4-1.6-4.5-5-5 3.4-.5 4.5-1.6 5-5z" fill="#2F5BEA"/></svg>`;
const visionSello = (txt = "Visión artificial para el punto de venta") => `<span class="cv-sello">${visionIc(20)}<b>Clarus Vision</b>${txt ? `<i>${txt}</i>` : ""}</span>`;
const logo = (s = 30) => `<svg width="${s}" height="${s}" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="none" stroke="#2F5BEA" stroke-width="3.5" stroke-dasharray="62 14" stroke-linecap="round" transform="rotate(35 16 16)"/><circle cx="19" cy="13" r="3.2" fill="#0B1B33"/></svg>`;
// Cajas a partir de kg (para mostrar objetivos)
const cajas = (kg, p) => (p?.kg_por_pedido ? kg / Number(p.kg_por_pedido) : kg);

const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const DIAS_C = ["", "L", "M", "X", "J", "V", "S", "D"];
// Próximos n días (desde hoy) en hora de Panamá: [{iso, dia (1=lunes), etiqueta}]
function proximosDias(n = 7) {
  const base = new Date(hoyISO() + "T12:00:00");
  return [...Array(n)].map((_, i) => {
    const d = new Date(base.getTime() + i * 864e5), iso = d.toISOString().slice(0, 10), w = d.getDay() || 7;
    const et = i === 0 ? "Hoy" : i === 1 ? "Mañana" : d.toLocaleDateString("es-PA", { weekday: "short", day: "numeric" });
    return { iso, dia: w, etiqueta: et };
  });
}

// Franjas de pasos/pestañas (.steps): la pestaña activa se centra sola cuando aparece o cambia
// (ej.: al pasar de Promociones a Pedido en la visita). Si la persona desliza con el dedo, se respeta hasta el próximo cambio.
const centrarPasos = () => $$(".steps").forEach((s) => {
  const on = $(".step.on", s); if (!on) return;
  const clave = on.textContent; if (s.dataset.centrado === clave) return;
  s.dataset.centrado = clave;
  if (s.scrollWidth <= s.clientWidth) return;
  const d = on.getBoundingClientRect().left - s.getBoundingClientRect().left - (s.clientWidth - on.offsetWidth) / 2;
  s.scrollTo({ left: s.scrollLeft + d, behavior: "smooth" });
});
let _cpPend = false;
new MutationObserver(() => { if (_cpPend) return; _cpPend = true; requestAnimationFrame(() => { _cpPend = false; centrarPasos(); }); })
  .observe(document.documentElement, { childList: true, subtree: true });

// ── Reportes en celular: cuadro de 5 filas que se desliza con el dedo ──────────────────────────────────────────
// Regla (18-nov-2026): en celular, todo reporte con más de 5 filas se muestra en un cuadro de 5; el resto se ve deslizando dentro del cuadro.
// Se marca el contenedor con la clase "lim5" (una lista, o el .scroll-x que envuelve una tabla). En computadora no cambia nada.
const esCel = () => matchMedia("(max-width:759px)").matches;
const LIM5 = {
  N: 5,
  aplicar() {
    if (!esCel()) return;
    $$(".lim5:not([data-lim5])").forEach((box) => {
      if (!box.offsetParent) return; // aún no se ve (pestaña oculta): se intenta en el próximo cambio
      const tabla = box.querySelector(":scope>table");
      const filas = tabla ? [...tabla.querySelectorAll("tr")].filter((tr) => tr.querySelector("td")) : [...box.children];
      box.dataset.lim5 = "1";
      if (filas.length <= LIM5.N) return;
      const y = (el) => el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
      // alto = hasta el inicio de la 6.ª fila + un 45 % de ella, para que se vea cortada y se note que hay más
      const alto = Math.round(y(filas[LIM5.N]) + filas[LIM5.N].getBoundingClientRect().height * 0.45);
      box.style.maxHeight = alto + "px";
      box.classList.add("lim5-on");
      const pie = document.createElement("div");
      pie.className = "lim5-n";
      const pinta = () => {
        const fin = box.scrollTop + box.clientHeight >= box.scrollHeight - 4;
        box.classList.toggle("lim5-fin", fin);
        const tope = box.getBoundingClientRect().bottom, vistas = filas.filter((f) => f.getBoundingClientRect().bottom <= tope + 6).length;
        pie.innerHTML = `<b>${Math.min(vistas, filas.length)} de ${filas.length}</b>${fin ? "" : " · desliza dentro del cuadro para ver más"}`;
      };
      box.after(pie); box.addEventListener("scroll", pinta, { passive: true }); pinta();
    });
  },
};
let _l5Pend = false;
new MutationObserver(() => { if (_l5Pend) return; _l5Pend = true; requestAnimationFrame(() => { _l5Pend = false; LIM5.aplicar(); }); })
  .observe(document.documentElement, { childList: true, subtree: true });

// Siglas de la industria: el nombre en español es la etiqueta principal; debajo va la sigla, pequeña y gris, siempre igual.
// Al tocarla (o pasar el mouse) dice qué es y cómo se calcula en Clarus. Solo siglas estándar; lo que no tiene sigla va solo en español.
const SIGLAS = {
  COV: ["Coverage", "Coverage · cobertura: tiendas del plan visitadas ÷ tiendas del plan del período."],
  RC: ["Route Compliance", "Route Compliance · cumplimiento de ruta: visitas programadas hechas ÷ visitas programadas (sin las justificadas)."],
  OOS: ["OOS", "OOS · Out of Stock: producto en cero en el último conteo de la tienda."],
  SOS: ["SOS", "SOS · Share of Shelf: frentes nuestros ÷ frentes de la categoría."],
  SHR: ["Shrink", "Shrink · merma: notas de crédito por merma ÷ venta facturada."],
  PEI: ["PEI", "PEI · Perfect Execution Index: promedio de asistencia, ruta cumplida, reporte con fotos e inventario."],
  PEIT: ["PEI", "PEI · Perfect Execution Index de la tienda (0 a 100): promedio de su cobertura, inventario, merma y avance del objetivo."],
  STR: ["Strike rate", "Strike rate · efectividad: visitas con pedido ÷ visitas a tiendas que piden en tienda."],
  FEFO: ["FEFO", "FEFO · First Expired, First Out: lo que vence primero sale primero. Aquí: la fecha más próxima a vencer por tienda."],
  RR: ["Run rate", "Run rate · avance del objetivo contra el ritmo esperado a la fecha (día del mes ÷ días del mes)."],
  MSL: ["MSL", "MSL · Must Stock List: productos que la tienda debe tener (surtido asignado)."],
  POG: ["POG", "POG · Planograma: cómo debe ir acomodado el producto en el mueble."],
};
const sig = (k) => (SIGLAS[k] ? `<span role="button" tabindex="0" class="sig" data-sig="${k}" title="${SIGLAS[k][1]}" aria-label="${SIGLAS[k][1]}">${SIGLAS[k][0]}</span>` : "");
const sigCerrar = () => document.querySelectorAll(".sig-pop").forEach((x) => x.remove());
const sigAbrir = (b) => {
  const ya = b._pop && b._pop.isConnected; sigCerrar(); if (ya) return;
  const p = document.createElement("div"); p.className = "sig-pop"; p.setAttribute("role", "tooltip"); p.textContent = SIGLAS[b.dataset.sig]?.[1] || "";
  document.body.appendChild(p); b._pop = p;
  const r = b.getBoundingClientRect(), w = Math.min(300, innerWidth - 24); p.style.width = w + "px";
  const x = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)), abajo = r.bottom + 8 + p.offsetHeight < innerHeight - 8;
  p.style.left = x + "px"; p.style.top = (abajo ? r.bottom + 8 : r.top - 8 - p.offsetHeight) + scrollY + "px";
};
document.addEventListener("click", (e) => { const b = e.target.closest?.("[data-sig]"); if (b) { e.preventDefault(); e.stopPropagation(); sigAbrir(b); } else sigCerrar(); }, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") sigCerrar(); else if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("[data-sig]")) { e.preventDefault(); e.stopPropagation(); sigAbrir(e.target); } }, true);
window.addEventListener("hashchange", sigCerrar);
if (window.matchMedia && matchMedia("(hover:hover) and (pointer:fine)").matches) {
  document.addEventListener("mouseover", (e) => { const b = e.target.closest?.("[data-sig]"); if (b && !(b._pop && b._pop.isConnected)) sigAbrir(b); });
  document.addEventListener("mouseout", (e) => { if (e.target.closest?.("[data-sig]")) sigCerrar(); });
}
