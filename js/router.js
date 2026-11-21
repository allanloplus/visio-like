/* 連接線路徑計算。回傳 { pts, pptx }，pptx 說明此路徑可對應到哪一種 PowerPoint 原生接點 */
(function () {
  const VL = window.VL;
  const M = 20;
  const T = (p) => ({ x: p.y, y: p.x });
  const TS = { t: 'l', l: 't', b: 'r', r: 'b' };

  function endInfo(end, doc) {
    if (end && end.id) {
      const n = VL.node(doc, end.id);
      if (n) return { p: VL.portPos(n, end.side), side: end.side, node: n };
    }
    return { p: { x: (end && end.x) || 0, y: (end && end.y) || 0 }, side: null, node: null };
  }
  function towards(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'r' : 'l') : dy >= 0 ? 'b' : 't';
  }
  function clean(pts) {
    const out = [];
    for (const p of pts) {
      const l = out[out.length - 1];
      if (l && Math.abs(l.x - p.x) < 0.01 && Math.abs(l.y - p.y) < 0.01) continue;
      const k = out[out.length - 2];
      if (k && l && ((Math.abs(k.x - l.x) < 0.01 && Math.abs(l.x - p.x) < 0.01) || (Math.abs(k.y - l.y) < 0.01 && Math.abs(l.y - p.y) < 0.01))) out.pop();
      out.push(p);
    }
    return out;
  }
  /* 兩節點之間、不穿過節點的水平通道 y 值 */
  function channelY(a, b, an, bn) {
    if (an && bn) {
      const at = an.y, ab = an.y + an.h, bt = bn.y, bb = bn.y + bn.h;
      if (ab + 2 * 6 <= bt) return (ab + bt) / 2;
      if (bb + 2 * 6 <= at) return (bb + at) / 2;
      return Math.min(at, bt) - M;
    }
    return (a.y + b.y) / 2;
  }

  /* 起點側為水平方向 (l/r) 的求解；垂直情況以轉置處理 */
  function solve(a, as, b, bs, an, bn) {
    const da = VL.DIR[as], db = VL.DIR[bs];
    if (bs === 'l' || bs === 'r') {
      if (as !== bs) {
        if ((b.x - a.x) * da[0] > M) {
          const mx = (a.x + b.x) / 2;
          return { pts: [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b], pptx: { type: 'bent3', adj: 0.5 } };
        }
        const x1 = a.x + da[0] * M, x2 = b.x + db[0] * M, my = channelY(a, b, an, bn);
        return { pts: [a, { x: x1, y: a.y }, { x: x1, y: my }, { x: x2, y: my }, { x: x2, y: b.y }, b], pptx: { type: 'free' } };
      }
      const mx = da[0] > 0 ? Math.max(a.x, b.x) + M : Math.min(a.x, b.x) - M;
      const pptx = Math.abs(b.x - a.x) > 1 ? { type: 'bent3', adj: (mx - a.x) / (b.x - a.x) } : { type: 'free' };
      return { pts: [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b], pptx };
    }
    if ((b.x - a.x) * da[0] > 0 && (a.y - b.y) * db[1] > 0)
      return { pts: [a, { x: b.x, y: a.y }, b], pptx: { type: 'bent2' } };
    const x1 = a.x + da[0] * M, y2 = b.y + db[1] * M;
    return { pts: [a, { x: x1, y: a.y }, { x: x1, y: y2 }, { x: b.x, y: y2 }, b], pptx: { type: 'free' } };
  }

  VL.router = {
    endInfo,
    route(e, doc) {
      const A = endInfo(e.from, doc), B = endInfo(e.to, doc);
      const as = A.side || towards(A.p, B.p), bs = B.side || towards(B.p, A.p);
      let r;
      if (e.kind === 'straight') r = { pts: [A.p, B.p], pptx: { type: 'straight' } };
      else if (as === 'l' || as === 'r') r = solve(A.p, as, B.p, bs, A.node, B.node);
      else {
        const tn = (n) => n && { x: n.y, y: n.x, w: n.h, h: n.w };
        r = solve(T(A.p), TS[as], T(B.p), TS[bs], tn(A.node), tn(B.node));
        r.pts = r.pts.map(T);
        r.pptx.vert = true;
      }
      r.pts = clean(r.pts);
      if (r.pts.length <= 2) r.pptx = { type: 'straight' };
      r.a = A; r.b = B;
      return r;
    },
    /* 折線中點（放標籤用） */
    midpoint(pts) {
      let len = 0;
      const seg = [];
      for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(d); len += d; }
      let t = len / 2;
      for (let i = 0; i < seg.length; i++) {
        if (t <= seg[i] || i === seg.length - 1) {
          const f = seg[i] ? t / seg[i] : 0;
          return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f };
        }
        t -= seg[i];
      }
      return pts[0];
    },
  };
})();
