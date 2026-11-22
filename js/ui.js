/* 介面：工具列、圖形調色盤、屬性面板 */
(function () {
  const VL = window.VL, E = VL.editor, io = VL.io;
  const $ = (s, r) => (r || document).querySelector(s);
  const ui = (VL.ui = {});
  const SWATCH = ['#FFFFFF', '#F2F2F2', '#DDEBF7', '#E2F0D9', '#FFF2CC', '#FCE4D6', '#EADCF4', '#BDD7EE',
    '#5B9BD5', '#70AD47', '#FFC000', '#ED7D31', '#C00000', '#2F5597', '#7F7F7F', '#1F1F1F'];

  /* ---------- 訊息 ---------- */
  let toastTimer;
  ui.toast = function (msg, ms) {
    const t = $('#toast'), bad = /^⚠/.test(msg);
    // 阿拉蕾報告結果：成功時開心、出錯時困惑
    $('img', t).src = bad ? 'img/arale-puzzled.webp' : 'img/arale-cheer.webp';
    $('span', t).textContent = msg.replace(/^⚠\s*/, '');
    t.classList.toggle('bad', bad);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), ms || 3200);
  };
  ui.modal = function (html) {
    $('#modal .body').innerHTML = html;
    $('#modal').hidden = false;
  };
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) $('#modal').hidden = true; });
  ui.choose = function (found) {
    return new Promise((res) => {
      ui.modal('<h2>這個檔案內有多張可編輯的圖，請選擇要修改哪一張</h2>' +
        found.map((f, i) => `<button class="pick" data-i="${i}">第 ${i + 1} 張：${VL.esc((f.doc.nodes.find((n) => n.text) || {}).text || '未命名')}　<span class="muted">(${f.doc.nodes.length} 個圖形)</span></button>`).join(''));
      const body = $('#modal .body');
      body.onclick = (e) => {
        const b = e.target.closest('.pick');
        if (!b) return;
        body.onclick = null; $('#modal').hidden = true; res(found[+b.dataset.i]);
      };
    });
  };
  const guard = (fn, ok) => async () => {
    try { await fn(); if (ok) ui.toast(ok); } catch (err) { console.error(err); ui.toast('⚠ ' + (err.message || err), 6000); }
  };

  /* ---------- 手機版：側邊面板改為抽屜 ---------- */
  function closeDrawers() { document.body.classList.remove('show-palette', 'show-props'); }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-drawer]');
    if (b) { const c = 'show-' + b.dataset.drawer, on = document.body.classList.contains(c); closeDrawers(); if (!on) document.body.classList.add(c); }
    else if (e.target.id === 'scrim') closeDrawers();
  });

  /* ---------- 調色盤 ---------- */
  function buildPalette() {
    const pal = $('#palette');
    const grp = (cat) => Object.values(VL.shapes).filter((s) => s.cat === cat)
      .map((s) => `<button class="pal-item" draggable="true" data-type="${s.id}" title="${s.name}">${cat === 'icon' ? VL.render.thumb(s.id, 30, 30) : VL.render.thumb(s.id, 36, s.w === s.h ? 30 : 24)}</button>`).join('');
    pal.innerHTML =
      '<h3>甬道圖（泳道）</h3><div class="pal-wide">' +
      '<button draggable="true" data-type="pool-h">▤ 水平甬道</button><button draggable="true" data-type="pool-v">▥ 垂直甬道</button></div>' +
      '<h3>心智圖</h3><div class="pal-wide"><button draggable="true" data-type="mindmap">✳ 新增心智圖</button></div>' +
      '<h3>組織圖</h3><div class="pal-wide"><button draggable="true" data-type="orgchart">⛶ 新增組織圖</button></div>' +
      `<h3>流程圖</h3><div class="pal-grid">${grp('flow')}</div>` +
      `<h3>常用圖示</h3><div class="pal-grid">${grp('icon')}</div>`;
    pal.addEventListener('click', (e) => { const b = e.target.closest('[data-type]'); if (b) { E.addNode(b.dataset.type); closeDrawers(); } });
    pal.addEventListener('dragstart', (e) => { const b = e.target.closest('[data-type]'); if (b) e.dataTransfer.setData('text/vl-type', b.dataset.type); });
    const stage = $('#stage');
    stage.addEventListener('dragover', (e) => e.preventDefault());
    stage.addEventListener('drop', (e) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('text/vl-type');
      if (type) {
        const r = stage.getBoundingClientRect();
        E.addNode(type, (e.clientX - r.left - E.view.x) / E.view.z, (e.clientY - r.top - E.view.y) / E.view.z);
      } else if (e.dataTransfer.files[0]) guard(() => io.openFile(e.dataTransfer.files[0]))().then(syncOffice);
    });
  }

  /* ---------- 屬性面板 ---------- */
  const sw = (key) => `<div class="swatches" data-key="${key}">${SWATCH.map((c) => `<button style="background:${c}" data-c="${c}" title="${c}"></button>`).join('')}</div>`;
  function buildProps() {
    const nodes = E.selNodes(), edges = E.selEdges(), items = nodes.concat(edges);
    const p = $('#props');
    if (!items.length) {
      p.innerHTML = '<h3>屬性</h3><p class="muted">選取圖形或連接線後，可在此調整樣式。</p>' +
        '<h3>小技巧</h3><p class="muted">・滑鼠移到圖形上，從橘色圓點拖曳即可拉出連接線<br>・按兩下圖形或線條可輸入文字<br>・空白鍵＋拖曳 可平移畫布<br>・Ctrl＋滾輪 可縮放<br>・手機／平板：點一下選取、點兩下改字、單指拖空白處平移、雙指縮放</p>';
      return;
    }
    const st = items[0].style, pool = nodes.find((n) => n.type === 'pool'), mm = nodes.find((n) => n.mm);
    let h = '';
    if (nodes.length) {
      h += `<h3>填色</h3>${sw('fill')}<div class="row"><label>自訂</label><input type="color" data-key="fill" value="${/^#/.test(st.fill) ? st.fill : '#ffffff'}"><button data-set="fill:none">無填色</button></div>`;
    }
    h += `<h3>線條</h3>${sw('stroke')}
      <div class="row"><label>粗細</label><select data-key="strokeWidth" data-num>${[1, 1.5, 2, 3, 4].map((v) => `<option${v === st.strokeWidth ? ' selected' : ''}>${v}</option>`).join('')}</select>
      <select data-key="dash">${[['', '實線'], ['dash', '虛線'], ['dot', '點線']].map((v) => `<option value="${v[0]}"${v[0] === st.dash ? ' selected' : ''}>${v[1]}</option>`).join('')}</select></div>`;
    if (nodes.length) h += '<div class="row"><label></label><button data-set="stroke:none">無框線</button></div>';
    h += `<h3>文字</h3><div class="row"><label>大小</label><input type="number" min="8" max="72" data-key="fontSize" data-num value="${st.fontSize}">
      <input type="color" data-key="color" value="${st.color}" title="文字顏色">
      <button data-toggle="bold" class="${st.bold ? 'on' : ''}"><b>B</b></button></div>`;
    if (edges.length) {
      const e = edges[0];
      h += `<h3>連接線</h3><div class="row"><label>路徑</label><select data-edgekind><option value="elbow"${e.kind === 'elbow' ? ' selected' : ''}>直角</option><option value="straight"${e.kind === 'straight' ? ' selected' : ''}>直線</option></select></div>
        <div class="btns"><button data-toggle="startArrow" class="${e.style.startArrow ? 'on' : ''}">◀ 起點箭頭</button><button data-toggle="endArrow" class="${e.style.endArrow ? 'on' : ''}">終點箭頭 ▶</button></div>`;
    }
    if (pool) h += '<h3>甬道</h3><div class="btns"><button data-pool="add">＋ 新增泳道</button><button data-pool="remove">－ 移除最後</button></div><div class="btns"><button data-pool="flip">水平 ⇄ 垂直</button></div><p class="muted">選取甬道後，拖曳藍色方塊可調整各泳道大小；按兩下標題可改名稱。</p>';
    if (mm && VL.mm.isOrg(E.doc, mm)) h += '<h3>組織圖</h3><div class="btns"><button data-mm="child">＋ 下屬 (Tab)</button><button data-mm="sibling">＋ 同層 (Enter)</button></div><div class="btns"><button data-mm="staff">＋ 幕僚</button></div><p class="muted">・幕僚會掛在主管下方的兩側。<br>・協調關係：從方塊的橘色圓點拖到另一個方塊，會畫出虛線。<br>・按兩下或 F2 改文字；Shift+Enter 可換行。</p>';
    else if (mm) h += '<h3>心智圖</h3><div class="btns"><button data-mm="child">＋ 子主題 (Tab)</button><button data-mm="sibling">＋ 同層 (Enter)</button></div><div class="btns"><button data-mm="flip">移到另一側</button></div>';
    if (nodes.length) {
      h += '<h3>排列</h3><div class="btns"><button data-order="front">移到最上層</button><button data-order="back">移到最下層</button></div>';
      if (nodes.length > 1) h += '<div class="btns three">' + [['left', '靠左'], ['center', '水平置中'], ['right', '靠右'], ['top', '靠上'], ['middle', '垂直置中'], ['bottom', '靠下'], ['dh', '水平等距'], ['dv', '垂直等距']]
        .map((a) => `<button data-align="${a[0]}">${a[1]}</button>`).join('') + '</div>';
    }
    h += `<h3>　</h3><div class="btns">${items.length === 1 ? '<button data-edit>✎ 編輯文字</button>' : ''}<button data-del>刪除 (Del)</button></div>`;
    p.innerHTML = h;
  }
  function bindProps() {
    const p = $('#props');
    p.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const d = b.dataset;
      if (d.c) E.setStyle({ [b.parentNode.dataset.key]: d.c });
      else if (d.set) { const [k, v] = d.set.split(':'); E.setStyle({ [k]: v }); }
      else if (d.toggle) { const it = E.selNodes().concat(E.selEdges())[0]; E.setStyle({ [d.toggle]: !it.style[d.toggle] }); }
      else if (d.pool) E.pool(d.pool);
      else if (d.mm) { if (d.mm === 'flip') E.mmFlip(); else E.mmAdd(d.mm); }
      else if (d.order) E.order(d.order);
      else if (d.align) E.align(d.align);
      else if ('del' in d) E.del();
      else if ('edit' in d) { closeDrawers(); E.editSelected(); }
    });
    p.addEventListener('change', (e) => {
      const t = e.target, d = t.dataset;
      if ('edgekind' in d) E.setEdgeKind(t.value);
      else if (d.key) E.setStyle({ [d.key]: 'num' in d ? Math.max(0.5, +t.value || 1) : t.value });
    });
  }

  /* ---------- 工具列 ---------- */
  function syncOffice() {
    const g = $('#office-grp');
    g.hidden = !io.office;
    if (io.office) $('[data-act=saveback]').textContent = '💾 存回 ' + io.office.fileName;
  }
  const HELP = `
  <h2>使用說明</h2>
  <h4>基本操作</h4>
  <ul><li>左側點一下圖形（或拖曳到畫布）即可新增。</li>
  <li>滑鼠移到圖形上會出現<b>橘色連接點</b>，拖曳到另一個圖形即可連線；圖形移動時連線會跟著走。</li>
  <li>按兩下圖形／線條／甬道標題可編輯文字（<kbd>Ctrl</kbd>+<kbd>Enter</kbd> 完成，<kbd>Esc</kbd> 取消）。</li>
  <li><kbd>空白鍵</kbd>+拖曳或滑鼠右鍵拖曳可平移；<kbd>Ctrl</kbd>+滾輪縮放；<kbd>Ctrl</kbd>+<kbd>Z</kbd>/<kbd>Y</kbd> 復原重做；<kbd>Ctrl</kbd>+<kbd>D</kbd> 複製一份。</li></ul>
  <h4>手機與平板</h4>
  <ul><li>左下「＋ 圖形」開啟圖形清單，右下「屬性」調整樣式、編輯文字或刪除；工具列可左右滑動。</li>
  <li>點一下圖形選取（會出現橘色連接點，拖到另一個圖形即可連線）；點兩下改文字；單指拖曳空白處平移；雙指縮放。</li></ul>
  <h4>甬道圖</h4>
  <ul><li>新增水平或垂直甬道後，把流程圖形放進各泳道；搬移甬道時裡面的圖形會一起移動。</li>
  <li>選取甬道後，拖曳藍色方塊調整每條泳道的大小，右側面板可增減泳道。</li></ul>
  <h4>心智圖</h4>
  <ul><li>選取主題後按 <kbd>Tab</kbd> 新增子主題、<kbd>Enter</kbd> 新增同層主題、<kbd>F2</kbd> 改文字、<kbd>Del</kbd> 刪除整個分支。版面會自動排列。</li></ul>
  <h4>組織圖</h4>
  <ul><li>新增組織圖後，選取任一方塊按 <kbd>Tab</kbd> 新增下屬、<kbd>Enter</kbd> 新增同層、<kbd>F2</kbd> 改文字（<kbd>Shift</kbd>+<kbd>Enter</kbd> 換行）、<kbd>Del</kbd> 刪除整個分支。版面由上往下自動排列。</li>
  <li>右側面板的「＋ 幕僚」可在主管下方加上幕僚位置（秘書、特助、委員會等）。</li>
  <li><b>協調關係</b>：從方塊邊緣的橘色圓點拖到另一個方塊，會畫出虛線；選取該線可改成實線或加箭頭、按兩下可加文字。</li></ul>
  <h4>放進 Word / PowerPoint，並保持可修改</h4>
  <ul><li><b>PowerPoint</b>：按「PowerPoint」匯出，得到的是 PowerPoint <b>原生圖案與接點</b>，可直接在簡報內改字、改色、搬移，也可複製貼到 Word。</li>
  <li><b>Word</b>：按「Word」匯出，圖案放在 Word 的「繪圖畫布」中，每個圖案與接點都是 <b>Word 原生物件</b>，可直接改字、改色、搬移；把整個畫布複製貼到你的文件即可。太寬的圖會自動改用橫式頁面或等比例縮小。</li>
  <li><b>Word（圖片）</b>：整張圖以向量圖片放入 .docx，版面最穩定；要修改時用本工具「開啟…」選那份 .docx，改完按「存回」。</li>
  <li>「複製圖片」可快速貼到任何地方（點陣圖，不可再編輯）。</li></ul>
  <h4>把現成的流程圖圖檔變成可編輯</h4>
  <ul><li>按「圖檔轉換…」選圖檔，或把圖檔拖進畫布，或直接 <kbd>Ctrl</kbd>+<kbd>V</kbd> 貼上截圖。</li>
  <li>工具會請 AI 辨識圖形、文字、連接線與甬道後重繪；完成後左下角會顯示原圖供對照檢查。</li>
  <li>自動轉換需 Claude API 金鑰，且<b>圖檔會傳送到 Anthropic API</b>；也可用手動方式（不需金鑰）。</li></ul>
  <p class="muted">除了「圖檔轉換」的自動模式外，所有資料都只在你的瀏覽器內處理，不會上傳到任何伺服器。</p>`;
  const A = VL.APP;
  const ABOUT = `<div class="about-hero"><img src="img/allan-full.webp" alt="Allan"><div><h2>${VL.esc(A.name)}</h2><p class="muted">Allan 與 AI 小助手阿拉蕾，陪你把流程畫清楚。</p></div><img src="img/arale-full.webp" alt="阿拉蕾"></div>
  <table class="about"><tr><th>工具名稱</th><td>${VL.esc(A.name)}</td></tr>
  <tr><th>系統設計</th><td>${VL.esc(A.author)}，<a href="${A.site}" target="_blank" rel="noopener">${A.site}</a></td></tr>
  <tr><th>開發日期</th><td>${A.date}</td></tr>
  <tr><th>最新版本</th><td>${A.version}</td></tr></table>`;
  const ACTS = {
    new: () => { if (!E.doc.nodes.length || confirm('確定要清空目前的圖嗎？（可用復原找回）')) { io.office = null; io.name = '流程圖'; E.load(VL.newDoc()); syncOffice(); } },
    open: () => $('#file-input').click(),
    import: () => $('#image-input').click(),
    save: () => io.saveSvg(),
    undo: () => E.undo(), redo: () => E.redo(),
    pptx: guard(() => io.savePptx(), '已匯出 PowerPoint，可直接在簡報中編輯圖案'),
    docx: guard(() => io.saveDocxShapes(), '已匯出 Word，圖案可直接在 Word 中編輯'),
    docximg: guard(() => io.saveDocx(), '已匯出 Word（圖片）；日後可用「開啟…」選這份 .docx 來修改圖'),
    png: guard(() => io.savePng()),
    copy: guard(() => io.copyPng(), '已複製圖片，可直接貼到 Word / PowerPoint'),
    saveback: guard(() => io.saveBackOffice(), '已產生更新後的檔案'),
    zoomin: () => E.zoom(E.view.z * 1.2), zoomout: () => E.zoom(E.view.z / 1.2), zoom100: () => E.zoom(1), fit: () => E.fit(),
    help: () => ui.modal(HELP + ABOUT),
    about: () => ui.modal(ABOUT),
  };

  document.title = A.name;
  $('#brand').textContent = A.name;
  buildPalette();
  bindProps();
  $('#toolbar').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) ACTS[b.dataset.act](); });
  $('#file-input').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) { await guard(() => io.openFile(f))(); syncOffice(); }
  });
  $('#image-input').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) await guard(() => VL.importer.open(f))();
  });
  // 直接貼上截圖（例如從程序書 PDF 擷取的流程圖）
  window.addEventListener('paste', (e) => {
    if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const f = [...(e.clipboardData ? e.clipboardData.files : [])].find((x) => VL.importer.isImage(x));
    if (f) { e.preventDefault(); guard(() => VL.importer.open(f))(); }
  });
  E.onChange = () => {
    buildProps();
    $('#zoom-label').textContent = Math.round(E.view.z * 100) + '%';
    $('#fab-props').classList.toggle('on', E.sel.size > 0);
    $('#hint').hidden = E.doc.nodes.length + E.doc.edges.length > 0;
  };
  E.init();
})();
