/* 編輯器：選取、拖曳、縮放、連線、文字編輯、復原 */
(function () {
  const VL = window.VL;
  const E = (VL.editor = { doc: VL.newDoc(), sel: new Set(), view: { x: 40, y: 40, z: 1 }, hover: null, onChange: null });
  const STORE = 'visio-like-autosave';
  let svg, vp, content, overlay, stage, drag = null, band = null, spaceDown = false, editing = null, clip = null;
  let hist = [], hi = -1;

  const node = (id) => VL.node(E.doc, id);
  const edge = (id) => VL.edge(E.doc, id);
  E.selNodes = () => E.doc.nodes.filter((n) => E.sel.has(n.id));
  E.selEdges = () => E.doc.edges.filter((e) => E.sel.has(e.id));

  /* ---------- 初始化 ---------- */
  E.init = function () {
    svg = document.getElementById('canvas');
    stage = document.getElementById('stage');
    vp = svg.querySelector('#viewport');
    content = svg.querySelector('#content');
    overlay = svg.querySelector('#overlay');
    svg.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    svg.addEventListener('dblclick', (e) => { if (!E.touch) onDbl(e); });
    window.addEventListener('pointercancel', (e) => { endTouch(e); drag = null; band = null; });
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });
    try {
      const saved = localStorage.getItem(STORE);
      if (saved) E.doc = JSON.parse(saved);
    } catch (err) { /* 無法讀取自動儲存時從空白開始 */ }
    pushHist();
    E.render();
  };

  /* ---------- 歷程 ---------- */
  function pushHist() {
    hist = hist.slice(0, hi + 1);
    hist.push(JSON.stringify(E.doc));
    if (hist.length > 200) hist.shift();
    hi = hist.length - 1;
  }
  E.commit = function () {
    VL.mm.layoutAll(E.doc);
    pushHist();
    try { localStorage.setItem(STORE, hist[hi]); } catch (err) { /* 儲存空間不足時略過自動儲存 */ }
    E.render();
  };
  function restore() {
    E.doc = JSON.parse(hist[hi]);
    E.sel = new Set([...E.sel].filter((id) => node(id) || edge(id)));
    try { localStorage.setItem(STORE, hist[hi]); } catch (err) { /* 同上 */ }
    E.render();
  }
  E.undo = () => { if (hi > 0) { hi--; restore(); } };
  E.redo = () => { if (hi < hist.length - 1) { hi++; restore(); } };
  E.load = function (doc) {
    E.doc = doc; E.sel.clear();
    E.commit(); E.fit();
  };

  /* ---------- 繪製 ---------- */
  E.render = function () {
    VL.mm.layoutAll(E.doc);
    content.innerHTML = VL.render.docSvg(E.doc, { interactive: true });
    applyView();
    drawOverlay();
    if (E.onChange) E.onChange();
  };
  function applyView() {
    const v = E.view;
    vp.setAttribute('transform', `translate(${v.x} ${v.y}) scale(${v.z})`);
    const g = 20 * v.z;
    stage.style.backgroundSize = `${g}px ${g}px`;
    stage.style.backgroundPosition = `${v.x}px ${v.y}px`;
  }
  const HANDLES = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] };
  function drawOverlay() {
    const z = E.view.z, T = E.touch ? 1.9 : 1, hs = (4 * T) / z, sw = 1 / z;  // 觸控時把控制點放大
    let s = '';
    const nodes = E.selNodes(), edges = E.selEdges();
    for (const n of nodes) s += `<rect class="sel" x="${n.x - 2}" y="${n.y - 2}" width="${n.w + 4}" height="${n.h + 4}" stroke-width="${sw}" stroke-dasharray="${4 / z} ${3 / z}"/>`;
    for (const e of edges) {
      const r = VL.router.route(e, E.doc);
      s += `<path class="sel-edge" d="M${r.pts.map((p) => p.x + ' ' + p.y).join(' L')}" stroke-width="${5 / z}"/>`;
    }
    const hd = (x, y, key, cls) => `<rect class="handle ${cls || ''}" data-h="${key}" x="${x - hs}" y="${y - hs}" width="${hs * 2}" height="${hs * 2}" stroke-width="${sw}"/>`;
    if (nodes.length === 1 && !edges.length) {
      const n = nodes[0];
      if (n.type === 'pool') {
        let o = 0;
        const h = n.orient === 'h';
        s += h ? hd(n.x + n.w, n.y + n.h / 2, 'e') : hd(n.x + n.w / 2, n.y + n.h, 's');
        n.lanes.forEach((l, i) => {
          o += l.size;
          s += h ? hd(n.x + n.w / 2, n.y + o, 'lane:' + i, 'lane') : hd(n.x + o, n.y + n.h / 2, 'lane:' + i, 'lane');
        });
      } else if (!n.mm) {
        for (const k in HANDLES) s += hd(n.x + HANDLES[k][0] * n.w, n.y + HANDLES[k][1] * n.h, k);
      }
    }
    if (edges.length === 1 && !nodes.length) {
      const r = VL.router.route(edges[0], E.doc);
      const a = r.pts[0], b = r.pts[r.pts.length - 1];
      s += `<circle class="ep" data-ep="${edges[0].id}:from" cx="${a.x}" cy="${a.y}" r="${(5 * T) / z}" stroke-width="${sw}"/>`;
      s += `<circle class="ep" data-ep="${edges[0].id}:to" cx="${b.x}" cy="${b.y}" r="${(5 * T) / z}" stroke-width="${sw}"/>`;
    }
    // 觸控沒有滑鼠懸停：選取單一圖形時就顯示連接點
    const hn = (E.hover && node(E.hover)) || (E.touch && nodes.length === 1 && !edges.length ? nodes[0] : null);
    if (hn && hn.type !== 'pool' && !(drag && (drag.type === 'move' || drag.type === 'resize'))) {
      for (const side of VL.SIDES) {
        const p = VL.portPos(hn, side);
        s += `<circle class="port" data-port="${hn.id}:${side}" cx="${p.x}" cy="${p.y}" r="${(5 * T) / z}" stroke-width="${1.5 / z}"/>`;
      }
    }
    if (band) {
      const x = Math.min(band.x0, band.x1), y = Math.min(band.y0, band.y1);
      s += `<rect class="band" x="${x}" y="${y}" width="${Math.abs(band.x1 - band.x0)}" height="${Math.abs(band.y1 - band.y0)}" stroke-width="${sw}"/>`;
    }
    overlay.innerHTML = s;
  }

  /* ---------- 座標 / 檢視 ---------- */
  function toDoc(evt) {
    const r = svg.getBoundingClientRect();
    return { x: (evt.clientX - r.left - E.view.x) / E.view.z, y: (evt.clientY - r.top - E.view.y) / E.view.z };
  }
  E.viewCenter = function () {
    const r = svg.getBoundingClientRect();
    return { x: (r.width / 2 - E.view.x) / E.view.z, y: (r.height / 2 - E.view.y) / E.view.z };
  };
  E.zoom = function (z, cx, cy) {
    const r = svg.getBoundingClientRect();
    if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
    z = Math.min(4, Math.max(0.2, z));
    const v = E.view;
    v.x = cx - ((cx - v.x) / v.z) * z; v.y = cy - ((cy - v.y) / v.z) * z; v.z = z;
    E.render();
  };
  E.fit = function () {
    const r = svg.getBoundingClientRect();
    if (!E.doc.nodes.length && !E.doc.edges.length) { E.view = { x: 40, y: 40, z: 1 }; return E.render(); }
    const b = VL.render.bbox(E.doc);
    const z = Math.min(1.5, Math.max(0.2, Math.min((r.width - 80) / b.w, (r.height - 80) / b.h)));
    E.view = { z, x: (r.width - b.w * z) / 2 - b.x * z, y: (r.height - b.h * z) / 2 - b.y * z };
    E.render();
  };
  function onWheel(evt) {
    evt.preventDefault();
    if (evt.ctrlKey || evt.metaKey) {
      const r = svg.getBoundingClientRect();
      E.zoom(E.view.z * (evt.deltaY < 0 ? 1.1 : 1 / 1.1), evt.clientX - r.left, evt.clientY - r.top);
    } else {
      E.view.x -= evt.shiftKey ? evt.deltaY : evt.deltaX;
      E.view.y -= evt.shiftKey ? 0 : evt.deltaY;
      applyView();
    }
  }

  /* ---------- 指標互動 ---------- */
  function nodeAt(evt, exceptId) {
    for (const el of document.elementsFromPoint(evt.clientX, evt.clientY)) {
      const g = el.closest && el.closest('#content [data-id]');
      if (!g) continue;
      const n = node(g.dataset.id);
      if (n && n.type !== 'pool' && n.id !== exceptId) return n;
    }
    return null;
  }
  function nearestSide(n, p) {
    let best = 't', bd = Infinity;
    for (const s of VL.SIDES) {
      const q = VL.portPos(n, s), dd = Math.hypot(q.x - p.x, q.y - p.y);
      if (dd < bd) { bd = dd; best = s; }
    }
    return best;
  }
  const inBox = (n, b) => { const cx = n.x + n.w / 2, cy = n.y + n.h / 2; return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h; };

  function startMove(p) {
    const ids = new Set();
    for (const n of E.selNodes()) {
      if (n.mm) VL.mm.subtree(E.doc, VL.mm.rootOf(E.doc, n).id).forEach((id) => ids.add(id));
      else ids.add(n.id);
      if (n.type === 'pool') E.doc.nodes.forEach((m) => { if (m.type !== 'pool' && inBox(m, n)) ids.add(m.id); });
    }
    [...ids].forEach((id) => { const m = node(id); if (m.mm) VL.mm.subtree(E.doc, VL.mm.rootOf(E.doc, m).id).forEach((i) => ids.add(i)); });
    const orig = [...ids].map((id) => { const n = node(id); return { n, x: n.x, y: n.y }; });
    const ends = [];
    for (const e of E.selEdges()) for (const k of ['from', 'to']) if (!e[k].id) ends.push({ o: e[k], x: e[k].x, y: e[k].y });
    drag = Object.assign(drag || {}, { type: 'move', start: p, orig, ends, moved: false });
  }

  /* 觸控：雙指縮放 / 平移 */
  const touches = new Map();
  let lastTap = { id: null, t: 0 };
  function pinchState() {
    const [a, b] = [...touches.values()], r = svg.getBoundingClientRect();
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top };
  }
  function endTouch(evt) {
    touches.delete(evt.pointerId);
    if (drag && drag.type === 'pinch' && touches.size < 2) { drag = null; E.render(); }
  }

  function onDown(evt) {
    if (editing) commitEdit();
    if (evt.pointerType === 'touch') {
      if (!E.touch) { E.touch = true; }
      touches.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
      if (touches.size === 2) {
        // 第二指落下：放棄尚未成立的拖曳，改為縮放
        if (drag && drag.type === 'move' && drag.moved) { drag.orig.forEach((o) => { o.n.x = o.x; o.n.y = o.y; }); }
        if (drag && drag.type === 'end' && drag.isNew) E.doc.edges = E.doc.edges.filter((x) => x !== drag.edge);
        band = null;
        const s = pinchState();
        drag = { type: 'pinch', d0: s.d, z0: E.view.z, px: (s.cx - E.view.x) / E.view.z, py: (s.cy - E.view.y) / E.view.z };
        return;
      }
      if (touches.size > 2) return;
    }
    const t = evt.target, p = toDoc(evt);
    if (evt.button === 1 || evt.button === 2 || (evt.button === 0 && spaceDown)) {
      drag = { type: 'pan', sx: evt.clientX, sy: evt.clientY, vx: E.view.x, vy: E.view.y };
      evt.preventDefault();
      return;
    }
    if (evt.button !== 0) return;
    const port = t.closest('[data-port]'), ep = t.closest('[data-ep]'), h = t.closest('[data-h]'), g = t.closest('#content [data-id]');
    if (port) {
      const [id, side] = port.dataset.port.split(':');
      const e = { id: VL.uid(), from: { id, side }, to: { x: p.x, y: p.y }, kind: 'elbow', text: '', style: VL.defaultEdgeStyle() };
      E.doc.edges.push(e);
      E.sel = new Set([e.id]);
      drag = { type: 'end', edge: e, end: 'to', isNew: true, start: p };
    } else if (ep) {
      const [id, end] = ep.dataset.ep.split(':');
      drag = { type: 'end', edge: edge(id), end, start: p };
    } else if (h) {
      const n = E.selNodes()[0], key = h.dataset.h;
      if (key.startsWith('lane:')) {
        const i = +key.slice(5), horiz = n.orient === 'h';
        let o = 0;
        for (let k = 0; k <= i; k++) o += n.lanes[k].size;
        const lim = horiz ? n.y + o : n.x + o;
        const follow = E.doc.nodes.filter((m) => m.type !== 'pool' && inBox(m, n) && (horiz ? m.y + m.h / 2 : m.x + m.w / 2) > lim)
          .map((m) => ({ n: m, x: m.x, y: m.y }));
        drag = { type: 'lane', n, i, size: n.lanes[i].size, start: p, follow };
      } else drag = { type: 'resize', n, key, start: p, box: { x: n.x, y: n.y, w: n.w, h: n.h } };
    } else if (g) {
      const id = g.dataset.id;
      drag = {};
      if (evt.shiftKey) { if (E.sel.has(id)) E.sel.delete(id); else E.sel.add(id); }
      else if (!E.sel.has(id)) E.sel = new Set([id]);
      else drag.clickId = id;
      startMove(p);
    } else if (evt.pointerType === 'touch') {
      // 觸控：在空白處拖曳是平移畫布，輕點則取消選取
      drag = { type: 'pan', sx: evt.clientX, sy: evt.clientY, vx: E.view.x, vy: E.view.y, tap: true };
    } else {
      if (!evt.shiftKey) E.sel.clear();
      band = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      drag = { type: 'band' };
    }
    if (document.activeElement && document.activeElement.blur && document.activeElement !== document.body) document.activeElement.blur();
    drawOverlay();
    if (E.onChange) E.onChange();
  }

  function onMove(evt) {
    if (touches.has(evt.pointerId)) touches.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
    if (drag && drag.type === 'pinch') {
      if (touches.size < 2) return;
      const s = pinchState(), z = Math.min(4, Math.max(0.2, (drag.z0 * s.d) / drag.d0));
      E.view = { z, x: s.cx - drag.px * z, y: s.cy - drag.py * z };
      applyView();
      drawOverlay();
      if (E.onChange) E.onChange();
      return;
    }
    if (!drag) {
      if (evt.target.closest && evt.target.closest('#canvas')) {
        const port = evt.target.closest('[data-port]'), g = evt.target.closest('#content [data-id]');
        const id = port ? port.dataset.port.split(':')[0] : g ? g.dataset.id : null;
        if (id !== E.hover) { E.hover = id; drawOverlay(); }
      }
      return;
    }
    const p = toDoc(evt);
    if (drag.type === 'pan') {
      E.view.x = drag.vx + evt.clientX - drag.sx; E.view.y = drag.vy + evt.clientY - drag.sy;
      applyView();
    } else if (drag.type === 'move') {
      let dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      if (!drag.moved && Math.hypot(dx, dy) * E.view.z < 4) return;
      drag.moved = true;
      const a = drag.orig[0];
      if (a) { dx = VL.snap(a.x + dx) - a.x; dy = VL.snap(a.y + dy) - a.y; }
      drag.orig.forEach((o) => { o.n.x = o.x + dx; o.n.y = o.y + dy; });
      drag.ends.forEach((o) => { o.o.x = o.x + dx; o.o.y = o.y + dy; });
      E.render();
    } else if (drag.type === 'resize') {
      const b = drag.box, k = drag.key, n = drag.n;
      let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      if (k.includes('w')) x0 = Math.min(VL.snap(b.x + dx), x1 - 20);
      if (k.includes('e')) x1 = Math.max(VL.snap(b.x + b.w + dx), x0 + 20);
      if (k.includes('n')) y0 = Math.min(VL.snap(b.y + dy), y1 - 20);
      if (k.includes('s')) y1 = Math.max(VL.snap(b.y + b.h + dy), y0 + 20);
      n.x = x0; n.y = y0; n.w = x1 - x0; n.h = y1 - y0;
      if (n.type === 'pool') { const min = 4 * VL.HS; if (n.orient === 'h') n.w = Math.max(n.w, min); else n.h = Math.max(n.h, min); }
      E.render();
    } else if (drag.type === 'lane') {
      const n = drag.n, horiz = n.orient === 'h';
      const size = Math.max(40, VL.snap(drag.size + (horiz ? p.y - drag.start.y : p.x - drag.start.x)));
      const dlt = size - drag.size;
      n.lanes[drag.i].size = size;
      VL.poolSync(n);
      drag.follow.forEach((o) => { if (horiz) o.n.y = o.y + dlt; else o.n.x = o.x + dlt; });
      E.render();
    } else if (drag.type === 'end') {
      const e = drag.edge, other = e[drag.end === 'to' ? 'from' : 'to'];
      const target = nodeAt(evt, other.id);
      if (target) { e[drag.end] = { id: target.id, side: nearestSide(target, p) }; E.hover = target.id; }
      else { e[drag.end] = { x: Math.round(p.x), y: Math.round(p.y) }; E.hover = null; }
      drag.moved = true;
      E.render();
    } else if (drag.type === 'band') {
      band.x1 = p.x; band.y1 = p.y;
      drawOverlay();
    }
  }

  function onUp(evt) {
    const wasTouch = touches.has(evt.pointerId);
    if (wasTouch) { endTouch(evt); E.hover = null; }
    if (!drag) return;
    if (drag.type === 'pinch') return;
    const dg = drag;
    drag = null;
    if (dg.type === 'pan' && dg.tap && Math.hypot(evt.clientX - dg.sx, evt.clientY - dg.sy) < 6) E.sel.clear();
    if (dg.type === 'move') {
      if (dg.moved) return E.commit();
      // 觸控的「點兩下」：自行判斷，直接進入文字編輯
      const tapId = dg.clickId || [...E.sel][0];
      if (wasTouch && tapId) {
        const now = Date.now();
        if (lastTap.id === tapId && now - lastTap.t < 400) { lastTap = { id: null, t: 0 }; E.sel = new Set([tapId]); drawOverlay(); return E.startEdit(editTarget(tapId, toDoc(evt))); }
        lastTap = { id: tapId, t: now };
      }
      if (dg.clickId) E.sel = new Set([dg.clickId]);
    } else if (dg.type === 'resize' || dg.type === 'lane') {
      return E.commit();
    } else if (dg.type === 'end') {
      const e = dg.edge, p = toDoc(evt);
      if (dg.isNew && !e.to.id && Math.hypot(p.x - dg.start.x, p.y - dg.start.y) < 12) {
        E.doc.edges = E.doc.edges.filter((x) => x !== e);
        E.sel.clear();
        return E.render();
      }
      // 組織圖方塊之間拉的線預設為「協調關係」：虛線、無箭頭
      const org = (end) => { const m = end.id && node(end.id); return !!(m && m.mm && VL.mm.isOrg(E.doc, m)); };
      if (dg.isNew && org(e.from) && org(e.to)) Object.assign(e.style, { dash: 'dash', endArrow: false });
      if (dg.moved) return E.commit();
    } else if (dg.type === 'band') {
      const b = { x: Math.min(band.x0, band.x1), y: Math.min(band.y0, band.y1), w: Math.abs(band.x1 - band.x0), h: Math.abs(band.y1 - band.y0) };
      band = null;
      if (b.w > 2 || b.h > 2) {
        const inside = (x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
        for (const n of E.doc.nodes) {
          const full = inside(n.x, n.y) && inside(n.x + n.w, n.y + n.h);
          const touch = n.x < b.x + b.w && n.x + n.w > b.x && n.y < b.y + b.h && n.y + n.h > b.y;
          if (n.type === 'pool' ? full : touch) E.sel.add(n.id);
        }
        for (const e of E.doc.edges) if (VL.router.route(e, E.doc).pts.every((q) => inside(q.x, q.y))) E.sel.add(e.id);
      }
    }
    // 沒有實際變更時只更新選取框：若重繪內容，瀏覽器會因元素被置換而不觸發按兩下事件
    drawOverlay();
    if (E.onChange) E.onChange();
  }

  /* ---------- 文字編輯 ---------- */
  function editTarget(id, p) {
    const n = node(id);
    if (!n) return edge(id) ? { id, field: 'edge' } : null;
    if (n.type !== 'pool') return { id, field: 'text' };
    const R = VL.render.poolRects(n), lx = p ? p.x - n.x : 0, ly = p ? p.y - n.y : 0;
    const hit = (r) => lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h;
    const i = R.lanes.findIndex((l) => hit(l.head));
    return i >= 0 ? { id, field: 'lane', index: i } : { id, field: 'text' };
  }
  E.startEdit = function (tg) {
    if (!tg) return;
    if (editing) commitEdit();
    const n = node(tg.id), e = edge(tg.id), z = E.view.z;
    let box, value, fs = 14, single = true;
    if (tg.field === 'edge') {
      const m = VL.router.midpoint(VL.router.route(e, E.doc).pts);
      box = { x: m.x - 70, y: m.y - 14, w: 140, h: 28 }; value = e.text; fs = e.style.fontSize; single = false;
    } else if (n.type === 'pool') {
      const R = VL.render.poolRects(n), r = tg.field === 'lane' ? R.lanes[tg.index].head : R.title;
      const cx = n.x + r.x + r.w / 2, cy = n.y + r.y + r.h / 2;
      box = { x: cx - 80, y: cy - 14, w: 160, h: 28 };
      value = tg.field === 'lane' ? n.lanes[tg.index].title : n.text; fs = n.style.fontSize;
    } else {
      const below = VL.shapes[n.type].label === 'below';
      box = below ? { x: n.x - 40, y: n.y + n.h + 2, w: n.w + 80, h: 30 } : { x: n.x, y: n.y, w: n.w, h: n.h };
      value = n.text; fs = n.style.fontSize; single = !!n.mm;
    }
    const ta = document.createElement('textarea');
    ta.className = 'inline-edit';
    ta.value = value || '';
    const w = Math.max(box.w * z, 90), h = Math.max(box.h * z, 30);
    Object.assign(ta.style, {
      left: (box.x + box.w / 2) * z + E.view.x - w / 2 + 'px', top: (box.y + box.h / 2) * z + E.view.y - h / 2 + 'px',
      width: w + 'px', height: h + 'px', fontSize: Math.max(E.touch ? 16 : 11, fs * z) + 'px',  // iOS 在字級小於 16px 時會自動放大頁面
    });
    stage.appendChild(ta);
    editing = { tg, ta };
    ta.focus(); ta.select();
    ta.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.isComposing) return;
      if (ev.key === 'Escape') { editing = null; ta.remove(); }
      else if (ev.key === 'Enter' && ((single && !ev.shiftKey) || ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); commitEdit(); }
      else if (ev.key === 'Tab' && n && n.mm) { ev.preventDefault(); commitEdit(); E.mmAdd('child'); }
    });
    ta.addEventListener('blur', () => commitEdit());
  };
  function commitEdit() {
    if (!editing) return;
    const { tg, ta } = editing;
    editing = null;
    const v = ta.value.replace(/\s+$/, '');
    ta.remove();
    const n = node(tg.id), e = edge(tg.id);
    if (tg.field === 'edge') { if (e) e.text = v; }
    else if (n && tg.field === 'lane') n.lanes[tg.index].title = v;
    else if (n) n.text = v;
    E.commit();
  }
  function onDbl(evt) {
    // 兩次點擊之間畫面會重繪，事件目標可能已不是原圖形，故以座標重新查找
    for (const el of document.elementsFromPoint(evt.clientX, evt.clientY)) {
      const g = el.closest && el.closest('#content [data-id]');
      if (g) return E.startEdit(editTarget(g.dataset.id, toDoc(evt)));
    }
  }

  /* ---------- 新增 / 刪除 / 剪貼 ---------- */
  E.addNode = function (type, x, y) {
    if (x == null) { const c = E.viewCenter(); x = c.x; y = c.y; }
    let n;
    if (type === 'pool-h' || type === 'pool-v') {
      const h = type === 'pool-h';
      n = {
        id: VL.uid(), type: 'pool', orient: h ? 'h' : 'v', text: '流程名稱',
        lanes: ['角色 A', '角色 B', '角色 C'].map((t) => ({ title: t, size: h ? 140 : 220 })),
        w: h ? 760 : 0, h: h ? 0 : 520,
        style: Object.assign(VL.defaultStyle(), { fill: '#BDD7EE', stroke: '#44546A', strokeWidth: 1.2 }),
      };
      VL.poolSync(n);
      n.x = VL.snap(x - n.w / 2); n.y = VL.snap(y - n.h / 2);
      E.doc.nodes.unshift(n);
    } else if (type === 'mindmap') {
      n = VL.mm.createRoot(E.doc, x, y);
    } else if (type === 'orgchart') {
      n = VL.mm.createOrg(E.doc, x, y - 80);
    } else {
      const def = VL.shapes[type];
      n = {
        id: VL.uid(), type, x: VL.snap(x - def.w / 2), y: VL.snap(y - def.h / 2), w: def.w, h: def.h,
        text: def.text || '', style: Object.assign(VL.defaultStyle(), def.style),
      };
      E.doc.nodes.push(n);
    }
    E.sel = new Set([n.id]);
    E.commit();
    return n;
  };
  E.del = function () {
    const ids = new Set(E.sel);
    E.selNodes().forEach((n) => { if (n.mm) VL.mm.subtree(E.doc, n.id).forEach((id) => ids.add(id)); });
    if (!ids.size) return;
    E.doc.nodes = E.doc.nodes.filter((n) => !ids.has(n.id));
    E.doc.edges = E.doc.edges.filter((e) => !ids.has(e.id) && !ids.has(e.from.id) && !ids.has(e.to.id));
    E.sel.clear();
    E.commit();
  };
  E.copy = function () {
    const ids = new Set();
    E.selNodes().forEach((n) => (n.mm ? VL.mm.subtree(E.doc, n.id) : [n.id]).forEach((id) => ids.add(id)));
    if (!ids.size) return;
    clip = {
      nodes: VL.clone(E.doc.nodes.filter((n) => ids.has(n.id))),
      edges: VL.clone(E.doc.edges.filter((e) => (!e.from.id || ids.has(e.from.id)) && (!e.to.id || ids.has(e.to.id)) && (E.sel.has(e.id) || (e.from.id && e.to.id)))),
    };
  };
  E.paste = function () {
    if (!clip) return;
    const map = {}, c = VL.clone(clip);
    c.nodes.forEach((n) => { map[n.id] = n.id = VL.uid(); n.x += 20; n.y += 20; });
    c.nodes.forEach((n) => { if (n.mm) n.mm.parent = map[n.mm.parent] || null; });
    c.edges.forEach((e) => {
      e.id = VL.uid();
      for (const k of ['from', 'to']) { if (e[k].id) e[k].id = map[e[k].id]; else { e[k].x += 20; e[k].y += 20; } }
    });
    clip.nodes.forEach((n) => { n.x += 20; n.y += 20; });
    E.doc.nodes.push(...c.nodes.filter((n) => n.type !== 'pool'));
    E.doc.nodes.unshift(...c.nodes.filter((n) => n.type === 'pool'));
    E.doc.edges.push(...c.edges);
    E.sel = new Set(c.nodes.map((n) => n.id).concat(c.edges.map((e) => e.id)));
    E.commit();
  };
  E.editSelected = () => { if (E.sel.size === 1) E.startEdit(editTarget([...E.sel][0])); };
  E.selectAll = () => { E.sel = new Set(E.doc.nodes.map((n) => n.id).concat(E.doc.edges.map((e) => e.id))); E.render(); };

  /* ---------- 樣式 / 排列 ---------- */
  E.setStyle = function (patch) {
    const items = E.selNodes().concat(E.selEdges());
    if (!items.length) return;
    items.forEach((o) => Object.assign(o.style, patch));
    E.commit();
  };
  E.setEdgeKind = (kind) => { E.selEdges().forEach((e) => (e.kind = kind)); E.commit(); };
  E.order = function (where) {
    const s = E.selNodes(), rest = E.doc.nodes.filter((n) => !E.sel.has(n.id));
    if (!s.length) return;
    E.doc.nodes = where === 'front' ? rest.concat(s) : s.concat(rest);
    E.commit();
  };
  E.align = function (kind) {
    const s = E.selNodes().filter((n) => !n.mm);
    if (s.length < 2) return;
    const x0 = Math.min(...s.map((n) => n.x)), x1 = Math.max(...s.map((n) => n.x + n.w));
    const y0 = Math.min(...s.map((n) => n.y)), y1 = Math.max(...s.map((n) => n.y + n.h));
    const spread = (pos, len) => {
      const o = s.slice().sort((a, b) => a[pos] + a[len] / 2 - (b[pos] + b[len] / 2));
      const a = o[0][pos] + o[0][len] / 2, b = o[o.length - 1][pos] + o[o.length - 1][len] / 2;
      o.forEach((n, i) => (n[pos] = Math.round(a + ((b - a) * i) / (o.length - 1) - n[len] / 2)));
    };
    for (const n of s) {
      if (kind === 'left') n.x = x0;
      else if (kind === 'right') n.x = x1 - n.w;
      else if (kind === 'center') n.x = Math.round((x0 + x1) / 2 - n.w / 2);
      else if (kind === 'top') n.y = y0;
      else if (kind === 'bottom') n.y = y1 - n.h;
      else if (kind === 'middle') n.y = Math.round((y0 + y1) / 2 - n.h / 2);
    }
    if (kind === 'dh' && s.length > 2) spread('x', 'w');
    if (kind === 'dv' && s.length > 2) spread('y', 'h');
    E.commit();
  };

  /* ---------- 甬道 / 心智圖 ---------- */
  E.pool = function (op) {
    const n = E.selNodes().find((m) => m.type === 'pool');
    if (!n) return;
    if (op === 'add') n.lanes.push({ title: '角色 ' + String.fromCharCode(65 + (n.lanes.length % 26)), size: n.lanes[n.lanes.length - 1].size });
    else if (op === 'remove' && n.lanes.length > 1) n.lanes.pop();
    else if (op === 'flip') {
      const cross = n.orient === 'h' ? n.w : n.h;
      n.orient = n.orient === 'h' ? 'v' : 'h';
      if (n.orient === 'h') n.w = cross; else n.h = cross;
    }
    VL.poolSync(n);
    E.commit();
  };
  E.mmAdd = function (how) {
    const n = E.selNodes()[0];
    if (!n || !n.mm) return;
    const c = how === 'staff' ? VL.mm.addStaff(E.doc, n) : how === 'child' ? VL.mm.addChild(E.doc, n) : VL.mm.addSibling(E.doc, n);
    E.sel = new Set([c.id]);
    E.commit();
    E.startEdit({ id: c.id, field: 'text' });
  };
  E.mmFlip = function () {
    E.selNodes().filter((n) => n.mm).forEach((n) => VL.mm.flip(E.doc, n));
    E.commit();
  };

  /* ---------- 鍵盤 ---------- */
  function onKey(evt) {
    const tag = evt.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const mod = evt.ctrlKey || evt.metaKey, k = evt.key.toLowerCase();
    const one = E.sel.size === 1 ? E.selNodes()[0] : null;
    const stop = () => evt.preventDefault();
    if (evt.code === 'Space') { spaceDown = true; stop(); }
    else if (k === 'delete' || k === 'backspace') { E.del(); stop(); }
    else if (mod && k === 'z') { if (evt.shiftKey) E.redo(); else E.undo(); stop(); }
    else if (mod && k === 'y') { E.redo(); stop(); }
    else if (mod && k === 'c') E.copy();
    else if (mod && k === 'x') { E.copy(); E.del(); }
    else if (mod && k === 'v') { E.paste(); stop(); }
    else if (mod && k === 'd') { E.copy(); E.paste(); stop(); }
    else if (mod && k === 'a') { E.selectAll(); stop(); }
    else if (mod && k === 's') { VL.io.saveSvg(); stop(); }
    else if (k === 'escape') { E.sel.clear(); E.render(); }
    else if (k === 'f2' && E.sel.size === 1) { E.startEdit(editTarget([...E.sel][0])); stop(); }
    else if (k === 'tab' && one && one.mm) { E.mmAdd('child'); stop(); }
    else if (k === 'enter' && one && one.mm) { E.mmAdd('sibling'); stop(); }
    else if (k === 'enter' && E.sel.size === 1) { E.startEdit(editTarget([...E.sel][0])); stop(); }
    else if (k.startsWith('arrow') && E.sel.size) {
      const s = evt.shiftKey ? 1 : VL.GRID, dx = k === 'arrowleft' ? -s : k === 'arrowright' ? s : 0, dy = k === 'arrowup' ? -s : k === 'arrowdown' ? s : 0;
      drag = null; startMove({ x: 0, y: 0 });
      drag.orig.forEach((o) => { o.n.x += dx; o.n.y += dy; });
      drag.ends.forEach((o) => { o.o.x += dx; o.o.y += dy; });
      drag = null;
      E.commit(); stop();
    }
  }
})();
