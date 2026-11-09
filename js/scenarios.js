/* IVUS Simulator — case scenarios (anatomy, angiographic layout, quiz, strategy) */
(function () {
  'use strict';
  const IV = window.IV;
  const { clamp, sstep, win, bell, lerp } = IV.util;
  const DZ = IV.DZ;

  // helpers over measurement arrays
  const idx = z => Math.round(z / DZ);
  function minOver(M, z0, z1, key) {
    let best = null;
    for (let i = idx(z0); i <= idx(z1); i++) if (M[i] && (best === null || M[i][key] < best[key])) best = M[i];
    return best;
  }
  function maxOver(M, z0, z1, key) {
    let best = null;
    for (let i = idx(z0); i <= idx(z1); i++) if (M[i] && (best === null || M[i][key] > best[key])) best = M[i];
    return best;
  }
  function lengthWhere(M, pred) {
    let best = 0, run = 0;
    for (const m of M) { if (pred(m)) { run += DZ; best = Math.max(best, run); } else run = 0; }
    return best;
  }
  IV.mutil = { minOver, maxOver, lengthWhere, idx };

  const f2 = v => v.toFixed(2);
  // numeric multiple-choice options around a value
  function numOpts(v, unit, factors) {
    const vals = factors.map(f => v * f);
    const opts = vals.map(x => `${f2(x)} ${unit}`);
    return { opts, ans: 0 };
  }
  function shuffleQ(q, seed) {
    const r = IV.rng(seed);
    const order = q.opts.map((_, i) => i).sort(() => r() - 0.5);
    return { ...q, opts: order.map(i => q.opts[i]), ans: order.indexOf(q.ans) };
  }

  const SC = {};

  /* ===================================================== 1. 高度石灰化 */
  SC.calc = {
    id: 'calc', no: 1,
    title: '高度石灰化病変',
    vessel: 'LAD 近位部〜中間部',
    tags: ['全周性石灰化', 'IVUSカルシウムスコア', 'デバルキング'],
    patient: '78歳男性。労作性狭心症（CCS III）。糖尿病・維持透析中。負荷心筋シンチでLAD領域に虚血。造影で両側性の石灰化陰影を伴うLAD中間部の高度狭窄。',
    vitals: { sbp: 134, dbp: 68, hr: 66, st: '変化なし' },
    lesion: [17.5, 40.5], refDist: [8, 15], refProx: [46, 53],
    profile(z) {
      const eemD = 3.0 + (z / 60) * 1.0 - 0.25 * win(z, 20, 38, 3);
      const pb = 0.33 + 0.47 * bell(z, 29, 8);
      const calc = [];
      const w = clamp((11.5 - Math.abs(z - 28)) / 8, 0, 1) * 360;
      if (w > 2) calc.push({ c: 210 + (z - 28) * 4, w, depth: 0.03, th: 0.45 + 0.6 * bell(z, 28, 4) });
      const wd = 60 * win(z, 8, 12, 0.8); if (wd > 2) calc.push({ c: 300, w: wd, depth: 0.45, th: 0.25 });
      const wp = 110 * win(z, 47, 50, 0.8); if (wp > 2) calc.push({ c: 40, w: wp, depth: 0.03, th: 0.3 });
      let sb = null;
      const fd = win(z, 42.5, 45.5, 0.7); if (fd > 0.05) sb = { c: 30, w: 55 * fd, len: 2.4, name: '対角枝' };
      const fs = win(z, 35.6, 36.6, 0.3); if (fs > 0.05) sb = { c: 250, w: 22 * fs, len: 1.0, name: '中隔枝' };
      return {
        eemD, pb, calc, sb,
        ecc: 0.08 + 0.35 * (1 - win(z, 24, 32, 2)), eccDir: 60 + z * 1.5,
        cath: { d: 0.3, a: 130 + z * 3 }, irr: 0.03 + 0.03 * win(z, 20, 36, 2), fib: 0.55, zone: 'LAD', gwA: 320
      };
    },
    angio: {
      zOst: 60.5, mainLen: 112,
      guide: [[50, 0], [100, 38], [146, 60]],
      static: [
        { name: 'LM', pts: [[146, 60], [178, 80]], d0: 4.4, d1: 4.2 },
        { name: 'LCx', pts: [[178, 80], [152, 112], [124, 160], [104, 220], [96, 290], [92, 345]], d0: 3.2, d1: 1.6 }
      ],
      main: [[178, 80], [214, 108], [250, 148], [281, 200], [305, 255], [322, 306], [332, 356]],
      branches: [
        { name: '対角枝', at: 16.5, rel: [[0, 0], [32, 6], [72, 30], [110, 70], [130, 110]], d0: 2.4, d1: 1.3 },
        { name: '中隔枝', at: 24.5, rel: [[0, 0], [-22, 14], [-40, 40]], d0: 1.2, d1: 0.7 },
        { name: '', at: 52, rel: [[0, 0], [26, 18], [44, 52], [52, 80]], d0: 1.9, d1: 1.0 }
      ],
      labels: [['LAD', 330, 340], ['LCx', 70, 300], ['D1', 300, 150]]
    },
    quiz(M, S) {
      const L = this.lesion;
      const mla = minOver(M, L[0], L[1], 'lumA');
      const len270 = lengthWhere(M, m => m.caArc > 270);
      const has360 = M.some(m => m.caArc >= 355);
      const maxCa = maxOver(M, L[0], L[1], 'caArc');
      const vd = maxCa.eemD;
      const score = (len270 >= 5 ? 1 : 0) + (has360 ? 1 : 0) + 0 + (vd < 3.5 ? 1 : 0);
      const dref = maxOver(M, this.refDist[0], this.refDist[1], 'lumA');
      const q = [];
      const n1 = numOpts(mla.lumA, 'mm²', [1, 1.75, 2.6, 0.5]);
      q.push({ q: 'この病変の最小内腔面積（MLA）に最も近いのはどれですか？', opts: n1.opts, ans: 0,
        ex: `MLA は ${f2(mla.lumA)} mm²（プルバック開始から ${mla.z.toFixed(1)} mm の位置）。同部位のEEM面積 ${f2(mla.eemA)} mm²、プラーク負荷 ${(mla.pb * 100).toFixed(0)}%。` });
      q.push({ q: '最大石灰化角度はどれに該当しますか？', opts: ['90°未満', '90〜180°', '180〜270°', '270°超（全周性を含む）'], ans: 3,
        ex: `最大石灰化角度は ${Math.round(maxCa.caArc)}°。270°超の石灰化は ${len270.toFixed(1)} mm にわたり、うち全周性（360°）の部分を含みます。` });
      q.push({ q: '石灰化の性状として最も適切なのはどれですか？', opts: ['表在性で厚い（多重反射を伴わず、後方は完全な音響陰影）', '表在性で薄い（多重反射を伴う）', '深在性（中膜近傍）', '内腔へ突出する石灰化結節'], ans: 0,
        ex: '病変中心の石灰化は内腔面に接する表在性で、多重反射（reverberation）がなく後方の音響陰影が完全です。厚い石灰化を示唆し、バルーン単独では破砕しにくい所見です。なお遠位・近位には多重反射を伴う薄い石灰化も見られます。' });
      q.push({ q: 'IVUSカルシウムスコア（Zhang ら, 2021）は何点ですか？', opts: ['0〜1点', '2点', '3点', '4点'], ans: score <= 1 ? 0 : score - 1,
        ex: `① 270°超の表在性石灰化が5 mm以上（${len270.toFixed(1)} mm）: ${len270 >= 5 ? 1 : 0}点、② 360°の表在性石灰化: ${has360 ? 1 : 0}点、③ 石灰化結節: 0点、④ 最大石灰化部の血管径（EEM）3.5 mm未満（${f2(vd)} mm）: ${vd < 3.5 ? 1 : 0}点。合計 ${score}点。2点以上ではステント拡張不良のリスクが高く、アテレクトミーやIVLなどの石灰化修飾が推奨されます。` });
      q.push({ q: '遠位参照部の計測に基づくステント径として妥当なのはどれですか？', opts: ['2.5 mm', '3.0 mm', '3.5 mm', '4.0 mm'], ans: 1,
        ex: `遠位参照部（${dref.z.toFixed(1)} mm）の内腔径 約${f2(2 * Math.sqrt(dref.lumA / Math.PI))} mm、EEM径 ${f2(dref.eemD)} mm。内腔径基準（切り上げ）またはEEM径基準（0.25〜0.5 mm切り下げ）でいずれも 3.0 mm が妥当です。近位部は後拡張で最適化します。` });
      return q.map((x, i) => (i === 0 ? shuffleQ(x, 101) : x));
    },
    strategy: [
      { id: 'prep', q: '病変前処置', max: 8, opts: [
        { t: 'ロータブレーター（バー/血管径比 0.5〜0.6）でデバルキング → NC/スコアリングで追加拡張', p: 8, fb: 'Caスコア3点・厚い全周性石灰化には妥当な戦略です。バー径は血管径の0.5〜0.6程度、回転数低下（>5,000 rpm）を避けるペッキング操作で。' },
        { t: 'IVL（血管内砕石術）で石灰化を破砕', p: 7, fb: '厚い・深い石灰化にも有効です。ただしMLDが小さくカテーテルが通過しない場合は、先に小径バルーンやアテレクトミーが必要です。' },
        { t: 'OAS（オービタルアテレクトミー）で切削', p: 7, fb: '全周性石灰化の修飾として妥当です。低速から開始し、ゆっくり進めます。' },
        { t: 'NC/スコアリングバルーンのみで前拡張', p: 2, fb: 'Caスコア3点ではバルーン単独では拡張不良となりやすく、高圧でのバルーン破裂や穿孔のリスクも伴います。' },
        { t: 'エキシマレーザー（ELCA）で前処置', p: 1, fb: 'ELCAの石灰化への効果は限定的で、本病変の第一選択ではありません。' } ] },
      { id: 'size', q: 'ステント径', max: 4, opts: [
        { t: '2.5 mm', p: 1, fb: '遠位参照部に対して小さく、拡張不良・圧着不良の原因になります。' },
        { t: '3.0 mm', p: 4, fb: '遠位参照部の内腔径・EEM径から妥当です。' },
        { t: '3.5 mm', p: 1, fb: '遠位部ではEEM径を超え、エッジ解離や穿孔のリスクがあります。' },
        { t: '4.0 mm', p: 0, fb: '過大です。' } ] },
      { id: 'len', q: 'ステント長・ランディング', max: 4, opts: [
        { t: '遠位・近位ともプラーク負荷 <50% の部位にランディング（約33 mm）', p: 4, fb: 'ULTIMATE基準（エッジ5 mm部のプラーク負荷 <50%）を満たすランディングです。' },
        { t: '石灰化部分のみを短くカバー（約18 mm）', p: 0, fb: 'エッジがプラーク負荷の大きい部位にかかり、エッジ再狭窄・解離のリスクが高まります。' },
        { t: '近位端をLAD入口部まで延ばす（約38 mm）', p: 2, fb: '近位参照部は正常に近く、入口部まで延ばす必要はありません。' } ] },
      { id: 'opt', q: '最適化', max: 4, opts: [
        { t: '近位部をNC 3.5 mmで後拡張し、IVUSで拡張・圧着・エッジを確認', p: 4, fb: 'テーパリングに合わせた近位最適化とIVUS確認が基本です。' },
        { t: '造影で良好なら終了', p: 0, fb: '石灰化病変では造影で良好に見えても拡張不良が多く、IVUSでの確認が必要です。' },
        { t: '全長を4.0 mm NCで高圧後拡張', p: 1, fb: '遠位部の過拡張でエッジ解離・穿孔のリスクがあります。' } ] }
    ]
  };

  /* ===================================================== 2. 減衰プラーク（ACS） */
  SC.atten = {
    id: 'atten', no: 2,
    title: '減衰プラーク（不安定）',
    vessel: 'RCA 中間部',
    tags: ['NSTEMI', '減衰プラーク', 'no-reflow対策'],
    patient: '58歳男性。NSTEMI（発症6時間）。II・III・aVFでST低下、高感度トロポニン上昇。RCA中間部に造影遅延のない高度狭窄（TIMI 3）。',
    vitals: { sbp: 122, dbp: 74, hr: 82, st: '下壁誘導 ST低下 1 mm' },
    lesion: [19.4, 40.6], refDist: [8, 16], refProx: [42, 47],
    profile(z) {
      const eemD = 3.6 + (z / 60) * 0.8 + 0.55 * bell(z, 30, 5);
      const pb = 0.33 + 0.53 * bell(z, 30, 7);
      const attW = 250 * clamp((9.5 - Math.abs(z - 30)) / 4.5, 0, 1);
      const att = attW > 2 ? { c: 150 + (z - 30) * 3, w: attW, depth: 0.22 } : null;
      const diss = [];
      const fr = win(z, 31.2, 33, 0.4); if (fr > 0.3) diss.push({ c: 95, w: 45, depth: 0.6 * fr, type: 'rupture' });
      const ft = win(z, 27, 30.5, 0.6);
      const thr = ft > 0.05 ? { c: 320, w: 70, h: 0.35 * ft } : null;
      const calc = [];
      const wc = 45 * win(z, 45, 47, 0.5); if (wc > 2) calc.push({ c: 250, w: wc, depth: 0.35, th: 0.3 });
      let sb = null;
      const f1 = win(z, 48, 50.5, 0.6); if (f1 > 0.05) sb = { c: 20, w: 45 * f1, len: 2.6, name: '右室枝' };
      const f2_ = win(z, 12, 13.5, 0.5); if (f2_ > 0.05) sb = { c: 200, w: 35 * f2_, len: 1.8, name: '鋭角枝' };
      return { eemD, pb, att, diss, thr, calc, sb, ecc: 0.45, eccDir: 330 + (z - 30) * 3, cath: { d: 0.35, a: 200 + z * 2 }, irr: 0.035, fib: 0.42, zone: 'RCA', gwA: 40 };
    },
    angio: {
      zOst: 75, mainLen: 125,
      guide: [[0, 128], [40, 100], [80, 82]],
      static: [],
      main: [[80, 82], [140, 62], [210, 68], [270, 108], [302, 168], [304, 234], [276, 290], [226, 322], [170, 334], [130, 336]],
      branches: [
        { name: '円錐枝', at: 5, rel: [[0, 0], [16, -18], [40, -30], [62, -34]], d0: 1.2, d1: 0.7 },
        { name: '右室枝', at: 25.5, rel: [[0, 0], [36, -2], [74, 6], [112, 22]], d0: 1.8, d1: 1.0 },
        { name: '鋭角枝', at: 62.3, rel: [[0, 0], [40, 6], [84, 22], [120, 34]], d0: 1.6, d1: 0.9 },
        { name: '後下行枝', at: 108, rel: [[0, 0], [6, 20], [16, 40]], d0: 1.6, d1: 1.0 }
      ],
      labels: [['RCA', 316, 200]]
    },
    quiz(M) {
      const L = this.lesion;
      const mla = minOver(M, L[0], L[1], 'lumA');
      const maxAtt = maxOver(M, L[0], L[1], 'attArc');
      const len180 = lengthWhere(M, m => m.attArc > 180);
      const lenAny = lengthWhere(M, m => m.attArc > 30);
      const dref = maxOver(M, this.refDist[0], this.refDist[1], 'lumA');
      const pref = maxOver(M, this.refProx[0], this.refProx[1], 'lumA');
      const ri = mla.eemA / ((dref.eemA + pref.eemA) / 2);
      const q = [];
      q.push({ q: '減衰プラークの最大減衰角度はどれですか？', opts: ['減衰なし', '90°未満', '90〜180°', '180°超'], ans: 3,
        ex: `最大減衰角度は約${Math.round(maxAtt.attArc)}°。石灰化を伴わない後方減衰（attenuation）で、表層は比較的エコー輝度があり深部に向かって信号が減衰します。` });
      q.push({ q: '減衰プラークの長さとして正しいのはどれですか？', opts: ['5 mm未満', '5 mm以上'], ans: lenAny >= 5 ? 1 : 0,
        ex: `減衰を伴う区間は約${lenAny.toFixed(1)} mm、180°超の減衰が約${len180.toFixed(1)} mm。減衰角度 >180°かつ長さ ≥5 mm はno-reflow/微小血管閉塞の予測因子として報告されています（Endo 2010, Shiono ら）。` });
      q.push({ q: 'MLA部位のリモデリングは？', opts: ['正の（拡大）リモデリング', '負のリモデリング', 'リモデリングなし'], ans: ri > 1.05 ? 0 : ri < 0.95 ? 1 : 2,
        ex: `リモデリング指数 = 病変部EEM面積 ${f2(mla.eemA)} / 平均参照EEM面積 ${f2((dref.eemA + pref.eemA) / 2)} = ${ri.toFixed(2)}。1.05超で正のリモデリング。不安定プラークに典型的です。` });
      q.push({ q: '病変内で見られる他の所見はどれですか？', opts: ['プラーク破綻（空洞）と小さな血栓', '石灰化結節', '医原性の冠動脈解離', 'ステント内新生内膜'], ans: 0,
        ex: 'MLA近位側に線維性被膜の断裂と内腔に交通する空洞（ruptured cavity）、MLA部に低エコーの小血栓を認めます。' });
      q.push({ q: 'この病変のno-reflowリスクの評価は？', opts: ['低い', '中等度', '高い'], ans: 2,
        ex: '減衰角度 >180°・長さ ≥5 mm に加えプラーク破綻を伴います。両者の合併でno-reflow頻度が高いと報告されており（Endo 2010）、末梢保護（VAMPIRE 3）や攻撃的な拡張を避ける戦略を考慮します。' });
      return q;
    },
    strategy: [
      { id: 'protect', q: '末梢保護', max: 6, opts: [
        { t: 'フィルター型末梢保護デバイスを病変遠位に留置', p: 6, fb: '減衰長 ≥5 mm のACSでフィルター型末梢保護がno-reflowを減らしたRCT（VAMPIRE 3）があります。' },
        { t: '使用しない', p: 1, fb: '高リスク所見があり、末梢保護を考慮すべき病変です。' },
        { t: 'ルーチンの血栓吸引のみ先行', p: 3, fb: 'ルーチンの血栓吸引はRCTで有用性が示されていません。本病変は血栓より脂質性プラークの塞栓が主体です。' } ] },
      { id: 'pre', q: '前拡張', max: 5, opts: [
        { t: 'ダイレクトステント、または2.0 mm程度の低圧での最小限の前拡張', p: 5, fb: 'プラーク内容物の押し出しを最小限にする戦略です。' },
        { t: '3.5 mm SCバルーンで高圧の前拡張', p: 0, fb: '大きな前拡張は遠位塞栓・no-reflowのリスクを高めます。' },
        { t: 'ELCAでデバルキング', p: 2, fb: '減衰プラークではELCA後の血栓形成・一過性no-reflowの報告があり、慎重に適応を判断します。' } ] },
      { id: 'size', q: 'ステント径', max: 5, opts: [
        { t: '3.0 mm', p: 3, fb: 'やや小さめ。後拡張が必要になる可能性があります。' },
        { t: '3.5 mm', p: 5, fb: '遠位参照部の内腔径（約3.1 mm）・EEM径（約3.9 mm）から妥当です。' },
        { t: '4.0 mm', p: 1, fb: '過大で、プラーク押し出しと遠位エッジ解離のリスクが高まります。' } ] },
      { id: 'post', q: '後拡張', max: 4, opts: [
        { t: '必要最小限（近位部のみ・NCで中等圧）とし、IVUSで確認', p: 4, fb: '拡張と塞栓リスクのバランスをとる方針です。' },
        { t: '全長を高圧で積極的に後拡張', p: 0, fb: 'no-reflowのリスクが高まります。' },
        { t: '後拡張は行わない', p: 2, fb: '拡張不良が残る可能性があり、IVUSで判断します。' } ] }
    ]
  };

  /* ===================================================== 3. LMT分岐部 */
  SC.lmt = {
    id: 'lmt', no: 3,
    title: '左主幹部（LMT）分岐部病変',
    vessel: 'LM遠位部〜LAD入口部',
    tags: ['Medina 1,1,0', 'provisional', 'POT', '5-6-7-8'],
    patient: '71歳男性。安定狭心症。LM遠位部からLAD入口部の狭窄（Medina 1,1,0）。LCxは入口部に有意狭窄なし。SYNTAXスコア 18。Heart Teamでの協議を経てPCIの方針。',
    vitals: { sbp: 128, dbp: 70, hr: 64, st: '変化なし' },
    lesion: [35.5, 56.6], refDist: [24, 32], refProx: [57, 60],
    zones: { ladOst: [38, 44], poc: [44, 48.5], lm: [48.5, 60] },
    profile(z) {
      const eemD = 3.6 + (Math.min(z, 44) / 44) * 0.5 + 0.9 * sstep(44, 48.5, z) + 0.2 * clamp((z - 48.5) / 11.5, 0, 1);
      const pb = 0.38 + 0.4 * bell(z, 40.5, 3.2) + 0.42 * bell(z, 51.5, 3.2);
      const calc = [];
      const w1 = 160 * win(z, 38, 42, 0.8); if (w1 > 2) calc.push({ c: 250, w: w1, depth: 0.03, th: 0.42 });
      const w2 = 60 * win(z, 54, 56, 0.6); if (w2 > 2) calc.push({ c: 200, w: w2, depth: 0.6, th: 0.35 });
      let sb = null;
      const fl = win(z, 44.2, 48.2, 0.7); if (fl > 0.05) sb = { c: 90, w: 110 * fl, len: 3.4, name: 'LCx' };
      const fd = win(z, 30, 31.5, 0.5); if (fd > 0.05) sb = { c: 200, w: 40 * fd, len: 1.8, name: '対角枝' };
      const zone = z < 38 ? 'LAD' : z < 44 ? 'LAD入口部' : z < 48.5 ? 'POC' : 'LM';
      return {
        eemD, pb, calc, sb, zone,
        ecc: lerp(0.3, 0.55, win(z, 36, 48, 2)), eccDir: z < 49 ? 90 : 60,
        cath: { d: 0.3 + 0.7 * sstep(44, 49, z), a: 210 + z * 1.5 }, irr: 0.03, fib: 0.55, gwA: 330
      };
    },
    angio: {
      zOst: 60.5, mainLen: 108,
      guide: [[30, 0], [80, 34], [120, 56]],
      static: [],
      main: [[120, 56], [150, 76], [176, 96], [210, 126], [244, 166], [272, 216], [292, 268], [305, 320], [310, 358]],
      branches: [
        { name: 'LCx', at: 14, lcx: true, rel: [[0, 0], [-24, 30], [-48, 76], [-62, 130], [-68, 190], [-70, 240]], d0: 3.4, d1: 1.8 },
        { name: '対角枝', at: 29.8, rel: [[0, 0], [34, 12], [70, 42], [96, 80]], d0: 2.3, d1: 1.2 }
      ],
      labels: [['LM', 112, 80], ['LAD', 300, 330], ['LCx', 70, 280]]
    },
    quiz(M) {
      const Z = this.zones;
      const lm = minOver(M, Z.lm[0], 58, 'lumA');
      const lad = minOver(M, Z.ladOst[0], Z.ladOst[1], 'lumA');
      const dref = maxOver(M, this.refDist[0], this.refDist[1], 'lumA');
      const q = [];
      const n1 = numOpts(lm.lumA, 'mm²', [1, 1.6, 2.2, 0.6]);
      q.push(shuffleQ({ q: 'LM本幹のMLAに最も近いのはどれですか？', opts: n1.opts, ans: 0,
        ex: `LMのMLAは ${f2(lm.lumA)} mm²。虚血のカットオフはアジア人で4.5〜4.8 mm²、欧米の報告では6.0 mm²が用いられ、いずれの基準でも有意です。` }, 303));
      const n2 = numOpts(lad.lumA, 'mm²', [1, 1.8, 0.6, 2.6]);
      q.push(shuffleQ({ q: 'LAD入口部のMLAに最も近いのはどれですか？', opts: n2.opts, ans: 0,
        ex: `LAD入口部のMLAは ${f2(lad.lumA)} mm²（プラーク負荷 ${(lad.pb * 100).toFixed(0)}%）。プラークはカリナ対側（外側壁）に偏在し、フローディバイダー側はほぼ正常です。` }, 304));
      q.push({ q: 'LADからのプルバックで見えるLCx入口部の所見は？', opts: ['プラークはほぼなし（Medina 1,1,0）', '高度狭窄（Medina 1,1,1）', '入口部閉塞'], ans: 0,
        ex: 'LCx分岐部のカリナ側にプラークはほとんどありません。ただしLADからのプルバックではLCx入口部を過大評価しうるため、必要ならLCxからの別プルバックで確認します。' });
      q.push({ q: 'LAD側のステント径として妥当なのはどれですか？', opts: ['3.0 mm', '3.5 mm', '4.0 mm', '4.5 mm'], ans: 1,
        ex: `LAD遠位参照部の内腔径 約${f2(2 * Math.sqrt(dref.lumA / Math.PI))} mm、EEM径 ${f2(dref.eemD)} mm。遠位参照部に合わせて3.5 mmを選び、LM部はPOTで拡張します。` });
      q.push({ q: 'POTに用いるバルーン径は？', opts: ['3.5 mm', '4.5〜5.0 mm', '5.5 mm以上', 'POTは不要'], ans: 1,
        ex: 'LM遠位部の参照径（Finetの法則でLAD 3.9 mm＋LCx 3.4 mm → 約4.9 mm）に合わせたNCバルーンで、カリナ直前に遠位マーカーを置いてPOTを行います。ステントの最大拡張径を超えないよう注意します。' });
      return q;
    },
    strategy: [
      { id: 'tech', q: 'ステント戦略', max: 8, opts: [
        { t: 'LM→LADのクロスオーバー1ステント（provisional）', p: 8, fb: 'LCx入口部に病変がないMedina 1,1,0では、provisional戦略が標準です。' },
        { t: 'DK crushによる2ステント', p: 2, fb: 'LCxに病変がなく側枝が大きく関与しない本例では、upfront 2ステントの必要性は低いです。' },
        { t: 'LAD入口部からのみステント（LMはカバーしない）', p: 0, fb: 'LM病変が残存し、LAD入口部のステント端がLMプラーク上にかかります。' },
        { t: 'Culotte法による2ステント', p: 2, fb: '2ステントの適応は乏しい症例です。' } ] },
      { id: 'size', q: 'ステント径', max: 4, opts: [
        { t: '3.0 mm', p: 2, fb: 'LAD遠位参照部に対しやや小さく、LM部はPOTでも最大拡張径に近づきます。' },
        { t: '3.5 mm', p: 4, fb: 'LAD遠位参照部に合わせた妥当なサイズです。' },
        { t: '4.0 mm', p: 2, fb: 'LAD遠位側では大きめです。' },
        { t: '4.5 mm', p: 0, fb: 'LADに対して過大です。' } ] },
      { id: 'pot', q: 'POT', max: 4, opts: [
        { t: 'カリナ直前に遠位マーカーを合わせ、NC 4.5〜5.0 mmでPOT', p: 4, fb: 'LM部の拡張・圧着の最適化と、側枝へのアクセス改善を得られます。' },
        { t: 'POTは行わない', p: 0, fb: 'LM部のステント拡張不良・圧着不良が残ります。' },
        { t: 'LM全体を5.5 mmで高圧拡張', p: 1, fb: 'ステントの最大拡張径を超える過拡張や、LM入口部の損傷のリスクがあります。' } ] },
      { id: 'sb', q: '側枝（LCx）', max: 4, opts: [
        { t: 'LCx入口部が狭小化した場合はFFR等で機能評価し、必要時のみKBT（その後re-POT）', p: 4, fb: '造影上のjailingは機能的に有意でないことが多く、評価に基づく判断が推奨されます。' },
        { t: 'ルーチンでKBTを行う', p: 2, fb: 'provisional 1ステント後のルーチンKBTの有用性は示されていません。' },
        { t: 'LCxは評価しない', p: 0, fb: 'LMではLCx入口部の評価が必須です。' } ] }
    ]
  };

  /* ===================================================== 4. ステント留置後の最適化 */
  SC.post = {
    id: 'post', no: 4,
    title: 'ステント留置後の最適化',
    vessel: 'LAD 中間部（DES 3.0×28 mm 留置後）',
    tags: ['拡張不良', '圧着不良', 'エッジ解離'],
    patient: '66歳女性。安定狭心症。LAD中間部にDES 3.0×28 mmを12 atmで留置。造影上は良好な拡張に見える。最終IVUSを施行した。',
    vitals: { sbp: 126, dbp: 72, hr: 70, st: '変化なし' },
    lesion: [16, 44], refDist: [8, 13], refProx: [45, 51], preStented: true,
    profile(z) {
      const eemD = 3.0 + (z / 60) * 1.5;
      const pb = 0.28 + 0.52 * bell(z, 28.5, 5.5);
      const calc = [];
      const w = 210 * win(z, 24.5, 32.5, 1.2); if (w > 2) calc.push({ c: 180, w, depth: 0.04, th: 0.55 + 0.1 * bell(z, 28.5, 2) });
      let sb = null;
      const fd = win(z, 52, 54.5, 0.6); if (fd > 0.05) sb = { c: 40, w: 50 * fd, len: 2.4, name: '対角枝' };
      return { eemD, pb, calc, sb, ecc: 0.3, eccDir: 300 + z, cath: { d: 0.3, a: 100 + z * 2.5 }, irr: 0.03, fib: 0.55, zone: 'LAD', gwA: 250 };
    },
    postBuild(S) {
      for (const sl of S) {
        const z = sl.z;
        if (z >= 16 && z <= 44) {
          const R = 1.47 - 0.33 * bell(z, 28.5, 2.6);
          sl.r0 = sl.lumR; // native lumen before the index stent
          const st = { R, cx: 0, cy: 0, n: 9, ph: z * 0.45, ell: 0.05, ellA: 0.7, id: 0, D: 3.0, maxD: 4.75 };
          IV.applyStentToSlice(sl, st);
          sl.stents.push(st);
        }
        if (z >= 12.4 && z <= 16.4) {
          const f = win(z, 12.4, 16.4, 0.4);
          sl.diss.push({ c: 210 * IV.D2R, w: (70 + 30 * f) * IV.D2R, depth: 0.55, type: 'media' });
        }
      }
    },
    angio: {
      zOst: 60.5, mainLen: 112,
      guide: [[50, 0], [100, 38], [146, 60]],
      static: [
        { name: 'LM', pts: [[146, 60], [178, 80]], d0: 4.4, d1: 4.2 },
        { name: 'LCx', pts: [[178, 80], [152, 112], [124, 160], [104, 220], [96, 290], [92, 345]], d0: 3.2, d1: 1.6 }
      ],
      main: [[178, 80], [214, 108], [250, 148], [281, 200], [305, 255], [322, 306], [332, 356]],
      branches: [
        { name: '対角枝', at: 7.5, rel: [[0, 0], [34, 4], [76, 26], [112, 64], [130, 104]], d0: 2.4, d1: 1.3 },
        { name: '中隔枝', at: 20, rel: [[0, 0], [-22, 14], [-40, 40]], d0: 1.2, d1: 0.7 },
        { name: '', at: 64, rel: [[0, 0], [26, 18], [44, 52]], d0: 1.7, d1: 1.0 }
      ],
      labels: [['LAD', 330, 340], ['LCx', 70, 300]]
    },
    quiz(M) {
      let msa = null;
      for (const m of M) if (m.stentA > 0 && (!msa || m.stentA < msa.stentA)) msa = m;
      const dref = maxOver(M, this.refDist[0], this.refDist[1], 'lumA');
      const pref = maxOver(M, this.refProx[0], this.refProx[1], 'lumA');
      const mean = (dref.lumA + pref.lumA) / 2;
      const exp = msa.stentA / mean;
      const gapM = maxOver(M, 36, 44, 'gap');
      const n1 = numOpts(msa.stentA, 'mm²', [1, 1.5, 0.65, 2.0]);
      const q = [];
      q.push(shuffleQ({ q: '最小ステント面積（MSA）に最も近いのはどれですか？', opts: n1.opts, ans: 0,
        ex: `MSAは ${f2(msa.stentA)} mm²（${msa.z.toFixed(1)} mm）。非LM病変のIVUS目標（EAPCI: >5.5 mm²）を下回ります。` }, 404));
      q.push({ q: 'ステント拡張率（MSA／平均参照内腔面積）は？', opts: ['70%未満', '70〜80%', '80〜90%', '90%以上'], ans: exp < 0.7 ? 0 : exp < 0.8 ? 1 : exp < 0.9 ? 2 : 3,
        ex: `遠位参照 ${f2(dref.lumA)} mm²、近位参照 ${f2(pref.lumA)} mm²、平均 ${f2(mean)} mm²。拡張率 ${(exp * 100).toFixed(0)}%（EAPCIの目標は >80%）。遠位参照比でも ${(msa.stentA / dref.lumA * 100).toFixed(0)}%（ULTIMATE: ≥90%）。` });
      q.push({ q: 'ステント近位部の所見は？', opts: ['圧着不良（ストラットと血管壁の間に血流）', '組織逸脱（tissue protrusion）', '異常なし'], ans: 0,
        ex: `近位部はテーパリングで参照径が大きく、3.0 mmステントが壁から最大 ${f2(gapM.gap)} mm 離れています。>0.4 mm・長さ >1 mm の圧着不良は補正が推奨されます。` });
      q.push({ q: '遠位エッジの所見は？', opts: ['中膜に達する解離（長さ >3 mm）', '内膜に限局した小フラップ（対処不要）', '壁内血腫', '異常なし'], ans: 0,
        ex: '遠位エッジから約4 mmにわたり約90°の解離フラップがあり、偽腔は中膜に達しています。ULTIMATE基準の「中膜に達する長さ >3 mmの解離」に該当し、追加治療を考慮します。' });
      q.push({ q: '拡張不良の主な原因は？', opts: ['ステント背後の石灰化（約210°）', 'ステント径の選択ミス', 'ステント破損'], ans: 0,
        ex: 'MSA部位でステント背後に約210°、厚さ約0.65 mmの表在性石灰化を認めます。前処置が不十分だった可能性があります。' });
      return q;
    },
    strategy: [
      { id: 'under', q: '拡張不良への対処', max: 8, opts: [
        { t: 'ステント内に収まる長さのNC／超高耐圧バルーンで高圧拡張', p: 8, fb: 'まず試みる標準的な対処です。バルーンはステント内に収め、エッジ損傷を避けます。' },
        { t: 'ELCA（造影剤注入下）で石灰化に亀裂を入れ、NCで高圧拡張', p: 6, fb: '高圧NCで拡張しない場合の選択肢です。' },
        { t: 'ステント内でIVL', p: 4, fb: '拡張不良ステントへのIVLは報告がありますが、本邦では適応外使用です。' },
        { t: 'ステントより長いNCで高圧拡張', p: 1, fb: 'ステント外の血管を損傷し、エッジ解離を悪化させます。' },
        { t: '追加ステント（stent-in-stent）', p: 1, fb: '拡張不良の原因を解決しません。' } ] },
      { id: 'mal', q: '近位部の圧着不良', max: 4, opts: [
        { t: 'NC 3.5 mmで近位部を後拡張', p: 4, fb: '近位参照部の内腔径に合わせた後拡張です。' },
        { t: '経過観察', p: 1, fb: '>0.4 mm・>1 mmの圧着不良は補正が推奨されます（EAPCI）。' },
        { t: 'NC 4.5 mmで後拡張', p: 1, fb: '過大で、近位エッジ損傷のリスクがあります。' } ] },
      { id: 'dis', q: '遠位エッジ解離', max: 6, opts: [
        { t: '追加ステント（短いDES）で解離をカバー', p: 6, fb: '中膜に達する >3 mmの解離は追加ステントを考慮します。' },
        { t: '経過観察', p: 0, fb: 'ULTIMATE基準の主要解離に該当し、経過観察は推奨されません。' },
        { t: '長時間の低圧バルーン拡張', p: 2, fb: '小さな解離では選択肢になりますが、本例では不十分です。' } ] },
      { id: 'order', q: '進め方', max: 2, opts: [
        { t: '各処置の後にIVUSで再評価する', p: 2, fb: '処置ごとに効果と新たな問題を確認します。' },
        { t: 'すべての処置後に最後に1回だけ評価する', p: 1, fb: '途中の問題を見逃す可能性があります。' } ] }
    ]
  };

  IV.SCENARIOS = [SC.calc, SC.atten, SC.lmt, SC.post];
  IV.SC = SC;
})();
