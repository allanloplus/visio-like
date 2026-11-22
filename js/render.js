/* 將文件模型繪製成 SVG 字串（畫布顯示與匯出共用同一份輸出） */
(function () {
  const VL = window.VL;
  const f2 = (v) => +(+v).toFixed(2);
  const d = (cmds) => cmds.map((c) => c[0] + c.slice(1).map(f2).join(' ')).join(' ');
  const dashAttr = (st) => (st.dash === 'dash' ? ' stroke-dasharray="7 4"' : st.dash === 'dot' ? ' stroke-dasharray="2 4"' : '');

  function partsSvg(parts, st) {
    return parts.map((p) => {
      const base = st.fill && st.fill !== 'none' ? st.fill : null;
      const fill = p.f === 'none' || !base ? 'none'
        : p.f === 'dark' ? VL.mix(base, '#000000', 0.35) : p.f === 'light' ? VL.mix(base, '#FFFFFF', 0.6) : base;
      const stroke = p.s === false || !st.stroke || st.stroke === 'none' ? 'none' : st.stroke;
      return `<path d="${d(p.c)}" fill="${fill}" stroke="${stroke}" stroke-width="${st.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"${dashAttr(st)}/>`;
    }).join('');
  }

  /* valign: 'middle' 以 y 為中心；'top' 以 y 為頂端 */
  function textBlock(lines, x, y, st, valign, extra) {
    if (!lines.length || lines.every((l) => !l)) return '';
    const fs = st.fontSize, lh = fs * 1.3;
    const y0 = (valign === 'top' ? y : y - (lines.length * lh) / 2) + fs * 1.0;
    return `<text font-family="${VL.FONT}" font-size="${fs}" fill="${st.color}" text-anchor="middle"${st.bold ? ' font-weight="bold"' : ''}${extra || ''}>` +
      lines.map((l, i) => `<tspan x="${f2(x)}" y="${f2(y0 + i * lh)}">${VL.esc(l)}</tspan>`).join('') + '</text>';
  }

  /* 甬道各區塊（供繪製、編輯定位、PPTX 匯出共用）— 區域座標 */
  function poolRects(n) {
    const HS = VL.HS, out = { title: null, lanes: [] };
    let o = 0;
    if (n.orient === 'h') {
      out.title = { x: 0, y: 0, w: HS, h: n.h };
      for (const l of n.lanes) {
        out.lanes.push({ head: { x: HS, y: o, w: HS, h: l.size }, body: { x: 2 * HS, y: o, w: n.w - 2 * HS, h: l.size } });
        o += l.size;
      }
    } else {
      out.title = { x: 0, y: 0, w: n.w, h: HS };
      for (const l of n.lanes) {
        out.lanes.push({ head: { x: o, y: HS, w: l.size, h: HS }, body: { x: o, y: 2 * HS, w: l.size, h: n.h - 2 * HS } });
        o += l.size;
      }
    }
    return out;
  }

  function poolSvg(n) {
    const st = n.style, R = poolRects(n), vert = n.orient === 'h';
    const box = (r, fill, cls) =>
      `<rect${cls ? ` class="${cls}"` : ''} x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}" stroke="${st.stroke}" stroke-width="${st.strokeWidth}"/>`;
    const label = (r, text, bold) => {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const s2 = Object.assign({}, st, { bold });
      return textBlock(String(text || '').split('\n'), cx, cy, s2, 'middle', vert ? ` transform="rotate(-90 ${cx} ${cy})"` : '');
    };
    let s = `<g data-id="${n.id}" transform="translate(${n.x} ${n.y})">`;
    for (const l of R.lanes) s += box(l.body, '#FFFFFF', 'vl-body');
    R.lanes.forEach((l, i) => (s += box(l.head, VL.mix(st.fill, '#FFFFFF', 0.45)) + label(l.head, n.lanes[i].title, false)));
    s += box(R.title, st.fill) + label(R.title, n.text, true);
    return s + '</g>';
  }

  function nodeSvg(n, opts) {
    if (n.type === 'pool') return poolSvg(n);
    const def = VL.shapes[n.type], st = n.style;
    let s = `<g data-id="${n.id}" transform="translate(${n.x} ${n.y})">`;
    if (opts && opts.interactive) s += `<rect class="vl-hit" width="${n.w}" height="${n.h}" fill="none"/>`;
    s += partsSvg(def.parts(n.w, n.h), st);
    if (def.label === 'below') s += textBlock(String(n.text || '').split('\n'), n.w / 2, n.h + 3, st, 'top');
    else s += textBlock(VL.text.wrap(n.text, Math.max(20, n.w - 12), st.fontSize, st.bold), n.w / 2, n.h / 2, st, 'middle');
    return s + '</g>';
  }

  function arrowHead(tip, from, st) {
    const len = 7 + st.strokeWidth * 2.5, half = len * 0.38;
    const L = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
    const ux = (tip.x - from.x) / L, uy = (tip.y - from.y) / L;
    const bx = tip.x - ux * len, by = tip.y - uy * len;
    return {
      base: { x: tip.x - ux * Math.min(len * 0.8, L), y: tip.y - uy * Math.min(len * 0.8, L) },
      svg: `<polygon points="${f2(tip.x)},${f2(tip.y)} ${f2(bx - uy * half)},${f2(by + ux * half)} ${f2(bx + uy * half)},${f2(by - ux * half)}" fill="${st.stroke}"/>`,
    };
  }

  function edgeLabelBox(e, pts) {
    if (!e.text) return null;
    const st = e.style, m = VL.router.midpoint(pts), lines = String(e.text).split('\n');
    const w = Math.max(...lines.map((l) => VL.text.width(l, st.fontSize, false))) + 8, h = lines.length * st.fontSize * 1.3 + 2;
    return { x: m.x - w / 2, y: m.y - h / 2, w, h, cx: m.x, cy: m.y, lines };
  }

  function edgeSvg(e, doc, opts) {
    const st = e.style, r = VL.router.route(e, doc), pts = r.pts.map((p) => ({ x: p.x, y: p.y }));
    if (pts.length < 2) return '';
    let heads = '';
    const full = pts.map((p) => `${f2(p.x)} ${f2(p.y)}`);
    if (st.endArrow) { const a = arrowHead(pts[pts.length - 1], pts[pts.length - 2], st); heads += a.svg; pts[pts.length - 1] = a.base; }
    if (st.startArrow) { const a = arrowHead(pts[0], pts[1], st); heads += a.svg; pts[0] = a.base; }
    const dd = 'M' + pts.map((p) => `${f2(p.x)} ${f2(p.y)}`).join(' L');
    let s = `<g data-id="${e.id}">`;
    if (opts && opts.interactive) s += `<path class="vl-hit" d="M${full.join(' L')}" fill="none" stroke="#000" stroke-opacity="0" stroke-width="14"/>`;
    s += `<path d="${dd}" fill="none" stroke="${st.stroke}" stroke-width="${st.strokeWidth}" stroke-linejoin="round"${dashAttr(st)}/>` + heads;
    const lb = edgeLabelBox(e, r.pts);
    if (lb) s += `<rect x="${f2(lb.x)}" y="${f2(lb.y)}" width="${f2(lb.w)}" height="${f2(lb.h)}" fill="#FFFFFF"/>` + textBlock(lb.lines, lb.cx, lb.cy, st, 'middle');
    return s + '</g>';
  }

  function linkSvg(l) {
    if (l.org) {
      const my = f2(l.a.y + (l.b.y - l.a.y) / 2);
      return `<path d="M${f2(l.a.x)} ${f2(l.a.y)} L${f2(l.a.x)} ${my} L${f2(l.b.x)} ${my} L${f2(l.b.x)} ${f2(l.b.y)}" fill="none" stroke="#595959" stroke-width="1.5" stroke-linejoin="round"/>`;
    }
    const mx = (l.a.x + l.b.x) / 2;
    return `<path d="M${f2(l.a.x)} ${f2(l.a.y)} C${f2(mx)} ${f2(l.a.y)} ${f2(mx)} ${f2(l.b.y)} ${f2(l.b.x)} ${f2(l.b.y)}" fill="none" stroke="${l.c.style.stroke === 'none' ? '#7F7F7F' : l.c.style.stroke}" stroke-width="1.6"/>`;
  }

  VL.render = {
    d, partsSvg, poolRects, edgeLabelBox,
    docSvg(doc, opts) {
      let s = '';
      doc.nodes.filter((n) => n.type === 'pool').forEach((n) => (s += nodeSvg(n, opts)));
      VL.mm.links(doc).forEach((l) => (s += linkSvg(l)));
      doc.nodes.filter((n) => n.type !== 'pool').forEach((n) => (s += nodeSvg(n, opts)));
      doc.edges.forEach((e) => (s += edgeSvg(e, doc, opts)));
      return s;
    },
    /* 調色盤縮圖 */
    thumb(type, w, h) {
      const def = VL.shapes[type], st = Object.assign(VL.defaultStyle(), def.style, { strokeWidth: 1.2 });
      if (st.fill === 'none') return `<svg width="${w + 4}" height="${h + 4}"><text x="${w / 2 + 2}" y="${h / 2 + 8}" text-anchor="middle" font-size="18" fill="#444">T</text></svg>`;
      return `<svg width="${w + 4}" height="${h + 4}"><g transform="translate(2 2)">${partsSvg(def.parts(w, h), st)}</g></svg>`;
    },
    nodeBox(n) {
      const def = VL.shapes[n.type];
      if (def && def.label === 'below' && n.text) {
        const lines = String(n.text).split('\n');
        const tw = Math.max(...lines.map((l) => VL.text.width(l, n.style.fontSize, n.style.bold)));
        const ex = Math.max(0, (tw - n.w) / 2);
        return { x: n.x - ex, y: n.y, w: n.w + 2 * ex, h: n.h + 5 + lines.length * n.style.fontSize * 1.3 };
      }
      return { x: n.x, y: n.y, w: n.w, h: n.h };
    },
    bbox(doc) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const add = (x, y, w, h) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + (w || 0)); y1 = Math.max(y1, y + (h || 0)); };
      doc.nodes.forEach((n) => { const b = this.nodeBox(n); add(b.x, b.y, b.w, b.h); });
      doc.edges.forEach((e) => {
        const r = VL.router.route(e, doc);
        r.pts.forEach((p) => add(p.x - 6, p.y - 6, 12, 12));
        const lb = edgeLabelBox(e, r.pts);
        if (lb) add(lb.x, lb.y, lb.w, lb.h);
      });
      if (x0 === Infinity) return { x: 0, y: 0, w: 100, h: 100 };
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    },
  };
})();
