/* IVUS Simulator — synthetic grayscale IVUS renderer (cross-section + L-mode) */
(function () {
  'use strict';
  const IV = window.IV;
  const { PI, TAU } = IV;
  const { clamp, sstep } = IV.util;

  const MODES = {
    '60': { label: '60 MHz 機械式', maxR: 5.0, blood: 0.075, alpha: 0.2, ring: 0, sheath: 0.9, blur: 1, tissueGain: 1.55, adv: 0.8 },
    '20': { label: '20 MHz 電子式', maxR: 6.5, blood: 0.022, alpha: 0.09, ring: 1, sheath: 0.0, blur: 3, tissueGain: 1.45, adv: 0.95 }
  };
  IV.MODES = MODES;

  // log compression LUT
  const LUTN = 2048, LUTMAX = 4;
  const LUT = new Float32Array(LUTN);
  for (let i = 0; i < LUTN; i++) {
    const I = (i / (LUTN - 1)) * LUTMAX;
    LUT[i] = 255 * clamp(Math.log(1 + 4.2 * I) / Math.log(1 + 4.2 * 2.0), 0, 1);
  }
  const comp = I => LUT[I <= 0 ? 0 : I >= LUTMAX ? LUTN - 1 : (I * ((LUTN - 1) / LUTMAX)) | 0];

  function rayleigh(rnd) { return Math.sqrt(-2 * Math.log(1 - rnd() * 0.9999)) * 0.8; }

  function makeNoise(rnd, NB, NR, blurB, blurR) {
    const raw = new Float32Array(NB * NR);
    for (let i = 0; i < raw.length; i++) raw[i] = rayleigh(rnd);
    const out = new Float32Array(NB * NR);
    for (let b = 0; b < NB; b++) {
      for (let i = 0; i < NR; i++) {
        let s = 0, n = 0;
        for (let db = -blurB; db <= blurB; db++) {
          const bb = (b + db + NB) % NB;
          for (let di = -blurR; di <= blurR; di++) {
            const ii = i + di; if (ii < 0 || ii >= NR) continue;
            s += raw[bb * NR + ii]; n++;
          }
        }
        out[b * NR + i] = s / n;
      }
    }
    // re-normalize contrast after blur
    let m = 0; for (let i = 0; i < out.length; i++) m += out[i]; m /= out.length;
    const k = blurB + blurR > 1 ? 1.9 : 1.25;
    for (let i = 0; i < out.length; i++) out[i] = Math.max(0, 1 + (out[i] / m - 1) * k);
    return out;
  }

  /* Core: intensity along one beam. Writes compressed values (0..255) to out[off..off+NRx) */
  function beamProfile(P, m, NRx, drx, out, off, tn, tOff, bn, bOff) {
    const rc = IV.CATH_R;
    let T = 1;
    const sbF = P.sb;
    const rWall = sbF > 0 ? P.rWall + (P.sbFar - P.rWall) * sbF : P.rWall;
    let rE = sbF > 0 ? Math.max(P.rE, rWall + 0.22 + (1 - sbF) * 0.2) : P.rE;
    const mediaW = 0.08;
    const disOn = P.dis > 0.3 && sbF < 0.5;
    const flapEnd = P.rWall + 0.07;
    const falseEnd = flapEnd + P.disDepth;
    const caOn = P.caF > 0.02 && sbF < 0.6;
    const ca = P.ca;
    const caEdge = ca + 0.075;
    const attOn = P.attF > 0.02 && sbF < 0.6;
    const fibRho = 0.38 + 0.6 * P.fib;
    for (let i = 0; i < NRx; i++) {
      const r = (i + 0.5) * drx;
      let I = 0;
      if (r < rc - 0.06) { out[off + i] = 0; continue; }
      if (r < rc) {
        // sheath / catheter surface
        I = m.sheath * (1 - Math.abs(r - (rc - 0.03)) / 0.03);
        out[off + i] = comp(Math.max(0, I) * tn[tOff + i]);
        continue;
      }
      const tnv = tn[tOff + i];
      let rho = 0, mu = 0.05;
      if (r < P.rThr) {
        rho = m.blood * bn[bOff + i];
      } else if (r < rWall) {
        if (P.thr > 0 && r < P.rWall) { rho = 0.3 * (0.6 + 0.8 * bn[bOff + i]) * P.thr + m.blood * (1 - P.thr); mu = 0.4; }
        else rho = m.blood * bn[bOff + i]; // side-branch lumen
      } else if (r < rE - mediaW || (sbF > 0.5 && r < rE)) {
        // plaque / intima
        if (disOn && r < flapEnd) { rho = 0.75 * tnv; mu = 0.5; }
        else if (disOn && r < falseEnd) { rho = m.blood * 0.9 * bn[bOff + i] * P.dis + fibRho * tnv * (1 - P.dis); }
        else {
          rho = fibRho * tnv;
          if (r - rWall < 0.08) rho += 0.2 * tnv; // luminal leading edge
          mu = 0.55;
          if (attOn && r > P.att) { mu += 4.2 * P.attF; rho *= 1 - 0.25 * P.attF; }
          if (caOn && r >= ca) {
            if (r < caEdge) { rho = rho * (1 - P.caF) + 2.1 * P.caF * (0.75 + 0.3 * tnv); mu = 4; }
            else mu += 32 * P.caF;
          }
        }
      } else if (r < rE) {
        rho = 0.1 * tnv; mu = 0.4; // media (sonolucent)
        if (caOn && r >= ca) { if (r < caEdge) rho = 2.0 * P.caF * tnv; mu += 32 * P.caF; }
      } else {
        const d = r - rE;
        rho = (m.adv * Math.exp(-d / 0.3) + 0.36 * Math.exp(-d / 2.5)) * tnv;
        mu = 0.6;
        if (P.perf > 0 && d < 1.6) rho *= 1 - 0.9 * P.perf * (1 - d / 1.6);
        if (caOn && r >= ca && r < caEdge) rho = 2.0 * P.caF * tnv;
        if (caOn && r >= ca) mu += 32 * P.caF;
      }
      // stent struts
      if (P.strut > 0 && Math.abs(r - P.rS) < 0.045) { rho += 2.6 * P.strut * (0.8 + 0.3 * tnv); mu += 5 * P.strut; }
      if (P.strut2 > 0 && Math.abs(r - P.rS2) < 0.045) { rho += 2.3 * P.strut2 * (0.8 + 0.3 * tnv); mu += 5 * P.strut2; }
      // guidewire
      if (P.gw > 0) {
        if (Math.abs(r - P.gw) < 0.06) { rho += 3.0; mu += 40; }
      }
      const G = Math.exp(-m.alpha * r) * m.tissueGain;
      I = rho * T * G + 0.018 * tnv * G;
      // reverberations (thin smooth calcium / wire)
      if (caOn && P.caRev) {
        const d2 = r - 2 * ca, d3 = r - 3 * ca;
        I += P.caF * (0.55 * Math.exp(-(d2 * d2) / 0.0012) + 0.28 * Math.exp(-(d3 * d3) / 0.0016)) * G * tnv;
      }
      if (P.gw > 0) {
        const d2 = r - 2 * P.gw;
        I += 0.35 * Math.exp(-(d2 * d2) / 0.001) * G;
      }
      // ring-down artifact (phased array)
      if (m.ring && r < rc + 0.4) I += m.ring * 1.3 * (1 - (r - rc) / 0.4) * (0.6 + 0.5 * tnv);
      T *= Math.exp(-mu * drx);
      out[off + i] = comp(I);
    }
  }
  IV.beamProfile = beamProfile;

  class IvusRenderer {
    constructor(canvas, N) {
      this.cv = canvas;
      this.N = N || 480;
      canvas.width = canvas.height = this.N;
      this.ctx = canvas.getContext('2d');
      this.img = this.ctx.createImageData(this.N, this.N);
      this.NB = 512; this.NR = 300;
      this.polar = new Float32Array(this.NB * this.NR);
      this.beams = {
        rL: new Float32Array(this.NB), rE: new Float32Array(this.NB), rS: new Float32Array(this.NB),
        rW: new Float32Array(this.NB), caF: new Float32Array(this.NB), attF: new Float32Array(this.NB),
        sb: new Float32Array(this.NB), dis: new Float32Array(this.NB), thr: new Float32Array(this.NB), nod: new Float32Array(this.NB)
      };
      this.P = {};
      this.frame = 0;
      this.setMode('60');
    }
    setMode(mode) {
      this.mode = mode;
      this.m = MODES[mode];
      this.maxR = this.m.maxR;
      this.dr = this.maxR / this.NR;
      const rnd = IV.rng(mode === '60' ? 11 : 23);
      const bl = this.m.blur;
      this.tNoise = [];
      for (let k = 0; k < 5; k++) this.tNoise.push(makeNoise(rnd, this.NB, this.NR, bl === 1 ? 2 : 4, 1));
      this.bNoise = makeNoise(rnd, this.NB, this.NR * 2, bl === 1 ? 1 : 2, 0);
      this.mix = new Float32Array(this.NR);
      this.buildLUT();
    }
    buildLUT() {
      const N = this.N, NB = this.NB, NR = this.NR;
      const sc = (2 * this.maxR) / N;
      this.i0 = new Int32Array(N * N); this.i1 = new Int32Array(N * N);
      this.ft = new Float32Array(N * N); this.fr = new Float32Array(N * N);
      for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
        const k = py * N + px;
        const x = (px + 0.5 - N / 2) * sc, y = (py + 0.5 - N / 2) * sc;
        const r = Math.hypot(x, y);
        let th = Math.atan2(y, x); if (th < 0) th += TAU;
        const tb = (th / TAU) * NB;
        const ti = Math.floor(tb) % NB;
        const rb = r / this.dr - 0.5;
        const ri = Math.floor(rb);
        if (ri < 0 || ri >= NR - 1) { this.i0[k] = -1; continue; }
        this.i0[k] = ti * NR + ri;
        this.i1[k] = ((ti + 1) % NB) * NR + ri;
        this.ft[k] = tb - Math.floor(tb);
        this.fr[k] = rb - ri;
      }
    }
    /* opts: {phase (0..1 cardiac), motion (bool), sliceIndex, mixNext (0..1)} */
    render(sl, opts) {
      opts = opts || {};
      const NB = this.NB, NR = this.NR, m = this.m;
      const ph = opts.motion ? opts.phase || 0 : 0;
      const s = 1 + (opts.motion ? 0.022 * Math.sin(TAU * ph) : 0);
      const rot = opts.motion ? 0.045 * Math.sin(TAU * ph + 0.6) : 0;
      this.rot = rot;
      const g = IV.geom(sl, s);
      const si = opts.sliceIndex || 0;
      const k0 = si % 5, k1 = (si + 1) % 5;
      const t0 = this.tNoise[k0], t1 = this.tNoise[k1];
      const mixW = opts.mixNext || 0;
      // blend two tissue noise variants for continuity along the pullback
      const tmp = this._tmp || (this._tmp = new Float32Array(NB * NR));
      if (mixW < 0.01) tmp.set(t0); else for (let i = 0; i < tmp.length; i++) tmp[i] = t0[i] * (1 - mixW) + t1[i] * mixW;
      this.frame++;
      const bOffBase = ((this.frame * 7919) % (NB * NR)) | 0;
      const B = this.beams, P = this.P;
      for (let b = 0; b < NB; b++) {
        const th = (b / NB) * TAU;
        IV.beam(sl, g, th - rot, P);
        B.rL[b] = P.rThr; B.rE[b] = P.rE; B.rS[b] = P.rS; B.rW[b] = P.rW;
        B.caF[b] = P.caF; B.attF[b] = P.attF; B.sb[b] = P.sb; B.dis[b] = P.dis; B.thr[b] = P.thr; B.nod[b] = P.nod;
        const bOff = (bOffBase + b * NR * 2 + ((this.frame * 31) % NR)) % (NB * NR);
        beamProfile(P, m, NR, this.dr, this.polar, b * NR, tmp, b * NR, this.bNoise, bOff);
      }
      // polar → cartesian
      const N = this.N, d = this.img.data, pol = this.polar;
      const i0 = this.i0, i1 = this.i1, ft = this.ft, fr = this.fr;
      for (let k = 0, p = 0; k < N * N; k++, p += 4) {
        const a = i0[k];
        if (a < 0) { d[p] = d[p + 1] = d[p + 2] = 0; d[p + 3] = 255; continue; }
        const c = i1[k], wt = ft[k], wr = fr[k];
        const v = (1 - wt) * ((1 - wr) * pol[a] + wr * pol[a + 1]) + wt * ((1 - wr) * pol[c] + wr * pol[c + 1]);
        d[p] = v; d[p + 1] = v; d[p + 2] = v * 1.015 + 1; d[p + 3] = 255;
      }
      this.ctx.putImageData(this.img, 0, 0);
      return { beams: B, NB, rot, maxR: this.maxR };
    }
  }
  IV.IvusRenderer = IvusRenderer;

  /* ---------- L-mode (longitudinal) ---------- */
  IV.LMode = class {
    constructor(NRx) {
      this.NRx = NRx || 90;
      this.cv = document.createElement('canvas');
      this.cv.width = IV.NS; this.cv.height = this.NRx * 2;
      this.ctx = this.cv.getContext('2d');
      this.img = this.ctx.createImageData(IV.NS, this.NRx * 2);
      const rnd = IV.rng(77);
      this.tn = makeNoise(rnd, IV.NS * 2, this.NRx, 0, 0);
      this.bn = makeNoise(rnd, IV.NS * 2, this.NRx, 0, 0);
      this.col = new Float32Array(this.NRx);
      this.P = {};
    }
    build(slices, mode, cutDeg) {
      const m = MODES[mode];
      const maxR = Math.min(m.maxR, 4.6);
      const dr = maxR / this.NRx, NRx = this.NRx, H = NRx * 2;
      const d = this.img.data;
      const cut = (cutDeg || 0) * IV.D2R;
      for (let i = 0; i < slices.length; i++) {
        const sl = slices[i];
        const g = IV.geom(sl, 1);
        for (let side = 0; side < 2; side++) {
          const th = cut + side * PI;
          IV.beam(sl, g, th, this.P);
          const off = (i * 2 + side) * NRx;
          beamProfile(this.P, m, NRx, dr, this.col, 0, this.tn, off, this.bn, off);
          for (let j = 0; j < NRx; j++) {
            const row = side === 0 ? NRx - 1 - j : NRx + j;
            const p = (row * IV.NS + i) * 4;
            const v = this.col[j];
            d[p] = v; d[p + 1] = v; d[p + 2] = v * 1.015 + 1; d[p + 3] = 255;
          }
        }
      }
      this.ctx.putImageData(this.img, 0, 0);
      this.maxR = maxR;
      return this.cv;
    }
  };

  /* ---------- overlay ---------- */
  function contour(ctx, cx, cy, sc, arr, NB, rot, mask, color, width, dashMask) {
    // draw smoothed polar contour; mask(b) -> bool to include
    ctx.strokeStyle = color; ctx.lineWidth = width;
    let started = false;
    ctx.beginPath();
    for (let k = 0; k <= NB; k++) {
      const b = k % NB;
      const ok = mask ? mask(b) : true;
      if (!ok) { started = false; continue; }
      const r = (arr[(b + NB - 1) % NB] + 2 * arr[b] + arr[(b + 1) % NB]) / 4;
      const th = (b / NB) * TAU;
      const x = cx + Math.cos(th) * r * sc, y = cy + Math.sin(th) * r * sc;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  function meanAngle(NB, pred) {
    let sx = 0, sy = 0, n = 0;
    for (let b = 0; b < NB; b++) if (pred(b)) { const t = (b / NB) * TAU; sx += Math.cos(t); sy += Math.sin(t); n++; }
    return n ? { a: Math.atan2(sy, sx), n } : null;
  }

  IV.drawIvusOverlay = function (ctx, W, frame, meas, o) {
    const B = frame.beams, NB = frame.NB;
    const cx = W / 2, cy = W / 2, sc = W / (2 * frame.maxR);
    ctx.clearRect(0, 0, W, W);
    const dpr = o.dpr || 1;
    const fs = Math.max(10, Math.round(W / 36));
    // scale marks every 1 mm
    ctx.fillStyle = 'rgba(214,231,240,0.75)';
    for (let mm = 1; mm < frame.maxR; mm++) {
      const p = mm * sc, s = mm % 5 === 0 ? 2.4 * dpr : 1.4 * dpr;
      [[cx + p, cy], [cx - p, cy], [cx, cy + p], [cx, cy - p]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill(); });
    }
    if (o.cut != null) {
      const a = o.cut * IV.D2R;
      ctx.setLineDash([3 * dpr, 6 * dpr]);
      ctx.strokeStyle = 'rgba(240,180,60,0.45)'; ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(a) * W, cy - Math.sin(a) * W); ctx.lineTo(cx + Math.cos(a) * W, cy + Math.sin(a) * W);
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (o.contours) {
      const shadow = b => B.caF[b] > 0.5 || B.attF[b] > 0.6;
      // EEM (solid where visible, dashed where estimated behind shadow)
      contour(ctx, cx, cy, sc, B.rE, NB, 0, b => !shadow(b) && B.sb[b] < 0.5, 'rgba(242,180,52,0.95)', 1.6 * dpr);
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      contour(ctx, cx, cy, sc, B.rE, NB, 0, b => shadow(b) && B.sb[b] < 0.5, 'rgba(242,180,52,0.7)', 1.4 * dpr);
      ctx.setLineDash([]);
      contour(ctx, cx, cy, sc, B.rL, NB, 0, null, 'rgba(56,214,232,0.95)', 1.6 * dpr);
      if (meas.stentA > 0) contour(ctx, cx, cy, sc, B.rS, NB, 0, b => B.rS[b] > 0, 'rgba(140,235,120,0.95)', 1.4 * dpr);
      // calcium arc marks
      ctx.strokeStyle = 'rgba(255,128,64,0.9)'; ctx.lineWidth = 3 * dpr;
      let on = false; ctx.beginPath();
      for (let k = 0; k <= NB; k++) {
        const b = k % NB;
        if (B.caF[b] > 0.5) {
          const r = B.rE[b] + 0.32; const th = (b / NB) * TAU;
          const x = cx + Math.cos(th) * r * sc, y = cy + Math.sin(th) * r * sc;
          if (!on) { ctx.moveTo(x, y); on = true; } else ctx.lineTo(x, y);
        } else on = false;
      }
      ctx.stroke();
    }
    // labels (findings)
    if (o.labels) {
      const L = [];
      const add = (pred, text, rr) => {
        const m = meanAngle(NB, pred);
        if (m && m.n > 4) L.push({ a: m.a, text, rr });
      };
      if (meas.caArc > 0) add(b => B.caF[b] > 0.5, `石灰化 ${Math.round(meas.caArc)}°` + (meas.caMaxTh < 0.45 ? '（多重反射）' : ''), 0.9);
      if (meas.attArc > 0) add(b => B.attF[b] > 0.5, `減衰プラーク ${Math.round(meas.attArc)}°`, 0.9);
      add(b => B.sb[b] > 0.6, meas.sbName || '側枝', 0.6);
      add(b => B.dis[b] > 0.5, meas.rupture ? 'プラーク破綻（空洞）' : meas.disMedia ? '解離（中膜到達）' : '解離フラップ', 0.7);
      add(b => B.thr[b] > 0.5, '血栓', 0.45);
      add(b => B.nod[b] > 0.5, '石灰化結節', 0.45);
      if (meas.gap > 0.25) add(b => B.rS[b] > 0 && B.rL[b] - B.rS[b] > 0.2, `圧着不良 ${meas.gap.toFixed(2)} mm`, 0.5);
      ctx.font = `600 ${fs}px "IBM Plex Sans JP", sans-serif`;
      ctx.textBaseline = 'middle';
      L.forEach(l => {
        const r = Math.min(frame.maxR * 0.86, 2.6 + l.rr);
        let x = cx + Math.cos(l.a) * r * sc, y = cy + Math.sin(l.a) * r * sc;
        const tw = ctx.measureText(l.text).width;
        x = clamp(x - tw / 2, 6 * dpr, W - tw - 6 * dpr);
        y = clamp(y, fs * 2.2, W - fs * 2.2);
        ctx.fillStyle = 'rgba(8,14,18,0.72)';
        ctx.fillRect(x - 4 * dpr, y - fs * 0.75, tw + 8 * dpr, fs * 1.5);
        ctx.fillStyle = '#f7e5b5';
        ctx.fillText(l.text, x, y);
      });
    }
    // readouts
    ctx.font = `500 ${fs}px "IBM Plex Mono", monospace`;
    ctx.textBaseline = 'top';
    ctx.save(); ctx.translate(0, (o.topPad || 0) * dpr);
    ctx.fillStyle = 'rgba(56,214,232,0.95)';
    const lines = [];
    if (o.readouts) {
      ctx.fillText(`Lumen ${meas.lumA.toFixed(2)} mm²`, 8 * dpr, 8 * dpr);
      ctx.fillStyle = 'rgba(242,180,52,0.95)';
      ctx.fillText(`EEM   ${meas.eemA.toFixed(2)} mm²`, 8 * dpr, 8 * dpr + fs * 1.25);
      ctx.fillStyle = '#d6e7f0';
      ctx.fillText(`PB    ${(meas.pb * 100).toFixed(0)} %`, 8 * dpr, 8 * dpr + fs * 2.5);
      if (meas.stentA > 0) {
        ctx.fillStyle = 'rgba(140,235,120,0.95)';
        ctx.fillText(`Stent ${meas.stentA.toFixed(2)} mm²`, 8 * dpr, 8 * dpr + fs * 3.75);
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = '#d6e7f0';
      ctx.fillText(`MLD ${meas.minLD.toFixed(2)} mm`, W - 8 * dpr, 8 * dpr);
      ctx.fillText(`MxLD ${meas.maxLD.toFixed(2)} mm`, W - 8 * dpr, 8 * dpr + fs * 1.25);
      if (meas.caArc > 0) { ctx.fillStyle = 'rgba(255,150,90,0.95)'; ctx.fillText(`Ca ${Math.round(meas.caArc)}°`, W - 8 * dpr, 8 * dpr + fs * 2.5); }
      ctx.textAlign = 'left';
    }
    ctx.restore();
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(214,231,240,0.8)';
    ctx.fillText(`${o.zLabel || ''}`, 8 * dpr, W - 8 * dpr);
    ctx.textAlign = 'right';
    ctx.fillText(o.modeLabel || '', W - 8 * dpr, W - 8 * dpr);
    ctx.textAlign = 'left';
    // calipers
    if (o.caliper && o.caliper.pts.length) {
      const cp = o.caliper;
      ctx.strokeStyle = '#ffe14d'; ctx.fillStyle = '#ffe14d'; ctx.lineWidth = 1.5 * dpr;
      const toPx = p => [cx + p.x * sc, cy + p.y * sc];
      if (cp.type === 'dist') {
        cp.pts.forEach(p => { const [x, y] = toPx(p); ctx.beginPath(); ctx.moveTo(x - 6 * dpr, y); ctx.lineTo(x + 6 * dpr, y); ctx.moveTo(x, y - 6 * dpr); ctx.lineTo(x, y + 6 * dpr); ctx.stroke(); });
        if (cp.pts.length === 2) {
          const [x1, y1] = toPx(cp.pts[0]), [x2, y2] = toPx(cp.pts[1]);
          ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
          const d = Math.hypot(cp.pts[0].x - cp.pts[1].x, cp.pts[0].y - cp.pts[1].y);
          ctx.textBaseline = 'bottom';
          ctx.fillText(`${d.toFixed(2)} mm`, (x1 + x2) / 2 + 6 * dpr, (y1 + y2) / 2 - 4 * dpr);
        }
      } else if (cp.type === 'arc') {
        const c = meas.lc; const [ox, oy] = toPx(c);
        cp.pts.forEach(p => { const [x, y] = toPx(p); ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(x, y); ctx.stroke(); });
        if (cp.pts.length === 2) {
          const a1 = Math.atan2(cp.pts[0].y - c.y, cp.pts[0].x - c.x), a2 = Math.atan2(cp.pts[1].y - c.y, cp.pts[1].x - c.x);
          let d = a2 - a1; while (d < 0) d += TAU;
          ctx.beginPath(); ctx.arc(ox, oy, 26 * dpr, a1, a2); ctx.stroke();
          ctx.textBaseline = 'bottom';
          ctx.fillText(`${Math.round((d * 180) / PI)}°（時計回り）`, ox + 10 * dpr, oy - 30 * dpr);
        }
      }
    }
    void lines;
  };
})();
