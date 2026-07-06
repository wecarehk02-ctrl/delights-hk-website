/* Module: 發票 (req 4) — invoices from sales, monthly settlement, tiered pricing, editable */
(function (root) {
  'use strict';
  var UI = root.UI, Store = root.Store, el = UI.el;

  function customer(id) { return Store.get('customers', id); }
  function product(id) { return Store.get('products', id); }
  function cur() { return Store.settings().currency; }

  function render(container) {
    var invoices = Store.all('invoices').slice().sort(function (a, b) { return (b.issueDate || '').localeCompare(a.issueDate || ''); });
    var right = el('div', { class: 'flex gap-2 flex-wrap' }, [
      UI.iconBtn('＋ 生成發票', 'primary', function () { generate(container); }),
      UI.iconBtn('⛰ 階梯價設定', 'ghost', function () { manageTiers(container); })
    ]);
    container.innerHTML = '';
    container.appendChild(UI.sectionTitle('發票 / 月結', '由訂單生成發票、階梯價（跳bar）、可編輯及列印', right));

    var cols = [
      { label: '發票號', render: function (v) { return '<b>' + v.invoiceNo + '</b>'; } },
      { label: '客戶', render: function (v) { var c = customer(v.customerId); return c ? c.name : '—'; } },
      { label: '類型', render: function (v) { return v.settlementType === 'monthly' ? UI.badge('月結 ' + (v.period || ''), 'info') : UI.badge('單次', 'muted'); } },
      { label: '開票日', render: function (v) { return UI.fmtDate(v.issueDate); } },
      { label: '金額', class: 'text-right', render: function (v) { return UI.fmtMoney(invTotal(v), cur()); } },
      { label: '狀態', render: function (v) { return v.status === 'paid' ? UI.badge('已付', 'ok') : (v.status === 'sent' ? UI.badge('已發出', 'info') : UI.badge('草稿', 'warn')); } },
      { label: '操作', class: 'text-right whitespace-nowrap', render: function (v) {
        return el('div', { class: 'flex gap-2 justify-end' }, [
          el('button', { class: 'text-terracotta hover:underline text-xs', text: '編輯', onclick: function () { editInvoice(v.id, container); } }),
          el('button', { class: 'text-indigo hover:underline text-xs', text: '🖨', onclick: function () { printInvoice(v.id); } }),
          el('button', { class: 'text-red-600 hover:underline text-xs', text: '刪除', onclick: function () { UI.confirmModal('刪除發票 ' + v.invoiceNo + '？', function () { Store.remove('invoices', v.id); render(container); }, { danger: true }); } })
        ]);
      } }
    ];
    container.appendChild(el('div', { class: 'bg-white border border-indigo/10 p-4' }, [UI.table(cols, invoices, { empty: '未有發票。' })]));
  }

  function invSubtotal(v) { return (v.lines || []).reduce(function (s, l) { return s + Number(l.qty || 0) * Number(l.unitPrice || 0); }, 0); }
  function invTotal(v) {
    var sub = invSubtotal(v);
    var adj = (v.adjustments || []).reduce(function (s, a) { return s + Number(a.amount || 0); }, 0);
    return sub + adj;
  }

  // ---- Generate invoice from orders --------------------------------------
  function generate(container) {
    var customers = Store.all('customers');
    var body = el('div', {}, [
      UI.grid(2, [
        UI.field({ key: 'customerId', label: '客戶', type: 'select', required: true,
          options: [{ value: '', label: '— 選客戶 —' }].concat(customers.map(function (c) { return { value: c.id, label: c.name + '（' + (c.settlementType === 'monthly' ? '月結' : '單次') + '）' }; })) }),
        UI.field({ key: 'settlementType', label: '結算方式', type: 'select', options: [{ value: 'per_order', label: '單次結算' }, { value: 'monthly', label: '月結' }] })
      ]),
      UI.grid(2, [
        UI.field({ key: 'period', label: '月結月份', type: 'month', value: new Date().toISOString().slice(0, 7), help: '只適用於月結' }),
        UI.field({ key: 'issueDate', label: '開票日', type: 'date', value: new Date().toISOString().slice(0, 10) })
      ]),
      el('p', { class: 'text-xs text-indigo/50 mt-1', text: '會抓取該客戶未開票嘅訂單。階梯價會依客戶合約自動套用，生成後仍可編輯。' })
    ]);
    var custSel = body.querySelector('[data-key=customerId]');
    var setSel = body.querySelector('[data-key=settlementType]');
    custSel.addEventListener('change', function () { var c = customer(custSel.value); if (c) setSel.value = c.settlementType || 'per_order'; });

    UI.modal({
      title: '生成發票', width: 'max-w-2xl', body: body,
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '生成', kind: 'primary', onClick: function (close) {
          var d = UI.readForm(body);
          if (!d.customerId) { UI.toast('請選客戶', 'err'); return false; }
          var c = customer(d.customerId);
          var tier = c && c.pricingTierId ? Store.get('pricingTiers', c.pricingTierId) : null;

          var orders = Store.all('orders').filter(function (o) {
            if (o.customerId !== d.customerId) return false;
            if (o.status === 'invoiced') return false;
            if (d.settlementType === 'monthly') return (o.deliveryDate || '').slice(0, 7) === d.period;
            return true;
          });
          if (!orders.length) { UI.toast('搵唔到未開票嘅訂單', 'warn'); return false; }

          // Aggregate lines by product across the orders, apply tier pricing
          var agg = {};
          orders.forEach(function (o) {
            (o.lines || []).forEach(function (l) {
              if (!agg[l.productId]) agg[l.productId] = { productId: l.productId, qty: 0, basePrice: (product(l.productId) || {}).unitPrice || l.unitPrice };
              agg[l.productId].qty += Number(l.qty || 0);
            });
          });
          var lines = Object.keys(agg).map(function (pid) {
            var a = agg[pid];
            var tp = UI.tierPrice(a.basePrice, a.qty, tier);
            return { productId: pid, qty: a.qty, unitPrice: tp.unit, basePrice: a.basePrice, discountPct: tp.discountPct };
          });

          var inv = Store.insert('invoices', {
            invoiceNo: Store.nextSeq('invoice', 'INV'),
            customerId: d.customerId, settlementType: d.settlementType, period: d.settlementType === 'monthly' ? d.period : '',
            issueDate: d.issueDate, dueDate: '', status: 'draft',
            orderIds: orders.map(function (o) { return o.id; }), lines: lines, adjustments: [],
            tierId: tier ? tier.id : ''
          });
          orders.forEach(function (o) { Store.update('orders', o.id, { status: 'invoiced' }); });
          UI.toast('已生成發票 ' + inv.invoiceNo, 'ok'); close(); editInvoice(inv.id, container);
        } }
      ]
    });
  }

  // ---- Edit invoice (editable lines + adjustments) -----------------------
  function editInvoice(invId, container) {
    var inv = Store.get('invoices', invId);
    if (!inv) return;
    var products = Store.all('products');
    var lines = JSON.parse(JSON.stringify(inv.lines || []));
    var adjustments = JSON.parse(JSON.stringify(inv.adjustments || []));
    var tier = inv.tierId ? Store.get('pricingTiers', inv.tierId) : null;

    var linesWrap = el('div', {});
    var adjWrap = el('div', {});
    var totWrap = el('div', { class: 'text-right space-y-1 mt-3' });

    function recalc() {
      var sub = lines.reduce(function (s, l) { return s + Number(l.qty || 0) * Number(l.unitPrice || 0); }, 0);
      var adj = adjustments.reduce(function (s, a) { return s + Number(a.amount || 0); }, 0);
      totWrap.innerHTML = '';
      totWrap.appendChild(el('div', { class: 'text-sm text-indigo/60', text: '小計 Subtotal: ' + UI.fmtMoney(sub, cur()) }));
      adjustments.forEach(function (a) { totWrap.appendChild(el('div', { class: 'text-sm text-indigo/60', text: (a.label || '調整') + ': ' + UI.fmtMoney(a.amount, cur()) })); });
      totWrap.appendChild(el('div', { class: 'font-serif text-xl text-indigo', text: '總計 Total: ' + UI.fmtMoney(sub + adj, cur()) }));
    }

    function drawLines() {
      linesWrap.innerHTML = '';
      lines.forEach(function (ln, idx) {
        var tp = UI.tierPrice(ln.basePrice != null ? ln.basePrice : ln.unitPrice, ln.qty, tier);
        var row = el('div', { class: 'grid grid-cols-12 gap-2 items-end mb-2' }, [
          el('div', { class: 'col-span-4' }, [UI.field({ key: 'productId', label: idx === 0 ? '產品' : '', type: 'select',
            options: [{ value: '', label: '— 選 —' }].concat(products.map(function (p) { return { value: p.id, label: p.name }; })), value: ln.productId })]),
          el('div', { class: 'col-span-2' }, [UI.field({ key: 'qty', label: idx === 0 ? '數量' : '', type: 'number', value: ln.qty })]),
          el('div', { class: 'col-span-3' }, [UI.field({ key: 'unitPrice', label: idx === 0 ? '單價(可改)' : '', type: 'number', value: ln.unitPrice })]),
          el('div', { class: 'col-span-2 text-xs text-indigo/50 pb-2', html: tp.discountPct ? '階梯 -' + tp.discountPct + '%<br>建議 ' + tp.unit : '<span class="text-indigo/30">標準價</span>' }),
          el('div', { class: 'col-span-1 pb-1 text-right' }, [el('button', { class: 'text-red-600 hover:text-red-800', text: '✕', onclick: function () { lines.splice(idx, 1); drawLines(); } })])
        ]);
        var sel = row.querySelector('[data-key=productId]'), qtyI = row.querySelector('[data-key=qty]'), priceI = row.querySelector('[data-key=unitPrice]');
        sel.addEventListener('change', function () { ln.productId = sel.value; var p = product(sel.value); ln.basePrice = p ? p.unitPrice : ln.unitPrice; var t = UI.tierPrice(ln.basePrice, ln.qty, tier); priceI.value = t.unit; ln.unitPrice = t.unit; drawLines(); });
        qtyI.addEventListener('input', function () { ln.qty = Number(qtyI.value || 0); recalc(); });
        priceI.addEventListener('input', function () { ln.unitPrice = Number(priceI.value || 0); recalc(); });
        linesWrap.appendChild(row);
      });
      recalc();
    }
    function drawAdj() {
      adjWrap.innerHTML = '';
      adjustments.forEach(function (a, idx) {
        var row = el('div', { class: 'grid grid-cols-12 gap-2 items-end mb-2' }, [
          el('div', { class: 'col-span-7' }, [UI.field({ key: 'label', label: idx === 0 ? '項目 (折扣/運費/稅)' : '', type: 'text', value: a.label })]),
          el('div', { class: 'col-span-4' }, [UI.field({ key: 'amount', label: idx === 0 ? '金額(負數=折扣)' : '', type: 'number', value: a.amount })]),
          el('div', { class: 'col-span-1 pb-1 text-right' }, [el('button', { class: 'text-red-600', text: '✕', onclick: function () { adjustments.splice(idx, 1); drawAdj(); recalc(); } })])
        ]);
        row.querySelector('[data-key=label]').addEventListener('input', function (e) { a.label = e.target.value; });
        row.querySelector('[data-key=amount]').addEventListener('input', function (e) { a.amount = Number(e.target.value || 0); recalc(); });
        adjWrap.appendChild(row);
      });
    }

    var meta = el('div', {}, [
      UI.grid(3, [
        UI.field({ key: 'issueDate', label: '開票日', type: 'date', value: inv.issueDate }),
        UI.field({ key: 'dueDate', label: '到期日', type: 'date', value: inv.dueDate }),
        UI.field({ key: 'status', label: '狀態', type: 'select', options: [{ value: 'draft', label: '草稿' }, { value: 'sent', label: '已發出' }, { value: 'paid', label: '已付款' }], value: inv.status })
      ])
    ]);

    var body = el('div', {}, [
      meta,
      el('div', { class: 'border-t border-indigo/10 mt-3 pt-3' }, [
        el('p', { class: 'text-xs font-bold uppercase tracking-wide text-indigo/60 mb-2', text: '項目（單價可自由編輯）' }),
        linesWrap,
        el('button', { class: 'text-terracotta hover:underline text-sm', text: '＋ 加項目', onclick: function () { lines.push({ productId: '', qty: 1, unitPrice: 0, basePrice: 0 }); drawLines(); } })
      ]),
      el('div', { class: 'border-t border-indigo/10 mt-3 pt-3' }, [
        el('p', { class: 'text-xs font-bold uppercase tracking-wide text-indigo/60 mb-2', text: '調整（折扣 / 運費 / 稅項）' }),
        adjWrap,
        el('button', { class: 'text-terracotta hover:underline text-sm', text: '＋ 加調整', onclick: function () { adjustments.push({ label: '', amount: 0 }); drawAdj(); } })
      ]),
      totWrap
    ]);
    drawLines(); drawAdj();

    UI.modal({
      title: '編輯發票 ' + inv.invoiceNo, width: 'max-w-4xl', body: body,
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '🖨 列印', kind: 'ghost', onClick: function (close) { save(); printInvoice(inv.id); } },
        { label: '儲存', kind: 'primary', onClick: function (close) { save(); UI.toast('已儲存', 'ok'); close(); render(container); } }
      ]
    });
    function save() {
      var m = UI.readForm(meta);
      Store.update('invoices', inv.id, { issueDate: m.issueDate, dueDate: m.dueDate, status: m.status, lines: lines.filter(function (l) { return l.productId; }), adjustments: adjustments });
    }
  }

  // ---- Tiered pricing (跳bar) manager ------------------------------------
  function manageTiers(container) {
    var body = el('div', {});
    function draw() {
      var tiers = Store.all('pricingTiers');
      body.innerHTML = '';
      body.appendChild(el('p', { class: 'text-sm text-indigo/60 mb-3', text: '階梯價（跳bar）：依訂購數量給予折扣百分比。將階梯指派給客戶後，生成發票時自動套用。' }));
      tiers.forEach(function (t) {
        var card = el('div', { class: 'border border-indigo/10 p-3 mb-3' });
        var bars = el('div', {});
        function drawBars() {
          bars.innerHTML = '';
          (t.tiers || []).forEach(function (b, i) {
            var row = el('div', { class: 'grid grid-cols-12 gap-2 items-center mb-1' }, [
              el('div', { class: 'col-span-5 text-sm', html: '數量 ≥ ' }),
              el('div', { class: 'col-span-3' }, [(function () { var inp = el('input', { class: UI.inputClass(), type: 'number', value: b.minQty }); inp.addEventListener('input', function () { b.minQty = Number(inp.value || 0); }); return inp; })()]),
              el('div', { class: 'col-span-3' }, [(function () { var inp = el('input', { class: UI.inputClass(), type: 'number', value: b.discountPct, placeholder: '折扣%' }); inp.addEventListener('input', function () { b.discountPct = Number(inp.value || 0); }); return inp; })()]),
              el('div', { class: 'col-span-1 text-right' }, [el('button', { class: 'text-red-600', text: '✕', onclick: function () { t.tiers.splice(i, 1); drawBars(); } })])
            ]);
            bars.appendChild(row);
          });
        }
        drawBars();
        card.appendChild(el('div', { class: 'flex items-center justify-between mb-2' }, [
          (function () { var inp = el('input', { class: UI.inputClass() + ' font-bold', value: t.name }); inp.addEventListener('input', function () { t.name = inp.value; }); return inp; })(),
          el('button', { class: 'text-red-600 hover:underline text-xs ml-2 whitespace-nowrap', text: '刪除階梯', onclick: function () { Store.remove('pricingTiers', t.id); draw(); } })
        ]));
        card.appendChild(el('div', { class: 'grid grid-cols-12 gap-2 text-xs text-indigo/50 mb-1' }, [el('div', { class: 'col-span-5', text: '條件' }), el('div', { class: 'col-span-3', text: '最低數量' }), el('div', { class: 'col-span-3', text: '折扣 %' }), el('div', { class: 'col-span-1' })]));
        card.appendChild(bars);
        card.appendChild(el('div', { class: 'flex gap-2 mt-2' }, [
          el('button', { class: 'text-terracotta hover:underline text-sm', text: '＋ 加一級', onclick: function () { t.tiers = t.tiers || []; t.tiers.push({ minQty: 0, discountPct: 0 }); drawBars(); } }),
          el('button', { class: UI.btnClass('ghost') + ' text-xs', text: '儲存此階梯', onclick: function () { Store.update('pricingTiers', t.id, { name: t.name, tiers: t.tiers }); UI.toast('已儲存', 'ok'); } })
        ]));
        body.appendChild(card);
      });
      body.appendChild(el('button', { class: UI.btnClass('accent'), text: '＋ 新增階梯價', onclick: function () { Store.insert('pricingTiers', { name: '新階梯價', tiers: [{ minQty: 0, discountPct: 0 }] }); draw(); } }));
    }
    draw();
    UI.modal({ title: '階梯價設定（跳bar）', width: 'max-w-2xl', body: body, actions: [{ label: '完成', kind: 'primary', onClick: function (close) { close(); } }] });
  }

  // ---- Print invoice ------------------------------------------------------
  function printInvoice(invId) {
    var inv = Store.get('invoices', invId);
    if (!inv) return;
    var s = Store.settings(); var c = customer(inv.customerId) || {};
    var rows = (inv.lines || []).map(function (l, i) {
      var p = product(l.productId) || {}; var amt = Number(l.qty || 0) * Number(l.unitPrice || 0);
      return '<tr><td class="c">' + (i + 1) + '</td><td>' + (p.name || l.productId) + '</td><td class="r">' + l.qty + '</td><td class="r">' + Number(l.unitPrice || 0).toFixed(2) + (l.discountPct ? '<br><small>階梯 -' + l.discountPct + '%</small>' : '') + '</td><td class="r">' + amt.toFixed(2) + '</td></tr>';
    }).join('');
    var sub = invSubtotal(inv);
    var adjRows = (inv.adjustments || []).map(function (a) { return '<tr><td colspan="4" class="r">' + (a.label || '調整') + '</td><td class="r">' + Number(a.amount || 0).toFixed(2) + '</td></tr>'; }).join('');
    var total = invTotal(inv);
    var html = '<div class="iv">' +
      '<div class="iv-head"><div><div class="iv-co">' + s.companyName + '</div><div class="iv-sm">' + (s.companyNameEn || '') + '</div><div class="iv-sm">' + (s.companyAddress || '') + '</div><div class="iv-sm">' + (s.companyPhone || '') + (s.companyBR ? '　BR:' + s.companyBR : '') + '</div></div>' +
      '<div class="iv-title">發 票<br><span class="iv-title-en">INVOICE</span></div></div>' +
      '<table class="iv-meta"><tr><td><b>發票號:</b> ' + inv.invoiceNo + '<br><b>客戶:</b> ' + (c.name || '') + '<br>' + (c.address || '') + '</td>' +
      '<td class="r"><b>開票日:</b> ' + UI.fmtDate(inv.issueDate) + '<br><b>到期日:</b> ' + (UI.fmtDate(inv.dueDate)) + '<br><b>結算:</b> ' + (inv.settlementType === 'monthly' ? '月結 ' + (inv.period || '') : '單次') + '</td></tr></table>' +
      '<table class="iv-items"><thead><tr><th>#</th><th>貨品 Description</th><th class="r">數量</th><th class="r">單價</th><th class="r">金額</th></tr></thead><tbody>' + rows + '</tbody>' +
      '<tfoot><tr><td colspan="4" class="r">小計 Subtotal</td><td class="r">' + sub.toFixed(2) + '</td></tr>' + adjRows + '<tr class="grand"><td colspan="4" class="r"><b>總計 TOTAL (' + cur() + ')</b></td><td class="r"><b>' + total.toFixed(2) + '</b></td></tr></tfoot></table>' +
      '<div class="iv-foot">付款方式 Payment: 支票抬頭「' + s.companyName + '」／銀行轉賬。多謝惠顧。<br>Printed ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + '</div></div>';
    var css = '<style>body{margin:0;font-family:"Noto Sans TC",Arial,sans-serif;color:#000;}.iv{padding:8mm;}.iv-head{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:3mm;}.iv-co{font-size:16pt;font-weight:bold;}.iv-sm{font-size:9pt;}.iv-title{text-align:right;font-size:20pt;font-weight:bold;letter-spacing:3px;}.iv-title-en{font-size:9pt;letter-spacing:2px;}.iv-meta{width:100%;margin-top:3mm;font-size:10pt;}.iv-meta td{vertical-align:top;padding:2mm 0;}.r{text-align:right;}.c{text-align:center;}.iv-items{width:100%;border-collapse:collapse;margin-top:4mm;font-size:10pt;}.iv-items th,.iv-items td{border:1px solid #000;padding:2mm;}.iv-items th{background:#eee;}.iv-items tfoot td{border:1px solid #000;}.grand td{background:#f2f2f2;font-size:11pt;}.iv-foot{margin-top:8mm;font-size:8.5pt;border-top:1px dashed #000;padding-top:2mm;}@page{margin:10mm;}</style>';
    var w = window.open('', '_blank', 'width=800,height=1000');
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + inv.invoiceNo + '</title>' + css + '</head><body>' + html + '</body></html>');
    w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 350);
  }

  root.Modules = root.Modules || {};
  root.Modules.invoices = { id: 'invoices', label: '發票/月結', icon: '💳', render: render, print: printInvoice };

})(typeof window !== 'undefined' ? window : this);
