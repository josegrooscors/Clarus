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
const iniciales = (s) => String(s || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
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

function confirmar(texto, okTxt = "Confirmar") {
  return new Promise((res) => {
    modal(`<h2 style="margin-bottom:8px">¿Seguro?</h2><p class="muted">${esc(texto)}</p>
      <div class="row" style="margin-top:16px"><button class="btn sec sp" data-no>Cancelar</button><button class="btn sp" data-si>${esc(okTxt)}</button></div>`,
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
const ICONOS = {
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
const fmtUsd = (n) => "$" + Number(n || 0).toLocaleString("es-PA", { maximumFractionDigits: 0 });
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
const colorPct = (p) => (p == null ? "p-gris" : p >= 100 ? "p-menta" : p >= 60 ? "p-azul" : p >= 30 ? "p-durazno" : "p-rosa");
const barra = (p) => `<div style="height:6px;border-radius:3px;background:#EEF1F5;overflow:hidden;margin-top:6px"><div style="height:100%;width:${Math.min(100, p || 0)}%;background:${(p || 0) >= 100 ? "#3FA373" : "var(--azul)"}"></div></div>`;
// Cajas a partir de kg (para mostrar objetivos)
const cajas = (kg, p) => (p?.kg_por_pedido ? kg / Number(p.kg_por_pedido) : kg);
