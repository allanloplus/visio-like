/* 圖檔轉換：把現成的流程圖圖檔（PNG / JPG…）交給 Claude 視覺模型拆解，重建為可編輯的圖。
   兩種方式共用同一份提示詞與同一個轉換程式：
   A. 直接呼叫 Claude API（需 API 金鑰；圖檔會從瀏覽器直接送到 Anthropic API）
   B. 手動：把圖與提示詞貼到任何可看圖的 AI 對話，再把回覆的 JSON 貼回來 */
(function () {
  const VL = window.VL;
  const TYPES = ['terminator', 'process', 'decision', 'document', 'data', 'database', 'predefined', 'manual', 'prep', 'circle', 'offpage', 'delay', 'note', 'text'];
  const KEY_STORE = 'visio-like-api-key';

  const PROMPT = `You are converting a picture of a flowchart into structured data so it can be redrawn in an editable diagram tool.

Look at the attached image carefully and return ONE JSON object, and nothing else, in this shape:

{
  "title": "diagram title if one is visible, else empty string",
  "pool": null | {
    "orient": "h" | "v",
    "title": "overall title written on the swimlane frame, else empty string",
    "x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0,
    "lanes": [ { "title": "lane name", "start": 0.0, "end": 0.33 } ]
  },
  "nodes": [ { "id": "n1", "type": "process", "text": "label", "x": 0.10, "y": 0.05, "w": 0.18, "h": 0.07 } ],
  "edges": [ { "from": "n1", "to": "n2", "fromSide": "b", "toSide": "t", "text": "", "dashed": false, "arrow": "end" } ]
}

Rules:
- All coordinates are fractions (0 to 1) of the image width (x, w) and image height (y, h). x and y are the LEFT and TOP of the shape's bounding box. Be as accurate as you can: the layout will be rebuilt from these numbers.
- "pool" describes a swimlane (cross-functional) frame. Use "h" when lanes are horizontal bands stacked top to bottom (lane names on the left), "v" when lanes are vertical columns side by side (lane names on top). For each lane, "start" and "end" are fractions of the image height ("h") or image width ("v"), in order, without gaps. Use null when the diagram has no swimlanes.
- Node "type" must be one of: ${TYPES.join(', ')}.
  terminator = rounded start/end pill; process = rectangle; decision = diamond; document = rectangle with wavy bottom; data = parallelogram; database = cylinder; predefined = rectangle with double side bars (sub-process); manual = manual input trapezoid; prep = hexagon; circle = small on-page connector circle; offpage = off-page connector pentagon; delay = D shape; note = annotation or comment box; text = free-standing text with no border.
- Do not create nodes for lane titles or the pool title; those belong in "pool".
- Copy every label exactly as written, in its original language and characters. Do not translate, correct, or summarize. Use "\\n" where the label visibly wraps onto a new line only if the break is meaningful; otherwise keep it on one line.
- One edge per connector line. "fromSide"/"toSide" are the sides of the shapes the line touches: "t", "b", "l" or "r". "text" is the label on the line (such as 是/否, Yes/No), else empty. "arrow" is "end", "start", "both" or "none".
- If a line branches or merges, output one edge per source-target pair.
- Include every shape and every connector you can see. If part of the image is unreadable, still include the shape and put your best reading in "text".`;

  /* ---------- 將模型回傳的描述轉成文件模型 ---------- */
  function parseJson(text) {
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a < 0 || b <= a) throw new Error('回覆中找不到 JSON 內容。');
    try { return JSON.parse(text.slice(a, b + 1)); } catch (err) { throw new Error('JSON 格式有誤，無法解析：' + err.message); }
  }
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  /* 把相近的座標群組成同一條對齊線 */
  function alignAxis(items, key, tol) {
    const sorted = items.slice().sort((p, q) => p[key] - q[key]);
    let group = [];
    const flush = () => {
      if (!group.length) return;
      const v = VL.snap(group.reduce((s, o) => s + o[key], 0) / group.length);
      group.forEach((o) => (o[key] = v));
      group = [];
    };
    for (const it of sorted) {
      if (group.length && it[key] - group[group.length - 1][key] > tol) flush();
      group.push(it);
    }
    flush();
  }
  function inferSides(a, b) {
    const dx = b.cx - a.cx, dy = b.cy - a.cy;
    if (Math.abs(dx) < (a.w + b.w) / 2 - 10) return dy >= 0 ? ['b', 't'] : ['t', 'b'];
    if (Math.abs(dy) < (a.h + b.h) / 2 - 10) return dx >= 0 ? ['r', 'l'] : ['l', 'r'];
    return a.type === 'decision' ? [dx >= 0 ? 'r' : 'l', dy >= 0 ? 't' : 'b'] : [dy >= 0 ? 'b' : 't', dx >= 0 ? 'l' : 'r'];
  }

  function toDoc(spec, imgW, imgH) {
    if (!spec || !Array.isArray(spec.nodes) || !spec.nodes.length) throw new Error('辨識結果中沒有任何圖形。');
    imgW = imgW || 1600; imgH = imgH || 1000;
    // 依圖形的中位高度決定縮放比例，讓重繪後的圖形接近標準大小
    const hs = spec.nodes.map((n) => num(n.h, 0.06) * imgH).filter((v) => v > 0).sort((p, q) => p - q);
    let s = 60 / (hs[Math.floor(hs.length / 2)] || 60);
    s = Math.min(Math.max(s, 500 / imgW), 2800 / imgW);
    const W = imgW * s, H = imgH * s, even = (v, min) => Math.max(min, Math.round(v / 20) * 20);

    const items = spec.nodes.map((n, i) => {
      const type = TYPES.includes(n.type) ? n.type : 'process';
      const small = type === 'circle' || type === 'offpage';
      const w = even(num(n.w, 0.15) * W, small ? 40 : type === 'text' ? 40 : 80), h = even(num(n.h, 0.06) * H, small ? 40 : 40);
      return { src: n, key: String(n.id != null ? n.id : i), type, w, h, cx: (num(n.x, 0) + num(n.w, 0.15) / 2) * W, cy: (num(n.y, 0) + num(n.h, 0.06) / 2) * H };
    });
    alignAxis(items, 'cx', 18);
    alignAxis(items, 'cy', 18);

    const doc = VL.newDoc(), map = {};
    for (const it of items) {
      const def = VL.shapes[it.type];
      const node = {
        id: VL.uid(), type: it.type, x: it.cx - it.w / 2, y: it.cy - it.h / 2, w: it.w, h: it.h,
        text: String(it.src.text || ''), style: Object.assign(VL.defaultStyle(), def.style),
      };
      map[it.key] = { node, it };
      doc.nodes.push(node);
    }

    const p = spec.pool;
    if (p && Array.isArray(p.lanes) && p.lanes.length) {
      const horiz = p.orient !== 'v', L = horiz ? H : W;
      const pool = {
        id: VL.uid(), type: 'pool', orient: horiz ? 'h' : 'v', text: String(p.title || spec.title || ''),
        lanes: p.lanes.map((l) => ({ title: String(l.title || ''), size: Math.max(60, VL.snap((num(l.end, 1) - num(l.start, 0)) * L)) })),
        x: VL.snap(num(p.x, 0) * W), y: VL.snap(num(p.y, 0) * H), w: Math.max(200, VL.snap(num(p.w, 1) * W)), h: Math.max(200, VL.snap(num(p.h, 1) * H)),
        style: Object.assign(VL.defaultStyle(), { fill: '#BDD7EE', stroke: '#44546A', strokeWidth: 1.2 }),
      };
      if (horiz) pool.y = VL.snap(num(p.lanes[0].start, num(p.y, 0)) * H); else pool.x = VL.snap(num(p.lanes[0].start, num(p.x, 0)) * W);
      VL.poolSync(pool);
      // 確保甬道外框包住所有圖形（含標題列的空間）
      const pad = 20, head = 2 * VL.HS + 10, ns = doc.nodes;
      const minX = Math.min(...ns.map((n) => n.x)), maxX = Math.max(...ns.map((n) => n.x + n.w));
      const minY = Math.min(...ns.map((n) => n.y)), maxY = Math.max(...ns.map((n) => n.y + n.h));
      if (horiz) {
        const x0 = Math.min(pool.x, VL.snap(minX - head)), x1 = Math.max(pool.x + pool.w, VL.snap(maxX + pad));
        pool.x = x0; pool.w = x1 - x0;
      } else {
        const y0 = Math.min(pool.y, VL.snap(minY - head)), y1 = Math.max(pool.y + pool.h, VL.snap(maxY + pad));
        pool.y = y0; pool.h = y1 - y0;
      }
      doc.nodes.unshift(pool);
    }

    for (const e of spec.edges || []) {
      const a = map[String(e.from)], b = map[String(e.to)];
      if (!a || !b || a === b) continue;
      const ok = (v) => VL.SIDES.includes(v);
      const guess = inferSides(a.it, b.it);
      const st = VL.defaultEdgeStyle();
      if (e.dashed) st.dash = 'dash';
      st.endArrow = e.arrow !== 'none' && e.arrow !== 'start';
      st.startArrow = e.arrow === 'both' || e.arrow === 'start';
      doc.edges.push({
        id: VL.uid(), kind: 'elbow', text: String(e.text || ''), style: st,
        from: { id: a.node.id, side: ok(e.fromSide) ? e.fromSide : guess[0] },
        to: { id: b.node.id, side: ok(e.toSide) ? e.toSide : guess[1] },
      });
    }
    return doc;
  }

  /* ---------- 圖檔處理 ---------- */
  /* 讀入圖檔並縮到長邊 2000px 以內，回傳 { dataUrl, b64, mediaType, w, h } */
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        const dataUrl = c.toDataURL('image/png');
        resolve({ dataUrl, b64: dataUrl.split(',')[1], mediaType: 'image/png', w: c.width, h: c.height });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('無法讀取這個圖檔。')); };
      img.src = url;
    });
  }

  /* ---------- Claude API ---------- */
  async function callApi(img, apiKey) {
    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2026-10-21',
          'anthropic-beta': 'server-side-fallback-2026-07-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-opus-5-5',
          max_tokens: 16000,
          output_config: { effort: 'high' },
          fallbacks: 'default',
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.b64 } },
              { type: 'text', text: PROMPT },
            ],
          }],
        }),
      });
    } catch (err) {
      throw new Error('無法連線到 Claude API（請檢查網路或公司防火牆是否允許 api.anthropic.com）。');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || res.statusText;
      if (res.status === 401) throw new Error('API 金鑰無效，請確認後再試。');
      if (res.status === 429) throw new Error('已達 API 使用頻率或額度上限，請稍後再試。');
      throw new Error(`Claude API 回應錯誤 (${res.status})：${msg}`);
    }
    if (data.stop_reason === 'refusal') throw new Error('模型拒絕處理這張圖。');
    if (data.stop_reason === 'max_tokens') throw new Error('這張圖的內容太多，回覆被截斷；請裁切成較小的區塊分次轉換。');
    return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  }

  /* ---------- 對話框 ---------- */
  let current = null; // 目前處理中的圖
  function showRef(img) {
    let box = document.getElementById('ref-img');
    if (!box) {
      box = document.createElement('div');
      box.id = 'ref-img';
      box.innerHTML = '<div class="bar"><span>原圖對照</span><button data-x title="關閉">✕</button></div><img alt="原始流程圖">';
      document.getElementById('stage').appendChild(box);
      box.addEventListener('click', (e) => { if (e.target.closest('[data-x]')) box.hidden = true; else box.classList.toggle('big'); });
    }
    box.querySelector('img').src = img.dataUrl;
    box.hidden = false;
    box.classList.remove('big');
  }
  function finish(text) {
    const doc = toDoc(parseJson(text), current.w, current.h);
    VL.io.office = null;
    VL.io.name = current.name;
    VL.editor.load(doc);
    showRef(current);
    document.getElementById('modal').hidden = true;
    document.getElementById('office-grp').hidden = true;
    VL.ui.toast(`已重繪 ${doc.nodes.filter((n) => n.type !== 'pool').length} 個圖形、${doc.edges.length} 條連接線。\n請對照左下角原圖檢查文字與連線。`, 6000);
  }

  async function open(file) {
    const img = await loadImage(file);
    current = Object.assign(img, { name: file.name.replace(/\.[^.]+$/, '') || '流程圖' });
    const saved = localStorage.getItem(KEY_STORE) || sessionStorage.getItem(KEY_STORE) || '';
    VL.ui.modal(`
      <h2>把圖檔轉換成可編輯的流程圖</h2>
      <img class="imp-preview" src="${img.dataUrl}" alt="待轉換的圖">
      <p class="muted">工具會請 AI 視覺模型辨識圖中的圖形、文字、連接線與甬道，再依原本的位置重繪。辨識結果可能有漏字或漏線，轉換後請對照原圖檢查。</p>
      <h4>方式一：自動轉換（Claude API）</h4>
      <p class="muted">⚠ 圖檔會從你的瀏覽器直接傳送到 Anthropic 的 API 進行辨識。若圖中含客戶機敏資訊，請先確認是否允許。</p>
      <div class="row"><input type="password" id="imp-key" placeholder="Claude API 金鑰 (sk-ant-…)" value="${VL.esc(saved)}" autocomplete="off" style="flex:1;width:auto">
        <button class="primary" id="imp-run">開始轉換</button></div>
      <div class="row"><label style="width:auto"><input type="checkbox" id="imp-remember" ${localStorage.getItem(KEY_STORE) ? 'checked' : ''}> 在這台電腦的瀏覽器記住金鑰（明碼存放，共用電腦請勿勾選）</label></div>
      <p id="imp-status" class="muted"></p>
      <h4>方式二：手動（不需 API 金鑰）</h4>
      <ol><li>按 <button id="imp-copy">複製提示詞</button>，連同這張圖一起貼到可看圖的 AI 對話（例如 Claude）。</li>
      <li>把 AI 回覆的 JSON 貼到下方，按「匯入」。</li></ol>
      <textarea id="imp-json" rows="4" placeholder='{ "nodes": [...], "edges": [...] }' style="width:100%;font-family:monospace"></textarea>
      <div class="row"><button id="imp-paste">匯入</button></div>`);
    const $ = (id) => document.getElementById(id), status = $('imp-status');
    const fail = (err) => { console.error(err); status.textContent = '⚠ ' + (err.message || err); status.style.color = '#c00000'; };
    $('imp-run').onclick = async () => {
      const key = $('imp-key').value.trim();
      if (!key) return fail(new Error('請先輸入 API 金鑰。'));
      localStorage.removeItem(KEY_STORE);
      ($('imp-remember').checked ? localStorage : sessionStorage).setItem(KEY_STORE, key);
      $('imp-run').disabled = true;
      status.style.color = ''; status.textContent = '辨識中，複雜的圖可能需要一兩分鐘…';
      try { finish(await callApi(current, key)); } catch (err) { fail(err); } finally { const b = $('imp-run'); if (b) b.disabled = false; }
    };
    $('imp-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(PROMPT); VL.ui.toast('已複製提示詞'); }
      catch (err) { $('imp-json').value = PROMPT; VL.ui.toast('無法存取剪貼簿，提示詞已放在下方文字框，請自行複製'); }
    };
    $('imp-paste').onclick = () => { try { finish($('imp-json').value); } catch (err) { fail(err); } };
  }

  VL.importer = { PROMPT, toDoc, parseJson, open, isImage: (f) => /^image\/(png|jpe?g|webp|gif|bmp)$/i.test(f.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name) };
})();
