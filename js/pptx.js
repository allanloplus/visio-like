/* 匯出 PPTX：圖形輸出為 PowerPoint 原生圖案，連接線輸出為「黏著」於圖案的原生接點，
   在 PowerPoint 中可直接改文字、改顏色、搬移（接點會跟著走）。 */
(function () {
  const VL = window.VL;
  const EMU = 9525;
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const emu = (v) => Math.round(v * EMU);
  const clr = (c) => `<a:solidFill><a:srgbClr val="${c.replace('#', '')}"/></a:solidFill>`;
  const fillXml = (c) => (!c || c === 'none' ? '<a:noFill/>' : clr(c));
  const dashXml = (st) => (st.dash === 'dash' ? '<a:prstDash val="dash"/>' : st.dash === 'dot' ? '<a:prstDash val="sysDot"/>' : '');
  function lnXml(st, ends) {
    if (!st.stroke || st.stroke === 'none') return '<a:ln><a:noFill/></a:ln>';
    return `<a:ln w="${emu(st.strokeWidth)}">${clr(st.stroke)}${dashXml(st)}<a:round/>${ends || ''}</a:ln>`;
  }
  const xfrm = (x, y, w, h, attrs) => `<a:xfrm${attrs || ''}><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm>`;

  function txBody(text, st, o) {
    o = o || {};
    const sz = Math.round(st.fontSize * 75);
    const rpr = (tag) => `<a:${tag} lang="zh-TW" altLang="en-US" sz="${sz}"${st.bold || o.bold ? ' b="1"' : ''}>${clr(st.color)}<a:latin typeface="Calibri"/><a:ea typeface="Microsoft JhengHei"/></a:${tag}>`;
    const paras = String(text || '').split('\n').map((l) =>
      `<a:p><a:pPr algn="ctr"/>${l ? `<a:r>${rpr('rPr')}<a:t>${VL.esc(l)}</a:t></a:r>` : ''}${rpr('endParaRPr')}</a:p>`).join('');
    return `<p:txBody><a:bodyPr${o.vert ? ' vert="vert270"' : ''} wrap="${o.nowrap ? 'none' : 'square'}" lIns="45720" tIns="27432" rIns="45720" bIns="27432" anchor="${o.anchor || 'ctr'}" rtlCol="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody>`;
  }

  const FILLMODE = { norm: 'norm', none: 'none', dark: 'darken', light: 'lighten' };
  function custGeom(parts, w, h, below, open) {
    const W = Math.max(1, Math.round(w * 100)), H = Math.max(1, Math.round(h * 100));
    const pt = (x, y) => `<a:pt x="${Math.round(x * 100)}" y="${Math.round(y * 100)}"/>`;
    const paths = parts.map((p) => {
      const body = p.c.map((c) =>
        c[0] === 'M' ? `<a:moveTo>${pt(c[1], c[2])}</a:moveTo>`
          : c[0] === 'L' ? `<a:lnTo>${pt(c[1], c[2])}</a:lnTo>`
            : c[0] === 'C' ? `<a:cubicBezTo>${pt(c[1], c[2])}${pt(c[3], c[4])}${pt(c[5], c[6])}</a:cubicBezTo>` : '<a:close/>').join('');
      return `<a:path w="${W}" h="${H}" fill="${FILLMODE[p.f || 'norm']}"${p.s === false ? ' stroke="0"' : ''}>${body}</a:path>`;
    }).join('');
    const cxn = open ? '<a:cxnLst/>' :
      '<a:cxnLst><a:cxn ang="16200000"><a:pos x="hc" y="t"/></a:cxn><a:cxn ang="10800000"><a:pos x="l" y="vc"/></a:cxn><a:cxn ang="5400000"><a:pos x="hc" y="b"/></a:cxn><a:cxn ang="0"><a:pos x="r" y="vc"/></a:cxn></a:cxnLst>';
    const gd = below ? '<a:gdLst><a:gd name="tb" fmla="*/ h 2 1"/></a:gdLst>' : '<a:gdLst/>';
    const rect = below ? '<a:rect l="l" t="b" r="r" b="tb"/>' : '<a:rect l="l" t="t" r="r" b="b"/>';
    return `<a:custGeom><a:avLst/>${gd}<a:ahLst/>${cxn}${rect}<a:pathLst>${paths}</a:pathLst></a:custGeom>`;
  }

  function build(doc) {
    doc = VL.clone(doc);
    VL.mm.layoutAll(doc);
    const bb = VL.render.bbox(doc), MARGIN = 40;
    const SW = Math.min(5300, Math.max(1280, Math.ceil(bb.w + MARGIN * 2))), SH = Math.min(5300, Math.max(720, Math.ceil(bb.h + MARGIN * 2)));
    const ox = Math.round((SW - bb.w) / 2 - bb.x), oy = Math.round((SH - bb.h) / 2 - bb.y);
    let nextId = 2;
    const ids = {};
    doc.nodes.forEach((n) => (ids[n.id] = nextId++));
    const nv = (id, name, extra) => `<p:nvSpPr><p:cNvPr id="${id}" name="${VL.esc(name)}"/><p:cNvSpPr${extra || ''}/><p:nvPr/></p:nvSpPr>`;

    function shape(n) {
      const def = VL.shapes[n.type], st = n.style, below = def.label === 'below';
      const geom = def.prst ? `<a:prstGeom prst="${def.prst}"><a:avLst/></a:prstGeom>` : custGeom(def.parts(n.w, n.h), n.w, n.h, below);
      return `<p:sp>${nv(ids[n.id], def.name)}<p:spPr>${xfrm(n.x + ox, n.y + oy, n.w, n.h)}${geom}${fillXml(st.fill)}${lnXml(st)}</p:spPr>${txBody(n.text, st, below ? { anchor: 't', nowrap: true } : null)}</p:sp>`;
    }
    function pool(n) {
      const st = n.style, R = VL.render.poolRects(n), vert = n.orient === 'h';
      const box = (r, fill, text, o) =>
        `<p:sp>${nv(nextId++, '甬道')}<p:spPr>${xfrm(n.x + ox + r.x, n.y + oy + r.y, r.w, r.h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fillXml(fill)}${lnXml(st)}</p:spPr>${txBody(text, st, o)}</p:sp>`;
      let kids = '';
      R.lanes.forEach((l) => (kids += box(l.body, '#FFFFFF', '', null)));
      R.lanes.forEach((l, i) => (kids += box(l.head, VL.mix(st.fill, '#FFFFFF', 0.45), n.lanes[i].title, { vert })));
      kids += box(R.title, st.fill, n.text, { vert, bold: true });
      const x = emu(n.x + ox), y = emu(n.y + oy), w = emu(n.w), h = emu(n.h);
      return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${ids[n.id]}" name="${VL.esc('甬道圖 ' + (n.text || ''))}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/><a:chOff x="${x}" y="${y}"/><a:chExt cx="${w}" cy="${h}"/></a:xfrm></p:grpSpPr>${kids}</p:grpSp>`;
    }
    const glueIdx = (n, side) => VL.SIDES.indexOf(side) * (VL.shapes[n.type].prst === 'ellipse' ? 2 : 1);
    function connector(prst, a, b, o) {
      // o: { vert, adj, st, ends, from:{node,side}, to:{node,side} }
      const dx = b.x - a.x, dy = b.y - a.y, W = Math.abs(dx), H = Math.abs(dy);
      let xf;
      if (o.vert) {
        const cx = (a.x + b.x) / 2 + ox, cy = (a.y + b.y) / 2 + oy;
        xf = xfrm(cx - H / 2, cy - W / 2, H, W, ` rot="5400000"${dy < 0 ? ' flipH="1"' : ''}${dx > 0 ? ' flipV="1"' : ''}`);
      } else {
        xf = xfrm(Math.min(a.x, b.x) + ox, Math.min(a.y, b.y) + oy, W, H, `${dx < 0 ? ' flipH="1"' : ''}${dy < 0 ? ' flipV="1"' : ''}`);
      }
      const av = o.adj != null ? `<a:avLst><a:gd name="adj1" fmla="val ${Math.round(o.adj * 100000)}"/></a:avLst>` : '<a:avLst/>';
      const glue = (tag, g) => (g && g.node && g.node.type !== 'pool' ? `<a:${tag} id="${ids[g.node.id]}" idx="${glueIdx(g.node, g.side)}"/>` : '');
      return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${nextId++}" name="連接線"/><p:cNvCxnSpPr>${glue('stCxn', o.from)}${glue('endCxn', o.to)}</p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr><p:spPr>${xf}<a:prstGeom prst="${prst}">${av}</a:prstGeom>${lnXml(o.st, o.ends)}</p:spPr></p:cxnSp>`;
    }
    function edgeXml(e) {
      const st = e.style, r = VL.router.route(e, doc), pts = r.pts;
      if (pts.length < 2) return '';
      const ends = `<a:headEnd type="${st.startArrow ? 'triangle' : 'none'}"/><a:tailEnd type="${st.endArrow ? 'triangle' : 'none'}"/>`;
      const a = pts[0], b = pts[pts.length - 1], o = { st, ends, from: r.a, to: r.b, vert: r.pptx.vert };
      let s;
      if (r.pptx.type === 'straight') s = connector('straightConnector1', a, b, Object.assign(o, { vert: false }));
      else if (r.pptx.type === 'bent2') s = connector('bentConnector2', a, b, o);
      else if (r.pptx.type === 'bent3') s = connector('bentConnector3', a, b, Object.assign(o, { adj: r.pptx.adj }));
      else {
        // 繞行路徑：以手繪多邊形輸出（外觀一致，但不黏著圖案）
        const x0 = Math.min(...pts.map((p) => p.x)), y0 = Math.min(...pts.map((p) => p.y));
        const w = Math.max(1, Math.max(...pts.map((p) => p.x)) - x0), h = Math.max(1, Math.max(...pts.map((p) => p.y)) - y0);
        const part = { c: pts.map((p, i) => [i ? 'L' : 'M', p.x - x0, p.y - y0]), f: 'none' };
        s = `<p:sp>${nv(nextId++, '連接線')}<p:spPr>${xfrm(x0 + ox, y0 + oy, w, h)}${custGeom([part], w, h, false, true)}<a:noFill/>${lnXml(st, ends)}</p:spPr></p:sp>`;
      }
      const lb = VL.render.edgeLabelBox(e, pts);
      if (lb) {
        s += `<p:sp>${nv(nextId++, '線條文字', ' txBox="1"')}<p:spPr>${xfrm(lb.x + ox - 3, lb.y + oy - 2, lb.w + 6, lb.h + 4)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fillXml('#FFFFFF')}<a:ln><a:noFill/></a:ln></p:spPr>${txBody(e.text, st, { nowrap: true })}</p:sp>`;
      }
      return s;
    }

    let tree = '';
    doc.nodes.filter((n) => n.type === 'pool').forEach((n) => (tree += pool(n)));
    VL.mm.links(doc).forEach((l) => {
      const st = { stroke: l.c.style.stroke === 'none' ? '#7F7F7F' : l.c.style.stroke, strokeWidth: 1.6 };
      tree += connector('curvedConnector3', l.a, l.b, { st, adj: 0.5, from: { node: l.p, side: l.right ? 'r' : 'l' }, to: { node: l.c, side: l.right ? 'l' : 'r' } });
    });
    doc.nodes.filter((n) => n.type !== 'pool').forEach((n) => (tree += shape(n)));
    doc.edges.forEach((e) => (tree += edgeXml(e)));

    const emptyTree = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
    const rels = (list) => XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((r, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/${r[0]}" Target="${r[1]}"/>`).join('')}</Relationships>`;
    const CT = 'application/vnd.openxmlformats-officedocument.';
    const files = {
      '[Content_Types].xml': XML + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="${CT}presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${CT}presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${CT}presentationml.slideLayout+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="${CT}presentationml.slide+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="${CT}theme+xml"/></Types>`,
      '_rels/.rels': rels([['officeDocument', 'ppt/presentation.xml']]),
      'ppt/presentation.xml': XML + `<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="${emu(SW)}" cy="${emu(SH)}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
      'ppt/_rels/presentation.xml.rels': rels([['slideMaster', 'slideMasters/slideMaster1.xml'], ['slide', 'slides/slide1.xml'], ['theme', 'theme/theme1.xml']]),
      'ppt/slideMasters/slideMaster1.xml': XML + `<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${emptyTree}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`,
      'ppt/slideMasters/_rels/slideMaster1.xml.rels': rels([['slideLayout', '../slideLayouts/slideLayout1.xml'], ['theme', '../theme/theme1.xml']]),
      'ppt/slideLayouts/slideLayout1.xml': XML + `<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${emptyTree}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
      'ppt/slideLayouts/_rels/slideLayout1.xml.rels': rels([['slideMaster', '../slideMasters/slideMaster1.xml']]),
      'ppt/slides/slide1.xml': XML + `<p:sld ${NS}><p:cSld><p:spTree>${emptyTree}${tree}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
      'ppt/slides/_rels/slide1.xml.rels': rels([['slideLayout', '../slideLayouts/slideLayout1.xml']]),
      'ppt/theme/theme1.xml': XML + THEME,
    };
    const zip = new JSZip();
    for (const k in files) zip.file(k, files[k]);
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', compression: 'DEFLATE' });
  }

  const ph = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const THEME = '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements>' +
    '<a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>' +
    '<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
    `<a:fmtScheme name="Office"><a:fillStyleLst>${ph}${ph}${ph}</a:fillStyleLst><a:lnStyleLst><a:ln w="6350">${ph}</a:ln><a:ln w="12700">${ph}</a:ln><a:ln w="19050">${ph}</a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>${ph}${ph}${ph}</a:bgFillStyleLst></a:fmtScheme>` +
    '</a:themeElements></a:theme>';

  VL.pptx = { build };
})();
