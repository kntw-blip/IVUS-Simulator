/* IVUS Simulator — synthetic cine angiography synced to the IVUS transducer */
(function () {
  'use strict';
  const IV = window.IV;
  const { TAU } = IV;
  const { clamp } = IV.util;
  const W = 480, H = 360;

  function spline(pts, sub) {
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      for (let k = 0; k < sub; k++) {
        const t = k / sub, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    out.push(pts[n - 1].slice());
    return out;
  }
  class Path {
    constructor(pts) {
      this.p = spline(pts, 24);
      this.cum = [0];
      for (let i = 1; i < this.p.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(this.p[i][0] - this.p[i - 1][0], this.p[i][1] - this.p[i - 1][1]));
      this.len = this.cum[this.cum.length - 1];
    }
    at(f) { // f 0..1 of length → {x,y,tx,ty}
      const L = clamp(f, 0, 1) * this.len;
      let lo = 0, hi = this.cum.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (this.cum[mid] < L) lo = mid; else hi = mid; }
      const seg = this.cum[hi] - this.cum[lo] || 1;
      const t = (L - this.cum[lo]) / seg;
      const a = this.p[lo], b = this.p[hi];
      const tx = (b[0] - a[0]) / seg, ty = (b[1] - a[1]) / seg;
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, tx, ty };
    }
  }

  function tube(ctx, pts, widths, fill) {
    // pts: [{x,y,tx,ty}], widths px
    const L = [], R = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], w = widths[i] / 2;
      const nx = -p.ty, ny = p.tx;
      L.push([p.x + nx * w, p.y + ny * w]); R.push([p.x - nx * w, p.y - ny * w]);
    }
    ctx.beginPath();
    ctx.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < L.length; i++) ctx.lineTo(L[i][0], L[i][1]);
    for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
  }

  IV.Angio = class {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.bg = document.createElement('canvas');
      this.bg.width = W; this.bg.height = H;
      this.makeBg();
    }
    makeBg() {
      const g = this.bg.getContext('2d');
      const grd = g.createRadialGradient(W * 0.55, H * 0.5, 40, W * 0.5, H * 0.5, W * 0.7);
      grd.addColorStop(0, '#b9b8b2'); grd.addColorStop(1, '#7d7c78');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      // soft anatomy: spine, diaphragm, ribs
      g.globalAlpha = 0.10; g.fillStyle = '#3a3a38';
      g.beginPath(); g.ellipse(70, 200, 46, 260, 0.05, 0, TAU); g.fill();
      g.globalAlpha = 0.12; g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(380, 420, 260, 120, -0.2, 0, TAU); g.fill();
      g.globalAlpha = 0.07; g.strokeStyle = '#2e2e2c'; g.lineWidth = 16;
      for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(300, -60 + k * 85, 300, 90, 0.18, 0.15, 2.6); g.stroke(); }
      g.globalAlpha = 1;
      const id = g.getImageData(0, 0, W, H), d = id.data, rnd = IV.rng(9);
      for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
      g.putImageData(id, 0, 0);
    }
    setCase(C) {
      this.C = C;
      const A = C.scn.angio;
      this.A = A;
      this.main = new Path(A.main);
      this.pxmm = this.main.len / A.mainLen;
      this.guide = new Path(A.guide);
      this.statics = (A.static || []).map(s => ({ ...s, path: new Path(s.pts) }));
      this.branches = A.branches.map(b => {
        const base = this.main.at(b.at / A.mainLen);
        return { ...b, path: new Path(b.rel.map(([dx, dy]) => [base.x + dx, base.y + dy])) };
      });
    }
    xOfZ(z) { return this.A.zOst - z; }
    ptZ(z) { return this.main.at(this.xOfZ(z) / this.A.mainLen); }
    diamAtX(x) {
      const C = this.C, A = this.A;
      const z = A.zOst - x;
      const M = C.M;
      if (z >= 0 && z <= IV.L) { const m = M[Math.round(z / IV.DZ)]; return 2 * Math.sqrt(m.lumA / Math.PI); }
      if (z > IV.L) { const m = M[IV.NS - 1]; return 2 * Math.sqrt(m.lumA / Math.PI); }
      const m0 = M[0]; const d0 = 2 * Math.sqrt(m0.lumA / Math.PI);
      return d0 * (1 - 0.5 * clamp(-z / (A.mainLen - A.zOst), 0, 1));
    }
    zAtPoint(px, py) { // logical coords
      const A = this.A;
      let best = 1e9, bx = 0;
      for (let x = 0; x <= A.mainLen; x += 0.5) {
        const p = this.main.at(x / A.mainLen);
        const d = Math.hypot(p.x - px, p.y - py);
        if (d < best) { best = d; bx = x; }
      }
      if (best > 26) return null;
      return clamp(A.zOst - bx, 0, IV.L);
    }
    resize() {
      const r = this.cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(200, Math.round(r.width * dpr));
      const h = Math.round((w * H) / W);
      if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
      this.k = w / W;
    }
    render(st) {
      const C = this.C, A = this.A, ctx = this.ctx, pxmm = this.pxmm;
      this.resize();
      ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
      ctx.drawImage(this.bg, 0, 0);
      const ph = st.motion ? st.phase || 0 : 0;
      const dx = st.motion ? 2.4 * Math.sin(TAU * ph) : 0, dy = st.motion ? 3.2 * Math.sin(TAU * ph + 0.7) : 0;
      const sc = st.motion ? 1 + 0.012 * Math.sin(TAU * ph + 0.3) : 1;
      ctx.save();
      ctx.translate(W / 2 + dx, H / 2 + dy); ctx.scale(sc, sc); ctx.translate(-W / 2, -H / 2);
      // contrast front for slow flow
      const timi = C.timi;
      const loop = (st.t || 0) % 3.2 / 3.2;
      const front = timi >= 3 ? 1e9 : (timi === 2 ? loop * 1.3 : Math.min(loop * 0.9, 0.45)) * A.mainLen;
      const alphaAt = x => (x <= front ? 1 : Math.max(0.08, 1 - (x - front) / 12));
      // contrast is injected while positioning; during inflation/ablation the image is plain fluoroscopy
      const fluoro = !!st.fluoro;
      const k = fluoro ? 0.16 : 1;
      const ink = a => `rgba(20,20,24,${0.8 * a * k})`;
      const core = a => `rgba(8,8,12,${0.38 * a * k})`;
      // guide catheter
      const gp = []; for (let f = 0; f <= 1.0001; f += 0.02) gp.push(this.guide.at(f));
      tube(ctx, gp, gp.map(() => 7.5), 'rgba(35,35,38,0.55)');
      tube(ctx, gp, gp.map(() => 4.2), 'rgba(15,15,18,0.45)');
      // static vessels
      for (const s of this.statics) {
        const pts = [], wd = [];
        for (let f = 0; f <= 1.0001; f += 0.02) { pts.push(s.path.at(f)); wd.push((s.d0 + (s.d1 - s.d0) * f) * pxmm); }
        tube(ctx, pts, wd, ink(1)); tube(ctx, pts, wd.map(w => w * 0.5), core(1));
      }
      // branches
      for (const b of this.branches) {
        const pts = [], wd = [];
        const a = alphaAt(b.at);
        for (let f = 0; f <= 1.0001; f += 0.025) {
          pts.push(b.path.at(f));
          let d = b.d0 + (b.d1 - b.d0) * f;
          if (b.lcx && C.lcx && f < 0.08) d *= 1 - (C.lcx.ds / 100) * Math.sin((f / 0.08) * Math.PI * 0.5 + Math.PI * 0.5) ** 0.6;
          wd.push(d * pxmm);
        }
        tube(ctx, pts, wd, ink(a)); tube(ctx, pts, wd.map(w => w * 0.5), core(a));
      }
      // main vessel, per-segment alpha for slow flow
      const step = 0.5;
      let segPts = [], segW = [], segA = null;
      const flush = () => { if (segPts.length > 1) { tube(ctx, segPts, segW, ink(segA)); tube(ctx, segPts, segW.map(w => w * 0.52), core(segA)); } };
      for (let x = 0; x <= A.mainLen + 1e-6; x += step) {
        const p = this.main.at(x / A.mainLen);
        const a = Math.round(alphaAt(x) * 10) / 10;
        const w = this.diamAtX(x) * pxmm;
        if (segA !== null && a !== segA) { segPts.push(p); segW.push(w); flush(); segPts = [p]; segW = [w]; segA = a; continue; }
        segA = a; segPts.push(p); segW.push(w);
      }
      flush();
      // perforation extravasation
      if (C.perforation && C.perfZ != null) {
        const p = this.ptZ(C.perfZ);
        const grd = ctx.createRadialGradient(p.x + 8, p.y + 4, 2, p.x + 8, p.y + 4, 26);
        grd.addColorStop(0, 'rgba(20,20,24,0.65)'); grd.addColorStop(1, 'rgba(20,20,24,0)');
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(p.x + 8, p.y + 4, 26, 0, TAU); ctx.fill();
      }
      // medial dissections → linear staining
      for (let i = 0; i < IV.NS; i += 3) {
        const m = C.M[i];
        if (m.disMedia && m.disArc > 40) {
          const p = this.ptZ(i * IV.DZ), w = this.diamAtX(this.xOfZ(i * IV.DZ)) * pxmm;
          ctx.fillStyle = 'rgba(18,18,22,0.35)';
          ctx.fillRect(p.x - p.ty * (w / 2 + 1.5) - 1, p.y + p.tx * (w / 2 + 1.5) - 1, 2.4, 2.4);
        }
      }
      // stents (faint mesh)
      for (const s of C.stentList) {
        ctx.strokeStyle = 'rgba(25,25,28,0.38)'; ctx.lineWidth = 0.7;
        ctx.beginPath();
        let k = 0;
        for (let z = s.z0; z <= s.z1; z += 0.9, k++) {
          const p = this.ptZ(z), w = (this.diamAtX(this.xOfZ(z)) * pxmm) / 2 + 0.4;
          const side = k % 2 ? 1 : -1;
          const x = p.x - p.ty * w * side, y = p.y + p.tx * w * side;
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // guidewire
      ctx.strokeStyle = 'rgba(12,12,14,0.85)'; ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let f = 0; f <= 1.0001; f += 0.01) { const p = this.main.at(f * 0.97); if (f === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
      ctx.stroke();
      // filter
      if (C.filter) {
        const p = this.ptZ(C.filter.z), w = this.diamAtX(this.xOfZ(C.filter.z)) * pxmm;
        ctx.strokeStyle = 'rgba(10,10,12,0.8)'; ctx.lineWidth = 1;
        for (let k = -2; k <= 2; k++) {
          ctx.beginPath(); ctx.moveTo(p.x + p.tx * 6, p.y + p.ty * 6);
          ctx.lineTo(p.x - p.ty * (w / 2) * (k / 2), p.y + p.tx * (w / 2) * (k / 2)); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(10,10,12,0.9)'; ctx.beginPath(); ctx.arc(p.x + p.tx * 6, p.y + p.ty * 6, 1.8, 0, TAU); ctx.fill();
      }
      // IVUS catheter + transducer
      if (st.showCath !== false) {
        const zc = st.z;
        const xEnd = this.xOfZ(zc);
        ctx.strokeStyle = 'rgba(14,14,16,0.7)'; ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let x = 0; x <= xEnd; x += 1) { const p = this.main.at(x / A.mainLen); if (x === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
        ctx.stroke();
        const p = this.ptZ(zc);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.ty, p.tx));
        ctx.fillStyle = 'rgba(6,6,8,0.95)'; ctx.fillRect(-4, -2.1, 8, 4.2);
        ctx.restore();
      }
      // planned / active device
      const dev = st.device;
      if (dev) {
        const drawMarkers = (z0, z1) => {
          [z0, z1].forEach(z => { const p = this.ptZ(z); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.ty, p.tx)); ctx.fillStyle = 'rgba(5,5,8,0.95)'; ctx.fillRect(-1.2, -3.2, 2.4, 6.4); ctx.restore(); });
        };
        if (dev.live && dev.live.length) {
          const pts = [], wd = [];
          dev.live.forEach(l => { pts.push(this.ptZ(l.i * IV.DZ)); wd.push(2 * l.R * pxmm); });
          tube(ctx, pts, wd, 'rgba(34,34,40,0.72)'); tube(ctx, pts, wd.map(w => w * 0.55), 'rgba(20,20,26,0.25)');
          if (dev.kind === 'kbt' && C.lcx) {
            const b = this.branches.find(x => x.lcx);
            if (b) { const bp = []; for (let f = 0; f <= 0.12; f += 0.02) bp.push(b.path.at(f)); tube(ctx, bp, bp.map(() => dev.D2 * pxmm * Math.min(1, dev.p / 6)), 'rgba(58,58,64,0.5)'); }
          }
        } else if (dev.z0 != null) {
          ctx.strokeStyle = 'rgba(8,8,10,0.9)'; ctx.lineWidth = 2;
          ctx.beginPath();
          for (let z = dev.z0; z <= dev.z1 + 1e-6; z += 0.5) { const p = this.ptZ(z); if (z === dev.z0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
          ctx.stroke();
        }
        if (dev.z0 != null && dev.kind !== 'ablation') drawMarkers(dev.z0, dev.z1);
        if (dev.kind === 'ablation' && dev.pos != null) {
          const p = this.ptZ(dev.pos);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.ty, p.tx));
          ctx.fillStyle = 'rgba(5,5,8,0.95)';
          ctx.beginPath(); ctx.ellipse(0, 0, Math.max(2.4, dev.D * pxmm * 0.7), Math.max(1.8, (dev.D * pxmm) / 2), 0, 0, TAU); ctx.fill();
          ctx.restore();
        }
      }
      ctx.restore();
      // UI overlay (not part of the angiogram): sync marker and pullback range
      if (st.overlay !== false) {
        const p = this.ptZ(st.z);
        const tx = p.x + dx, ty = p.y + dy;
        const nx = -p.ty, ny = p.tx;
        ctx.strokeStyle = 'rgba(56,214,232,0.95)'; ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(tx + nx * 9, ty + ny * 9); ctx.lineTo(tx + nx * 17, ty + ny * 17);
        ctx.moveTo(tx - nx * 9, ty - ny * 9); ctx.lineTo(tx - nx * 17, ty - ny * 17);
        ctx.stroke();
        [0, IV.L].forEach(z => {
          const q = this.ptZ(z);
          ctx.fillStyle = 'rgba(56,214,232,0.55)';
          ctx.beginPath(); ctx.arc(q.x + dx - q.ty * 13, q.y + dy + q.tx * 13, 2, 0, TAU); ctx.fill();
        });
        ctx.font = '600 10px "IBM Plex Sans JP", sans-serif';
        ctx.fillStyle = 'rgba(30,30,32,0.7)';
        (A.labels || []).forEach(([t, x, y]) => ctx.fillText(t, x, y));
      }
    }
  };
})();
