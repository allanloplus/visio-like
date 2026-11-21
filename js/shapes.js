/* 圖形庫：每個圖形以「路徑指令」定義一次，同時供 SVG 繪製與 PPTX (custGeom) 匯出使用。
   part = { c: 指令陣列, f: 'norm'|'none'|'dark'|'light', s: 是否描邊(預設 true) } */
(function () {
  const VL = window.VL;
  const K = 0.5523;

  const P = {
    rect: (x, y, w, h) => [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']],
    poly: (pts, open) => {
      const c = pts.map((p, i) => [i ? 'L' : 'M', p[0], p[1]]);
      if (!open) c.push(['Z']);
      return c;
    },
    ellipse: (cx, cy, rx, ry) => [
      ['M', cx - rx, cy],
      ['C', cx - rx, cy - K * ry, cx - K * rx, cy - ry, cx, cy - ry],
      ['C', cx + K * rx, cy - ry, cx + rx, cy - K * ry, cx + rx, cy],
      ['C', cx + rx, cy + K * ry, cx + K * rx, cy + ry, cx, cy + ry],
      ['C', cx - K * rx, cy + ry, cx - rx, cy + K * ry, cx - rx, cy],
      ['Z'],
    ],
    round: (x, y, w, h, r) => {
      r = Math.min(r, w / 2, h / 2);
      const k = r * (1 - K);
      return [
        ['M', x + r, y], ['L', x + w - r, y], ['C', x + w - k, y, x + w, y + k, x + w, y + r],
        ['L', x + w, y + h - r], ['C', x + w, y + h - k, x + w - k, y + h, x + w - r, y + h],
        ['L', x + r, y + h], ['C', x + k, y + h, x, y + h - k, x, y + h - r],
        ['L', x, y + r], ['C', x, y + k, x + k, y, x + r, y], ['Z'],
      ];
    },
  };
  VL.P = P;

  /* 將 100x100 格線座標縮放到 w x h */
  const sc = (cmds, w, h) =>
    cmds.map((c) => [c[0]].concat(c.slice(1).map((v, i) => (i % 2 ? (v * h) / 100 : (v * w) / 100))));
  const grid = (list) => (w, h) => list.map((p) => ({ c: sc(p[0], w, h), f: p[1] || 'norm', s: p[2] !== false }));

  const S = (VL.shapes = {});
  const add = (id, name, cat, w, h, parts, extra) => (S[id] = Object.assign({ id, name, cat, w, h, parts }, extra));

  /* ---------- 流程圖 ---------- */
  add('process', '處理程序', 'flow', 120, 60, (w, h) => [{ c: P.rect(0, 0, w, h) }], { prst: 'rect' });
  add('round', '圓角處理', 'flow', 120, 60, (w, h) => [{ c: P.round(0, 0, w, h, Math.min(w, h) / 6) }], { prst: 'roundRect' });
  add('terminator', '開始 / 結束', 'flow', 120, 50, (w, h) => [{ c: P.round(0, 0, w, h, h / 2) }], { prst: 'flowChartTerminator' });
  add('decision', '判斷', 'flow', 120, 80, (w, h) => [{ c: P.poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]) }], { prst: 'flowChartDecision' });
  add('data', '資料 (輸入/輸出)', 'flow', 120, 60, (w, h) => [{ c: P.poly([[w * 0.18, 0], [w, 0], [w * 0.82, h], [0, h]]) }]);
  add('document', '文件', 'flow', 120, 70, (w, h) => [{
    c: [['M', 0, 0], ['L', w, 0], ['L', w, h * 0.84],
      ['C', w * 0.78, h * 0.68, w * 0.62, h * 0.74, w * 0.5, h * 0.86],
      ['C', w * 0.36, h, w * 0.18, h * 1.02, 0, h * 0.9], ['Z']],
  }]);
  add('predefined', '子流程', 'flow', 120, 60, (w, h) => [
    { c: P.rect(0, 0, w, h) },
    { c: P.poly([[w * 0.1, 0], [w * 0.1, h]], true), f: 'none' },
    { c: P.poly([[w * 0.9, 0], [w * 0.9, h]], true), f: 'none' },
  ]);
  add('database', '資料庫', 'flow', 90, 80, (w, h) => {
    const ry = Math.min(h * 0.15, 14), k = K * ry, m = w / 2;
    return [
      {
        c: [['M', 0, ry], ['C', 0, ry - k, m - K * m, 0, m, 0], ['C', m + K * m, 0, w, ry - k, w, ry],
          ['L', w, h - ry], ['C', w, h - ry + k, m + K * m, h, m, h], ['C', m - K * m, h, 0, h - ry + k, 0, h - ry], ['Z']],
      },
      { c: [['M', 0, ry], ['C', 0, ry + k, m - K * m, 2 * ry, m, 2 * ry], ['C', m + K * m, 2 * ry, w, ry + k, w, ry]], f: 'none' },
    ];
  });
  add('manual', '人工輸入', 'flow', 120, 60, (w, h) => [{ c: P.poly([[0, h * 0.3], [w, 0], [w, h], [0, h]]) }]);
  add('prep', '準備', 'flow', 120, 60, (w, h) => [{ c: P.poly([[w * 0.15, 0], [w * 0.85, 0], [w, h / 2], [w * 0.85, h], [w * 0.15, h], [0, h / 2]]) }]);
  add('circle', '連接點', 'flow', 50, 50, (w, h) => [{ c: P.ellipse(w / 2, h / 2, w / 2, h / 2) }], { prst: 'ellipse' });
  add('offpage', '跨頁連接', 'flow', 60, 60, (w, h) => [{ c: P.poly([[0, 0], [w, 0], [w, h * 0.6], [w / 2, h], [0, h * 0.6]]) }]);
  add('delay', '延遲 / 等待', 'flow', 100, 60, (w, h) => [{
    c: [['M', 0, 0], ['L', w - h / 2, 0], ['C', w - h / 2 + (K * h) / 2, 0, w, h / 2 - (K * h) / 2, w, h / 2],
      ['C', w, h / 2 + (K * h) / 2, w - h / 2 + (K * h) / 2, h, w - h / 2, h], ['L', 0, h], ['Z']],
  }]);
  add('note', '註解', 'flow', 120, 70, (w, h) => {
    const f = Math.min(16, w / 3, h / 3);
    return [
      { c: P.poly([[0, 0], [w - f, 0], [w, f], [w, h], [0, h]]) },
      { c: P.poly([[w - f, 0], [w - f, f], [w, f]]), f: 'dark' },
    ];
  }, { style: { fill: '#FFF2CC', stroke: '#BF9000' } });
  const CLOUD = [['M', 25, 82], ['C', 6, 82, 0, 62, 13, 52], ['C', 5, 33, 24, 20, 38, 27], ['C', 44, 8, 72, 8, 76, 29],
    ['C', 95, 27, 103, 52, 88, 63], ['C', 96, 75, 86, 84, 75, 82], ['Z']];
  add('cloudshape', '雲', 'flow', 130, 80, grid([[CLOUD]]));
  add('text', '文字', 'flow', 120, 40, (w, h) => [{ c: P.rect(0, 0, w, h) }], { prst: 'rect', style: { fill: 'none', stroke: 'none' }, text: '文字' });

  /* ---------- 圖示 (100x100 格線) ---------- */
  const icon = (id, name, list, style) =>
    add('i-' + id, name, 'icon', 60, 60, grid(list), {
      label: 'below', text: name,
      style: Object.assign({ fill: '#5B9BD5', stroke: '#1F3864', strokeWidth: 1.2, fontSize: 12 }, style),
    });
  const person = (cx, cy, k) => [
    [[['M', cx - 36 * k, cy + 40 * k], ['C', cx - 36 * k, cy + 12 * k, cx - 18 * k, cy, cx, cy],
      ['C', cx + 18 * k, cy, cx + 36 * k, cy + 12 * k, cx + 36 * k, cy + 40 * k], ['Z']]],
    [P.ellipse(cx, cy - 24 * k, 18 * k, 18 * k)],
  ];
  const HA = [[12, 50], [28, 36], [28, 45], [72, 45], [72, 36], [88, 50], [72, 64], [72, 55], [28, 55], [28, 64]];

  icon('user', '使用者', person(50, 54, 1));
  icon('users', '群組', [...person(30, 50, 0.7).map((p) => [p[0], 'dark']), ...person(70, 50, 0.7).map((p) => [p[0], 'dark']), ...person(50, 60, 0.85)]);
  icon('pc', '電腦', [
    [P.round(8, 10, 84, 58, 5)], [P.rect(15, 17, 70, 44), 'light'],
    [P.poly([[42, 68], [58, 68], [62, 82], [38, 82]]), 'dark'], [P.round(26, 82, 48, 7, 2)],
  ]);
  icon('laptop', '筆電', [
    [P.round(18, 16, 64, 48, 4)], [P.rect(24, 22, 52, 36), 'light'],
    [P.poly([[12, 66], [88, 66], [98, 80], [2, 80]])], [P.poly([[40, 72], [60, 72], [62, 76], [38, 76]]), 'dark'],
  ]);
  icon('mobile', '行動裝置', [
    [P.round(30, 6, 40, 88, 7)], [P.rect(35, 16, 30, 60), 'light'], [P.ellipse(50, 85, 3.5, 3.5), 'light'],
  ]);
  icon('server', '主機', [
    [P.round(22, 6, 56, 88, 4)],
    [P.rect(29, 14, 42, 13), 'light'], [P.rect(29, 33, 42, 13), 'light'], [P.rect(29, 52, 42, 13), 'light'],
    [P.ellipse(64, 20.5, 2.5, 2.5), 'dark'], [P.ellipse(64, 39.5, 2.5, 2.5), 'dark'], [P.ellipse(64, 58.5, 2.5, 2.5), 'dark'],
    [P.poly([[32, 78], [68, 78]], true), 'none'], [P.poly([[32, 84], [68, 84]], true), 'none'],
  ]);
  icon('db', '資料庫', [
    [[['M', 14, 20], ['C', 14, 4, 86, 4, 86, 20], ['L', 86, 80], ['C', 86, 96, 14, 96, 14, 80], ['Z']]],
    [P.ellipse(50, 20, 36, 12), 'light'],
    [[['M', 14, 40], ['C', 14, 56, 86, 56, 86, 40]], 'none'],
    [[['M', 14, 60], ['C', 14, 76, 86, 76, 86, 60]], 'none'],
  ]);
  icon('cloud', '雲端', [[CLOUD, 'light']]);
  icon('internet', '網際網路', [
    [P.ellipse(50, 50, 42, 42), 'light'], [P.ellipse(50, 50, 18, 42), 'none'],
    [P.poly([[8, 50], [92, 50]], true), 'none'], [P.poly([[15, 28], [85, 28]], true), 'none'], [P.poly([[15, 72], [85, 72]], true), 'none'],
  ]);
  icon('firewall', '防火牆', [
    [P.rect(8, 18, 84, 64)],
    [P.poly([[8, 34], [92, 34]], true), 'none'], [P.poly([[8, 50], [92, 50]], true), 'none'], [P.poly([[8, 66], [92, 66]], true), 'none'],
    [P.poly([[36, 18], [36, 34]], true), 'none'], [P.poly([[64, 18], [64, 34]], true), 'none'],
    [P.poly([[22, 34], [22, 50]], true), 'none'], [P.poly([[50, 34], [50, 50]], true), 'none'], [P.poly([[78, 34], [78, 50]], true), 'none'],
    [P.poly([[36, 50], [36, 66]], true), 'none'], [P.poly([[64, 50], [64, 66]], true), 'none'],
    [P.poly([[22, 66], [22, 82]], true), 'none'], [P.poly([[50, 66], [50, 82]], true), 'none'], [P.poly([[78, 66], [78, 82]], true), 'none'],
  ], { fill: '#E06C5A', stroke: '#7B241C' });
  icon('router', '路由器', [
    [P.ellipse(50, 50, 44, 44)], [P.poly(HA), 'light'], [P.poly(HA.map((p) => [p[1], p[0]])), 'light'],
  ]);
  icon('switch', '交換器', [
    [P.round(4, 26, 92, 48, 6)],
    [P.poly([[18, 36], [66, 36], [66, 30], [82, 40], [66, 50], [66, 44], [18, 44]]), 'light'],
    [P.poly([[82, 56], [34, 56], [34, 50], [18, 60], [34, 70], [34, 64], [82, 64]]), 'light'],
  ]);
  icon('printer', '印表機', [
    [P.rect(28, 8, 44, 26), 'light'], [P.round(8, 32, 84, 38, 5)],
    [P.rect(26, 58, 48, 32), 'light'], [P.ellipse(78, 42, 3, 3), 'dark'],
    [P.poly([[33, 68], [67, 68]], true), 'none'], [P.poly([[33, 78], [67, 78]], true), 'none'],
  ]);
  icon('file', '文件檔案', [
    [P.poly([[20, 6], [60, 6], [80, 26], [80, 94], [20, 94]]), 'light'], [P.poly([[60, 6], [60, 26], [80, 26]])],
    [P.poly([[30, 44], [70, 44]], true), 'none'], [P.poly([[30, 58], [70, 58]], true), 'none'], [P.poly([[30, 72], [70, 72]], true), 'none'],
  ]);
  icon('folder', '資料夾', [
    [P.poly([[8, 20], [38, 20], [46, 30], [92, 30], [92, 82], [8, 82]]), 'dark'], [P.round(8, 38, 84, 46, 3)],
  ], { fill: '#F4B942', stroke: '#7F6000' });
  icon('mail', '電子郵件', [
    [P.rect(8, 22, 84, 56), 'light'], [P.poly([[8, 22], [50, 56], [92, 22]], true), 'none'],
  ]);
  icon('lock', '鎖 / 加密', [
    [[['M', 28, 46], ['L', 28, 32], ['C', 28, 4, 72, 4, 72, 32], ['L', 72, 46], ['L', 62, 46], ['L', 62, 32],
      ['C', 62, 18, 38, 18, 38, 32], ['L', 38, 46], ['Z']], 'dark'],
    [P.round(18, 46, 64, 46, 6)], [P.ellipse(50, 64, 6, 6), 'light'], [P.poly([[47, 66], [53, 66], [54, 80], [46, 80]]), 'light'],
  ], { fill: '#F4B942', stroke: '#7F6000' });

  /* 連接點位置：四邊中點 */
  VL.SIDES = ['t', 'l', 'b', 'r'];
  VL.DIR = { t: [0, -1], l: [-1, 0], b: [0, 1], r: [1, 0] };
  VL.portPos = (n, side) => ({
    x: n.x + (side === 'l' ? 0 : side === 'r' ? n.w : n.w / 2),
    y: n.y + (side === 't' ? 0 : side === 'b' ? n.h : n.h / 2),
  });
})();
