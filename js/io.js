/* 檔案進出：SVG（內嵌可編輯原始資料）、PNG、Word、PPTX，以及「開啟 Office 檔內的圖 → 修改 → 存回」 */
(function () {
  const VL = window.VL;
  const E = () => VL.editor;
  const META_RE = /<metadata id="visio-like-data">([A-Za-z0-9+/=\s]+)<\/metadata>/;
  const io = (VL.io = { office: null, name: '流程圖' });

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  io.download = download;

  /* ---------- SVG ---------- */
  io.buildSvg = function (doc) {
    doc = VL.clone(doc);
    VL.mm.layoutAll(doc);
    const b = VL.render.bbox(doc), m = 8;
    const w = Math.ceil(b.w + m * 2), h = Math.ceil(b.h + m * 2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${Math.floor(b.x - m)} ${Math.floor(b.y - m)} ${w} ${h}">` +
      `<metadata id="visio-like-data">${VL.b64enc(JSON.stringify(doc))}</metadata>` + VL.render.docSvg(doc) + '</svg>';
    return { svg, w, h };
  };
  io.parseSvg = function (text) {
    const m = META_RE.exec(text);
    if (!m) return null;
    try { return JSON.parse(VL.b64dec(m[1].replace(/\s+/g, ''))); } catch (err) { return null; }
  };
  io.saveSvg = () => download(new Blob([io.buildSvg(E().doc).svg], { type: 'image/svg+xml' }), io.name + '.svg');

  /* ---------- PNG ---------- */
  io.buildPng = function (doc, scale) {
    const { svg, w, h } = io.buildSvg(doc);
    scale = scale || 2;
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = w * scale; c.height = h * scale;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 轉換失敗'))), 'image/png');
      };
      img.onerror = () => reject(new Error('SVG 載入失敗'));
      img.src = url;
    });
  };
  io.savePng = async () => download(await io.buildPng(E().doc), io.name + '.png');
  io.copyPng = async function () {
    const blob = await io.buildPng(E().doc);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  };

  /* ---------- PPTX ---------- */
  io.savePptx = async () => download(await VL.pptx.build(E().doc), io.name + '.pptx');

  /* ---------- 新 Word 檔（內含向量圖，可再用本工具開啟修改） ---------- */
  io.saveDocx = async function () {
    const { svg, w, h } = io.buildSvg(E().doc);
    const png = await io.buildPng(E().doc);
    const maxW = 5731510; // A4 扣除邊界的可用寬度 (EMU)
    let cx = w * 9525, cy = h * 9525;
    if (cx > maxW) { cy = Math.round((cy * maxW) / cx); cx = maxW; }
    const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n', R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const zip = new JSZip();
    zip.file('[Content_Types].xml', X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="svg" ContentType="image/svg+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', X + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.file('word/_rels/document.xml.rels', X + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/image" Target="media/image1.png"/><Relationship Id="rId2" Type="${R}/image" Target="media/image2.svg"/></Relationships>`);
    zip.file('word/document.xml', X + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="${R}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="${VL.esc(io.name)}" descr="以 visio-like 繪製，可用該工具開啟本檔修改"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="diagram.svg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1"><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rId2"/></a:ext></a:extLst></a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr></w:body></w:document>`);
    zip.file('word/media/image1.png', png);
    zip.file('word/media/image2.svg', svg);
    download(await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' }), io.name + '.docx');
  };

  /* ---------- Office 往返 ---------- */
  /* 找出 docx / pptx 中由本工具產生的 SVG 圖 */
  io.scanOffice = async function (file) {
    const zip = await JSZip.loadAsync(file);
    const found = [];
    for (const path of Object.keys(zip.files)) {
      if (!/\/media\/[^/]+\.svg$/i.test(path)) continue;
      const doc = io.parseSvg(await zip.file(path).async('string'));
      if (doc) found.push({ path, doc });
    }
    return { zip, fileName: file.name, found };
  };
  const resolve = (base, target) => {
    if (target.startsWith('/')) return target.slice(1);
    const parts = base.split('/').slice(0, -1);
    for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
    return parts.join('/');
  };
  /* 將目前的圖寫回 Office 檔：替換 SVG、PNG 備援圖，並依新長寬比調整高度 */
  io.saveBackOffice = async function () {
    const ctx = io.office;
    if (!ctx) return;
    const { svg, w, h } = io.buildSvg(E().doc);
    const png = await io.buildPng(E().doc);
    const zip = ctx.zip;
    zip.file(ctx.svgPath, svg);
    for (const relPath of Object.keys(zip.files).filter((p) => /_rels\/[^/]+\.rels$/.test(p))) {
      const owner = relPath.replace(/_rels\/([^/]+)\.rels$/, '$1');
      if (!zip.file(owner)) continue;
      const rels = await zip.file(relPath).async('string');
      const map = {};
      rels.replace(/<Relationship\b[^>]*>/g, (tag) => {
        const id = /\bId="([^"]+)"/.exec(tag), tg = /\bTarget="([^"]+)"/.exec(tag);
        if (id && tg && !/TargetMode="External"/.test(tag)) map[id[1]] = resolve(owner, tg[1]);
        return tag;
      });
      const svgIds = Object.keys(map).filter((id) => map[id] === ctx.svgPath);
      if (!svgIds.length) continue;
      let xml = await zip.file(owner).async('string');
      for (const sid of svgIds) {
        let from = 0;
        for (;;) {
          const at = xml.indexOf(`svgBlip`, from);
          if (at < 0) break;
          from = at + 7;
          const tagEnd = xml.indexOf('>', at);
          if (!new RegExp(`r:embed="${sid}"`).test(xml.slice(at, tagEnd))) continue;
          // 備援 PNG：同一個 <a:blip> 的 r:embed
          const blipAt = xml.lastIndexOf('<a:blip', at);
          const fb = /r:embed="([^"]+)"/.exec(xml.slice(blipAt, xml.indexOf('>', blipAt)));
          if (fb && map[fb[1]] && /\.png$/i.test(map[fb[1]])) zip.file(map[fb[1]], png);
          // 調整外框高度以符合新的長寬比（寬度維持使用者在文件中設定的大小）
          const open = Math.max(xml.lastIndexOf('<w:drawing', at), xml.lastIndexOf('<p:pic>', at), xml.lastIndexOf('<p:pic ', at));
          const closeW = xml.indexOf('</w:drawing>', at), closeP = xml.indexOf('</p:pic>', at);
          const close = Math.min(closeW < 0 ? Infinity : closeW, closeP < 0 ? Infinity : closeP);
          if (open >= 0 && close !== Infinity) {
            const seg = xml.slice(open, close).replace(/(<(?:wp:extent|a:ext) cx=")(\d+)(" cy=")(\d+)(")/g,
              (m0, a, cx, c, cy, e) => a + cx + c + Math.round((+cx * h) / w) + e);
            xml = xml.slice(0, open) + seg + xml.slice(close);
          }
        }
      }
      zip.file(owner, xml);
    }
    const mime = /\.pptx$/i.test(ctx.fileName) ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    download(await zip.generateAsync({ type: 'blob', mimeType: mime, compression: 'DEFLATE' }), ctx.fileName);
  };

  /* ---------- 開啟檔案 ---------- */
  io.openFile = async function (file) {
    const base = file.name.replace(/\.[^.]+$/, '');
    if (VL.importer.isImage(file)) return VL.importer.open(file);
    if (/\.(docx|pptx)$/i.test(file.name)) {
      const res = await io.scanOffice(file);
      if (!res.found.length) throw new Error('這個檔案裡找不到由本工具繪製的圖。\n（請確認圖片是以本工具匯出的 SVG 插入的）');
      let pick = res.found[0];
      if (res.found.length > 1) pick = await VL.ui.choose(res.found);
      if (!pick) return;
      io.office = { zip: res.zip, fileName: file.name, svgPath: pick.path };
      io.name = base;
      E().load(pick.doc);
    } else {
      const doc = io.parseSvg(await file.text());
      if (!doc) throw new Error('這個 SVG 不含可編輯資料（不是由本工具儲存的檔案）。');
      io.office = null;
      io.name = base;
      E().load(doc);
    }
  };
})();
