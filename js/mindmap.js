/* 心智圖：節點以 mm:{parent, side} 表示樹狀關係，位置由自動排版決定 */
(function () {
  const VL = window.VL;
  const HG = 46, VG = 14;
  const COLORS = ['#2E75B6', '#C55A11', '#548235', '#7030A0', '#BF9000', '#C00000'];

  const kids = (doc, id) => doc.nodes.filter((n) => n.mm && n.mm.parent === id);
  const rootOf = (doc, n) => {
    while (n && n.mm && n.mm.parent) n = VL.node(doc, n.mm.parent);
    return n;
  };
  const subtree = (doc, id, out = []) => {
    out.push(id);
    kids(doc, id).forEach((k) => subtree(doc, k.id, out));
    return out;
  };

  function size(n) {
    const st = n.style, pad = n.mm.parent ? 14 : 22;
    const lines = VL.text.wrap(n.text || ' ', 200, st.fontSize, st.bold);
    const tw = Math.max(...lines.map((l) => VL.text.width(l, st.fontSize, st.bold)));
    n.w = Math.max(50, Math.ceil(tw) + pad * 2);
    n.h = Math.ceil(lines.length * st.fontSize * 1.3) + (n.mm.parent ? 12 : 22);
  }
  function subH(doc, n) {
    const ks = kids(doc, n.id);
    if (!ks.length) return n.h;
    return Math.max(n.h, ks.reduce((a, k) => a + subH(doc, k), 0) + VG * (ks.length - 1));
  }
  function place(doc, n, side, xEdge, top) {
    const H = subH(doc, n);
    n.x = side === 'r' ? xEdge : xEdge - n.w;
    n.y = Math.round(top + H / 2 - n.h / 2);
    const ks = kids(doc, n.id);
    const total = ks.reduce((a, k) => a + subH(doc, k), 0) + VG * Math.max(0, ks.length - 1);
    let y = top + (H - total) / 2;
    const nx = side === 'r' ? n.x + n.w + HG : n.x - HG;
    for (const k of ks) { place(doc, k, side, nx, y); y += subH(doc, k) + VG; }
  }
  function layout(doc, root) {
    subtree(doc, root.id).forEach((id) => size(VL.node(doc, id)));
    const cy = root.y + root.h / 2;
    for (const side of ['r', 'l']) {
      const ks = kids(doc, root.id).filter((k) => k.mm.side === side);
      const total = ks.reduce((a, k) => a + subH(doc, k), 0) + VG * Math.max(0, ks.length - 1);
      let y = cy - total / 2;
      const x = side === 'r' ? root.x + root.w + HG : root.x - HG;
      for (const k of ks) { place(doc, k, side, x, y); y += subH(doc, k) + VG; }
    }
  }

  function make(text, parent, side, style) {
    return { id: VL.uid(), type: 'round', x: 0, y: 0, w: 80, h: 30, text, style: Object.assign(VL.defaultStyle(), style), mm: { parent, side } };
  }

  VL.mm = {
    kids, rootOf, subtree,
    layoutAll(doc) {
      doc.nodes.filter((n) => n.mm && !n.mm.parent).forEach((r) => {
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        size(r);
        r.x = Math.round(cx - r.w / 2); r.y = Math.round(cy - r.h / 2);
        layout(doc, r);
      });
    },
    createRoot(doc, x, y) {
      const root = make('中心主題', null, 'r', { fill: '#1F4E79', stroke: '#1F4E79', color: '#FFFFFF', fontSize: 18, bold: true });
      root.x = x - 60; root.y = y - 25; root.w = 120; root.h = 50;
      doc.nodes.push(root);
      for (let i = 0; i < 3; i++) this.addChild(doc, root);
      return root;
    },
    addChild(doc, parent, afterId) {
      const sibs = kids(doc, parent.id);
      let n;
      if (!parent.mm.parent) {
        const color = COLORS[sibs.length % COLORS.length];
        const r = sibs.filter((k) => k.mm.side === 'r').length;
        n = make('分支主題', parent.id, r <= sibs.length - r ? 'r' : 'l', { fill: VL.mix(color, '#FFFFFF', 0.82), stroke: color, fontSize: 14 });
      } else {
        n = make('子主題', parent.id, parent.mm.side, { fill: '#FFFFFF', stroke: parent.style.stroke, fontSize: 13 });
      }
      const after = afterId || (sibs.length ? sibs[sibs.length - 1].id : parent.id);
      const idx = Math.max(...subtree(doc, after).map((id) => doc.nodes.findIndex((m) => m.id === id)));
      doc.nodes.splice(idx + 1, 0, n);
      return n;
    },
    addSibling(doc, node) {
      const parent = VL.node(doc, node.mm.parent);
      if (!parent) return this.addChild(doc, node);
      const n = this.addChild(doc, parent, node.id);
      n.mm.side = node.mm.side;
      if (!parent.mm.parent) return n;
      n.style.stroke = node.style.stroke;
      return n;
    },
    flip(doc, node) {
      let top = node;
      while (top.mm.parent && VL.node(doc, top.mm.parent).mm.parent) top = VL.node(doc, top.mm.parent);
      if (!top.mm.parent) return;
      const s = top.mm.side === 'r' ? 'l' : 'r';
      subtree(doc, top.id).forEach((id) => (VL.node(doc, id).mm.side = s));
    },
    /* 隱含的父子連線 */
    links(doc) {
      const out = [];
      for (const c of doc.nodes) {
        if (!c.mm || !c.mm.parent) continue;
        const p = VL.node(doc, c.mm.parent);
        if (!p) continue;
        const right = c.x + c.w / 2 >= p.x + p.w / 2;
        out.push({
          p, c, right,
          a: { x: right ? p.x + p.w : p.x, y: p.y + p.h / 2 },
          b: { x: right ? c.x : c.x + c.w, y: c.y + c.h / 2 },
        });
      }
      return out;
    },
  };
})();
