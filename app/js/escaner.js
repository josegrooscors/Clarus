// Escáner de documentos: foto → detección de bordes → corrección de perspectiva → blanco y negro → PDF
const Escaner = {
  // Flujo completo; devuelve { blob (PDF), paginas, miniaturas } o null
  async escanear({ titulo = "Escanear orden" } = {}) {
    const paginas = [];
    while (true) {
      const foto = await Camara.abrir({ titulo: `${titulo} · página ${paginas.length + 1}`, alta: true, guia: true });
      if (!foto) { if (!paginas.length) return null; }
      else {
        const pag = await this.recortar(foto.canvas, foto.guia);
        if (pag) paginas.push(pag);
      }
      if (!paginas.length) continue;
      const accion = await this.resumen(paginas);
      if (accion === "mas") continue;
      if (accion === "cancelar") return null;
      break;
    }
    const pdf = this.pdf(paginas);
    return { blob: pdf, paginas: paginas.length, miniaturas: paginas.map((p) => p.toDataURL("image/jpeg", 0.3)) };
  },

  // Pantalla para ajustar las 4 esquinas
  recortar(src, guia) {
    return new Promise((resolve) => {
      let quad = this.detectar(src, guia);
      if (!quad.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))) quad = [[src.width * 0.07, src.height * 0.07], [src.width * 0.93, src.height * 0.07], [src.width * 0.93, src.height * 0.93], [src.width * 0.07, src.height * 0.93]];
      const el = document.createElement("div");
      el.className = "full";
      el.innerHTML = `<div class="head"><button class="txtbtn" data-x>Repetir</button><b>Ajusta el recorte</b><button class="txtbtn" data-ok>Usar</button></div>
        <div class="cropwrap"><canvas></canvas><svg><polygon fill="rgba(47,91,234,.18)" stroke="#8FB0FF" stroke-width="2"/></svg></div>
        <div class="bar" style="justify-content:center"><span class="small" style="opacity:.8">Si el recorte ya calza, toca «Usar». Si no, arrastra una esquina o un lado.</span></div>`;
      document.body.appendChild(el);
      const wrap = $(".cropwrap", el), cv = $("canvas", el), poly = $("polygon", el);
      const disp = Math.min(1, 1400 / Math.max(src.width, src.height));
      cv.width = Math.round(src.width * disp); cv.height = Math.round(src.height * disp);
      cv.getContext("2d").drawImage(src, 0, 0, cv.width, cv.height);
      const hs = quad.map(() => { const h = document.createElement("div"); h.className = "handle"; wrap.appendChild(h); return h; });
      // Asas en la mitad de cada lado: mueven el lado completo (como recortar una captura de pantalla)
      const ls = quad.map(() => { const h = document.createElement("div"); h.className = "handle lado"; wrap.appendChild(h); return h; });
      const geo = () => { const r = cv.getBoundingClientRect(), w = wrap.getBoundingClientRect(); return { ox: r.left - w.left, oy: r.top - w.top, s: r.width / src.width }; };
      const pintar = () => {
        const g = geo();
        hs.forEach((h, i) => { h.style.left = g.ox + quad[i][0] * g.s + "px"; h.style.top = g.oy + quad[i][1] * g.s + "px"; });
        ls.forEach((h, i) => { const a = quad[i], b = quad[(i + 1) % 4]; h.style.left = g.ox + ((a[0] + b[0]) / 2) * g.s + "px"; h.style.top = g.oy + ((a[1] + b[1]) / 2) * g.s + "px"; });
        poly.setAttribute("points", quad.map((p) => `${g.ox + p[0] * g.s},${g.oy + p[1] * g.s}`).join(" "));
      };
      requestAnimationFrame(pintar); window.addEventListener("resize", pintar);
      hs.forEach((h, i) => {
        h.addEventListener("pointerdown", (e) => {
          h.setPointerCapture(e.pointerId);
          const mover = (ev) => {
            const g = geo(), w = wrap.getBoundingClientRect();
            quad[i] = [Math.max(0, Math.min(src.width, (ev.clientX - w.left - g.ox) / g.s)), Math.max(0, Math.min(src.height, (ev.clientY - w.top - g.oy) / g.s))];
            pintar();
          };
          h.addEventListener("pointermove", mover);
          h.addEventListener("pointerup", () => h.removeEventListener("pointermove", mover), { once: true });
        });
      });
      ls.forEach((h, i) => {
        h.addEventListener("pointerdown", (e) => {
          h.setPointerCapture(e.pointerId);
          const ia = i, ib = (i + 1) % 4, a0 = [...quad[ia]], b0 = [...quad[ib]], x0 = e.clientX, y0 = e.clientY;
          // normal del lado: el lado se mueve hacia afuera o adentro, sin girar
          const dx = b0[0] - a0[0], dy = b0[1] - a0[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
          const mover = (ev) => {
            const g = geo(), d = ((ev.clientX - x0) * nx + (ev.clientY - y0) * ny) / g.s;
            const cl = (p) => [Math.max(0, Math.min(src.width, p[0])), Math.max(0, Math.min(src.height, p[1]))];
            quad[ia] = cl([a0[0] + nx * d, a0[1] + ny * d]); quad[ib] = cl([b0[0] + nx * d, b0[1] + ny * d]);
            pintar();
          };
          h.addEventListener("pointermove", mover);
          h.addEventListener("pointerup", () => h.removeEventListener("pointermove", mover), { once: true });
        });
      });
      const fin = (r) => { window.removeEventListener("resize", pintar); el.remove(); resolve(r); };
      $("[data-x]", el).onclick = () => fin(null);
      $("[data-ok]", el).onclick = () => {
        $("[data-ok]", el).textContent = "Procesando…";
        setTimeout(() => fin(this.mejorar(this.enderezar(src, quad))), 30);
      };
    });
  },

  resumen(paginas) {
    return new Promise((resolve) => {
      const el = document.createElement("div");
      el.className = "full";
      el.innerHTML = `<div class="head"><button class="txtbtn" data-c>Cancelar</button><b>${plur(paginas.length, "página")}</b><span style="width:70px"></span></div>
        <div class="cropwrap"><img style="max-width:92%;max-height:100%;background:#fff;border-radius:4px"></div>
        <div class="pages"></div>
        <div class="bar"><button class="btn sec" data-mas>+ Otra página</button><button class="btn" data-fin>Listo</button></div>`;
      document.body.appendChild(el);
      $("img", el).src = paginas[paginas.length - 1].toDataURL("image/jpeg", 0.6);
      const pg = $(".pages", el);
      paginas.forEach((p) => { const i = new Image(); i.src = p.toDataURL("image/jpeg", 0.25); i.onclick = () => ($("img", el).src = p.toDataURL("image/jpeg", 0.6)); pg.appendChild(i); });
      const fin = (r) => { el.remove(); resolve(r); };
      $("[data-c]", el).onclick = () => fin("cancelar");
      $("[data-mas]", el).onclick = () => fin("mas");
      $("[data-fin]", el).onclick = () => fin("listo");
    });
  },

  // Detección automática de la hoja: zona blanca que contiene el centro del marco guía. La máscara se "adelgaza" para separar
  // la hoja de papeles que la tocan. Si el resultado no es creíble (o no calza con el marco), el recorte es el marco guía.
  detectar(src, guia) {
    const W = 360, s = W / src.width, H = Math.round(src.height * s);
    const gq = guia && guia.length === 4 && guia.every(Number.isFinite) && guia[2] - guia[0] > 0.2 && guia[3] - guia[1] > 0.2 ? guia : [0.07, 0.07, 0.93, 0.93];
    const def = [[gq[0] * src.width, gq[1] * src.height], [gq[2] * src.width, gq[1] * src.height], [gq[2] * src.width, gq[3] * src.height], [gq[0] * src.width, gq[3] * src.height]];
    try {
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(src, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data, n = W * H, gray = new Uint8Array(n);
      const mx = (gq[2] - gq[0]) * 0.1, my = (gq[3] - gq[1]) * 0.1;
      const X0 = Math.max(0, ((gq[0] - mx) * W) | 0), X1 = Math.min(W - 1, ((gq[2] + mx) * W) | 0), Y0 = Math.max(0, ((gq[1] - my) * H) | 0), Y1 = Math.min(H - 1, ((gq[3] + my) * H) | 0);
      const areaGuia = (gq[2] - gq[0]) * W * (gq[3] - gq[1]) * H, E = 3;
      const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      // Busca la hoja con una medida de "qué tan hoja es cada píxel" (0–255). Devuelve el cuadrilátero y qué tan rectangular salió la mancha.
      const intento = (gray, minArea) => {
        const hist = new Array(256).fill(0); let tot = 0;
        for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) { hist[gray[y * W + x]]++; tot++; }
        let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
        let sB = 0, wB = 0, best = 0, th = 160;
        for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = tot - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = t; } }
        let m = new Uint8Array(n);
        for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) m[y * W + x] = gray[y * W + x] > th ? 1 : 0;
        // Crecer y encoger la mancha (r píxeles, por filas y luego por columnas). Crecer primero tapa el texto y las líneas impresas,
        // que si no partirían la hoja en tiras; encoger de más después corta los puentes finos con otros papeles.
        const pasada = (a, r, crecer) => {
          const t = new Uint8Array(n), o = new Uint8Array(n);
          for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) { let v = crecer ? 0 : 1; for (let k = -r; k <= r; k++) { const xx = x + k, q = xx < X0 || xx > X1 ? 0 : a[y * W + xx]; if (crecer ? q : !q) { v = crecer ? 1 : 0; break; } } t[y * W + x] = v; }
          for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) { let v = crecer ? 0 : 1; for (let k = -r; k <= r; k++) { const yy = y + k, q = yy < Y0 || yy > Y1 ? 0 : t[yy * W + x]; if (crecer ? q : !q) { v = crecer ? 1 : 0; break; } } o[y * W + x] = v; }
          return o;
        };
        m = pasada(pasada(m, 5, true), 5 + E, false);
        // semilla: el píxel de hoja más cercano al centro del marco
        const cx = (((gq[0] + gq[2]) / 2) * W) | 0, cy = (((gq[1] + gq[3]) / 2) * H) | 0;
        let seed = -1;
        for (let r = 0; r < Math.max(W, H) / 3 && seed < 0; r += 2) for (let a = 0; a < 16 && seed < 0; a++) {
          const x = Math.round(cx + r * Math.cos((a * Math.PI) / 8)), y = Math.round(cy + r * Math.sin((a * Math.PI) / 8));
          if (x >= 0 && y >= 0 && x < W && y < H && m[y * W + x]) seed = y * W + x;
        }
        if (seed < 0) return null;
        const lab = new Uint8Array(n), pila = new Int32Array(n); let sp = 0, tam = 0; pila[sp++] = seed; lab[seed] = 1;
        let tl = [0, 0, 1e9], tr = [0, 0, -1e9], br = [0, 0, -1e9], bl = [0, 0, 1e9];
        while (sp) {
          const p = pila[--sp]; tam++; const x = p % W, y = (p / W) | 0, sm = x + y, df = x - y;
          if (sm < tl[2]) tl = [x, y, sm]; if (sm > br[2]) br = [x, y, sm]; if (df > tr[2]) tr = [x, y, df]; if (df < bl[2]) bl = [x, y, df];
          for (const q of [p - 1, p + 1, p - W, p + W]) if (q >= 0 && q < n && !lab[q] && m[q] && Math.abs((q % W) - x) <= 1) { lab[q] = 1; pila[sp++] = q; }
        }
        if (tam < areaGuia * minArea || tam > areaGuia * 1.9) return null; // demasiado chico o se pegó al fondo
        let pts = [tl, tr, br, bl].map((p) => [p[0], p[1]]);
        const ccx = pts.reduce((t, p) => t + p[0], 0) / 4, ccy = pts.reduce((t, p) => t + p[1], 0) / 4;
        const aQ = Math.abs(pts.reduce((t, p, k) => { const q = pts[(k + 1) % 4]; return t + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2 || 1;
        // compensar la erosión: abrir las esquinas desde el centro
        pts = pts.map(([x, y]) => { const L = Math.hypot(x - ccx, y - ccy) || 1; return [x + ((x - ccx) / L) * (E + 1), y + ((y - ccy) / L) * (E + 1)]; });
        const quad = pts.map(([x, y]) => [Math.max(0, Math.min(src.width, x / s)), Math.max(0, Math.min(src.height, y / s))]);
        // que sea un cuadrilátero creíble (lados no degenerados)
        const lados = [0, 1, 2, 3].map((i) => len(quad[i], quad[(i + 1) % 4]));
        if (Math.min(...lados) < Math.max(...lados) * 0.35) return null;
        // si dos o más esquinas tocan el borde de la foto, la mancha no es la hoja: se regó por la mesa
        const mxB = src.width * 0.03, myB = src.height * 0.03;
        if (quad.filter(([x, y]) => x < mxB || y < myB || x > src.width - mxB || y > src.height - myB).length >= 2) return null;
        return { quad, rect: Math.min(1, tam / aQ), tam };
      };
      // Medida 1, "blancura": el canal más bajo (el papel blanco es alto en los 3).
      for (let i = 0; i < n; i++) gray[i] = Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
      // Medida 2, "distinto del fondo": qué tanto se aleja cada píxel del color de la mesa (sirve para papel de color: amarillo, rosado, kraft…).
      // El color del fondo se toma del contorno de la zona de búsqueda, donde casi nunca hay hoja.
      const anillo = [[], [], []], bw = Math.max(2, ((X1 - X0) * 0.05) | 0), bh = Math.max(2, ((Y1 - Y0) * 0.05) | 0);
      for (let y = Y0; y <= Y1; y += 2) for (let x = X0; x <= X1; x += 2) if (x < X0 + bw || x > X1 - bw || y < Y0 + bh || y > Y1 - bh) { const i = (y * W + x) * 4; anillo[0].push(d[i]); anillo[1].push(d[i + 1]); anillo[2].push(d[i + 2]); }
      const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1] || 0; }, fondo = anillo.map(med);
      const dist = new Uint8Array(n);
      for (let i = 0; i < n; i++) dist[i] = Math.min(255, (Math.abs(d[i * 4] - fondo[0]) + Math.abs(d[i * 4 + 1] - fondo[1]) + Math.abs(d[i * 4 + 2] - fondo[2])) * 0.9);
      // Medida 3, "color vivo": diferencia entre el canal más alto y el más bajo (un papel de color resalta sobre una mesa gris, blanca o de madera).
      const sat = new Uint8Array(n);
      for (let i = 0; i < n; i++) { const r = d[i * 4], g2 = d[i * 4 + 1], b2 = d[i * 4 + 2]; sat[i] = Math.min(255, (Math.max(r, g2, b2) - Math.min(r, g2, b2)) * 1.6); }
      const a1 = intento(gray, 0.08), a2 = intento(dist, 0.05), a3 = intento(sat, 0.05);
      // Se queda con la mancha más rectangular. Una hoja bien separada del fondo llena su cuadrilátero casi por completo.
      const mejor = [a1, a3, a2].filter(Boolean).sort((p, q) => q.rect - p.rect)[0];
      if (!mejor) return def;
      if (mejor.rect >= 0.82) return mejor.quad; // detección confiable: se recorta por la hoja aunque no llene el marco guía
      const quad = mejor.quad;
      // confianza media: con marco guía, cada esquina detectada debe quedar cerca de la esquina del marco (la persona encuadró la hoja ahí)
      if (guia) {
        // esquina por esquina: si la detectada se aleja más de 8% del marco, se usa la esquina del marco
        const tolX = (gq[2] - gq[0]) * src.width * 0.08, tolY = (gq[3] - gq[1]) * src.height * 0.08;
        return quad.map((p, i) => (Math.abs(p[0] - def[i][0]) > tolX || Math.abs(p[1] - def[i][1]) > tolY ? def[i] : p));
      }
      return quad;
    } catch (e) { return def; }
  },

  // Corrección de perspectiva (homografía) a tamaño carta/A4
  enderezar(src, q) {
    const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const wq = (len(q[0], q[1]) + len(q[3], q[2])) / 2, hq = (len(q[0], q[3]) + len(q[1], q[2])) / 2;
    const vertical = hq >= wq;
    const W = vertical ? 1240 : 1754, H = vertical ? 1754 : 1240; // 150 ppp
    const dst = [[0, 0], [W, 0], [W, H], [0, H]];
    const Hm = this.homografia(dst, q);
    const sc = src.getContext("2d", { willReadFrequently: true });
    const sd = sc.getImageData(0, 0, src.width, src.height).data, sw = src.width, sh = src.height;
    const out = document.createElement("canvas"); out.width = W; out.height = H;
    const oc = out.getContext("2d"), od = oc.createImageData(W, H), o = od.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const z = Hm[6] * x + Hm[7] * y + 1;
      const sx = (Hm[0] * x + Hm[1] * y + Hm[2]) / z, sy = (Hm[3] * x + Hm[4] * y + Hm[5]) / z;
      const x0 = Math.max(0, Math.min(sw - 2, sx | 0)), y0 = Math.max(0, Math.min(sh - 2, sy | 0));
      const fx = Math.min(1, Math.max(0, sx - x0)), fy = Math.min(1, Math.max(0, sy - y0));
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4, oi = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) o[oi + k] = (sd[i00 + k] * (1 - fx) + sd[i10 + k] * fx) * (1 - fy) + (sd[i01 + k] * (1 - fx) + sd[i11 + k] * fx) * fy;
      o[oi + 3] = 255;
    }
    oc.putImageData(od, 0, 0);
    return out;
  },

  homografia(a, b) { // matriz que lleva puntos a -> b
    const A = [], B = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = a[i], [u, v] = b[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
    }
    for (let c = 0; c < 8; c++) { // Gauss
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [B[c], B[p]] = [B[p], B[c]];
      for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; B[r] -= f * B[c]; }
    }
    return B.map((v, i) => v / A[i][i]);
  },

  // Efecto "documento": fondo blanco, texto negro nítido
  mejorar(c) {
    const W = c.width, H = c.height, g = c.getContext("2d", { willReadFrequently: true });
    const bg = document.createElement("canvas"); bg.width = Math.max(1, W >> 4); bg.height = Math.max(1, H >> 4);
    const bgc = bg.getContext("2d"); bgc.imageSmoothingQuality = "high"; bgc.drawImage(c, 0, 0, bg.width, bg.height);
    const big = document.createElement("canvas"); big.width = W; big.height = H;
    const bigc = big.getContext("2d", { willReadFrequently: true }); bigc.imageSmoothingQuality = "high"; bigc.filter = "blur(6px)"; bigc.drawImage(bg, 0, 0, W, H);
    const img = g.getImageData(0, 0, W, H), d = img.data, b = bigc.getImageData(0, 0, W, H).data;
    const rel = new Float32Array(W * H), hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114, f = b[i] * 0.299 + b[i + 1] * 0.587 + b[i + 2] * 0.114 || 1;
      rel[i >> 2] = Math.min(255, (v / f) * 255); hist[rel[i >> 2] | 0]++;
    }
    // Contraste según lo que haya escrito: tinta de impresora llega casi a negro; un lápiz o un sello tenue apenas oscurece el papel.
    // "lo" es el tono del trazo más oscuro que de verdad existe (el 0.4 % más oscuro de la hoja); desde ahí se estira hasta blanco.
    let acc = 0, lo = 0; const corte = (W * H) * 0.004;
    for (let t = 0; t < 256; t++) { acc += hist[t]; if (acc >= corte) { lo = t; break; } }
    const hi = 232; lo = Math.max(30, Math.min(lo, hi - 45));
    for (let i = 0; i < d.length; i += 4) {
      const t = Math.max(0, Math.min(1, (rel[i >> 2] - lo) / (hi - lo)));
      d[i] = d[i + 1] = d[i + 2] = 255 * Math.pow(t, 1.35);
    }
    g.putImageData(img, 0, 0);

    return c;
  },

  pdf(paginas) {
    const { jsPDF } = window.jspdf;
    let doc = null;
    paginas.forEach((p, i) => {
      const vertical = p.height >= p.width, f = vertical ? "p" : "l";
      if (!doc) doc = new jsPDF({ orientation: f, unit: "mm", format: "letter", compress: true });
      else doc.addPage("letter", f);
      const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
      const s = Math.min(pw / p.width, ph / p.height), w = p.width * s, h = p.height * s;
      doc.addImage(p.toDataURL("image/jpeg", 0.7), "JPEG", (pw - w) / 2, (ph - h) / 2, w, h, undefined, "FAST");
    });
    return doc.output("blob");
  },
};
