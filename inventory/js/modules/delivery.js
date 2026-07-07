/* Module: 送貨單 (req 5) — delivery notes, print-optimised for Epson dot-matrix */
(function (root) {
  'use strict';
  var UI = root.UI, Store = root.Store, el = UI.el;

  function productName(id) { var p = Store.get('products', id); return p ? p.name : id; }
  function product(id) { return Store.get('products', id); }
  function customer(id) { return Store.get('customers', id); }

  function render(container) {
    var orders = Store.all('orders').slice().sort(function (a, b) { return (b.deliveryDate || '').localeCompare(a.deliveryDate || ''); });
    container.innerHTML = '';
    container.appendChild(UI.sectionTitle('送貨單', '由訂單生成送貨單並用 Epson 針機列印', null));

    var cols = [
      { label: '單號', render: function (o) { return '<b>' + o.orderNo + '</b>'; } },
      { label: '客戶', render: function (o) { var c = customer(o.customerId); return c ? c.name : '—'; } },
      { label: '送貨日', render: function (o) { return UI.fmtDate(o.deliveryDate); } },
      { label: '送貨地址', class: 'max-w-xs', render: function (o) { return '<span class="text-indigo/70">' + (o.deliveryAddress || '—') + '</span>'; } },
      { label: '項目', render: function (o) { return (o.lines || []).length + ' 項'; } },
      { label: '操作', class: 'text-right whitespace-nowrap', render: function (o) {
        return el('div', { class: 'flex gap-2 justify-end' }, [
          el('button', { class: 'text-indigo hover:underline text-xs', text: '預覽', onclick: function () { preview(o.id); } }),
          el('button', { class: 'text-terracotta hover:underline text-xs', text: '🖨 列印', onclick: function () { doPrint(o.id); } })
        ]);
      } }
    ];
    container.appendChild(el('div', { class: 'bg-white border border-indigo/10 p-4' }, [UI.table(cols, orders, { empty: '未有訂單。' })]));

    container.appendChild(el('div', { class: 'mt-4 text-xs text-indigo/50' }, [
      el('p', { text: '針機提示：於列印對話框選擇 Epson 針機，紙張選「連續紙 / Continuous」或對應尺寸，邊界設為最小。可於「設定」調整公司資料同頁尾。' })
    ]));
  }

  // Build delivery-note HTML string (self-contained, B&W, dot-matrix friendly)
  function noteHTML(order) {
    var s = Store.settings();
    var c = customer(order.customerId) || {};
    var rows = (order.lines || []).map(function (l, i) {
      var p = product(l.productId) || {};
      var amt = Number(l.qty || 0) * Number(l.unitPrice || 0);
      return '<tr>' +
        '<td class="c">' + (i + 1) + '</td>' +
        '<td>' + (p.sku || '') + '</td>' +
        '<td>' + (p.name || l.productId) + '</td>' +
        '<td class="r">' + l.qty + '</td>' +
        '<td>' + (p.unit || '') + '</td>' +
        '<td class="r">' + Number(l.unitPrice || 0).toFixed(2) + '</td>' +
        '<td class="r">' + amt.toFixed(2) + '</td>' +
        '</tr>';
    }).join('');
    var total = (order.lines || []).reduce(function (a, l) { return a + Number(l.qty || 0) * Number(l.unitPrice || 0); }, 0);
    var totalQty = (order.lines || []).reduce(function (a, l) { return a + Number(l.qty || 0); }, 0);

    return '' +
      '<div class="dn">' +
      '<div class="dn-head">' +
        '<div><div class="dn-co">' + s.companyName + '</div>' +
        '<div class="dn-co-en">' + (s.companyNameEn || '') + '</div>' +
        '<div class="dn-sm">' + (s.companyAddress || '') + '</div>' +
        '<div class="dn-sm">Tel: ' + (s.companyPhone || '') + (s.companyBR ? '　BR: ' + s.companyBR : '') + '</div></div>' +
        '<div class="dn-title">送 貨 單<br><span class="dn-title-en">DELIVERY NOTE</span></div>' +
      '</div>' +
      '<table class="dn-meta"><tr>' +
        '<td><b>送貨單號 No.:</b> ' + order.orderNo + '</td>' +
        '<td><b>下單日 Order:</b> ' + UI.fmtDate(order.orderDate) + '</td>' +
        '<td><b>送貨日 Delivery:</b> ' + UI.fmtDate(order.deliveryDate) + '</td>' +
      '</tr></table>' +
      '<table class="dn-cust"><tr>' +
        '<td><b>客戶 Customer:</b> ' + (c.name || '') + '<br><b>聯絡 Contact:</b> ' + (c.contact || '') + '</td>' +
        '<td><b>送貨地址 Deliver to:</b><br>' + (order.deliveryAddress || c.address || '') + '</td>' +
      '</tr></table>' +
      '<table class="dn-items">' +
        '<thead><tr><th>#</th><th>編號 Code</th><th>貨品 Description</th><th class="r">數量 Qty</th><th>單位</th><th class="r">單價</th><th class="r">金額 Amount</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '<tfoot><tr><td colspan="3" class="r"><b>合計 Total</b></td><td class="r"><b>' + totalQty + '</b></td><td></td><td></td><td class="r"><b>' + total.toFixed(2) + '</b></td></tr></tfoot>' +
      '</table>' +
      (order.note ? '<div class="dn-note"><b>備註 Remarks:</b> ' + order.note + '</div>' : '') +
      '<table class="dn-sign"><tr>' +
        '<td>發貨人 Issued by:<br><br>______________</td>' +
        '<td>司機 Driver:<br><br>______________</td>' +
        '<td>' + (s.deliveryNoteFooter || '收貨人簽署 Received by') + ':<br><br>______________</td>' +
      '</tr></table>' +
      '<div class="dn-foot">此送貨單一式兩份，收貨後請簽回一份。 Printed ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + '</div>' +
      '</div>';
  }

  function noteCSS() {
    return '<style>' +
      '*{box-sizing:border-box;}' +
      'body{margin:0;font-family:"Courier New",Courier,"Noto Sans TC",monospace;color:#000;font-size:11pt;}' +
      '.dn{padding:6mm;max-width:200mm;}' +
      '.dn-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:2mm;}' +
      '.dn-co{font-size:15pt;font-weight:bold;font-family:"Noto Sans TC",sans-serif;}' +
      '.dn-co-en{font-size:9pt;letter-spacing:1px;}' +
      '.dn-sm{font-size:8.5pt;}' +
      '.dn-title{text-align:right;font-size:16pt;font-weight:bold;letter-spacing:3px;font-family:"Noto Sans TC",sans-serif;}' +
      '.dn-title-en{font-size:8pt;letter-spacing:2px;}' +
      '.dn-meta,.dn-cust,.dn-sign{width:100%;border-collapse:collapse;margin-top:2mm;}' +
      '.dn-meta td{font-size:9.5pt;padding:1mm 0;}' +
      '.dn-cust td{border:1px solid #000;padding:2mm;vertical-align:top;font-size:9.5pt;width:50%;}' +
      '.dn-items{width:100%;border-collapse:collapse;margin-top:3mm;}' +
      '.dn-items th,.dn-items td{border:1px solid #000;padding:1.5mm 2mm;font-size:9.5pt;}' +
      '.dn-items th{background:#eee;font-family:"Noto Sans TC",sans-serif;}' +
      '.dn-items .r,.r{text-align:right;}.dn-items .c,.c{text-align:center;}' +
      '.dn-note{margin-top:2mm;font-size:9.5pt;border:1px solid #000;padding:2mm;}' +
      '.dn-sign{margin-top:8mm;}' +
      '.dn-sign td{width:33%;font-size:9pt;padding:2mm;vertical-align:top;}' +
      '.dn-foot{margin-top:4mm;font-size:8pt;text-align:center;border-top:1px dashed #000;padding-top:1mm;}' +
      '@media print{.dn{padding:4mm;}@page{margin:6mm;}}' +
      '</style>';
  }

  // ---- Plain-text delivery note for dot-matrix continuous paper ----------
  // CJK characters occupy 2 columns in a monospace / dot-matrix font.
  function dispWidth(s) { var w = 0; for (var i = 0; i < s.length; i++) { w += s.charCodeAt(i) > 0x2e7f ? 2 : 1; } return w; }
  function padEnd(s, n) { s = String(s == null ? '' : s); var w = dispWidth(s); if (w > n) { // truncate to fit
      var out = '', ww = 0; for (var i = 0; i < s.length; i++) { var cw = s.charCodeAt(i) > 0x2e7f ? 2 : 1; if (ww + cw > n) break; out += s[i]; ww += cw; } return out + new Array(Math.max(0, n - ww) + 1).join(' '); }
    return s + new Array(n - w + 1).join(' '); }
  function padStart(s, n) { s = String(s == null ? '' : s); var w = dispWidth(s); return (w >= n ? s : new Array(n - w + 1).join(' ') + s); }
  function rule(ch, width) { return new Array(width + 1).join(ch); }

  function noteText(order, width) {
    var s = Store.settings(); var c = customer(order.customerId) || {};
    var L = [];
    L.push(padEnd(s.companyName, width - 18) + padStart('送貨單 DELIVERY NOTE', 18));
    if (s.companyNameEn) L.push(s.companyNameEn);
    if (s.companyAddress) L.push(s.companyAddress);
    L.push('Tel: ' + (s.companyPhone || '') + (s.companyBR ? '   BR: ' + s.companyBR : ''));
    L.push(rule('=', width));
    L.push('單號 No.: ' + padEnd(order.orderNo, Math.max(10, width / 2 - 12)) + '下單 Order: ' + UI.fmtDate(order.orderDate));
    L.push('客戶 To : ' + padEnd(c.name || '', Math.max(10, width / 2 - 12)) + '送貨 Deliv: ' + UI.fmtDate(order.deliveryDate));
    L.push('送貨地址: ' + (order.deliveryAddress || c.address || ''));
    L.push(rule('-', width));
    // columns: # code desc qty unit price amount
    var wNo = 3, wQty = 6, wUnit = 5, wPrice = 9, wAmt = 11;
    var wDesc = width - wNo - wQty - wUnit - wPrice - wAmt - 5; if (wDesc < 10) wDesc = 10;
    L.push(padEnd('#', wNo) + ' ' + padEnd('貨品 Description', wDesc) + ' ' + padStart('數量', wQty) + ' ' + padEnd('單位', wUnit) + ' ' + padStart('單價', wPrice) + ' ' + padStart('金額', wAmt));
    L.push(rule('-', width));
    var total = 0, totalQty = 0;
    (order.lines || []).forEach(function (l, i) {
      var p = product(l.productId) || {}; var amt = Number(l.qty || 0) * Number(l.unitPrice || 0); total += amt; totalQty += Number(l.qty || 0);
      L.push(padEnd(i + 1, wNo) + ' ' + padEnd((p.name || l.productId), wDesc) + ' ' + padStart(l.qty, wQty) + ' ' + padEnd(p.unit || '', wUnit) + ' ' + padStart(Number(l.unitPrice || 0).toFixed(2), wPrice) + ' ' + padStart(amt.toFixed(2), wAmt));
    });
    L.push(rule('-', width));
    L.push(padStart('合計 Total:', width - wAmt - wQty - 8) + ' ' + padStart(totalQty, wQty) + '        ' + padStart(total.toFixed(2), wAmt));
    if (order.note) L.push('備註 Remarks: ' + order.note);
    L.push(rule('=', width));
    L.push('');
    L.push('發貨 Issued: ____________   司機 Driver: ____________   收貨 Received: ____________');
    L.push('');
    L.push(padStart('Printed ' + new Date().toISOString().slice(0, 16).replace('T', ' '), width));
    return L.join('\n');
  }

  function printText(orderId, width) {
    var order = Store.get('orders', orderId); if (!order) return;
    var txt = noteText(order, width);
    var w = window.open('', '_blank', 'width=780,height=900');
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>DN ' + order.orderNo + '</title>' +
      '<style>@page{margin:6mm;}body{margin:0;}pre{font-family:"Courier New",monospace;font-size:10pt;line-height:1.2;white-space:pre;}</style></head><body><pre>' +
      txt.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre></body></html>');
    w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 300);
  }

  function preview(orderId) {
    var order = Store.get('orders', orderId);
    if (!order) return;
    var mode = { type: 'html', width: 80 };
    var toolbar = el('div', { class: 'flex items-center gap-2 mb-3 flex-wrap' });
    var wrap = el('div', { class: 'bg-white border border-indigo/10', style: 'max-height:65vh;overflow:auto;' });

    function draw() {
      if (mode.type === 'html') { wrap.innerHTML = noteCSS() + noteHTML(order); }
      else {
        wrap.innerHTML = '';
        wrap.appendChild(el('pre', { class: 'p-3 text-xs', style: 'font-family:"Courier New",monospace;white-space:pre;', text: noteText(order, mode.width) }));
      }
    }
    function drawToolbar() {
      toolbar.innerHTML = '';
      function tab(label, active, on) { return el('button', { class: 'px-3 py-1 text-sm border ' + (active ? 'bg-indigo text-white border-indigo' : 'border-indigo/20 text-indigo hover:bg-indigo/5'), text: label, onclick: on }); }
      toolbar.appendChild(tab('HTML 版', mode.type === 'html', function () { mode.type = 'html'; drawToolbar(); draw(); }));
      toolbar.appendChild(tab('純文字 (針機)', mode.type === 'text', function () { mode.type = 'text'; drawToolbar(); draw(); }));
      if (mode.type === 'text') {
        toolbar.appendChild(el('span', { class: 'text-xs text-indigo/50 ml-2', text: '欄寬：' }));
        [80, 96, 132].forEach(function (w) { toolbar.appendChild(tab(w + '欄', mode.width === w, function () { mode.width = w; drawToolbar(); draw(); })); });
      }
    }
    drawToolbar(); draw();

    UI.modal({
      title: '送貨單預覽 ' + order.orderNo, width: 'max-w-4xl', body: el('div', {}, [toolbar, wrap]),
      actions: [{ label: '關閉', kind: 'ghost' }, { label: '🖨 列印', kind: 'primary', onClick: function (close) {
        if (mode.type === 'html') doPrint(orderId); else printText(orderId, mode.width);
      } }]
    });
  }

  function doPrint(orderId) {
    var order = Store.get('orders', orderId);
    if (!order) { UI.toast('搵唔到訂單', 'err'); return; }
    var w = window.open('', '_blank', 'width=800,height=900');
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>DN ' + order.orderNo + '</title>' + noteCSS() + '</head><body>' + noteHTML(order) + '</body></html>');
    w.document.close(); w.focus();
    setTimeout(function () { w.print(); }, 350);
  }

  root.Modules = root.Modules || {};
  root.Modules.delivery = { id: 'delivery', label: '送貨單', icon: '🚚', render: render, print: doPrint, preview: preview };

})(typeof window !== 'undefined' ? window : this);
