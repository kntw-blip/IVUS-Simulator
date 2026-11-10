/* IVUS Simulator — in-app manual (使い方) and first-run guided tour */
(function () {
  'use strict';
  const IV = window.IV;
  const $ = s => document.querySelector(s);

  const SECTIONS = [
    { id: 'h-about', title: 'できること', html: `
      <p>IVUS（血管内超音波）の断層像とシネ画像（血管造影）を同期させて見ながら、冠動脈病変の読影・治療戦略の立案・治療手技・治療後の評価までを練習できるシミュレータです。</p>
      <ul>
        <li><b>観察モード</b>：画像を自由に見て、所見の見え方を学びます。点数はつきません。</li>
        <li><b>シナリオモード</b>：読影 → 戦略 → 治療 → 評価の順に進み、100点満点で採点されます。</li>
      </ul>
      <p class="small">画像はすべてプログラムで合成したもので、実在の患者画像ではありません。</p>` },
    { id: 'h-start', title: 'はじめ方', html: `
      <ol>
        <li>トップ画面でIVUSカテーテルの種類（<b>60 MHz 機械式</b> または <b>20 MHz 電子式</b>）を選びます。あとから画面下の「60 MHz」ボタンでも切り替えられます。</li>
        <li>ケースのカードで <b>観察モード</b> か <b>シナリオに挑戦</b> を押します。</li>
        <li>初めてケースを開くと、画面の各部を順に案内するガイドが表示されます。</li>
        <li>左上の <b>IVUS SIM</b> を押すと、いつでもケース一覧に戻れます。</li>
      </ol>` },
    { id: 'h-screen', title: '画面の見方', html: `
      <dl class="hdl">
        <dt>シネ（左上）</dt><dd>合成した冠動脈造影です。血管の外側にある<span class="c-acc">水色の目印</span>が、いまIVUSで見ている位置（トランスデューサの位置）です。血管をタップすると、その位置の断層像に移動します。</dd>
        <dt>IVUS断層像（右上）</dt><dd>血管を輪切りにした画像です。中央の黒い円がIVUSカテーテル、白い点は1 mm間隔の目盛です。</dd>
        <dt>L-mode（中段）</dt><dd>プルバック全体を縦に切った長軸像です。<b>左が遠位、右が近位</b>。水色の縦線が現在位置で、タップやドラッグで移動できます。</dd>
        <dt>右側のパネル</dt><dd>症例情報と、読影・戦略・治療・評価の操作を行う場所です（スマホでは画像の下）。</dd>
      </dl>
      <h4>線の色</h4>
      <div class="legend">
        <span class="sw" style="background:var(--accent)"></span><span>内腔（Lumen）の輪郭</span>
        <span class="sw" style="background:var(--amber)"></span><span>外弾性板（EEM）。点線は音響陰影で見えない部分の推定</span>
        <span class="sw" style="background:#8ceb78"></span><span>ステントの輪郭</span>
        <span class="sw" style="background:#ff8040"></span><span>石灰化の範囲</span>
        <span class="sw" style="background:#ffe14d"></span><span>手動計測（距離・角度）</span>
      </div>
      <h4>断層像の数値</h4>
      <dl class="hdl">
        <dt>Lumen</dt><dd>内腔面積（mm²）</dd>
        <dt>EEM</dt><dd>外弾性板で囲まれた血管面積（mm²）</dd>
        <dt>PB</dt><dd>プラーク負荷 =（EEM − 内腔）÷ EEM</dd>
        <dt>MLD / MxLD</dt><dd>内腔の最小径 / 最大径（mm）</dd>
        <dt>Stent</dt><dd>ステント面積（mm²、ステント部のみ）</dd>
        <dt>Ca</dt><dd>石灰化の角度（内腔中心から測った連続した最大の弧）</dd>
      </dl>` },
    { id: 'h-basic', title: '基本操作', html: `
      <dl class="hdl">
        <dt>▶ プルバック</dt><dd>遠位から近位へ、自動でカテーテルを引き戻しながら再生します。もう一度押すと停止します。速度は 0.5〜5 mm/s から選べます。</dd>
        <dt>スライダー・−／＋</dt><dd>位置を手動で動かします。−／＋は0.2 mmずつ。PCでは ← → キーでも動かせます。</dd>
        <dt>自動計測</dt><dd>輪郭線と数値の表示をオン・オフします。自分で読影したいときはオフにします。</dd>
        <dt>所見ラベル</dt><dd>石灰化・減衰プラーク・側枝・解離・圧着不良などの名前を断層像に表示します。</dd>
        <dt>心拍動</dt><dd>拍動による画像の動きをオン・オフします。</dd>
        <dt>距離</dt><dd>断層像を2回タップすると、その2点間の距離を表示します。3回目のタップで測り直しになります。</dd>
        <dt>角度</dt><dd>断層像を2回タップすると、内腔の中心から見た2点の間の角度（時計回り）を表示します。石灰化角度の確認に使います。</dd>
        <dt>最新 / 治療前</dt><dd>治療を始めると表示されます。治療前の画像と、最後に撮ったIVUS画像を切り替えて比べられます。</dd>
        <dt>L断面</dt><dd>L-modeで切る向き（角度）を変えます。断層像に橙色の点線で表示されます。</dd>
      </dl>` },
    { id: 'h-scenario', title: 'シナリオの進め方', html: `
      <ol>
        <li><b>読影（20点）</b>：IVUSを見てクイズに答えます。全問に答えると「回答を確定する」が押せるようになり、正解と解説が表示されます。</li>
        <li><b>戦略（20点）</b>：前処置、ステント径、最適化などの方針を選びます。確定すると各選択肢の解説が出ます。</li>
        <li><b>治療</b>：デバイスを選んで実際に手技を行います。選んだ戦略どおりでなくてもかまいません。</li>
        <li><b>評価（手技結果 40点・安全性 20点）</b>：「手技を終了して評価へ」を押すと最終IVUSが自動で撮像され、判定基準に沿って採点されます。</li>
      </ol>
      <p>総合点で S（90点以上）・A（80点以上）・B（65点以上）・C（50点以上）・D に判定されます。</p>` },
    { id: 'h-treat', title: '治療の操作', html: `
      <h4>基本の手順</h4>
      <ol>
        <li><b>デバイスを選ぶ</b>：上のタブ（バルーン／ステント／石灰化デバイス／ELCA／DCB／末梢保護）から選びます。</li>
        <li><b>サイズを選ぶ</b>：径と長さを選びます。</li>
        <li><b>位置を決める</b>：「位置」のスライダーで動かします。シネ画像に黒いマーカー、L-modeに橙色の範囲が表示されます。</li>
        <li><b>「デバイスを病変へ進める」</b>：病変が狭すぎると通過しないことがあります。その場合は小さいバルーンやアテレクトミーで先に広げます。</li>
        <li><b>「長押しで加圧」</b>：押している間、圧が上がります。指を離すとその圧で止まります。ゲージの<span class="c-amb">NP</span>は公称圧、<span class="c-red">RBP</span>は最大推奨圧で、RBPを超えると破裂することがあります。</li>
        <li><b>「減圧して抜去」</b>：ここで効果が確定し、記録に残ります。</li>
        <li><b>「IVUSプルバックを実施」</b>：治療の効果は、IVUSを撮り直すと断層像に反映されます。シネ画像は常に現在の状態です。</li>
      </ol>
      <p class="small">加圧中・アブレーション中のシネ画像は、造影剤を入れていない透視像になります。石灰化が強いところではバルーンにくびれが残り、亀裂が入るとくびれが取れます。</p>
      <h4>デバイスごとのコツ</h4>
      <dl class="hdl">
        <dt>バルーン・ステント</dt><dd>石灰化部ではNCや超高耐圧バルーンで高圧にします。後拡張のバルーンはステントの中に収め、ステントの外の血管を傷つけないようにします。ステントには最大拡張径があり、超えると減点されます。</dd>
        <dt>ロータブレーター</dt><dd>「長押しで前進」で近位から遠位へ進みます。石灰化に当たると回転数が下がります。<b>5,000 rpm以上下がったら指を離し、回転数を戻してから再び押す</b>（ペッキング）を繰り返します。遠位端に届くと1パス完了です。バー径は血管径の0.5〜0.6倍が目安です。</dd>
        <dt>OAS</dt><dd>低速か高速を選び、長押しでゆっくり前進します。遠位端で自動的に折り返し、戻りでも削ります。</dd>
        <dt>IVL</dt><dd>長押しで約4 atmまで加圧し、「パルス照射（10回）」を押して石灰化に亀裂を入れます（最大120回）。そのあと6 atm程度まで加圧してから減圧します。</dd>
        <dt>ELCA</dt><dd>ゆっくり前進して照射します。拡張不良のステントには、照射液を「造影剤」にすると石灰化に亀裂が入りやすくなります。</dd>
        <dt>DCB</dt><dd>公称圧付近で <b>30秒以上</b> 拡張を保ちます（パネルに拡張時間が出ます）。前処置が不十分だと評価で不利になります。</dd>
        <dt>末梢保護フィルター</dt><dd>病変より遠位の正常な部分を選んで展開します。</dd>
        <dt>LMT症例（POT・KBT）</dt><dd>POTは、NCバルーン（4.0 mm以上）の遠位端をカリナのすぐ近位（約48〜50 mm）に合わせて拡張します。キッシングバルーン（KBT）はバルーンのタブにあります。「LCxのFFRを測定」で側枝の機能評価ができます。</dd>
      </dl>` },
    { id: 'h-comp', title: '合併症が起きたら', html: `
      <p>手技の内容によって、no-reflow・冠動脈穿孔・解離・バルーン破裂が起きることがあります。no-reflowや穿孔が起きると画面中央に対応の選択肢が出るので、適切なものを選んでください。上部のBP・HR・TIMI・STの表示も変化します。穿孔が起きた場合、手技はそこで中止になります。</p>` },
    { id: 'h-criteria', title: '評価の基準', html: `
      <ul>
        <li><b>EAPCI専門家コンセンサス</b>：MSA >5.5 mm²（非LM）、拡張率（MSA／平均参照内腔面積）>80%、>0.4 mmかつ >1 mm長の圧着不良は補正。</li>
        <li><b>ULTIMATE基準</b>：MSA >5.0 mm² または遠位参照内腔面積の90%以上、エッジ5 mm部のプラーク負荷 <50%、中膜に達する >3 mmのエッジ解離がない。</li>
        <li><b>LM 5-6-7-8ルール</b>：LAD入口部 ≥6、POC ≥7、LM ≥8 mm²。</li>
        <li><b>IVUSカルシウムスコア</b>：270°超が5 mm以上、360°、石灰化結節、血管径 <3.5 mm を各1点。</li>
      </ul>` },
    { id: 'h-terms', title: '用語集', html: `
      <dl class="hdl">
        <dt>MLA / MSA</dt><dd>最小内腔面積 / 最小ステント面積</dd>
        <dt>参照部</dt><dd>病変の遠位・近位にある、比較的正常な部分</dd>
        <dt>NP / RBP</dt><dd>公称圧（表示径になる圧）/ 最大推奨圧</dd>
        <dt>POT</dt><dd>Proximal Optimization Technique。分岐部の近位側ステントを近位血管径に合わせて拡張する手技</dd>
        <dt>KBT</dt><dd>キッシングバルーン。本幹と側枝で同時にバルーンを拡張する手技</dd>
        <dt>TIMI</dt><dd>造影上の血流の評価（3が正常、低いほど遅延）</dd>
        <dt>FFR</dt><dd>冠血流予備量比。0.80以下で機能的に有意</dd>
        <dt>RA / OAS / IVL / ELCA</dt><dd>ロータブレーター / オービタルアテレクトミー / 血管内砕石術 / エキシマレーザー</dd>
        <dt>DCB</dt><dd>薬剤コーティングバルーン</dd>
      </dl>` },
    { id: 'h-note', title: '注意とライセンス', html: `
      <ul>
        <li>デバイスの挙動（コンプライアンス、最大拡張径、通過性、合併症の起こりやすさなど）は、教育用に簡略化したシミュレータ上の設定値です。実際の診療では各製品の添付文書と施設の方針に従ってください。</li>
        <li>本シミュレータは教育目的のもので、診断や治療の判断には使用できません。</li>
        <li>ライセンス：MIT License（Copyright © 2026 kntw-blip）。<a href="https://github.com/kntw-blip/IVUS-Simulator" target="_blank" rel="noopener">ソースコード（GitHub）</a></li>
      </ul>` }
  ];

  function helpHTML() {
    return `<div class="help-card" role="document">
      <div class="help-head"><h2>使い方</h2><button type="button" class="btn small" id="helpClose">閉じる</button></div>
      <nav class="help-nav" aria-label="目次">${SECTIONS.map(s => `<a href="#${s.id}" data-hnav="${s.id}">${s.title}</a>`).join('')}</nav>
      <div class="help-body" id="helpBody">
        ${SECTIONS.map(s => `<section id="${s.id}"><h3>${s.title}</h3>${s.html}</section>`).join('')}
        <div class="row"><button type="button" class="btn primary" id="helpTour">画面ガイドをもう一度見る</button></div>
      </div></div>`;
  }

  /* ---------- guided tour (coach marks) ---------- */
  const TOURS = {
    case: [
      { sel: '.angio-panel', title: 'シネ画像', text: '合成した冠動脈造影です。血管の横の水色の目印が、いまIVUSで見ている位置です。血管をタップすると、その位置の断層像に移動します。' },
      { sel: '.ivus-panel', title: 'IVUS断層像', text: '血管の輪切りです。水色の線が内腔、橙色の線が血管の外枠（EEM）。左上に面積やプラーク負荷が表示されます。' },
      { sel: '.lmode-panel', title: 'L-mode（長軸像）', text: '左が遠位、右が近位です。タップやドラッグで見たい位置へ移動できます。' },
      { sel: '.transport', title: 'プルバック', text: '「▶ プルバック」で遠位から近位へ自動再生します。スライダーや −／＋ で位置を細かく動かせます。' },
      { sel: '.toggles', title: '表示と計測', text: '輪郭線・所見ラベル・心拍動のオン／オフ、周波数の切替、距離・角度の手動計測ができます。' },
      { sel: '.side', title: '進行パネル', text: 'ここで症例を読み、操作を進めます。シナリオでは「読影 → 戦略 → 治療 → 評価」の順に進みます。' },
      { sel: '#helpBtn', title: '使い方', text: '操作に迷ったら、いつでもここから説明を読めます。' }
    ],
    treat: [
      { sel: '.tabs', title: 'デバイスの種類', text: 'バルーン・ステント・石灰化デバイスなどを選びます。その下でデバイスと径・長さを選びます。' },
      { sel: '#pZ', title: '位置を決める', text: 'スライダーで位置を合わせます。シネ画像に黒いマーカー、L-modeに橙色の範囲が出ます。' },
      { sel: '#advance', title: '病変へ進める', text: '準備ができたら押します。病変が狭すぎると通過しないこともあります。' },
      { sel: '#ivusBtn', title: 'IVUSで確認', text: '治療のあとはIVUSを撮り直して効果を確認します。断層像は撮り直したときに更新されます。' },
      { sel: '#endProc', title: '手技の終了', text: '満足できたら押します。最終IVUSが撮られ、評価画面に進みます。' }
    ],
    dock: [
      { sel: '#holdBtn', title: '長押しで操作', text: '押している間、加圧（アテレクトミーでは前進）します。指を離すとその状態で止まります。ゲージのRBPを超えると破裂することがあります。' },
      { sel: '#deflBtn', title: '効果を確定', text: '「減圧して抜去」で効果が確定します。そのあとIVUSを撮り直して結果を確認しましょう。' }
    ]
  };
  const KEY = k => 'ivusSim.tour.' + k;
  const seen = k => { try { return localStorage.getItem(KEY(k)) === '1'; } catch (_) { return false; } };
  const mark = k => { try { localStorage.setItem(KEY(k), '1'); } catch (_) { /* storage unavailable */ } };

  let tour = null;
  function startTour(name, force) {
    if (tour) return;
    if (!force && seen(name)) return;
    const steps = TOURS[name].filter(s => { const e = $(s.sel); return e && e.offsetParent !== null; });
    if (!steps.length) return;
    tour = { name, steps, i: 0 };
    mark(name);
    const ov = $('#coach');
    ov.hidden = false;
    show();
  }
  function endTour() { tour = null; const ov = $('#coach'); ov.hidden = true; ov.innerHTML = ''; }
  function show() {
    const st = tour.steps[tour.i];
    const el = $(st.sel);
    if (!el) { next(); return; }
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
    requestAnimationFrame(() => place(st, el));
  }
  function place(st, el) {
    if (!tour) return;
    const ov = $('#coach');
    const r = el.getBoundingClientRect();
    const pad = 6;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const cw = Math.min(340, vw - 24);
    const n = tour.steps.length, i = tour.i;
    let top = r.bottom + 12;
    const estH = 170;
    if (top + estH > vh) top = Math.max(12, r.top - estH - 12);
    if (top < 12 || r.height > vh * 0.6) top = Math.max(12, Math.min(vh - estH - 12, r.top + 12));
    const left = Math.max(12, Math.min(vw - cw - 12, r.left + r.width / 2 - cw / 2));
    ov.innerHTML = `
      <div class="coach-hole" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></div>
      <div class="coach-card" role="dialog" aria-live="polite" style="left:${left}px;top:${top}px;width:${cw}px">
        <div class="coach-step">${i + 1} / ${n}</div>
        <h3>${st.title}</h3><p>${st.text}</p>
        <div class="row" style="margin-top:6px">
          <button type="button" class="btn primary small" id="coachNext">${i === n - 1 ? '閉じる' : '次へ'}</button>
          ${i > 0 ? '<button type="button" class="btn small" id="coachPrev">戻る</button>' : ''}
          ${i < n - 1 ? '<button type="button" class="btn small" id="coachSkip">スキップ</button>' : ''}
        </div>
      </div>`;
    $('#coachNext').addEventListener('click', next);
    const p = $('#coachPrev'); if (p) p.addEventListener('click', () => { tour.i--; show(); });
    const s = $('#coachSkip'); if (s) s.addEventListener('click', endTour);
    $('#coachNext').focus({ preventScroll: true });
  }
  function next() { if (!tour) return; tour.i++; if (tour.i >= tour.steps.length) endTour(); else show(); }
  window.addEventListener('resize', () => { if (tour) show(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') { if (tour) endTour(); else closeHelp(); } });

  function openHelp(sectionId) {
    const h = $('#help');
    h.innerHTML = helpHTML();
    h.hidden = false;
    document.body.classList.add('noscroll');
    $('#helpClose').addEventListener('click', closeHelp);
    $('#helpTour').addEventListener('click', () => {
      closeHelp();
      const onCase = !$('#caseView').hidden;
      if (onCase) startTour('case', true);
      else IV.toast && IV.toast('ケースを開くと画面ガイドが表示されます');
    });
    h.querySelectorAll('[data-hnav]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const t = document.getElementById(a.dataset.hnav);
      if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }));
    h.addEventListener('click', e => { if (e.target === h) closeHelp(); });
    if (sectionId) { const t = document.getElementById(sectionId); if (t) t.scrollIntoView({ block: 'start' }); }
    $('#helpClose').focus();
  }
  function closeHelp() {
    const h = $('#help');
    if (h.hidden) return;
    h.hidden = true; h.innerHTML = '';
    document.body.classList.remove('noscroll');
  }

  IV.help = { open: openHelp, close: closeHelp, tour: startTour, tourActive: () => !!tour };
})();
