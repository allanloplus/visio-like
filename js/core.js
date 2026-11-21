/* 共用工具：命名空間、文字量測、顏色、文件模型 */
(function () {
  const VL = (window.VL = window.VL || {});

  VL.APP = {
    name: "Allan's 隨意畫流程圖",
    author: 'Allan Lo',
    site: 'https://www.123hi.org',
    date: '2026/11/21',
    version: 'Allanlo-20261121-01',
  };

  VL.FONT = "'Microsoft JhengHei','PingFang TC','Noto Sans TC','Segoe UI',Arial,sans-serif";
  VL.GRID = 10;
  VL.HS = 28; // 甬道標題列寬度

  VL.uid = () => 'n' + Math.random().toString(36).slice(2, 10);
  VL.snap = (v) => Math.round(v / VL.GRID) * VL.GRID;
  VL.esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  VL.clone = (o) => JSON.parse(JSON.stringify(o));

  const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  VL.mix = (a, b, t) => {
    const A = hex2rgb(a), B = hex2rgb(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
  };

  const ctx = document.createElement('canvas').getContext('2d');
  VL.text = {
    width(s, fs, bold) {
      ctx.font = `${bold ? 'bold ' : ''}${fs}px ${VL.FONT}`;
      return ctx.measureText(s).width;
    },
    /* 依寬度折行；中日韓文字逐字可斷，英數以單字為單位 */
    wrap(text, maxW, fs, bold) {
      const out = [];
      for (const para of String(text || '').split('\n')) {
        const tokens = para.match(/[⺀-￯]|[^\s⺀-￯]+|\s+/g) || [''];
        let line = '';
        for (const tk of tokens) {
          if (line && this.width(line + tk, fs, bold) > maxW) {
            out.push(line.trimEnd());
            line = /^\s+$/.test(tk) ? '' : tk;
          } else line += tk;
        }
        out.push(line.trimEnd());
      }
      return out;
    },
  };

  VL.newDoc = () => ({ version: 1, nodes: [], edges: [] });
  VL.node = (doc, id) => doc.nodes.find((n) => n.id === id);
  VL.edge = (doc, id) => doc.edges.find((e) => e.id === id);

  VL.defaultStyle = () => ({
    fill: '#FFFFFF', stroke: '#2F5597', strokeWidth: 1.5, dash: '',
    fontSize: 14, color: '#1F1F1F', bold: false,
  });
  VL.defaultEdgeStyle = () => ({
    stroke: '#404040', strokeWidth: 1.5, dash: '', startArrow: false, endArrow: true,
    fontSize: 12, color: '#1F1F1F',
  });

  /* 甬道：依泳道大小同步整體尺寸 */
  VL.poolSync = (n) => {
    const sum = n.lanes.reduce((a, l) => a + l.size, 0);
    if (n.orient === 'h') n.h = sum; else n.w = sum;
  };

  /* UTF-8 安全的 base64 */
  VL.b64enc = (s) => {
    const bytes = new TextEncoder().encode(s);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  VL.b64dec = (b) => new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
})();
