/* IVUS Simulator — vessel model, geometry and measurement
 * All lengths in mm, angles in radians unless noted.
 * z = position along the pullback, 0 = distal start, IV.L = proximal end.
 */
(function () {
  'use strict';
  const IV = (window.IV = window.IV || {});
  const PI = Math.PI, TAU = 2 * PI, D2R = PI / 180;
  IV.PI = PI; IV.TAU = TAU; IV.D2R = D2R;
  IV.L = 60;
  IV.DZ = 0.2;
  IV.NS = Math.round(IV.L / IV.DZ) + 1;
  IV.CATH_R = 0.45; // imaging catheter radius on screen (mm)

  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const win = (z, z0, z1, e) => sstep(z0 - e, z0 + e, z) * (1 - sstep(z1 - e, z1 + e, z));
  const bell = (z, c, s) => Math.exp(-0.5 * ((z - c) / s) ** 2);
  const adiff = (a, b) => { let d = (a - b) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; };
  const lerp = (a, b, t) => a + (b - a) * t;
  IV.util = { clamp, sstep, win, bell, adiff, lerp };

  IV.rng = function (seed) {
    let s = seed | 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ---------- slice construction ---------- */
  // profile(z) returns degrees for angles; converted here
  IV.makeSlice = function (p, z) {
    const eemR = p.eemD / 2;
    const lumR = eemR * Math.sqrt(1 - clamp(p.pb, 0.05, 0.93));
    const sl = {
      z,
      eemR, lumR,
      ecc: p.ecc || 0,
      eccDir: (p.eccDir || 0) * D2R,
      cath: { d: p.cath ? p.cath.d : 0.25, a: (p.cath ? p.cath.a : 0) * D2R },
      calc: (p.calc || []).filter(c => c.w > 2).map(c => ({ c: c.c * D2R, w: Math.min(360, c.w) * D2R, depth: c.depth, th: c.th, fr: [] })),
      nod: p.nod && p.nod.h > 0.02 ? { c: p.nod.c * D2R, w: p.nod.w * D2R, h: p.nod.h } : null,
      att: p.att && p.att.w > 2 ? { c: p.att.c * D2R, w: p.att.w * D2R, depth: p.att.depth } : null,
      sb: p.sb && p.sb.w > 2 ? { c: p.sb.c * D2R, w: p.sb.w * D2R, len: p.sb.len, name: p.sb.name || '側枝' } : null,
      diss: (p.diss || []).filter(d => d.w > 2).map(d => ({ c: d.c * D2R, w: d.w * D2R, depth: d.depth, type: d.type || 'intima' })),
      thr: p.thr && p.thr.h > 0.02 ? { c: p.thr.c * D2R, w: p.thr.w * D2R, h: p.thr.h } : null,
      perf: null,
      stents: [],
      zone: p.zone || '',
      irr: p.irr != null ? p.irr : 0.03,
      fib: p.fib != null ? p.fib : 0.55,
      ph1: z * 0.21 + 0.3, ph2: z * 0.13 + 1.7, ph3: z * 0.31 + 4.1,
      gwA: ((p.gwA != null ? p.gwA : 300) + z * 1.2) * D2R,
      ablated: 0,
      dcb: false,
      injury: 0
    };
    return sl;
  };

  IV.cloneSlice = function (s) {
    return {
      ...s,
      cath: { ...s.cath },
      calc: s.calc.map(c => ({ ...c, fr: c.fr.map(f => ({ ...f })) })),
      nod: s.nod ? { ...s.nod } : null,
      att: s.att ? { ...s.att } : null,
      sb: s.sb ? { ...s.sb } : null,
      diss: s.diss.map(d => ({ ...d })),
      thr: s.thr ? { ...s.thr } : null,
      perf: s.perf ? { ...s.perf } : null,
      stents: s.stents.map(t => ({ ...t }))
    };
  };
  IV.cloneSlices = arr => arr.map(IV.cloneSlice);

  IV.buildSlices = function (scn) {
    const out = [];
    for (let i = 0; i < IV.NS; i++) {
      const z = i * IV.DZ;
      out.push(IV.makeSlice(scn.profile(z), z));
    }
    if (scn.postBuild) scn.postBuild(out);
    return out;
  };

  /* ---------- geometry ---------- */
  IV.geom = function (sl, s) {
    s = s || 1;
    const Re = sl.eemR * s, Rl = sl.lumR * s;
    const cd = Math.min(sl.cath.d, Math.max(0, Rl - IV.CATH_R - 0.06));
    const Lc = { x: -cd * Math.cos(sl.cath.a), y: -cd * Math.sin(sl.cath.a) };
    const sh = sl.ecc * Math.max(0, Re - Rl - 0.12);
    const E = { x: Lc.x - sh * Math.cos(sl.eccDir), y: Lc.y - sh * Math.sin(sl.eccDir) };
    return { Re, Rl, Lc, E, s };
  };

  function rayCircle(cx, cy, R, ux, uy) {
    const b = cx * ux + cy * uy;
    const c = cx * cx + cy * cy - R * R;
    const d = b * b - c;
    if (d <= 0) return 0.05;
    return Math.max(0.05, b + Math.sqrt(d));
  }
  IV.rayCircle = rayCircle;

  // Fill P with beam parameters for beam angle th (catheter frame)
  IV.beam = function (sl, g, th, P) {
    const ux = Math.cos(th), uy = Math.sin(th);
    const rW0 = rayCircle(g.Lc.x, g.Lc.y, g.Rl, ux, uy);
    const px = ux * rW0 - g.Lc.x, py = uy * rW0 - g.Lc.y;
    const ac = Math.atan2(py, px);
    P.ac = ac;
    P.fib = sl.fib;
    let rW = rW0 * (1 + sl.irr * (0.5 * Math.sin(3 * ac + sl.ph1) + 0.3 * Math.sin(5 * ac + sl.ph2) + 0.2 * Math.sin(7 * ac + sl.ph3)));
    // nodule
    P.nod = 0;
    if (sl.nod) {
      const d = adiff(ac, sl.nod.c);
      const hw = sl.nod.w / 2;
      if (Math.abs(d) < hw) {
        const f = Math.cos((PI / 2) * (d / hw)) ** 2;
        const bump = sl.nod.h * g.s * f * (1 + 0.18 * Math.sin(19 * ac + sl.ph2));
        rW = Math.max(IV.CATH_R + 0.08, rW - bump);
        P.nod = f;
      }
    }
    // calcium (strongest arc)
    P.ca = 0; P.caTh = 0; P.caF = 0; P.caRev = 0; P.crack = 0;
    for (let k = 0; k < sl.calc.length; k++) {
      const c = sl.calc[k];
      let f;
      if (c.w >= TAU - 1e-3) f = 1;
      else {
        const d = Math.abs(adiff(ac, c.c));
        const hw = c.w / 2;
        f = 1 - sstep(hw - 5 * D2R, hw + 1 * D2R, d);
      }
      if (f <= 0.02) continue;
      let crack = 0;
      for (let j = 0; j < c.fr.length; j++) {
        const fr = c.fr[j];
        const dd = Math.abs(adiff(ac, fr.a));
        const cf = 1 - sstep(fr.w * 0.35, fr.w * 0.5 + 0.5 * D2R, dd);
        if (cf > crack) crack = cf;
      }
      const fe = f * (1 - crack);
      if (crack > P.crack) P.crack = crack;
      if (fe > P.caF) {
        P.caF = fe; P.caTh = c.th; P.caDepth = c.depth;
        P.caRev = c.th < 0.45 && c.depth < 0.2 ? 1 : 0;
      }
    }
    if (P.crack > 0) rW += 0.16 * P.crack * g.s;
    P.rW = rW;
    // EEM
    let rE = rayCircle(g.E.x, g.E.y, g.Re, ux, uy);
    // stents
    P.rS = 0; P.strut = 0; P.rS2 = 0; P.strut2 = 0;
    for (let k = 0; k < sl.stents.length; k++) {
      const st = sl.stents[k];
      const sx = g.Lc.x + st.cx * g.s, sy = g.Lc.y + st.cy * g.s;
      const Rs = st.R * g.s * (1 + (st.ell || 0) * Math.cos(2 * (ac - (st.ellA || 0))));
      const rs = rayCircle(sx, sy, Rs, ux, uy);
      const qa = Math.atan2(uy * rs - sy, ux * rs - sx);
      const n = st.n;
      const step = TAU / n;
      let rel = (qa - st.ph) % step; if (rel < 0) rel += step;
      const dist = Math.min(rel, step - rel) * Rs; // arc length to nearest strut
      const hit = dist < 0.06 ? 1 - dist / 0.06 : 0;
      if (rs > P.rS) { P.rS2 = P.rS; P.strut2 = P.strut; P.rS = rs; P.strut = hit; }
      else if (rs > P.rS2) { P.rS2 = rs; P.strut2 = hit; }
    }
    const rWall = Math.max(rW, P.rS);
    if (rE < rWall + 0.1) rE = rWall + 0.1;
    P.rWall = rWall; P.rE = rE;
    // thrombus
    P.rThr = rWall; P.thr = 0;
    if (sl.thr) {
      const d = Math.abs(adiff(ac, sl.thr.c));
      const hw = sl.thr.w / 2;
      if (d < hw) {
        const f = Math.cos((PI / 2) * (d / hw)) ** 1.5;
        P.rThr = Math.max(IV.CATH_R + 0.08, rWall - sl.thr.h * g.s * f * (1 + 0.25 * Math.sin(11 * ac + sl.ph1)));
        P.thr = f;
      }
    }
    if (P.ca) { /* placeholder */ }
    if (P.caF > 0) P.ca = rWall + (P.caDepth || 0) * g.s;
    // attenuation
    P.att = 0; P.attF = 0;
    if (sl.att) {
      const d = Math.abs(adiff(ac, sl.att.c));
      const hw = sl.att.w / 2;
      const f = sl.att.w >= TAU - 1e-3 ? 1 : 1 - sstep(hw - 12 * D2R, hw + 2 * D2R, d);
      if (f > 0.02) { P.att = rWall + sl.att.depth * g.s; P.attF = f; }
    }
    // side branch
    P.sb = 0; P.sbFar = 0;
    if (sl.sb) {
      const d = Math.abs(adiff(ac, sl.sb.c));
      const hw = sl.sb.w / 2;
      const f = 1 - sstep(hw - 10 * D2R, hw + 2 * D2R, d);
      if (f > 0.01) { P.sb = f; P.sbFar = rWall + sl.sb.len * g.s * (0.6 + 0.4 * Math.cos(d / hw * PI / 2)); }
    }
    // dissection
    P.dis = 0; P.disDepth = 0; P.disMedia = 0; P.disRupture = 0;
    for (let k = 0; k < sl.diss.length; k++) {
      const ds = sl.diss[k];
      const d = Math.abs(adiff(ac, ds.c));
      const hw = ds.w / 2;
      const f = 1 - sstep(hw - 8 * D2R, hw + 1 * D2R, d);
      if (f > P.dis) {
        P.dis = f;
        const maxDepth = rE - rWall - 0.04;
        P.disDepth = Math.min(ds.depth * g.s, maxDepth) * (0.55 + 0.45 * f);
        P.disMedia = ds.type === 'media' ? 1 : 0;
        P.disRupture = ds.type === 'rupture' ? 1 : 0;
      }
    }
    // perforation (EEM disruption)
    P.perf = 0;
    if (sl.perf) {
      const d = Math.abs(adiff(ac, sl.perf.c));
      if (d < sl.perf.w / 2) P.perf = 1 - d / (sl.perf.w / 2);
    }
    // guidewire (next to catheter)
    P.gw = 0;
    const gd = 0.66;
    const gx = gd * Math.cos(sl.gwA), gy = gd * Math.sin(sl.gwA);
    const along = gx * ux + gy * uy;
    if (along > 0) {
      const cross = Math.abs(gx * uy - gy * ux);
      if (cross < 0.11) P.gw = along;
    }
    return P;
  };

  /* ---------- measurement ---------- */
  const MB = 360;
  const _P = {};
  IV.measure = function (sl) {
    const g = IV.geom(sl, 1);
    const dth = TAU / MB;
    let aL = 0, aE = 0, aS = 0, hasS = false;
    const lx = new Float32Array(MB), ly = new Float32Array(MB);
    const sx = new Float32Array(MB), sy = new Float32Array(MB);
    const caBins = new Uint8Array(360), atBins = new Uint8Array(360);
    let maxGap = 0, shadow = 0, disArc = 0, disMedia = false, disRup = false;
    for (let b = 0; b < MB; b++) {
      const th = b * dth;
      const P = IV.beam(sl, g, th, _P);
      const rl = P.rThr;
      aL += 0.5 * rl * rl * dth;
      aE += 0.5 * P.rE * P.rE * dth;
      lx[b] = Math.cos(th) * rl; ly[b] = Math.sin(th) * rl;
      if (P.rS > 0) {
        hasS = true;
        aS += 0.5 * P.rS * P.rS * dth;
        sx[b] = Math.cos(th) * P.rS; sy[b] = Math.sin(th) * P.rS;
        const gap = P.rW - P.rS;
        if (gap > maxGap && P.sb < 0.3) maxGap = gap;
      }
      let deg = Math.round(((P.ac * 180) / PI + 360) % 360) % 360;
      if (P.caF > 0.5) caBins[deg] = 1;
      if (P.attF > 0.5) atBins[deg] = 1;
      if (P.caF > 0.5 || P.attF > 0.6) shadow++;
      if (P.dis > 0.5) { if (P.disRupture) disRup = true; else { disArc++; if (P.disMedia) disMedia = true; } }
    }
    const fill = bins => { // fill 1-deg holes caused by sampling
      const o = bins.slice();
      for (let i = 0; i < 360; i++) if (!bins[i] && bins[(i + 359) % 360] && bins[(i + 1) % 360]) o[i] = 1;
      return o;
    };
    const arcs = bins => {
      bins = fill(bins);
      let tot = 0; for (let i = 0; i < 360; i++) tot += bins[i];
      if (tot >= 358) return { total: 360, max: 360 };
      let best = 0, run = 0, start = 0;
      while (start < 360 && bins[start]) start++;
      for (let k = 1; k <= 360; k++) {
        const i = (start + k) % 360;
        if (bins[i]) { run++; if (run > best) best = run; } else run = 0;
      }
      return { total: tot, max: best };
    };
    const diam = (xs, ys) => {
      let cx = 0, cy = 0;
      for (let b = 0; b < MB; b++) { cx += xs[b]; cy += ys[b]; }
      cx /= MB; cy /= MB;
      const NB2 = 90;
      const rr = new Float32Array(NB2 * 2);
      const cnt = new Uint8Array(NB2 * 2);
      for (let b = 0; b < MB; b++) {
        const dx = xs[b] - cx, dy = ys[b] - cy;
        let a = Math.atan2(dy, dx); if (a < 0) a += TAU;
        const k = Math.floor((a / TAU) * NB2 * 2) % (NB2 * 2);
        rr[k] += Math.hypot(dx, dy); cnt[k]++;
      }
      for (let k = 0; k < NB2 * 2; k++) if (cnt[k]) rr[k] /= cnt[k];
      for (let k = 0; k < NB2 * 2; k++) if (!cnt[k]) {
        let j = 1; while (!cnt[(k + j) % (NB2 * 2)] && j < NB2) j++;
        rr[k] = rr[(k + j) % (NB2 * 2)];
      }
      let mn = 1e9, mx = 0;
      for (let k = 0; k < NB2; k++) { const d = rr[k] + rr[k + NB2]; if (d < mn) mn = d; if (d > mx) mx = d; }
      return { min: mn, max: mx, cx, cy };
    };
    const dl = diam(lx, ly);
    const ds = hasS ? diam(sx, sy) : null;
    const ca = arcs(caBins), at = arcs(atBins);
    return {
      z: sl.z,
      lumA: aL, eemA: aE, pb: 1 - aL / aE,
      minLD: dl.min, maxLD: dl.max, lc: { x: dl.cx, y: dl.cy },
      eemD: 2 * Math.sqrt(aE / PI),
      stentA: hasS ? aS : 0, minSD: ds ? ds.min : 0, maxSD: ds ? ds.max : 0,
      caArc: ca.max, caTotal: ca.total, caMaxTh: sl.calc.reduce((m, c) => Math.max(m, c.th), 0),
      attArc: at.max,
      gap: maxGap, shadowFrac: shadow / MB,
      disArc: (disArc / MB) * 360, disMedia, rupture: disRup,
      sb: !!sl.sb, sbName: sl.sb ? sl.sb.name : '', nod: !!sl.nod, thr: !!sl.thr, zone: sl.zone
    };
  };

  IV.measureAll = function (slices) { return slices.map(IV.measure); };

  // equivalent lumen radius, used by device physics and angio
  IV.effLumR = function (m) { return Math.sqrt(m.lumA / PI); };

  // largest intact (unfractured) continuous arc fraction of a calcium arc
  IV.intactArc = function (c) {
    if (!c.fr.length) return c.w / TAU;
    // fractures split the arc; largest segment
    if (c.w >= TAU - 1e-3) {
      if (c.fr.length === 1) return 0.62; // an opened ring behaves like a large arc
      const a = c.fr.map(f => ((f.a % TAU) + TAU) % TAU).sort((x, y) => x - y);
      let best = 0;
      for (let i = 0; i < a.length; i++) {
        const nxt = i === a.length - 1 ? a[0] + TAU : a[i + 1];
        best = Math.max(best, nxt - a[i]);
      }
      return best / TAU;
    }
    const lo = c.c - c.w / 2;
    const pts = [0];
    c.fr.forEach(f => { const r = adiff(f.a, lo); const rr = r < 0 ? r + TAU : r; if (rr < c.w) pts.push(rr); });
    pts.push(c.w);
    pts.sort((x, y) => x - y);
    let best = 0;
    for (let i = 1; i < pts.length; i++) best = Math.max(best, pts[i] - pts[i - 1]);
    return best / TAU;
  };

  // rigidity 0..~1.3 — resistance of the slice to balloon expansion
  IV.rigidity = function (sl) {
    let r = 0;
    for (const c of sl.calc) {
      if (c.depth > 0.5) continue; // deep calcium contributes little
      const a = IV.intactArc(c);
      const tf = clamp(c.th / 0.6, 0.25, 1.45);
      const v = a * a * tf * (c.depth > 0.25 ? 0.5 : 1);
      if (v > r) r = v;
    }
    if (sl.nod) r += 0.15 * clamp(sl.nod.h / 0.6, 0, 1);
    r *= 1 - 0.35 * (sl.ablated || 0); // atherectomy-modified calcium is more compliant
    return clamp(r, 0, 1.3);
  };
})();
