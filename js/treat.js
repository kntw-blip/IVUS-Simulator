/* IVUS Simulator — devices, treatment physics, complications, evaluation */
(function () {
  'use strict';
  const IV = window.IV;
  const { PI, TAU, D2R } = IV;
  const { clamp, adiff } = IV.util;
  const DZ = IV.DZ;
  const zi = z => clamp(Math.round(z / DZ), 0, IV.NS - 1);
  const range = (a, b, st) => { const o = []; for (let x = a; x <= b + 1e-9; x += st) o.push(+x.toFixed(2)); return o; };

  IV.stentMaxD = D => (D <= 2.75 ? 3.75 : D <= 3.5 ? 4.75 : 5.75);

  IV.DEV = {
    sc: { cat: 'balloon', group: 'balloon', name: 'セミコンプライアントバルーン', short: 'SC', NP: 6, RBP: 14, comp: 0.012, recoil: 0.25, prof: 0.8, crackTh: 0.4, pCrack: 12, frN: 1, D: [1.25, 1.5, 2.0, 2.25, 2.5, 2.75, 3.0, 3.25, 3.5, 3.75, 4.0], L: [10, 15, 20] },
    nc: { cat: 'balloon', group: 'balloon', name: 'ノンコンプライアントバルーン', short: 'NC', NP: 12, RBP: 20, comp: 0.005, recoil: 0.18, prof: 0.92, crackTh: 0.5, pCrack: 16, frN: 1, D: range(2.0, 5.0, 0.25), L: [6, 8, 12, 15] },
    opn: { cat: 'balloon', group: 'balloon', name: '超高耐圧NCバルーン', short: 'SHP', NP: 10, RBP: 35, comp: 0.003, recoil: 0.15, prof: 1.05, crackTh: 0.72, pCrack: 24, frN: 2, D: [2.0, 2.5, 3.0, 3.5, 4.0], L: [10, 15, 20] },
    score: { cat: 'balloon', group: 'balloon', name: 'スコアリングバルーン', short: 'Score', NP: 8, RBP: 18, comp: 0.007, recoil: 0.15, prof: 0.95, crackTh: 0.6, pCrack: 10, frN: 2, D: range(2.0, 3.5, 0.25), L: [10, 15, 20] },
    cut: { cat: 'balloon', group: 'balloon', name: 'カッティングバルーン', short: 'Cut', NP: 6, RBP: 12, comp: 0.006, recoil: 0.12, prof: 1.05, crackTh: 0.65, pCrack: 8, frN: 3, D: range(2.0, 4.0, 0.25), L: [6, 10, 15] },
    des: { cat: 'stent', group: 'stent', name: '薬剤溶出性ステント', short: 'DES', NP: 10, RBP: 16, comp: 0.01, recoil: 0.03, prof: 1.0, crackTh: 0.45, pCrack: 14, frN: 1, D: [2.25, 2.5, 2.75, 3.0, 3.5, 4.0, 4.5], L: [8, 12, 15, 18, 23, 28, 33, 38] },
    dcb: { cat: 'dcb', group: 'dcb', name: '薬剤コーティングバルーン', short: 'DCB', NP: 7, RBP: 14, comp: 0.01, recoil: 0.25, prof: 0.95, crackTh: 0.4, pCrack: 12, frN: 1, D: [2.0, 2.25, 2.5, 2.75, 3.0, 3.5, 4.0], L: [15, 20, 25, 30] },
    ivl: { cat: 'ivl', group: 'calc', name: '血管内砕石術（IVL）', short: 'IVL', NP: 4, RBP: 10, comp: 0.004, recoil: 0.15, prof: 1.25, crackTh: 0, pCrack: 99, frN: 0, D: [2.5, 3.0, 3.5, 4.0], L: [12] },
    ra: { cat: 'ra', group: 'calc', name: 'ロータブレーター', short: 'RA', D: [1.25, 1.5, 1.75, 2.0, 2.15, 2.25, 2.38, 2.5] },
    oas: { cat: 'oas', group: 'calc', name: 'オービタルアテレクトミー', short: 'OAS', D: [1.25] },
    elca: { cat: 'elca', group: 'elca', name: 'エキシマレーザー（ELCA）', short: 'ELCA', D: [0.9, 1.4, 1.7, 2.0] },
    filter: { cat: 'filter', group: 'protect', name: '末梢保護フィルター', short: 'Filter', D: [4.0], L: [10] },
    kbt: { cat: 'kbt', group: 'balloon', name: 'キッシングバルーン（LAD＋LCx）', short: 'KBT', NP: 10, RBP: 18, comp: 0.006, recoil: 0.1, prof: 0.95, D: [3.0, 3.25, 3.5, 3.75, 4.0], D2: [2.5, 2.75, 3.0, 3.25, 3.5], L: [12] }
  };
  IV.DEV_GROUPS = [
    { id: 'balloon', label: 'バルーン', keys: ['sc', 'nc', 'opn', 'score', 'cut'] },
    { id: 'stent', label: 'ステント', keys: ['des'] },
    { id: 'calc', label: '石灰化デバイス', keys: ['ra', 'oas', 'ivl'] },
    { id: 'elca', label: 'ELCA', keys: ['elca'] },
    { id: 'dcb', label: 'DCB', keys: ['dcb'] },
    { id: 'protect', label: '末梢保護', keys: ['filter'] }
  ];

  /* ---------- tissue helpers ---------- */
  function effR(sl) { return Math.sqrt(IV.measure(sl).lumA / PI); }

  // move tissue lumen to radius (circle radius), compress plaque, stretch EEM
  function setLumen(sl, newLumR, comp) {
    if (newLumR <= sl.lumR) return;
    const aL = PI * sl.lumR ** 2, aE = PI * sl.eemR ** 2, P = aE - aL;
    const aL2 = PI * newLumR ** 2;
    const aE2 = Math.max(aE, aL2 + P * (comp || 0.82));
    const grow = newLumR - sl.lumR;
    sl.lumR = newLumR;
    sl.eemR = Math.sqrt(aE2 / PI);
    // widen existing fractures as the ring opens
    for (const c of sl.calc) if (c.fr.length) {
      const add = (grow / Math.max(0.6, newLumR)) / c.fr.length * 1.4;
      c.fr.forEach(f => (f.w = Math.min(f.w + add, 45 * D2R)));
    }
    if (sl.thr) sl.thr.h *= 0.25;
    sl.diss = sl.diss.filter(d => d.type !== 'rupture' || sl.stents.length === 0);
  }
  IV.setLumen = setLumen;

  IV.applyStentToSlice = function (sl, st) {
    if (st.R >= sl.lumR - 0.02) {
      setLumen(sl, st.R, 0.8);
      st.cx = 0; st.cy = 0;
      if (sl.thr) sl.thr = null;
      sl.diss = sl.diss.filter(d => d.type !== 'rupture');
    } else {
      const off = (sl.lumR - st.R) * 0.95;
      const a = sl.cath.a + PI * 0.9;
      st.cx = Math.cos(a) * off; st.cy = Math.sin(a) * off;
    }
  };

  function addFractures(sl, n, rnd, minTh) {
    let added = 0;
    for (const c of sl.calc) {
      if (c.depth > 0.6 && minTh !== -1) continue;
      for (let k = 0; k < n && c.fr.length < 5; k++) {
        const a = c.w >= TAU - 1e-3 ? rnd() * TAU : c.c + (rnd() - 0.5) * c.w * 0.85;
        if (c.fr.some(f => Math.abs(adiff(f.a, a)) < 20 * D2R)) continue;
        c.fr.push({ a, w: 5 * D2R });
        added++;
      }
    }
    return added;
  }

  // add a fracture at angle a to every calcium arc of the slice that contains it
  function addFractureAt(sl, a, w, allowDeep) {
    let n = 0;
    for (const c of sl.calc) {
      if (c.depth > 0.6 && !allowDeep) continue;
      if (c.fr.length >= 5) continue;
      if (c.w < TAU - 1e-3 && Math.abs(adiff(a, c.c)) > c.w / 2 - 4 * D2R) continue;
      if (c.fr.some(f => Math.abs(adiff(f.a, a)) < 18 * D2R)) continue;
      c.fr.push({ a, w: w || 5 * D2R }); n++;
    }
    return n;
  }
  // a fracture line runs longitudinally: apply the same angles over a run of slices
  function crackRun(C, idxs, nLines, allowDeep) {
    if (!idxs.length) return 0;
    const mid = C.slices[idxs[Math.floor(idxs.length / 2)]];
    const arc = mid.calc.reduce((b, c) => (!b || c.w > b.w ? c : b), null);
    if (!arc) return 0;
    let added = 0;
    for (let k = 0; k < nLines; k++) {
      const a = arc.w >= TAU - 1e-3 ? C.rnd() * TAU : arc.c + (C.rnd() - 0.5) * arc.w * 0.8;
      idxs.forEach(i => (added += addFractureAt(C.slices[i], a, 5 * D2R, allowDeep)));
    }
    return added;
  }

  function expansionFrac(rig, p) {
    // fraction of the balloon-lumen mismatch actually gained; calibrated so that unmodified
    // severe calcium yields roughly 65–75% stent expansion at high pressure
    return clamp(1 - rig * (0.5 - 0.15 * clamp(p / 20, 0, 1.5)), 0.2, 1);
  }

  // balloon radius actually achieved in a slice (waist in resistant lesions)
  function achieved(sl, Rb, p, rCur) {
    const b = sl.r0 != null ? sl.r0 : rCur;
    const f = expansionFrac(IV.rigidity(sl), p);
    const Ra = Rb > b ? b + (Rb - b) * f : Rb;
    return Math.max(Ra, Math.min(Rb, rCur));
  }

  function maxStentR(sl) { return sl.stents.reduce((m, s) => Math.max(m, s.R), 0); }
  function slThick(sl) { return sl.calc.filter(c => c.depth < 0.5).reduce((m, c) => Math.max(m, c.th), 0); }

  /* ---------- case runtime ---------- */
  IV.newCase = function (scn, mode, seed) {
    const base = IV.buildSlices(scn);
    const C = {
      scn, mode,
      pre: base,
      slices: IV.cloneSlices(base),
      rnd: IV.rng(seed || (Date.now() & 0xffff)),
      vitals: { ...scn.vitals, timi: 3 },
      timi: 3,
      filter: null,
      lcx: scn.id === 'lmt' ? { ds: 10, ffr: 0.93, crossed: false, kbt: false, ffrMeasured: null } : null,
      potDone: false, kbtDone: false, rePot: false,
      stentList: [], overexp: false, perforation: false,
      noReflow: { count: 0, unresolved: false, filterNR: false },
      rpmEvents: 0, crossFail: 0, ruptures: 0,
      debris: 0, log: [], penalties: [],
      quiz: null, quizAns: [], plan: {}, imaging: 0, devices: [], ended: false,
      pendingEvents: []
    };
    if (scn.preStented) C.stentList.push({ id: 0, D: 3.0, L: 28, z0: 16, z1: 44, pre: true });
    C.Mpre = IV.measureAll(C.pre);
    // native (pre-intervention) equivalent lumen radius: expansion is computed from this
    // baseline so repeated inflations at the same size/pressure do not keep adding lumen
    C.slices.forEach((sl, i) => { if (sl.r0 == null) sl.r0 = Math.sqrt(C.Mpre[i].lumA / PI); });
    C.M = C.Mpre;
    C.dirty = true;
    return C;
  };

  IV.refreshMeasures = function (C) { C.M = IV.measureAll(C.slices); C.dirty = true; };

  function logEv(C, text, kind) { C.log.push({ t: text, k: kind || 'info' }); }
  function penal(C, label, pts) { C.penalties.push({ label, pts }); }
  IV.logEv = logEv;

  /* ---------- crossing ---------- */
  IV.canCross = function (C, key, D, zDistal) {
    const dev = IV.DEV[key];
    if (!dev.prof) return { ok: true };
    const prof = dev.prof * (0.88 + 0.05 * (D || 2.5) / 2.5);
    for (let i = zi(zDistal); i < IV.NS; i++) {
      const m = C.M[i], sl = C.slices[i];
      const need = prof + 0.15 * IV.rigidity(sl);
      if (m.minLD < need) return { ok: false, z: sl.z, mld: m.minLD };
    }
    return { ok: true };
  };

  /* ---------- balloon-type inflation ---------- */
  IV.balloonR = function (dev, D, p) {
    const unfold = clamp(p / 2, 0.3, 1);
    return (D / 2) * (1 + dev.comp * (p - dev.NP)) * unfold;
  };

  // live inflation state
  IV.startInflation = function (C, key, D, L, zc, extra) {
    const dev = IV.DEV[key];
    const z0 = clamp(zc - L / 2, 0, IV.L), z1 = clamp(zc + L / 2, 0, IV.L);
    const inf = { key, dev, D, L, zc, z0, z1, p: 0, pmax: 0, cracked: new Set(), ruptured: false, simTime: 0, pulses: 0, cycles: 0, extra: extra || {}, live: [] };
    inf.r0 = {};
    for (let i = zi(z0); i <= zi(z1); i++) inf.r0[i] = C.slices[i].stents.length ? maxStentR(C.slices[i]) : effR(C.slices[i]);
    return inf;
  };

  // update during hold; returns list of event strings
  IV.inflateTo = function (C, inf, p, dt) {
    const ev = [];
    const prev = inf.p;
    inf.p = p;
    if (p > inf.pmax) inf.pmax = p;
    if (p >= inf.dev.NP - 1) inf.simTime += dt * 6;
    // cracks when crossing threshold
    if (inf.dev.pCrack < 90 && p >= inf.dev.pCrack && prev < p) {
      let run = [];
      const flush = () => {
        if (run.length) { const n = crackRun(C, run, inf.dev.frN + (C.rnd() < 0.4 ? 1 : 0)); if (n) run.forEach(i => inf.cracked.add(i)); }
        run = [];
      };
      for (let i = zi(inf.z0); i <= zi(inf.z1); i++) {
        const sl = C.slices[i];
        const th = slThick(sl);
        const ok = !inf.cracked.has(i) && th > 0 && th <= inf.dev.crackTh + 0.25 * (sl.ablated || 0) && IV.rigidity(sl) > 0.12;
        if (ok) run.push(i); else flush();
      }
      flush();
      if (inf.cracked.size && !inf._crackMsg) { inf._crackMsg = true; ev.push('crack'); }
    }
    // rupture above RBP
    if (p > inf.dev.RBP && Math.floor(p) > Math.floor(prev)) {
      let rig = 0; for (let i = zi(inf.z0); i <= zi(inf.z1); i++) rig = Math.max(rig, IV.rigidity(C.slices[i]));
      const chance = 0.1 + (rig > 0.4 ? 0.1 : 0) + (p - inf.dev.RBP) * 0.03;
      if (C.rnd() < chance) { inf.ruptured = true; ev.push('rupture'); }
    }
    // live radii for angio
    inf.live = [];
    for (let i = zi(inf.z0); i <= zi(inf.z1); i++) {
      const sl = C.slices[i];
      const Rb = IV.balloonR(inf.dev, inf.D, p);
      inf.live.push({ i, R: achieved(sl, Rb, p, inf.r0[i]) });
    }
    return ev;
  };

  // apply the result on deflation. returns summary
  IV.finishInflation = function (C, inf) {
    const dev = inf.dev, p = inf.ruptured ? Math.min(inf.pmax, dev.RBP + 2) : inf.pmax;
    const res = { gainMax: 0, dissection: null, perforation: false, debris: 0, overexp: false, minRatio: 9, maxRatio: 0 };
    if (p < 1) return res;
    const isStent = dev.cat === 'stent';
    const stentId = C.stentList.length;
    const Rb = IV.balloonR(dev, inf.D, p);
    let riskSlice = -1, riskVal = 0;
    const edgeRisk = [];
    for (let i = zi(inf.z0); i <= zi(inf.z1); i++) {
      const sl = C.slices[i];
      const m = C.M[i];
      const rig = IV.rigidity(sl);
      const r = inf.r0[i];
      const Ra = Math.max(r, achieved(sl, Rb, p, r));
      const ratio = (2 * Ra) / m.eemD;
      res.maxRatio = Math.max(res.maxRatio, ratio);
      const attFrac = sl.att ? sl.att.w / TAU : 0;
      const aBefore = m.lumA;
      if (isStent) {
        let R = Ra * (1 - dev.recoil);
        const st = { R, cx: 0, cy: 0, n: clamp(Math.round((TAU * R) / 1.0), 6, 13), ph: sl.z * 0.45 + stentId * 0.9, ell: rig > 0.3 ? 0.06 : 0.02, ellA: sl.z * 0.2, id: stentId, D: inf.D, maxD: IV.stentMaxD(inf.D) };
        if (sl.stents.length) { // overlap: inner layer cannot exceed outer
          const outer = maxStentR(sl);
          if (R > outer) sl.stents.forEach(s => (s.R = R));
          st.R = Math.min(R, outer + 0.02);
        }
        IV.applyStentToSlice(sl, st);
        sl.stents.push(st);
        if (sl.nod) sl.nod.h *= 0.7;
        res.debris += attFrac * Math.max(0, (PI * st.R * st.R - aBefore) / m.eemA) * (0.7 + p / 25) + (sl.thr ? 0.4 : 0);
      } else if (sl.stents.length) {
        const outer = maxStentR(sl);
        const maxD = Math.min(...sl.stents.map(s => s.maxD));
        let R = Math.max(outer, Ra * (1 - 0.04));
        if (2 * Ra > maxD + 0.05) { res.overexp = true; R = Math.min(R, maxD / 2 + 0.05); }
        if (R > outer) {
          sl.stents.forEach(s => { s.R = R; IV.applyStentToSlice(sl, s); });
          if (inf.key === 'kbt') sl.stents.forEach(s => { s.ell = 0.1; s.ellA = 0; });
          else if (inf.extra.pot) sl.stents.forEach(s => { s.ell = 0.02; });
        }
        res.debris += attFrac * Math.max(0, (PI * R * R - aBefore) / m.eemA) * 0.4;
      } else {
        const newR = r + Math.max(0, Ra - r) * (1 - dev.recoil);
        const k = newR / Math.max(0.3, r);
        setLumen(sl, sl.lumR * k);
        if (sl.nod) sl.nod.h *= inf.key === 'cut' ? 0.6 : 0.85;
        if (inf.key === 'dcb' && inf.simTime >= 30) sl.dcb = true;
        res.debris += attFrac * Math.max(0, (PI * newR * newR - aBefore) / m.eemA) * (0.6 + p / 20) + (sl.thr ? 0.25 : 0);
        sl.injury = Math.max(sl.injury, ratio);
        // dissection risk for non-stented segments
        let risk = clamp((ratio - 0.88) * 2.3, 0, 0.75) + (inf.cracked.has(i) ? 0.12 : 0) + (inf.ruptured ? 0.35 : 0);
        if (inf.key === 'score' || inf.key === 'cut') risk *= 0.6;
        if (risk > riskVal) { riskVal = risk; riskSlice = i; }
      }
      if (ratio > 1.18) {
        const pr = (ratio - 1.18) * 2.5 + (inf.ruptured ? 0.25 : 0) + (rig > 0.4 ? 0.1 : 0);
        if (C.rnd() < pr) { res.perforation = true; res.perfZ = sl.z; }
      }
    }
    // stent edges
    if (isStent) {
      C.stentList.push({ id: stentId, D: inf.D, L: inf.L, z0: inf.z0, z1: inf.z1, p });
      logEv(C, `DES ${inf.D}×${inf.L} mm を ${p.toFixed(0)} atm で留置（${inf.z0.toFixed(1)}–${inf.z1.toFixed(1)} mm）`, 'dev');
      for (const [zEdge, dir] of [[inf.z0, -1], [inf.z1, 1]]) {
        const ie = zi(zEdge), io = zi(zEdge + dir * 1);
        if (C.slices[io].stents.length) continue; // overlapping another stent
        const me = C.M[io], sl = C.slices[ie];
        const ratio = (2 * IV.balloonR(dev, inf.D, p)) / me.eemD;
        let risk = clamp((ratio - 0.92) * 2.0, 0, 0.6) + (me.pb > 0.5 ? 0.25 : 0) + (slThick(sl) > 0.3 ? 0.15 : 0);
        edgeRisk.push({ zEdge, dir, risk, ratio });
      }
      edgeRisk.forEach(e => {
        if (C.rnd() < e.risk) {
          const len = 1.5 + C.rnd() * 3;
          const za = e.dir < 0 ? e.zEdge - len : e.zEdge, zb = e.dir < 0 ? e.zEdge + 0.4 : e.zEdge + len;
          const type = e.ratio > 1.0 ? 'media' : 'intima';
          addDissection(C, za, zb, C.rnd() * TAU, (60 + C.rnd() * 60) * D2R, type === 'media' ? 0.55 : 0.25, type);
          res.dissection = { z0: za, z1: zb, type, edge: e.dir < 0 ? '遠位' : '近位' };
        }
      });
      // LM crossover → LCx ostium
      if (C.lcx && inf.z0 < 44.5 && inf.z1 > 48) {
        if (!C.lcx.crossed) {
          C.lcx.crossed = true;
          const jail = C.rnd() < 0.45;
          C.lcx.ds = jail ? 60 + Math.round(C.rnd() * 15) : 30 + Math.round(C.rnd() * 15);
          C.lcx.ffr = jail && C.rnd() < 0.3 ? +(0.74 + C.rnd() * 0.04).toFixed(2) : +(0.84 + C.rnd() * 0.07).toFixed(2);
        }
      }
    } else {
      logEv(C, `${dev.short} ${inf.D}${inf.key === 'kbt' ? '/' + inf.extra.D2 : ''}×${inf.L} mm ${p.toFixed(0)} atm（${inf.z0.toFixed(1)}–${inf.z1.toFixed(1)} mm）${inf.key === 'dcb' ? `・拡張時間 ${Math.round(inf.simTime)} 秒` : ''}`, 'dev');
      if (riskSlice >= 0 && C.rnd() < riskVal) {
        const sl = C.slices[riskSlice];
        const len = 1.2 + C.rnd() * 3.5;
        const ratio = sl.injury;
        const type = ratio > 1.0 || inf.cracked.has(riskSlice) && ratio > 0.95 ? 'media' : 'intima';
        addDissection(C, sl.z - len / 2, sl.z + len / 2, C.rnd() * TAU, (50 + C.rnd() * 70) * D2R, type === 'media' ? 0.55 : 0.25, type);
        res.dissection = { z0: sl.z - len / 2, z1: sl.z + len / 2, type };
      }
    }
    // POT / KBT bookkeeping (LM case)
    if (C.lcx && C.lcx.crossed) {
      if (inf.key === 'kbt') {
        C.kbtDone = true; C.rePot = false;
        C.lcx.ds = 12 + Math.round(C.rnd() * 8); C.lcx.ffr = 0.92;
      } else if (dev.cat === 'balloon' && inf.z0 >= 47.2 && inf.z0 <= 50.5 && inf.D >= 4.0 && maxStentR(C.slices[zi(inf.z0 + 1)]) > 0) {
        C.potDone = true; inf.extra.pot = true;
        if (C.kbtDone) C.rePot = true;
        C.lcx.ds = Math.max(10, C.lcx.ds - 8);
        if (C.lcx.ffr < 0.8 && C.rnd() < 0.3) C.lcx.ffr = 0.82;
      }
    }
    if (res.overexp && !C.overexp) { C.overexp = true; penal(C, 'ステント最大拡張径を超える後拡張', 5); logEv(C, 'ステントの最大拡張径を超えて拡張しました（ストラット変形・薬剤ポリマー損傷のリスク）', 'warn'); }
    if (inf.ruptured) { C.ruptures++; penal(C, 'バルーン破裂（RBP超過）', 3); logEv(C, `バルーン破裂（${inf.pmax.toFixed(0)} atm）`, 'warn'); }
    if (res.dissection) logEv(C, `${res.dissection.edge ? res.dissection.edge + 'エッジに' : ''}解離が発生（${res.dissection.type === 'media' ? '中膜に到達' : '内膜〜プラーク内'}、約${(res.dissection.z1 - res.dissection.z0).toFixed(1)} mm）`, 'warn');
    if (inf.key === 'dcb' && inf.simTime < 30) logEv(C, `DCBの拡張時間が不足（${Math.round(inf.simTime)} 秒・推奨30〜60秒）`, 'warn');
    C.devices.push(inf.key);
    IV.refreshMeasures(C);
    afterAction(C, res);
    return res;
  };

  function addDissection(C, za, zb, c, w, depth, type) {
    for (let i = zi(za); i <= zi(zb); i++) {
      const sl = C.slices[i];
      if (sl.stents.length && type !== 'edge-in') { if (sl.z > za + 0.6 && sl.z < zb - 0.6) continue; }
      sl.diss.push({ c, w, depth, type });
    }
  }

  /* ---------- IVL pulses ---------- */
  IV.ivlCycle = function (C, inf) {
    if (inf.cycles >= 12) return { ok: false, msg: '最大パルス数（120パルス）に達しました' };
    if (inf.p < 3.5 || inf.p > 6.5) return { ok: false, msg: 'パルスは4〜6 atmで照射します' };
    inf.cycles++;
    let added = 0, lines = 0;
    // emitters act on ~2 mm blocks; each fracture line extends over the block
    const i0 = zi(inf.z0), i1 = zi(inf.z1), B = 10;
    for (let b = i0; b <= i1; b += B) {
      const idxs = [];
      for (let i = b; i < Math.min(i1 + 1, b + B); i++) if (C.slices[i].calc.length) idxs.push(i);
      if (!idxs.length) continue;
      const mid = C.slices[idxs[Math.floor(idxs.length / 2)]];
      const th = mid.calc.reduce((m, c) => Math.max(m, c.th), 0);
      const pf = 0.3 * clamp(th / 0.5, 0.6, 1.6) * (mid.nod ? 0.5 : 1);
      if (C.rnd() < pf) { const n = crackRun(C, idxs, 1, true); if (n) { added += n; lines++; } }
    }
    return { ok: true, added: lines };
  };

  /* ---------- ablation devices (RA / OAS / ELCA) ---------- */
  IV.startAblation = function (C, key, D, opts) {
    const L = C.scn.lesion;
    const ab = { key, D, opts: opts || {}, pos: Math.min(IV.L - 0.5, L[1] + 4), start: Math.min(IV.L - 0.5, L[1] + 4), end: Math.max(0.5, L[0] - 2), dir: -1, rpm: 160000, base: 160000, heat: 0, dropT: 0, passes: 0, lastI: null, warned: false, stall: false, touched: {} };
    if (key === 'oas') ab.eff = opts.speed === 'high' ? 2.0 : 1.7;
    return ab;
  };

  IV.ablationTick = function (C, ab, dt, holding) {
    const ev = [];
    const speed = ab.key === 'ra' ? 2.0 : ab.key === 'oas' ? 1.2 : 0.6;
    const i = zi(ab.pos);
    const sl = C.slices[i];
    const r = sl.stents.length ? maxStentR(sl) : Math.sqrt(C.M[i].lumA / PI);
    const target = ab.key === 'ra' ? (ab.D / 2) * 1.04 : ab.key === 'oas' ? ab.eff / 2 : (ab.D / 2) * 1.1;
    const contact = r < target ? (target - r) / target : 0;
    const rig = IV.rigidity(sl);
    if (ab.key === 'ra') {
      if (holding && contact > 0) ab.heat = Math.min(3, ab.heat + dt * 1.1); else ab.heat = Math.max(0, ab.heat - dt * 1.8);
      const drop = holding ? contact * (0.35 + rig * 0.75) * 42000 * (0.5 + ab.heat) : 0;
      const tgt = ab.base - drop;
      ab.rpm += (tgt - ab.rpm) * Math.min(1, dt / 0.18);
      const d = ab.base - ab.rpm;
      if (d > 5000) { ab.dropT += dt; } else ab.dropT = 0;
      if (ab.dropT > 0.7 && !ab.warned) { ab.warned = true; C.rpmEvents++; ev.push('rpmdrop'); }
      if (d < 3000) ab.warned = false;
      if (d > 20000 && !ab.stall) { ab.stall = true; ev.push('stall'); C.debris += 0.25; }
      if (d < 8000) ab.stall = false;
    }
    if (holding) {
      const prev = ab.pos;
      ab.pos += ab.dir * speed * dt;
      // apply effect to slices crossed
      const a = zi(Math.min(prev, ab.pos)), b = zi(Math.max(prev, ab.pos));
      for (let k = a; k <= b; k++) ablateSlice(C, ab, k, target);
      if (ab.dir < 0 && ab.pos <= ab.end) {
        ab.passes++;
        if (ab.key === 'oas') { ab.dir = 1; } else { ab.pos = ab.start; }
        ev.push('pass');
        passEnd(C, ab, ev);
      } else if (ab.dir > 0 && ab.pos >= ab.start) {
        ab.passes++; ab.dir = -1; ev.push('pass'); passEnd(C, ab, ev);
      }
    }
    return ev;
  };

  function ablateSlice(C, ab, k, target) {
    const sl = C.slices[k];
    const key = ab.key;
    const tk = ab.passes + ':' + ab.dir + ':' + k;
    if (ab.touched[tk]) return; // once per slice per pass
    ab.touched[tk] = 1;
    const m = C.M[k];
    const r = sl.stents.length ? maxStentR(sl) : Math.sqrt(m.lumA / PI);
    const rig = IV.rigidity(sl);
    const th = slThick(sl);
    if (key === 'elca') {
      if (sl.thr) sl.thr.h *= 0.3;
      const contrast = ab.opts.medium === 'contrast';
      if (sl.stents.length) {
        if (contrast && th > 0 && C.rnd() < 0.55) { addFractures(sl, 1, C.rnd); sl.calc.forEach(c => (c.th *= 0.92)); }
      } else if (r < target) {
        const gain = (target - r) * (rig > 0.3 ? 0.15 : 0.55);
        setLumen(sl, sl.lumR * ((r + gain) / Math.max(0.3, r)));
        sl.r0 = Math.max(sl.r0 || 0, r + gain);
        if (contrast && th > 0 && C.rnd() < 0.35) addFractures(sl, 1, C.rnd);
      }
      if (sl.att) C.debris += (sl.att.w / TAU) * 0.012;
      return;
    }
    if (sl.stents.length) return; // RA/OAS not used inside stents here
    if (r >= target) return;
    const soft = rig < 0.15;
    const eff = key === 'ra' ? (soft ? 0.35 : 0.8) : soft ? 0.3 : 0.6;
    const newR = r + (target - r) * eff;
    const gain = newR - r;
    setLumen(sl, sl.lumR * (newR / Math.max(0.3, r)), 0.98);
    sl.r0 = Math.max(sl.r0 || 0, newR);
    let hadCa = false;
    for (const c of sl.calc) if (c.depth < 0.25) { c.th = Math.max(0.12, c.th - gain * 1.1 - 0.1); c.depth = 0.0; hadCa = true; }
    if (hadCa) sl.ablated = Math.min(1, (sl.ablated || 0) + (key === 'ra' ? 0.5 : 0.4));
    if (sl.nod) { sl.nod.h = Math.max(0, sl.nod.h - gain * 2); if (sl.nod.h < 0.05) sl.nod = null; }
    sl.irr = Math.max(0.008, sl.irr * 0.5);
    C.debris += gain * 0.01;
    if (sl.att) C.debris += (sl.att.w / TAU) * 0.03;
  }

  function passEnd(C, ab, ev) {
    IV.refreshMeasures(C);
    // burr/vessel ratio & perforation risk
    if (ab.key === 'ra' || ab.key === 'oas') {
      const L = C.scn.lesion;
      const mla = IV.mutil.minOver(C.Mpre, L[0], L[1], 'lumA');
      const dEff = ab.key === 'ra' ? ab.D : ab.eff;
      const ratio = dEff / mla.eemD;
      ab.ratio = ratio;
      let pr = ratio > 0.8 ? 0.25 : ratio > 0.7 ? 0.08 : 0.005;
      if (C.rnd() < pr) ev.push('perforation');
    }
    if (ab.key === 'elca' && ab.opts.medium === 'contrast' && (ab.opts.fluence || 60) >= 80 && C.rnd() < 0.05) ev.push('perforation');
    logEv(C, `${IV.DEV[ab.key].short} ${ab.key === 'oas' ? (ab.opts.speed === 'high' ? '高速' : '低速') : ab.D + ' mm'} パス${ab.passes}完了`, 'dev');
  }

  IV.finishAblation = function (C, ab) {
    if (!C.devices.includes(ab.key)) C.devices.push(ab.key);
    if (ab.key === 'ra' && ab.ratio > 0.7) penal(C, `バー/血管径比 ${ab.ratio.toFixed(2)}（推奨 0.5〜0.6）`, 3);
    IV.refreshMeasures(C);
    afterAction(C, { debris: 0 });
  };

  /* ---------- filter ---------- */
  IV.deployFilter = function (C, z) {
    const L = C.scn.lesion;
    const m = C.M[zi(z)];
    C.filter = { z, ok: z < L[0] - 3 && m.eemD > 2.5, load: 0, cap: 0.55 + C.rnd() * 0.5 };
    C.devices.push('filter');
    logEv(C, `末梢保護フィルターを ${z.toFixed(1)} mm に展開${C.filter.ok ? '' : '（病変に近すぎ／血管径不足で効果不十分）'}`, C.filter.ok ? 'dev' : 'warn');
  };

  /* ---------- complications after actions ---------- */
  function afterAction(C, res) {
    const d = (res.debris || 0) * 0.035 + C.debris;
    C.debris = 0;
    if (d > 0.01 && C.timi === 3) {
      const p = 1 - Math.exp(-d * 1.2);
      if (C.filter && C.filter.ok) {
        C.filter.load += d;
        if (C.filter.load > C.filter.cap && !C.noReflow.filterNR) { C.noReflow.filterNR = true; C.pendingEvents.push('filterNR'); }
      } else if (C.rnd() < p) {
        C.pendingEvents.push('noreflow');
      }
    }
    if (res.perforation) C.pendingEvents.push('perforation');
  }
  IV.afterAction = afterAction;

  /* event definitions: {title, body, choices:[{t, fx(C)->{text, ok}}]} */
  IV.EVENTS = {
    noreflow: C => ({
      title: 'No-reflow',
      sev: 'danger',
      body: '病変部は拡張したが、末梢への造影剤の流入が著明に遅延（TIMI 1）。胸痛が出現し、ST上昇、血圧 86/50 mmHg、心拍数 52 bpm。',
      onShow: () => { C.timi = 1; C.vitals = { ...C.vitals, sbp: 86, dbp: 50, hr: 52, st: 'ST上昇', timi: 1 }; C.noReflow.count++; },
      choices: [
        { t: '冠動脈内に血管拡張薬（ニコランジル／ニトロプルシド等）を投与', fx: () => { const ok = C.rnd() < 0.65; C.timi = ok ? 3 : 2; return { ok: true, text: ok ? '末梢の流入が改善し TIMI 3 に回復。' : 'TIMI 2 まで改善。追加の対応を検討します。' }; } },
        { t: '血栓吸引カテーテルで吸引', fx: () => { const ok = C.rnd() < 0.45; C.timi = ok ? 3 : 2; return { ok: true, text: ok ? 'デブリスが吸引され TIMI 3 に回復。' : '一部改善し TIMI 2。' }; } },
        { t: 'さらに高圧で後拡張して内腔を広げる', fx: () => { C.timi = 1; penal(C, 'no-reflowに対する追加の高圧拡張', 4); return { ok: false, text: '機械的狭窄ではないため改善せず、さらにデブリスを押し出すおそれがあります。' }; } },
        { t: '経過観察', fx: () => { C.timi = C.rnd() < 0.2 ? 2 : 1; return { ok: false, text: '改善は乏しい状態です。' }; } }
      ],
      repeatUntil: () => C.timi >= 3,
      maxRounds: 3,
      onEnd: () => {
        if (C.timi >= 3) { penal(C, 'No-reflow（回復）', 6); C.vitals = { ...C.vitals, sbp: 112, dbp: 68, hr: 74, st: 'ST改善', timi: 3 }; logEv(C, 'No-reflow 発生 → TIMI 3 に回復', 'warn'); }
        else { penal(C, 'No-reflow（遷延）', 12); C.noReflow.unresolved = true; C.vitals = { ...C.vitals, sbp: 96, dbp: 58, hr: 60, st: 'ST上昇残存', timi: C.timi }; logEv(C, `No-reflow 遷延（TIMI ${C.timi}）`, 'danger'); }
      }
    }),
    filterNR: C => ({
      title: 'フィルターno-reflow',
      sev: 'warn',
      body: 'ステント留置後、フィルターより近位で造影遅延（TIMI 1）。フィルター内にデブリスが充満していると考えられます。',
      onShow: () => { C.timi = 1; C.vitals = { ...C.vitals, timi: 1, st: '軽度ST上昇' }; },
      choices: [
        { t: '吸引カテーテルでフィルター手前を吸引してから回収', fx: () => { C.timi = 3; return { ok: true, text: '吸引で大量の黄色調デブリスを回収。TIMI 3 に回復しフィルターを回収しました。' }; } },
        { t: 'そのままフィルターを回収', fx: () => { C.timi = 2; penal(C, 'フィルター内デブリスの末梢流出', 5); return { ok: false, text: '回収時にデブリスが末梢へ流出し TIMI 2。' }; } },
        { t: '血管拡張薬のみで経過をみる', fx: () => { C.timi = 2; penal(C, 'フィルターno-reflowの対処不十分', 3); return { ok: false, text: '部分的に改善（TIMI 2）。フィルターは目詰まりしたままです。' }; } }
      ],
      onEnd: () => { C.filter = null; C.vitals = { ...C.vitals, timi: C.timi, st: C.timi === 3 ? '変化なし' : '軽度ST上昇' }; logEv(C, `フィルターno-reflow → TIMI ${C.timi}、フィルター回収`, C.timi === 3 ? 'info' : 'warn'); }
    }),
    perforation: C => ({
      title: '冠動脈穿孔（Ellis III）',
      sev: 'danger',
      body: '造影剤が血管外へジェット状に漏出。血圧 78/46 mmHg、心拍数 112 bpm。',
      onShow: () => { C.perforation = true; C.vitals = { ...C.vitals, sbp: 78, dbp: 46, hr: 112, st: '変化なし' }; },
      choices: [
        { t: '直ちに穿孔部をバルーンで低圧閉塞し、カバードステントと心嚢穿刺の準備', fx: () => { penal(C, '冠動脈穿孔（適切に対処）', 14); return { ok: true, text: 'バルーン閉塞で止血を得て、カバードステントで封鎖。心エコーで少量の心嚢液。手技は中止となりました。' }; } },
        { t: 'まずプロタミンでヘパリンを中和する', fx: () => { penal(C, '冠動脈穿孔（初期対応の遅れ）', 18); return { ok: false, text: 'バルーン閉塞の前に中和を優先したため出血が持続し、心タンポナーデに。心嚢穿刺とカバードステントで救命しました。' }; } },
        { t: 'そのままステントを留置して手技を続ける', fx: () => { penal(C, '冠動脈穿孔（不適切な対処）', 20); return { ok: false, text: '出血が持続し心タンポナーデ・ショックに。緊急心嚢穿刺と外科的修復が必要になりました。' }; } }
      ],
      onEnd: () => { C.ended = true; logEv(C, '冠動脈穿孔のため手技中止', 'danger'); }
    })
  };

  /* ---------- evaluation ---------- */
  function segments(C) {
    const segs = []; let cur = null;
    C.slices.forEach((sl, i) => {
      if (sl.stents.length) { if (!cur) cur = { i0: i, i1: i }; else cur.i1 = i; }
      else if (cur) { segs.push(cur); cur = null; }
    });
    if (cur) segs.push(cur);
    return segs.map(s => ({ z0: s.i0 * DZ, z1: s.i1 * DZ, i0: s.i0, i1: s.i1 }));
  }
  IV.segments = segments;

  IV.evaluate = function (C) {
    const scn = C.scn, M = C.M;
    const R = []; // result criteria
    const segs = segments(C);
    // reference segments are taken from the pre-treatment pullback (outside the treated segment)
    const dref = IV.mutil.maxOver(C.Mpre, scn.refDist[0], scn.refDist[1], 'lumA');
    const pref = IV.mutil.maxOver(C.Mpre, scn.refProx[0], scn.refProx[1], 'lumA');
    const meanRef = (dref.lumA + pref.lumA) / 2;
    const L = scn.lesion;
    const mlaPre = IV.mutil.minOver(C.Mpre, L[0], L[1], 'lumA');
    const coreStented = C.slices[zi(mlaPre.z)].stents.length > 0;
    const dcbCore = C.slices[zi(mlaPre.z)].dcb;
    const isLM = scn.id === 'lmt';

    if (C.perforation) {
      R.push({ label: '手技の完遂', detail: '冠動脈穿孔のため手技中止', pass: false });
    } else if (segs.length && coreStented) {
      let msa = null;
      for (let i = 0; i < M.length; i++) if (M[i].stentA > 0) {
        if (isLM && M[i].z > 44) continue;
        if (!msa || M[i].stentA < msa.stentA) msa = M[i];
      }
      if (!isLM) {
        R.push({ label: 'MSA >5.5 mm²（EAPCI）', detail: `MSA ${msa.stentA.toFixed(2)} mm²（${msa.z.toFixed(1)} mm）`, pass: msa.stentA > 5.5 });
        const exp = msa.stentA / meanRef;
        R.push({ label: '拡張率 >80%（MSA／平均参照内腔面積, EAPCI）', detail: `${(exp * 100).toFixed(0)}%（平均参照 ${meanRef.toFixed(2)} mm²）`, pass: exp > 0.8 });
        const ult = msa.stentA > 5.0 || msa.stentA >= 0.9 * dref.lumA;
        R.push({ label: 'MSA >5.0 mm² または 遠位参照の90%以上（ULTIMATE）', detail: `遠位参照 ${dref.lumA.toFixed(2)} mm² の ${(msa.stentA / dref.lumA * 100).toFixed(0)}%`, pass: ult });
      } else {
        const zoneMin = (a, b) => { let mm = null; for (let i = zi(a); i <= zi(b); i++) if (M[i].stentA > 0 && (!mm || M[i].stentA < mm.stentA)) mm = M[i]; return mm; };
        const Z = scn.zones;
        const lad = zoneMin(Z.ladOst[0] + 2, Z.ladOst[1]), poc = zoneMin(Z.poc[0], Z.poc[1]), lm = zoneMin(Z.lm[0], 58);
        R.push({ label: 'LAD入口部 MSA ≥6 mm²（5-6-7-8）', detail: lad ? `${lad.stentA.toFixed(2)} mm²` : 'ステントなし', pass: !!lad && lad.stentA >= 6 });
        R.push({ label: 'POC MSA ≥7 mm²', detail: poc ? `${poc.stentA.toFixed(2)} mm²` : 'ステントなし', pass: !!poc && poc.stentA >= 7 });
        R.push({ label: 'LM MSA ≥8 mm²', detail: lm ? `${lm.stentA.toFixed(2)} mm²` : 'ステントなし', pass: !!lm && lm.stentA >= 8 });
        R.push({ label: 'POT施行（KBT後はre-POT）', detail: C.potDone ? (C.kbtDone ? (C.rePot ? 'POT→KBT→re-POT' : 'KBT後のre-POTなし') : 'POT施行') : '未施行', pass: C.potDone && (!C.kbtDone || C.rePot) });
        const lcxOk = C.lcx.ds < 50 || C.lcx.ffr >= 0.8;
        R.push({ label: 'LCx入口部（狭窄 <50% または FFR ≥0.80）', detail: `造影狭窄 ${C.lcx.ds}%${C.lcx.ffrMeasured != null ? ` / FFR ${C.lcx.ffrMeasured}` : '（FFR未測定）'}`, pass: lcxOk && (C.lcx.ds < 50 || C.lcx.ffrMeasured != null) });
      }
      // malapposition
      let worst = 0, run = 0, best = 0;
      for (let i = 0; i < M.length; i++) {
        if (M[i].stentA > 0 && M[i].gap > 0.4) { run += DZ; best = Math.max(best, run); worst = Math.max(worst, M[i].gap); } else run = 0;
      }
      R.push({ label: '圧着不良なし（>0.4 mm かつ >1 mm長, EAPCI）', detail: best > 0 ? `最大 ${worst.toFixed(2)} mm・長さ ${best.toFixed(1)} mm` : '補正を要する圧着不良なし', pass: !(worst > 0.4 && best > 1.0) });
      // edge dissection & edge plaque burden
      const s0 = segs[0].z0, s1 = segs[segs.length - 1].z1;
      const edgeDis = [];
      for (const [za, zb, name] of [[s0 - 5, s0 + 1, '遠位'], [s1 - 1, s1 + 5, '近位']]) {
        let len = 0, media = false, arc = 0;
        for (let i = zi(za); i <= zi(zb); i++) if (M[i].disArc > 20) { len += DZ; media = media || M[i].disMedia; arc = Math.max(arc, M[i].disArc); }
        edgeDis.push({ name, len, media, arc });
      }
      const major = edgeDis.filter(e => e.len > 3 && (e.media || e.arc >= 60));
      R.push({ label: '中膜に達する >3 mmのエッジ解離なし（ULTIMATE）', detail: edgeDis.map(e => `${e.name}: ${e.len > 0 ? `${e.len.toFixed(1)} mm${e.media ? '・中膜到達' : ''}` : 'なし'}`).join(' / '), pass: major.length === 0 });
      const pbD = M[zi(s0 - 5)], pbP = isLM ? null : M[zi(s1 + 5)];
      const pbOk = pbD.pb < 0.5 && (!pbP || pbP.pb < 0.5);
      R.push({ label: 'エッジ5 mm部のプラーク負荷 <50%（ULTIMATE）', detail: `遠位 ${(pbD.pb * 100).toFixed(0)}%${pbP ? ` / 近位 ${(pbP.pb * 100).toFixed(0)}%` : '（LM入口部側は対象外）'}`, pass: pbOk });
      if (scn.id === 'atten') R.push({ label: '最終 TIMI 3', detail: `TIMI ${C.timi}`, pass: C.timi === 3 });
    } else if (dcbCore) {
      const minL = IV.mutil.minOver(M, L[0], L[1], 'lumA');
      const ratio = Math.sqrt(minL.lumA / meanRef);
      R.push({ label: 'DCB: 残存狭窄 <30%（径換算）', detail: `最小内腔 ${minL.lumA.toFixed(2)} mm²（参照比 径 ${(ratio * 100).toFixed(0)}%）`, pass: ratio >= 0.7 });
      let medLen = 0; for (let i = zi(L[0]); i <= zi(L[1]); i++) if (M[i].disMedia) medLen += DZ;
      R.push({ label: 'DCB: 中膜に達する広範な解離なし', detail: medLen > 0 ? `中膜到達解離 ${medLen.toFixed(1)} mm` : 'なし', pass: medLen < 3 });
      R.push({ label: 'DCB: 病変全体を30秒以上拡張', detail: '最小内腔部はDCBで処置済み', pass: true });
      if (scn.id === 'atten') R.push({ label: '最終 TIMI 3', detail: `TIMI ${C.timi}`, pass: C.timi === 3 });
    } else {
      R.push({ label: '責任病変の治療', detail: '最小内腔部がステント／DCBで治療されていません', pass: false });
    }
    if (C.overexp) R.push({ label: 'ステント最大拡張径の遵守', detail: '最大拡張径を超える後拡張あり', pass: false });

    // scores
    const quizMax = 20, planMax = 20, resMax = 40, safeMax = 20;
    const quizPts = C.quiz ? C.quiz.reduce((s, q, i) => s + (C.quizAns[i] === q.ans ? quizMax / C.quiz.length : 0), 0) : 0;
    let planPts = 0;
    scn.strategy.forEach(g => { const k = C.plan[g.id]; if (k != null) planPts += g.opts[k].p; });
    const per = resMax / R.length;
    const resPts = R.reduce((s, r) => s + (r.pass ? per : 0), 0);
    const pens = [...C.penalties];
    if (C.rpmEvents) pens.push({ label: `ロータブレーター回転数低下 >5,000 rpm（${C.rpmEvents}回）`, pts: Math.min(5, C.rpmEvents) });
    if (C.crossFail) pens.push({ label: `デバイス通過不能（${C.crossFail}回）`, pts: Math.min(3, C.crossFail) });
    const safePts = Math.max(0, safeMax - pens.reduce((s, p) => s + p.pts, 0));
    const total = Math.round(quizPts + planPts + resPts + safePts);
    const grade = total >= 90 ? 'S' : total >= 80 ? 'A' : total >= 65 ? 'B' : total >= 50 ? 'C' : 'D';
    return { R, pens, quizPts, planPts, resPts, safePts, total, grade, quizMax, planMax, resMax, safeMax, dref, pref, meanRef };
  };
})();
