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

  function preview(orderId) {
    var order = Store.get('orders', orderId);
    if (!order) return;
    var wrap = el('div', { class: 'bg-white border border-indigo/10', style: 'max-height:70vh;overflow:auto;' });
    wrap.innerHTML = noteCSS() + noteHTML(order);
    UI.modal({
      title: '送貨單預覽 ' + order.orderNo, width: 'max-w-4xl', body: wrap,
      actions: [{ label: '關閉', kind: 'ghost' }, { label: '🖨 列印', kind: 'primary', onClick: function (close) { doPrint(orderId); } }]
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
