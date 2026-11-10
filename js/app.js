/* IVUS Simulator — UI controller */
(function () {
  'use strict';
  const IV = window.IV;
  const { clamp } = IV.util;
  const $ = s => document.querySelector(s);
  const DZ = IV.DZ;
  const zi = z => clamp(Math.round(z / DZ), 0, IV.NS - 1);
  const f1 = v => v.toFixed(1), f2 = v => v.toFixed(2);

  const TEACH = {
    calc: {
      pts: [
        'IVUSカルシウムスコア 2点以上では、ステント留置前にアテレクトミーやIVLで石灰化を修飾します。',
        '多重反射を伴わない厚い石灰化はバルーンでは割れにくく、高圧での破裂・穿孔のリスクがあります。アブレーションで石灰化が薄くなると、NC・スコアリングで亀裂が入りやすくなります。',
        'ロータブレーターはバー/血管径比 0.5〜0.6、回転数低下 5,000 rpm 以内を目安に、ペッキング操作で進めます。',
        '最終IVUSでMSA（>5.5 mm²）と拡張率（>80%）、エッジを確認します。'
      ],
      refs: ['Zhang M, et al. Circ Cardiovasc Interv 2021;14:e010296（IVUSカルシウムスコア）', 'Räber L, et al. EuroIntervention 2018;14:656-677（EAPCI専門家コンセンサス）', 'Zhang J, et al. J Am Coll Cardiol 2018;72:3126-37（ULTIMATE）']
    },
    atten: {
      pts: [
        '減衰角度 >180°・長さ ≥5 mm、プラーク破綻の併存は、no-reflowの高リスク所見です。',
        'フィルター型末梢保護、ダイレクトステント、過度な前拡張・後拡張の回避でリスクを下げます。',
        'no-reflow時は冠動脈内血管拡張薬（ニコランジル・ニトロプルシドなど）や吸引で対応します。追加の高圧拡張は無効です。'
      ],
      refs: ['Endo M, et al. JACC Cardiovasc Interv 2010（減衰長・プラーク破綻とno-reflow）', 'Wu X, et al. JACC Cardiovasc Interv 2011（HORIZONS-AMI IVUS: 減衰スコア）', 'Hibi K, et al. Circulation 2018（VAMPIRE 3: 減衰長 ≥5 mmへの末梢保護）']
    },
    lmt: {
      pts: [
        'Medina 1,1,0でLCx入口部が保たれていれば、provisional（LM→LADクロスオーバー）が基本です。',
        'ステント径は遠位（LAD）参照に合わせ、LM部はカリナ直前からのPOTで最適化します。ステントの最大拡張径に注意します。',
        'クロスオーバー後のLCxの造影上の狭窄は、多くが機能的に有意ではありません。FFRなどで評価し、必要時のみKBT → re-POTを行います。',
        'MSA目標: LCx入口部 5、LAD入口部 6、POC 7、LM 8 mm²（5-6-7-8ルール、アジア人データ）。欧米データではより大きな値が報告されています。'
      ],
      refs: ['Kang SJ, et al. Circ Cardiovasc Interv 2011;4:562-9（5-6-7-8ルール）', 'Räber L, et al. EuroIntervention 2018;14:656-677', 'Johnson TW, et al. Eur Heart J 2026（EAPCI/EBC LM imaging consensus）']
    },
    post: {
      pts: [
        'EAPCI: MSA >5.5 mm²・拡張率 >80%。ULTIMATE: MSA >5.0 mm² または遠位参照の90%以上。',
        '拡張不良はステント内に収まるNC／超高耐圧バルーンで対処し、改善しなければELCA（造影剤）などを考慮します。',
        '>0.4 mm・>1 mm長の圧着不良は補正を考慮します。テーパリング血管では近位部の後拡張が必要です。',
        '中膜に達する >3 mmのエッジ解離（ULTIMATE）は、追加ステントを考慮します。'
      ],
      refs: ['Zhang J, et al. J Am Coll Cardiol 2018;72:3126-37（ULTIMATE）', 'Räber L, et al. EuroIntervention 2018;14:656-677（EAPCI専門家コンセンサス）']
    }
  };

  const S = {
    freq: '60', screen: 'home', C: null, mode: 'observe', phase: 'observe',
    z: 0, playing: false, speed: 2, contours: true, labels: false, motion: true,
    tool: null, caliper: { type: null, pts: [] }, view: 'latest', cut: 0, t: 0,
    tray: { group: 'balloon', key: 'nc', D: 3.0, L: 12, zc: 30, extra: {} },
    active: null, holding: false, lmodeDirty: true, quizDone: false, planDone: false
  };

  /* ---------- renderers ---------- */
  const ivusR = new IV.IvusRenderer($('#ivus'), 480);
  const angioR = new IV.Angio($('#angio'));
  const lm = new IV.LMode(90);
  const heroR = new IV.IvusRenderer($('#heroIvus'), 360);
  const heroSlices = IV.buildSlices(IV.SC.calc);
  const heroM = IV.measureAll(heroSlices);
  let heroZ = 8;

  /* ---------- utilities ---------- */
  let toastT = 0;
  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast show ' + (kind || '');
    clearTimeout(toastT); toastT = setTimeout(() => (t.className = 'toast'), 2600);
  }
  IV.toast = toast;
  function setFreq(f) {
    S.freq = f;
    ivusR.setMode(f); heroR.setMode(f);
    S.lmodeDirty = true;
    document.querySelectorAll('[data-freq]').forEach(b => b.classList.toggle('on', b.dataset.freq === f));
    $('#tFreq').textContent = f === '60' ? '60 MHz' : '20 MHz';
    $('#ivusTag').textContent = IV.MODES[f].label;
  }

  /* ---------- home ---------- */
  function renderHome() {
    const list = $('#caseList');
    list.innerHTML = IV.SCENARIOS.map(s => `
      <article class="card">
        <div class="card-no">CASE ${String(s.no).padStart(2, '0')}</div>
        <h3>${s.title}</h3>
        <div class="vessel">${s.vessel}</div>
        <div class="tags">${s.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
        <p>${s.patient}</p>
        <div class="card-actions">
          <button type="button" class="btn small" data-open="${s.id}" data-mode="observe">観察モード</button>
          <button type="button" class="btn primary small" data-open="${s.id}" data-mode="scenario">シナリオに挑戦</button>
        </div>
      </article>`).join('');
    list.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openCase(b.dataset.open, b.dataset.mode)));
  }

  function showHome() {
    S.screen = 'home';
    S.playing = false; S.active = null; S.holding = false;
    $('#home').hidden = false; $('#caseView').hidden = true;
    $('#caseTitle').textContent = ''; $('#vitals').innerHTML = '';
    $('#dock').hidden = true;
    window.scrollTo(0, 0);
  }

  /* ---------- case ---------- */
  function openCase(id, mode) {
    const scn = IV.SC[id];
    const C = IV.newCase(scn, mode, (Date.now() % 100000) + 7);
    S.C = C; S.mode = mode; S.phase = mode === 'observe' ? 'observe' : 'quiz';
    S.quizDone = false; S.planDone = false; S.active = null; S.holding = false;
    S.view = 'latest'; S.caliper = { type: null, pts: [] }; S.tool = null;
    C.viewSlices = IV.cloneSlices(C.slices); C.viewM = C.Mpre; C.stale = false;
    C.quiz = scn.quiz(C.Mpre, C.slices);
    C.quizAns = new Array(C.quiz.length).fill(null);
    const mla = scn.preStented ? C.Mpre.reduce((a, m) => (m.stentA > 0 && (!a || m.stentA < a.stentA) ? m : a), null) : IV.mutil.minOver(C.Mpre, scn.lesion[0], scn.lesion[1], 'lumA');
    S.z = mla ? mla.z : 0;
    S.tray = { group: 'balloon', key: 'nc', D: 3.0, L: 12, zc: (scn.lesion[0] + scn.lesion[1]) / 2, extra: {} };
    angioR.setCase(C);
    S.lmodeDirty = true;
    S.screen = 'case';
    $('#home').hidden = true; $('#caseView').hidden = false;
    $('#caseTitle').textContent = `CASE ${String(scn.no).padStart(2, '0')}　${scn.title}（${scn.vessel}）・${mode === 'observe' ? '観察モード' : 'シナリオモード'}`;
    updateToggles();
    renderVitals();
    renderSide();
    window.scrollTo(0, 0);
    setTimeout(() => IV.help.tour('case'), 450);
  }

  function viewSrc() {
    const C = S.C;
    if (S.view === 'pre') return { slices: C.pre, M: C.Mpre };
    return { slices: C.viewSlices, M: C.viewM };
  }

  function runIVUS(silent) {
    const C = S.C;
    C.viewSlices = IV.cloneSlices(C.slices);
    C.viewM = C.M;
    C.imaging++;
    C.stale = false;
    S.view = 'latest';
    S.lmodeDirty = true;
    S.z = 0; S.playing = true;
    updateToggles();
    if (!silent) { IV.logEv(C, `IVUSプルバック（${C.imaging}回目）`, 'info'); toast('IVUSプルバックを開始しました'); }
  }

  function renderVitals() {
    const C = S.C; if (!C) return;
    const v = C.vitals;
    const bpCls = v.sbp < 90 ? 'bad' : v.sbp < 105 ? 'mid' : '';
    const timi = C.timi;
    $('#vitals').innerHTML = `
      <span class="vit ${bpCls}"><b>BP</b>${v.sbp}/${v.dbp}</span>
      <span class="vit ${v.hr > 105 || v.hr < 55 ? 'mid' : ''}"><b>HR</b>${v.hr}</span>
      <span class="vit ${timi < 3 ? 'bad' : ''}"><b>TIMI</b>${timi}</span>
      <span class="vit ${/上昇/.test(v.st) ? 'bad' : ''}"><b>ST</b>${v.st}</span>`;
  }

  function updateToggles() {
    $('#tContours').classList.toggle('on', S.contours);
    $('#tLabels').classList.toggle('on', S.labels);
    $('#tMotion').classList.toggle('on', S.motion);
    $('#toolDist').classList.toggle('on', S.tool === 'dist');
    $('#toolArc').classList.toggle('on', S.tool === 'arc');
    const C = S.C;
    const showCmp = C && S.mode === 'scenario' && (C.imaging > 0 || C.scn.preStented && C.devices.length);
    $('#cmpGroup').hidden = !showCmp;
    $('#vLatest').classList.toggle('on', S.view === 'latest');
    $('#vPre').classList.toggle('on', S.view === 'pre');
    $('#playBtn').textContent = S.playing ? '❚❚ 停止' : '▶ プルバック';
    let tag = '';
    if (C && S.mode === 'scenario') {
      if (S.view === 'pre') tag = '治療前';
      else if (C.imaging > 0) tag = `撮像 ${C.imaging}回目${C.stale ? '・治療後は未撮像' : ''}`;
      else if (C.stale) tag = '治療後は未撮像';
    }
    $('#viewTag').textContent = tag;
  }

  /* ---------- side panel ---------- */
  const STEPS = [['quiz', 'READ', '読影'], ['plan', 'PLAN', '戦略'], ['treat', 'TREAT', '治療'], ['result', 'REVIEW', '評価']];
  function renderSteps() {
    const nav = $('#steps');
    if (S.mode === 'observe') { nav.innerHTML = `<div class="step on"><b>VIEW</b>観察モード</div>`; return; }
    const cur = STEPS.findIndex(s => s[0] === S.phase);
    nav.innerHTML = STEPS.map((s, i) => `<div class="step ${i === cur ? 'on' : i < cur ? 'done' : ''}"><b>${s[1]}</b>${s[2]}</div>`).join('');
  }

  const PHASE_TIPS = {
    observe: ['画像をスクロール・タップして所見を探します。', 'h-basic'],
    quiz: ['IVUSを見ながら全問に答え、「回答を確定する」を押します。', 'h-scenario'],
    plan: ['各項目で最も適切な方針を1つずつ選びます。', 'h-scenario'],
    treat: ['デバイスを選ぶ → 位置を合わせる → 病変へ進める → 長押しで加圧 → 減圧して抜去 → IVUSで確認。', 'h-treat'],
    result: ['判定基準ごとの合否と減点の内訳を確認できます。', 'h-criteria']
  };
  function renderSide() {
    renderSteps();
    const b = $('#sideBody');
    if (S.phase !== 'treat') { $('#dock').hidden = true; }
    const tip = PHASE_TIPS[S.phase];
    let body = '';
    if (S.phase === 'observe') body = observeHTML();
    else if (S.phase === 'quiz') body = quizHTML();
    else if (S.phase === 'plan') body = planHTML();
    else if (S.phase === 'treat') body = treatHTML();
    else if (S.phase === 'result') body = resultHTML();
    b.innerHTML = (tip ? `<div class="side-help"><span>${tip[0]}</span><button type="button" data-help="${tip[1]}">詳しく</button></div>` : '') + body;
    b.querySelectorAll('[data-help]').forEach(x => x.addEventListener('click', () => IV.help.open(x.dataset.help)));
    bindSide();
    updateToggles();
  }

  function caseBox() {
    const s = S.C.scn;
    return `<div class="box"><h3>症例</h3><p>${s.patient}</p><div class="tags">${s.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div></div>`;
  }

  function landmarks() {
    const C = S.C, s = C.scn, M = C.Mpre, mu = IV.mutil;
    const L = [];
    const add = (label, m) => m && L.push({ label, z: m.z });
    if (s.preStented) {
      add('最小ステント面積（MSA）', M.reduce((a, m) => (m.stentA > 0 && (!a || m.stentA < a.stentA) ? m : a), null));
      add('近位部の圧着不良', mu.maxOver(M, 36, 44, 'gap'));
      add('遠位エッジ解離', M[zi(14.5)]);
    } else add('最小内腔面積（MLA）', mu.minOver(M, s.lesion[0], s.lesion[1], 'lumA'));
    if (s.id === 'calc') { add('全周性石灰化（360°）', M[zi(28)]); add('多重反射を伴う薄い石灰化', M[zi(48.6)]); add('深在性石灰化', M[zi(10)]); add('対角枝の分岐部', M[zi(44)]); }
    if (s.id === 'atten') { add('減衰プラーク（最大角度）', mu.maxOver(M, s.lesion[0], s.lesion[1], 'attArc')); add('プラーク破綻（空洞）', M[zi(32.2)]); add('血栓', M[zi(29)]); add('右室枝', M[zi(49.2)]); }
    if (s.id === 'lmt') { add('LAD入口部', M[zi(41)]); add('POC・LCx分岐部', M[zi(46.2)]); add('LM本幹の最小内腔', mu.minOver(M, 48.5, 58, 'lumA')); }
    add('遠位参照部', mu.maxOver(M, s.refDist[0], s.refDist[1], 'lumA'));
    add('近位参照部', mu.maxOver(M, s.refProx[0], s.refProx[1], 'lumA'));
    return L;
  }

  function observeHTML() {
    const L = landmarks();
    return `${caseBox()}
      <div class="box"><h3>見どころへ移動</h3>
        <div class="jump">${L.map(l => `<button type="button" class="btn small" data-jump="${l.z}"><span class="mono">${f1(l.z)} mm</span>${l.label}</button>`).join('')}</div>
        <p class="small" style="margin-top:8px">「所見ラベル」をオンにすると、断層像に所見名が表示されます。</p>
      </div>
      <div class="box"><h3>画像の見方</h3>
        <div class="legend">
          <span class="sw" style="background:var(--accent)"></span><span>内腔（Lumen）</span>
          <span class="sw" style="background:var(--amber)"></span><span>外弾性板（EEM）・点線は音響陰影部の推定</span>
          <span class="sw" style="background:#8ceb78"></span><span>ステント</span>
          <span class="sw" style="background:#ff8040"></span><span>石灰化の範囲</span>
          <span class="sw" style="background:#ffe14d"></span><span>手動計測（距離・角度）</span>
        </div>
        <p class="small" style="margin-top:8px">断層像の白点は1 mm間隔の目盛です。L-modeは左が遠位、右が近位です。シネ画像・L-modeをタップすると、その位置の断層像に移動します。</p>
      </div>
      <button type="button" class="btn primary block" id="toScenario">このケースのシナリオに挑戦</button>`;
  }

  function quizHTML() {
    const C = S.C;
    const done = S.quizDone;
    const right = C.quiz.filter((q, i) => C.quizAns[i] === q.ans).length;
    return `${caseBox()}
      <div class="box"><h3>読影 — IVUSを見て答えてください</h3>
      ${C.quiz.map((q, i) => `
        <div class="q"><div class="q-title">Q${i + 1}. ${q.q}</div>
          ${q.opts.map((o, k) => {
            let cls = C.quizAns[i] === k ? 'sel' : '';
            if (done) cls = k === q.ans ? 'right' : C.quizAns[i] === k ? 'wrong' : '';
            return `<button type="button" class="opt ${cls}" data-q="${i}" data-k="${k}" ${done ? 'disabled' : ''}><span class="dot"></span><span>${o}</span></button>`;
          }).join('')}
          ${done ? `<div class="ex ${C.quizAns[i] === q.ans ? 'good' : 'bad'}">${C.quizAns[i] === q.ans ? '正解。' : '不正解。'}${q.ex}</div>` : ''}
        </div>`).join('')}
      </div>
      ${done ? `<div class="box"><p><b>読影 ${right}/${C.quiz.length} 問正解</b>（${Math.round((right / C.quiz.length) * 20)} / 20点）</p><button type="button" class="btn primary block" id="toPlan">治療戦略の立案へ</button></div>`
        : `<button type="button" class="btn primary block" id="submitQuiz" ${C.quizAns.some(a => a === null) ? 'disabled' : ''}>回答を確定する</button>`}`;
  }

  function planHTML() {
    const C = S.C, scn = C.scn, done = S.planDone;
    let pts = 0;
    scn.strategy.forEach(g => { if (C.plan[g.id] != null) pts += g.opts[C.plan[g.id]].p; });
    return `<div class="box"><h3>治療戦略の立案</h3><p class="small">IVUS所見をもとに、各項目で最も適切なものを選んでください。</p>
      ${scn.strategy.map(g => `
        <div class="q"><div class="q-title">${g.q}</div>
          ${g.opts.map((o, k) => {
            const sel = C.plan[g.id] === k;
            const best = Math.max(...g.opts.map(x => x.p));
            let cls = sel ? 'sel' : '';
            if (done) cls = o.p === best ? 'right' : sel ? 'wrong' : '';
            return `<button type="button" class="opt ${cls}" data-g="${g.id}" data-k="${k}" ${done ? 'disabled' : ''}><span class="dot"></span><span>${o.t}</span>${done ? `<span class="pts">${o.p}/${g.max}</span>` : ''}</button>`;
          }).join('')}
          ${done ? `<div class="ex ${g.opts[C.plan[g.id]].p === Math.max(...g.opts.map(x => x.p)) ? 'good' : 'bad'}">${g.opts[C.plan[g.id]].fb}</div>` : ''}
        </div>`).join('')}
      </div>
      ${done ? `<div class="box"><p><b>戦略 ${pts} / 20点</b>　選んだ戦略に縛られず、実際の手技はIVUSを見ながら自由に行えます。</p><button type="button" class="btn primary block" id="toTreat">治療を開始する</button></div>`
        : `<button type="button" class="btn primary block" id="submitPlan" ${scn.strategy.some(g => C.plan[g.id] == null) ? 'disabled' : ''}>戦略を確定する</button>`}`;
  }

  /* ---------- treatment panel ---------- */
  function devDefaults(key) {
    const C = S.C, dev = IV.DEV[key], scn = C.scn;
    const t = S.tray;
    t.key = key;
    const pick = (arr, v) => arr.reduce((a, x) => (Math.abs(x - v) < Math.abs(a - v) ? x : a), arr[0]);
    const want = { sc: 2.0, nc: 3.0, opn: 3.0, score: 2.5, cut: 2.5, des: 3.0, dcb: 3.0, ivl: 3.0, ra: 1.5, oas: 1.25, elca: 1.4, filter: 4.0, kbt: 3.5 }[key];
    t.D = pick(dev.D, want);
    t.L = dev.L ? dev.L[Math.min(1, dev.L.length - 1)] : 0;
    if (key === 'des') t.L = scn.id === 'lmt' ? 28 : scn.id === 'post' ? 12 : 28;
    t.extra = key === 'oas' ? { speed: 'low' } : key === 'elca' ? { fluence: 60, rate: 40, medium: 'saline' } : key === 'kbt' ? { D2: 3.0 } : {};
    if (key === 'filter') t.zc = Math.max(4, scn.lesion[0] - 9);
    else if (key === 'kbt') t.zc = 44;
    else t.zc = clamp(t.zc, t.L / 2, IV.L - t.L / 2);
  }

  function devRange() {
    const t = S.tray;
    if (t.key === 'kbt') return { z0: 38, z1: 50 };
    if (t.key === 'filter') return { z0: t.zc - 1, z1: t.zc + 1 };
    return { z0: clamp(t.zc - t.L / 2, 0, IV.L), z1: clamp(t.zc + t.L / 2, 0, IV.L) };
  }

  function trayHTML() {
    const t = S.tray, C = S.C;
    const g = IV.DEV_GROUPS.find(x => x.id === t.group);
    const dev = IV.DEV[t.key];
    const opt = (arr, v, fmt) => arr.map(x => `<option value="${x}" ${x == v ? 'selected' : ''}>${fmt ? fmt(x) : x}</option>`).join('');
    const groups = IV.DEV_GROUPS.slice();
    const keys = g.keys.concat(t.group === 'balloon' && C.scn.id === 'lmt' ? ['kbt'] : []);
    let params = '';
    if (['balloon', 'stent', 'dcb', 'ivl'].includes(dev.cat)) {
      params = `<label>径 (mm)<select id="pD">${opt(dev.D, t.D, x => x.toFixed(2))}</select></label>
        <label>長さ (mm)<select id="pL">${opt(dev.L, t.L)}</select></label>`;
      if (dev.cat === 'stent') params += `<p class="small" style="grid-column:1/-1;margin:0">最大拡張径（シミュレータ設定値）: ${IV.stentMaxD(t.D)} mm</p>`;
    } else if (dev.cat === 'kbt') {
      params = `<label>LAD側 (mm)<select id="pD">${opt(dev.D, t.D, x => x.toFixed(2))}</select></label>
        <label>LCx側 (mm)<select id="pD2">${opt(dev.D2, t.extra.D2, x => x.toFixed(2))}</select></label>`;
    } else if (dev.cat === 'ra') {
      params = `<label>バー径 (mm)<select id="pD">${opt(dev.D, t.D, x => x.toFixed(2))}</select></label><label>回転数<select disabled><option>160,000 rpm</option></select></label>`;
    } else if (dev.cat === 'oas') {
      params = `<label>クラウン<select disabled><option>1.25 mm</option></select></label>
        <label>速度<select id="pSpeed"><option value="low" ${t.extra.speed === 'low' ? 'selected' : ''}>低速</option><option value="high" ${t.extra.speed === 'high' ? 'selected' : ''}>高速</option></select></label>`;
    } else if (dev.cat === 'elca') {
      params = `<label>カテーテル径 (mm)<select id="pD">${opt(dev.D, t.D, x => x.toFixed(1))}</select></label>
        <label>照射液<select id="pMed"><option value="saline" ${t.extra.medium === 'saline' ? 'selected' : ''}>生理食塩水</option><option value="contrast" ${t.extra.medium === 'contrast' ? 'selected' : ''}>造影剤</option></select></label>
        <label>フルエンス (mJ/mm²)<select id="pFlu">${opt([45, 60, 80], t.extra.fluence)}</select></label>
        <label>繰り返し (Hz)<select id="pRate">${opt([25, 40, 80], t.extra.rate)}</select></label>`;
    }
    const r = devRange();
    let place = '';
    if (['balloon', 'stent', 'dcb', 'ivl'].includes(dev.cat)) {
      place = `<div class="place"><span>位置（バルーン中心）<span class="mono" id="plRead">${f1(r.z0)}–${f1(r.z1)} mm</span></span>
        <input type="range" id="pZ" min="${t.L / 2}" max="${IV.L - t.L / 2}" step="0.2" value="${t.zc}" aria-label="デバイスの位置"></div>`;
    } else if (dev.cat === 'filter') {
      place = `<div class="place"><span>展開位置（病変より遠位）<span class="mono" id="plRead">${f1(t.zc)} mm</span></span>
        <input type="range" id="pZ" min="2" max="40" step="0.2" value="${t.zc}" aria-label="フィルター展開位置"></div>`;
    } else if (dev.cat === 'kbt') {
      place = `<p class="small" style="margin-top:8px">LADバルーンはLM遠位〜LAD入口部（38–50 mm）、LCxバルーンはLCx入口部に配置します。</p>`;
    } else {
      place = `<p class="small" style="margin-top:8px">病変近位から遠位へ（${f1(C.scn.lesion[1] + 4)} → ${f1(Math.max(0.5, C.scn.lesion[0] - 2))} mm）進めます。</p>`;
    }
    const busy = !!S.active;
    return `<div class="box"><h3>デバイス</h3>
      <div class="tabs" role="tablist">${groups.map(x => `<button type="button" class="tab ${x.id === t.group ? 'on' : ''}" data-group="${x.id}">${x.label}</button>`).join('')}</div>
      <div class="devlist">${keys.map(k => `<button type="button" class="dev ${k === t.key ? 'on' : ''}" data-dev="${k}">${IV.DEV[k].name}<small>${devNote(k)}</small></button>`).join('')}</div>
      <div class="params">${params}</div>
      ${place}
      <div class="row"><button type="button" class="btn primary" id="advance" ${busy ? 'disabled' : ''}>${dev.cat === 'filter' ? 'フィルターを展開' : 'デバイスを病変へ進める'}</button></div>
    </div>`;
  }

  function devNote(k) {
    const d = IV.DEV[k];
    if (d.NP) return `公称圧 ${d.NP} atm・RBP ${d.RBP} atm`;
    return { ra: 'バー/血管径比 0.5〜0.6 が目安', oas: '低速→高速。ゆっくり前進', elca: '血栓・軟性プラーク、拡張不良ステント', filter: '病変遠位の正常部に展開' }[k] || '';
  }

  function treatHTML() {
    const C = S.C;
    const lcx = C.lcx ? `<div class="box"><h3>LCx入口部</h3>
        <dl class="kv"><dt>造影上の狭窄</dt><dd>${C.lcx.crossed ? C.lcx.ds + '%' : '— （未カバー）'}</dd><dt>FFR</dt><dd>${C.lcx.ffrMeasured != null ? C.lcx.ffrMeasured : '未測定'}</dd><dt>POT / KBT</dt><dd>${C.potDone ? 'POT済' : 'POT未'} / ${C.kbtDone ? (C.rePot ? 'KBT→re-POT済' : 'KBT済') : '未'}</dd></dl>
        <div class="row"><button type="button" class="btn small" id="ffrBtn">LCxのFFRを測定</button></div></div>` : '';
    return `${trayHTML()}
      <div class="box"><h3>IVUS</h3><p class="small">治療の効果は、IVUSを再撮像すると断層像に反映されます（シネ画像はリアルタイム）。</p>
        <div class="row"><button type="button" class="btn primary" id="ivusBtn">IVUSプルバックを実施</button><span class="small" style="align-self:center">撮像 ${C.imaging} 回</span></div></div>
      ${lcx}
      <div class="box"><h3>手技ログ</h3>${C.log.length ? `<ul class="log">${C.log.slice().reverse().map(l => `<li class="${l.k}">${l.t}</li>`).join('')}</ul>` : '<p class="small">まだ手技は行っていません。</p>'}</div>
      <button type="button" class="btn danger block" id="endProc">手技を終了して評価へ</button>`;
  }

  /* ---------- dock (active device) ---------- */
  let dockRefs = null;
  function renderDock() {
    const d = $('#dock');
    const A = S.active;
    if (!A) { d.hidden = true; dockRefs = null; return; }
    d.hidden = false;
    if (A.type === 'inf') {
      const inf = A.inf, dev = inf.dev;
      const max = Math.max(dev.RBP + 6, 10);
      d.innerHTML = `<div class="dock-head"><b>${dev.name} ${inf.D.toFixed(2)}${inf.key === 'kbt' ? '/' + inf.extra.D2.toFixed(2) : ''} × ${inf.L} mm</b><span>${f1(inf.z0)}–${f1(inf.z1)} mm</span></div>
        <div style="display:flex;justify-content:space-between;align-items:end;gap:10px">
          <div class="big" id="dkP">0.0<small>atm</small></div>
          <div class="small mono" id="dkInfo" style="text-align:right"></div>
        </div>
        <div class="gauge"><div class="fill" id="dkFill"></div>
          <div class="mk" style="left:${(dev.NP / max) * 100}%"><i>NP ${dev.NP}</i></div>
          <div class="mk rbp" style="left:${(dev.RBP / max) * 100}%"><i>RBP ${dev.RBP}</i></div></div>
        <button type="button" class="hold" id="holdBtn">長押しで加圧</button>
        <div class="row" style="margin-top:0">
          ${inf.key === 'ivl' ? '<button type="button" class="btn" id="pulseBtn">パルス照射（10回）</button>' : ''}
          <button type="button" class="btn primary" id="deflBtn">減圧して抜去</button>
        </div>`;
      dockRefs = { p: $('#dkP'), fill: $('#dkFill'), info: $('#dkInfo'), max };
    } else {
      const ab = A.ab;
      const name = IV.DEV[ab.key].name;
      const sub = ab.key === 'ra' ? `バー ${ab.D} mm` : ab.key === 'oas' ? (ab.opts.speed === 'high' ? '高速' : '低速') : `${ab.D} mm・${ab.opts.fluence} mJ/mm²・${ab.opts.rate} Hz・${ab.opts.medium === 'contrast' ? '造影剤' : '生食'}`;
      d.innerHTML = `<div class="dock-head"><b>${name}</b><span>${sub}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:end;gap:10px">
          <div class="big" id="dkP">${ab.key === 'ra' ? '160,000<small>rpm</small>' : '—'}</div>
          <div class="small mono" id="dkInfo" style="text-align:right"></div>
        </div>
        ${ab.key === 'ra' ? '<div class="meter" aria-label="回転数低下"><i id="dkFill" style="width:0"></i></div><p class="small" style="margin:0">回転数低下 5,000 rpm 以内を目安に、押しすぎず短いストロークで（ペッキング）。</p>' : '<div class="meter"><i id="dkFill" style="width:0"></i></div>'}
        <button type="button" class="hold" id="holdBtn">長押しで前進</button>
        <div class="row" style="margin-top:0"><button type="button" class="btn primary" id="deflBtn">終了して抜去</button></div>`;
      dockRefs = { p: $('#dkP'), fill: $('#dkFill'), info: $('#dkInfo') };
    }
    const hb = $('#holdBtn');
    const on = e => { e.preventDefault(); S.holding = true; hb.classList.add('active'); try { hb.setPointerCapture(e.pointerId); } catch (_) { } };
    const off = () => { S.holding = false; hb.classList.remove('active'); };
    hb.addEventListener('pointerdown', on);
    hb.addEventListener('pointerup', off); hb.addEventListener('pointercancel', off); hb.addEventListener('lostpointercapture', off);
    hb.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); S.holding = true; hb.classList.add('active'); } });
    hb.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') off(); });
    hb.addEventListener('contextmenu', e => e.preventDefault());
    $('#deflBtn').addEventListener('click', finishActive);
    setTimeout(() => IV.help.tour('dock'), 250);
    const pb = $('#pulseBtn');
    if (pb) pb.addEventListener('click', () => {
      const r = IV.ivlCycle(S.C, S.active.inf);
      if (!r.ok) toast(r.msg, 'warn'); else toast(`パルス照射 ${S.active.inf.cycles * 10} 回目まで${r.added ? `・石灰化に新たな亀裂 ${r.added}箇所` : ''}`);
    });
  }

  function updateDock() {
    const A = S.active; if (!A || !dockRefs) return;
    if (A.type === 'inf') {
      const inf = A.inf;
      dockRefs.p.innerHTML = `${f1(inf.p)}<small>atm</small>`;
      dockRefs.fill.style.width = `${clamp(inf.p / dockRefs.max, 0, 1) * 100}%`;
      dockRefs.fill.classList.toggle('over', inf.p > inf.dev.RBP);
      let info = `最大 ${f1(inf.pmax)} atm`;
      if (inf.key === 'dcb') info += `<br>拡張時間 ${Math.round(inf.simTime)} 秒`;
      if (inf.key === 'ivl') info += `<br>パルス ${inf.cycles * 10} / 120`;
      if (inf.live.length) {
        let mn = 9, mx = 0; inf.live.forEach(l => { mn = Math.min(mn, l.R); mx = Math.max(mx, l.R); });
        info += `<br>バルーン径 ${f2(2 * mn)}–${f2(2 * mx)} mm`;
      }
      dockRefs.info.innerHTML = info;
    } else {
      const ab = A.ab;
      if (ab.key === 'ra') {
        dockRefs.p.innerHTML = `${Math.round(ab.rpm).toLocaleString()}<small>rpm</small>`;
        const drop = ab.base - ab.rpm;
        dockRefs.fill.style.width = `${clamp(drop / 20000, 0, 1) * 100}%`;
        dockRefs.fill.style.background = drop > 5000 ? 'var(--danger)' : drop > 3000 ? 'var(--warn)' : 'var(--ok)';
      } else {
        dockRefs.p.innerHTML = `${f1(ab.pos)}<small>mm</small>`;
        dockRefs.fill.style.width = `${clamp((ab.start - ab.pos) / (ab.start - ab.end), 0, 1) * 100}%`;
      }
      dockRefs.info.innerHTML = `位置 ${f1(ab.pos)} mm<br>パス ${ab.passes}${ab.key === 'oas' ? (ab.dir > 0 ? '（後退中）' : '（前進中）') : ''}`;
    }
  }

  function startActive() {
    const C = S.C, t = S.tray, dev = IV.DEV[t.key];
    if (dev.cat === 'filter') {
      if (C.filter) { toast('フィルターはすでに展開されています', 'warn'); return; }
      IV.deployFilter(C, t.zc); toast('末梢保護フィルターを展開しました'); renderSide(); return;
    }
    if (['ra', 'oas', 'elca'].includes(dev.cat)) {
      S.active = { type: 'abl', ab: IV.startAblation(C, t.key, t.D, t.extra) };
      C.stale = true;
      renderDock(); renderSide(); return;
    }
    const r = devRange();
    const cross = IV.canCross(C, t.key, t.D, r.z0);
    if (!cross.ok) {
      C.crossFail++;
      IV.logEv(C, `${dev.short} ${t.D}mm が通過不能（${f1(cross.z)} mm、MLD ${f2(cross.mld)} mm）`, 'warn');
      toast(`${dev.short} ${t.D} mm が病変を通過しません（${f1(cross.z)} mm、MLD ${f2(cross.mld)} mm）`, 'warn');
      renderSide(); return;
    }
    const inf = IV.startInflation(C, t.key, t.D, t.key === 'kbt' ? 12 : t.L, t.key === 'kbt' ? 44 : t.zc, t.key === 'kbt' ? { D2: t.extra.D2 } : {});
    S.active = { type: 'inf', inf };
    C.stale = true;
    renderDock(); renderSide();
  }

  function finishActive() {
    const C = S.C, A = S.active;
    if (!A) return;
    S.holding = false;
    if (A.type === 'inf') {
      const inf = A.inf;
      const res = IV.finishInflation(C, inf);
      if (inf.pmax < 1) toast('拡張せずに抜去しました');
      else {
        let msg = `最大 ${f1(inf.pmax)} atm で拡張しました`;
        if (res.dissection) msg += `・解離が発生（${res.dissection.type === 'media' ? '中膜到達' : '内膜'}）`;
        toast(msg, res.dissection ? 'warn' : '');
      }
      if (res.perforation) C.perfZ = res.perfZ;
    } else {
      IV.finishAblation(C, A.ab);
      toast(`${IV.DEV[A.ab.key].short} を抜去しました（${A.ab.passes} パス）`);
    }
    S.active = null;
    renderDock(); renderSide(); renderVitals();
    processEvents();
  }

  /* ---------- events (modal) ---------- */
  function processEvents() {
    const C = S.C;
    if (!C || !$('#modal').hidden) return;
    const key = C.pendingEvents.shift();
    if (!key) { if (C.ended) goResult(); return; }
    if (key === 'perforation' && C.perfZ == null) C.perfZ = (C.scn.lesion[0] + C.scn.lesion[1]) / 2;
    if (S.active) { // abort active device
      if (S.active.type === 'inf') IV.finishInflation(C, S.active.inf); else IV.finishAblation(C, S.active.ab);
      S.active = null; renderDock();
    }
    const ev = IV.EVENTS[key](C);
    if (ev.onShow) ev.onShow();
    renderVitals();
    let rounds = 0;
    const m = $('#modal');
    const showChoices = (note) => {
      m.innerHTML = `<div class="modal-card ${ev.sev === 'warn' ? 'warn' : ''}"><h3>${ev.title}</h3><p>${ev.body}</p>${note ? `<div class="ex">${note}</div>` : ''}
        <div class="choices">${ev.choices.map((c, i) => `<button type="button" class="opt" data-c="${i}"><span class="dot"></span><span>${c.t}</span></button>`).join('')}</div></div>`;
      m.hidden = false;
      m.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
        const r = ev.choices[+b.dataset.c].fx();
        rounds++;
        renderVitals();
        const again = ev.repeatUntil && !ev.repeatUntil() && rounds < (ev.maxRounds || 1);
        m.innerHTML = `<div class="modal-card ${ev.sev === 'warn' ? 'warn' : ''}"><h3>${ev.title}</h3>
          <div class="ex ${r.ok ? 'good' : 'bad'}">${r.text}</div>
          <button type="button" class="btn primary" id="evNext">${again ? '次の対応を選ぶ' : '続ける'}</button></div>`;
        $('#evNext').addEventListener('click', () => {
          if (again) { showChoices(`現在 TIMI ${C.timi}。`); return; }
          if (ev.onEnd) ev.onEnd();
          m.hidden = true; m.innerHTML = '';
          renderVitals(); renderSide();
          processEvents();
        });
        $('#evNext').focus();
      }));
      const first = m.querySelector('[data-c]'); if (first) first.focus();
    };
    showChoices();
  }

  /* ---------- result ---------- */
  function goResult() {
    const C = S.C;
    if (S.active) { if (S.active.type === 'inf') IV.finishInflation(C, S.active.inf); else IV.finishAblation(C, S.active.ab); S.active = null; renderDock(); }
    if (C.filter) { IV.logEv(C, 'フィルターを回収', 'info'); C.filter = null; }
    IV.refreshMeasures(C);
    runIVUS(true);
    S.phase = 'result';
    C.result = IV.evaluate(C);
    renderSide();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resultHTML() {
    const C = S.C, E = C.result, T = TEACH[C.scn.id];
    const bar = (lab, v, m) => `<div class="bar-row"><span>${lab}</span><span class="track"><i style="width:${(v / m) * 100}%"></i></span><span class="mono">${Math.round(v)}/${m}</span></div>`;
    return `<div class="box"><h3>総合評価</h3>
        <div class="score"><div class="grade g-${E.grade}">${E.grade}</div><div><div class="total">${E.total}<small> / 100</small></div><div class="small">最終IVUSを自動で撮像しました。断層像で結果を確認し、「治療前」と比較できます。</div></div></div>
        <div class="bars">${bar('読影', E.quizPts, 20)}${bar('戦略', E.planPts, 20)}${bar('手技結果', E.resPts, 40)}${bar('安全性', E.safePts, 20)}</div>
      </div>
      <div class="box"><h3>手技結果（最終IVUS）</h3>
        <ul class="crit">${E.R.map(r => `<li><span class="pf ${r.pass ? 'p' : 'f'}">${r.pass ? '✓' : '✗'}</span><span>${r.label}<small>${r.detail}</small></span></li>`).join('')}</ul>
        <p class="small" style="margin-top:8px">参照内腔面積: 遠位 ${f2(E.dref.lumA)} mm² / 近位 ${f2(E.pref.lumA)} mm²</p>
      </div>
      <div class="box"><h3>安全性</h3>${E.pens.length ? `<ul class="crit">${E.pens.map(p => `<li><span class="pf f">−${p.pts}</span><span>${p.label}</span></li>`).join('')}</ul>` : '<p>合併症・減点はありません。</p>'}</div>
      <div class="box"><h3>このケースのポイント</h3><ul style="margin:0;padding-left:18px;display:grid;gap:6px;font-size:13.5px">${T.pts.map(p => `<li>${p}</li>`).join('')}</ul>
        <h4>参考文献</h4><ol class="refs">${T.refs.map(r => `<li>${r}</li>`).join('')}</ol></div>
      <div class="box"><h3>手技ログ</h3><ul class="log">${C.log.map(l => `<li class="${l.k}">${l.t}</li>`).join('') || '<li>記録なし</li>'}</ul></div>
      <div class="row"><button type="button" class="btn primary" id="retry">もう一度挑戦</button><button type="button" class="btn" id="goHome">ケース一覧へ</button></div>`;
  }

  /* ---------- side bindings ---------- */
  function bindSide() {
    const C = S.C;
    const on = (sel, fn) => { const e = $(sel); if (e) e.addEventListener('click', fn); };
    document.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => { S.z = +b.dataset.jump; S.playing = false; updateToggles(); }));
    on('#toScenario', () => openCase(C.scn.id, 'scenario'));
    document.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { C.quizAns[+b.dataset.q] = +b.dataset.k; renderSide(); }));
    on('#submitQuiz', () => { S.quizDone = true; renderSide(); });
    on('#toPlan', () => { S.phase = 'plan'; renderSide(); $('#sideBody').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    document.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', () => { C.plan[b.dataset.g] = +b.dataset.k; renderSide(); }));
    on('#submitPlan', () => { S.planDone = true; renderSide(); });
    on('#toTreat', () => { S.phase = 'treat'; devDefaults(S.tray.key); renderSide(); setTimeout(() => IV.help.tour('treat'), 300); });
    document.querySelectorAll('[data-group]').forEach(b => b.addEventListener('click', () => { if (S.active) return; S.tray.group = b.dataset.group; devDefaults(IV.DEV_GROUPS.find(g => g.id === b.dataset.group).keys[0]); renderSide(); }));
    document.querySelectorAll('[data-dev]').forEach(b => b.addEventListener('click', () => { if (S.active) return; devDefaults(b.dataset.dev); renderSide(); }));
    const chg = (sel, fn) => { const e = $(sel); if (e) e.addEventListener('change', () => { fn(e.value); renderSide(); }); };
    chg('#pD', v => (S.tray.D = +v));
    chg('#pL', v => { S.tray.L = +v; S.tray.zc = clamp(S.tray.zc, S.tray.L / 2, IV.L - S.tray.L / 2); });
    chg('#pD2', v => (S.tray.extra.D2 = +v));
    chg('#pSpeed', v => (S.tray.extra.speed = v));
    chg('#pMed', v => (S.tray.extra.medium = v));
    chg('#pFlu', v => (S.tray.extra.fluence = +v));
    chg('#pRate', v => (S.tray.extra.rate = +v));
    const pz = $('#pZ');
    if (pz) pz.addEventListener('input', () => {
      S.tray.zc = +pz.value;
      const r = devRange();
      $('#plRead').textContent = S.tray.key === 'filter' ? `${f1(S.tray.zc)} mm` : `${f1(r.z0)}–${f1(r.z1)} mm`;
    });
    on('#advance', startActive);
    on('#ivusBtn', () => { if (S.active) { toast('デバイスを抜去してから撮像してください', 'warn'); return; } runIVUS(); renderSide(); });
    on('#ffrBtn', () => {
      if (!C.lcx.crossed) { toast('LCx入口部はまだステントで覆われていません', 'warn'); return; }
      C.lcx.ffrMeasured = C.lcx.ffr;
      IV.logEv(C, `LCx FFR ${C.lcx.ffr}（造影上の狭窄 ${C.lcx.ds}%）`, C.lcx.ffr < 0.8 ? 'warn' : 'info');
      toast(`LCx FFR ${C.lcx.ffr}`);
      renderSide();
    });
    on('#endProc', () => {
      const m = $('#modal');
      m.innerHTML = `<div class="modal-card warn"><h3>手技を終了しますか？</h3><p>最終IVUSを撮像し、評価を行います。終了後は治療を追加できません。</p>
        <div class="row"><button type="button" class="btn primary" id="cfYes">終了して評価する</button><button type="button" class="btn" id="cfNo">戻る</button></div></div>`;
      m.hidden = false;
      $('#cfYes').addEventListener('click', () => { m.hidden = true; goResult(); });
      $('#cfNo').addEventListener('click', () => { m.hidden = true; });
      $('#cfYes').focus();
    });
    on('#retry', () => openCase(C.scn.id, 'scenario'));
    on('#goHome', showHome);
  }

  /* ---------- stage controls ---------- */
  function bindStage() {
    $('#homeBtn').addEventListener('click', showHome);
    $('#helpBtn').addEventListener('click', () => IV.help.open(S.screen === 'case' && S.phase === 'treat' ? 'h-treat' : null));
    $('#heroHelp').addEventListener('click', () => IV.help.open());
    document.querySelectorAll('[data-freq]').forEach(b => b.addEventListener('click', () => setFreq(b.dataset.freq)));
    $('#tFreq').addEventListener('click', () => setFreq(S.freq === '60' ? '20' : '60'));
    $('#playBtn').addEventListener('click', () => { if (!S.playing && S.z >= IV.L - 0.01) S.z = 0; S.playing = !S.playing; updateToggles(); });
    $('#stepBack').addEventListener('click', () => { S.playing = false; S.z = clamp(S.z - DZ, 0, IV.L); updateToggles(); });
    $('#stepFwd').addEventListener('click', () => { S.playing = false; S.z = clamp(S.z + DZ, 0, IV.L); updateToggles(); });
    $('#zSlider').addEventListener('input', e => { S.playing = false; S.z = +e.target.value; updateToggles(); });
    $('#speedSel').addEventListener('change', e => (S.speed = +e.target.value));
    $('#tContours').addEventListener('click', () => { S.contours = !S.contours; updateToggles(); });
    $('#tLabels').addEventListener('click', () => { S.labels = !S.labels; updateToggles(); });
    $('#tMotion').addEventListener('click', () => { S.motion = !S.motion; updateToggles(); });
    const setTool = t => { S.tool = S.tool === t ? null : t; S.caliper = { type: S.tool, pts: [] }; updateToggles(); };
    $('#toolDist').addEventListener('click', () => setTool('dist'));
    $('#toolArc').addEventListener('click', () => setTool('arc'));
    $('#vLatest').addEventListener('click', () => { S.view = 'latest'; S.lmodeDirty = true; updateToggles(); });
    $('#vPre').addEventListener('click', () => { S.view = 'pre'; S.lmodeDirty = true; updateToggles(); });
    $('#cutSlider').addEventListener('input', e => { S.cut = +e.target.value; S.lmodeDirty = true; });
    // angio tap
    $('#angio').addEventListener('pointerdown', e => {
      if (!S.C) return;
      const r = e.currentTarget.getBoundingClientRect();
      const k = 480 / r.width;
      const z = angioR.zAtPoint((e.clientX - r.left) * k, (e.clientY - r.top) * k);
      if (z != null) { S.z = z; S.playing = false; updateToggles(); }
    });
    // L-mode drag
    const lmc = $('#lmode');
    const lmSet = e => { const r = lmc.getBoundingClientRect(); S.z = clamp(((e.clientX - r.left) / r.width) * IV.L, 0, IV.L); S.playing = false; };
    let lmDown = false;
    lmc.addEventListener('pointerdown', e => { lmDown = true; lmSet(e); updateToggles(); });
    lmc.addEventListener('pointermove', e => { if (lmDown) lmSet(e); });
    window.addEventListener('pointerup', () => (lmDown = false));
    // calipers
    $('#ivusOv').addEventListener('pointerdown', e => {
      if (!S.tool) return;
      const r = e.currentTarget.getBoundingClientRect();
      const maxR = ivusR.maxR;
      const x = ((e.clientX - r.left) / r.width - 0.5) * 2 * maxR, y = ((e.clientY - r.top) / r.height - 0.5) * 2 * maxR;
      if (S.caliper.pts.length >= 2) S.caliper.pts = [];
      S.caliper.type = S.tool; S.caliper.pts.push({ x, y });
    });
    window.addEventListener('keydown', e => {
      if (S.screen !== 'case' || !$('#help').hidden || IV.help.tourActive() || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || document.activeElement.id === 'holdBtn') return;
      if (e.key === 'ArrowRight') { S.z = clamp(S.z + DZ, 0, IV.L); S.playing = false; }
      if (e.key === 'ArrowLeft') { S.z = clamp(S.z - DZ, 0, IV.L); S.playing = false; }
    });
    window.addEventListener('blur', () => (S.holding = false));
  }

  /* ---------- frame loop ---------- */
  let last = performance.now(), ivusAcc = 1, lastZ = -1, lastSliderZ = -1;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; S.t += dt;
    try {
      if (S.screen === 'home') heroFrame(dt); else caseFrame(dt);
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }

  let heroAcc = 1;
  function heroFrame(dt) {
    heroZ += dt * 2.2; if (heroZ > 52) heroZ = 8;
    heroAcc += dt; if (heroAcc < 1 / 24) return; heroAcc = 0;
    const i = zi(heroZ);
    heroR.render(heroSlices[i], { phase: (S.t * 66 / 60) % 1, motion: true, sliceIndex: i, mixNext: heroZ / DZ - Math.floor(heroZ / DZ) });
    const m = heroM[i];
    $('#heroRead').textContent = `${f1(heroZ)} mm · Lumen ${f2(m.lumA)} mm²${m.caArc ? ` · Ca ${Math.round(m.caArc)}°` : ''}`;
  }

  function caseFrame(dt) {
    const C = S.C; if (!C) return;
    const phase = (S.t * (C.vitals.hr || 70) / 60) % 1;
    if (S.playing) { S.z += S.speed * dt; if (S.z >= IV.L) { S.z = IV.L; S.playing = false; updateToggles(); } }
    if (Math.abs(S.z - lastSliderZ) > 1e-6) { $('#zSlider').value = S.z; $('#zRead').textContent = `${f1(S.z)} mm`; lastSliderZ = S.z; }
    // active device
    const A = S.active;
    if (A) {
      if (A.type === 'inf') {
        const inf = A.inf;
        let p = inf.p;
        if (S.holding) {
          const cap = inf.key === 'ivl' ? 10 : inf.dev.RBP + 6;
          p = Math.min(cap, p + (inf.key === 'ivl' ? 2.5 : 3.2) * dt);
        }
        const ev = IV.inflateTo(C, inf, p, dt);
        if (ev.includes('crack')) toast('石灰化に亀裂が入り、バルーンのくびれが解除されました');
        if (ev.includes('rupture')) { toast('バルーン破裂！', 'danger'); finishActive(); }
      } else {
        const ev = IV.ablationTick(C, A.ab, dt, S.holding);
        if (ev.includes('rpmdrop')) toast('回転数低下 >5,000 rpm — 一度引いて回転数を回復させてください', 'warn');
        if (ev.includes('stall')) toast('回転数が大きく低下（>20,000 rpm）。slow flow・スタックのリスク', 'danger');
        if (ev.includes('pass')) toast(`パス ${A.ab.passes} 完了`);
        if (ev.includes('perforation')) { C.pendingEvents.push('perforation'); C.perfZ = A.ab.pos; finishActive(); }
      }
      updateDock();
    }
    // IVUS
    ivusAcc += dt;
    const zChanged = Math.abs(S.z - lastZ) > 1e-6;
    if (ivusAcc >= 1 / 30 || zChanged) {
      ivusAcc = 0; lastZ = S.z;
      const src = viewSrc();
      const fi = S.z / DZ, i = clamp(Math.floor(fi), 0, IV.NS - 1);
      const fr = ivusR.render(src.slices[i], { phase, motion: S.motion, sliceIndex: i, mixNext: fi - i });
      const ov = $('#ivusOv');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(ov.getBoundingClientRect().width * dpr) || 480;
      if (ov.width !== W) { ov.width = W; ov.height = W; }
      const m = src.M[i];
      IV.drawIvusOverlay(ov.getContext('2d'), W, fr, m, {
        dpr, topPad: 24, contours: S.contours, labels: S.labels, readouts: S.contours, cut: S.cut,
        zLabel: `${f1(S.z)} mm  ${m.zone}`, modeLabel: IV.MODES[S.freq].label, caliper: S.caliper
      });
    }
    // angio
    let device = null;
    if (A && A.type === 'inf') device = { kind: A.inf.dev.cat, live: A.inf.p > 0.3 ? A.inf.live : null, z0: A.inf.z0, z1: A.inf.z1, p: A.inf.p, D2: A.inf.extra.D2 };
    else if (A && A.type === 'abl') device = { kind: 'ablation', pos: A.ab.pos, D: A.ab.key === 'oas' ? 1.25 : A.ab.D };
    else if (S.phase === 'treat' && !['ra', 'oas', 'elca'].includes(IV.DEV[S.tray.key].cat)) { const r = devRange(); device = { kind: 'plan', z0: r.z0, z1: r.z1 }; }
    angioR.render({ z: S.z, t: S.t, phase, motion: S.motion, device, showCath: !A, fluoro: !!(A && (A.type === 'abl' || A.inf.p > 0.3)) });
    // L-mode
    drawLMode(device);
  }

  function drawLMode(device) {
    const C = S.C, cv = $('#lmode');
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    if (S.lmodeDirty) { lm.build(viewSrc().slices, S.freq, S.cut); S.lmodeDirty = false; }
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lm.cv, 0, 0, w, h);
    const X = z => (z / IV.L) * w;
    if (device && device.z0 != null) {
      ctx.fillStyle = 'rgba(242,180,52,0.16)'; ctx.fillRect(X(device.z0), 0, X(device.z1) - X(device.z0), h);
      ctx.strokeStyle = 'rgba(242,180,52,0.9)'; ctx.lineWidth = 1.5 * dpr;
      [device.z0, device.z1].forEach(z => { ctx.beginPath(); ctx.moveTo(X(z), 0); ctx.lineTo(X(z), h); ctx.stroke(); });
    }
    if (device && device.kind === 'ablation') { ctx.strokeStyle = 'rgba(255,128,64,0.9)'; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.moveTo(X(device.pos), 0); ctx.lineTo(X(device.pos), h); ctx.stroke(); }
    if (C.filter) { ctx.fillStyle = 'rgba(200,200,255,0.8)'; ctx.fillRect(X(C.filter.z) - 1.5 * dpr, h - 8 * dpr, 3 * dpr, 8 * dpr); }
    ctx.strokeStyle = 'rgba(56,214,232,0.95)'; ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.moveTo(X(S.z), 0); ctx.lineTo(X(S.z), h); ctx.stroke();
    ctx.font = `${10 * dpr}px "IBM Plex Mono", monospace`; ctx.fillStyle = 'rgba(214,231,240,0.7)';
    for (let mm = 10; mm < IV.L; mm += 10) { ctx.fillRect(X(mm), h - 4 * dpr, 1, 4 * dpr); ctx.fillText(String(mm), X(mm) + 2 * dpr, h - 4 * dpr); }
  }

  /* ---------- init ---------- */
  renderHome();
  bindStage();
  setFreq('60');
  requestAnimationFrame(frame);
  // test hook
  window.IVAPP = { S, openCase, goResult, startActive, finishActive, runIVUS, renderSide, devDefaults };
})();
