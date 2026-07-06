/* Module: 庫存管理 — inbound stock, stock levels, reorder (req 3), expiry warnings (req 7) */
(function (root) {
  'use strict';
  var UI = root.UI, Store = root.Store, Biz = root.Biz, el = UI.el;

  function productName(id) { var p = Store.get('products', id); return p ? p.name : id; }

  function render(container) {
    container.innerHTML = '';
    container.appendChild(UI.sectionTitle('庫存管理', '入庫、即時庫存、補貨提示同到期警告', el('div', { class: 'flex gap-2' }, [
      UI.iconBtn('＋ 入庫（新到貨）', 'primary', function () { inbound(null, container); })
    ])));

    // ---- alerts row ----
    var low = Biz.lowStockItems();
    var expiring = Biz.expiringLots();
    var alerts = el('div', { class: 'grid grid-cols-1 md:grid-cols-3 gap-4 mb-6' }, [
      statCard('低於安全庫存', low.length, low.length ? 'err' : 'ok', low.length ? '需要補貨' : '庫存充足'),
      statCard('接近到期', expiring.filter(function (e) { return !e.expired; }).length, expiring.length ? 'warn' : 'ok', '＜ ' + Store.settings().expiryWarnDays + ' 日'),
      statCard('已過期', expiring.filter(function (e) { return e.expired; }).length, expiring.some(function (e) { return e.expired; }) ? 'err' : 'ok', '需即時處理')
    ]);
    container.appendChild(alerts);

    // ---- low stock / reorder ----
    if (low.length) {
      var reorderBtns = el('div', { class: 'flex gap-2 flex-wrap' }, [
        UI.iconBtn('✉ 生成補貨 Email', 'accent', function () { var m = Biz.reorderEmail(low); window.location.href = Biz.mailtoLink(m); }),
        UI.iconBtn('⇪ POST Webhook', 'ghost', function () {
          Biz.postWebhook(low).then(function () { UI.toast('已送出補貨要求', 'ok'); }).catch(function (e) { UI.toast(e.message, 'err'); });
        })
      ]);
      var lowCols = [
        { label: '貨品', render: function (s) { return '<b>' + s.product.name + '</b>'; } },
        { label: '現存', class: 'text-right', render: function (s) { return '<span class="text-red-600 font-bold">' + s.qty + '</span> ' + (s.product.unit || ''); } },
        { label: '安全庫存', class: 'text-right', render: function (s) { return String(s.reorderLevel); } },
        { label: '建議補貨', class: 'text-right', render: function (s) { return (s.product.reorderQty || '—') + ' ' + (s.product.unit || ''); } },
        { label: '供應商', render: function (s) { return s.product.supplierName || '—'; } }
      ];
      container.appendChild(el('div', { class: 'bg-white border-l-4 border-red-500 border border-indigo/10 p-4 mb-6' }, [
        el('div', { class: 'flex items-center justify-between mb-3 flex-wrap gap-2' }, [
          el('h3', { class: 'font-serif text-lg text-indigo', text: '⚠ 補貨提示（' + low.length + '）' }), reorderBtns
        ]),
        UI.table(lowCols, low)
      ]));
    }

    // ---- expiry warnings ----
    if (expiring.length) {
      var expCols = [
        { label: '批次', render: function (e) { return e.lot.lotCode || e.lot.qrId; } },
        { label: '貨品', render: function (e) { return productName(e.lot.productId); } },
        { label: '數量', class: 'text-right', render: function (e) { return e.lot.qty + ' ' + (e.lot.unit || ''); } },
        { label: '存放位置', render: function (e) { return e.lot.storageLocation || '—'; } },
        { label: '到期日', render: function (e) { return UI.fmtDate(e.lot.expiryDate); } },
        { label: '狀態', render: function (e) {
          if (e.expired) return UI.badge('已過期 ' + Math.abs(e.days) + ' 日', 'err');
          if (e.days <= 3) return UI.badge('剩 ' + e.days + ' 日', 'err');
          return UI.badge('剩 ' + e.days + ' 日', 'warn');
        } }
      ];
      container.appendChild(el('div', { class: 'bg-white border-l-4 border-amber-500 border border-indigo/10 p-4 mb-6' }, [
        el('h3', { class: 'font-serif text-lg text-indigo mb-3', text: '⏰ 到期警告（' + expiring.length + '）' }),
        UI.table(expCols, expiring)
      ]));
    }

    // ---- full stock table ----
    var summary = Biz.stockSummary();
    var cols = [
      { label: '貨品編號', render: function (s) { return s.product.sku || '—'; } },
      { label: '名稱', render: function (s) { return '<b>' + s.product.name + '</b>'; } },
      { label: '分類', render: function (s) { return s.product.category || '—'; } },
      { label: '現存', class: 'text-right', render: function (s) {
        return '<span class="' + (s.low ? 'text-red-600 font-bold' : 'text-indigo') + '">' + s.qty + '</span> ' + (s.product.unit || ''); } },
      { label: '安全庫存', class: 'text-right', render: function (s) { return String(s.reorderLevel || '—'); } },
      { label: '批次數', class: 'text-right', render: function (s) { return String(Biz.lotsForProduct(s.product.id).length); } }
    ];
    container.appendChild(el('div', { class: 'bg-white border border-indigo/10 p-4 mb-6' }, [
      el('h3', { class: 'font-serif text-lg text-indigo mb-3', text: '即時庫存' }),
      UI.table(cols, summary, { empty: '未有產品。' })
    ]));

    // ---- lots list ----
    var lots = Store.all('stockLots').filter(function (l) { return l.status !== 'shipped'; });
    var lotCols = [
      { label: '批次', render: function (l) { return '<b>' + (l.lotCode || l.qrId) + '</b>'; } },
      { label: '貨品', render: function (l) { return productName(l.productId); } },
      { label: '數量', class: 'text-right', render: function (l) { return l.qty + ' ' + (l.unit || ''); } },
      { label: '入庫時間', render: function (l) { return UI.fmtDate(l.inboundTime); } },
      { label: '到期日', render: function (l) { return UI.fmtDate(l.expiryDate); } },
      { label: '位置', render: function (l) { return l.storageLocation || '—'; } },
      { label: '篩', class: 'text-right', render: function (l) { return (l.sieveReturned || 0) + '/' + (l.sieveCount || 0); } },
      { label: '操作', class: 'text-right whitespace-nowrap', render: function (l) {
        return el('div', { class: 'flex gap-2 justify-end' }, [
          el('button', { class: 'text-indigo hover:underline text-xs', text: '標籤', onclick: function () { root.Modules.labels.printLot(l.id); } }),
          el('button', { class: 'text-terracotta hover:underline text-xs', text: '編輯', onclick: function () { inbound(l, container); } }),
          el('button', { class: 'text-red-600 hover:underline text-xs', text: '刪除', onclick: function () {
            UI.confirmModal('刪除批次 ' + (l.lotCode || l.qrId) + '？', function () { Store.remove('stockLots', l.id); render(container); }, { danger: true });
          } })
        ]);
      } }
    ];
    container.appendChild(el('div', { class: 'bg-white border border-indigo/10 p-4' }, [
      el('h3', { class: 'font-serif text-lg text-indigo mb-3', text: '庫存批次' }),
      UI.table(lotCols, lots, { empty: '未有庫存批次。' })
    ]));
  }

  function statCard(title, value, kind, sub) {
    var ring = { ok: 'border-emerald-200', warn: 'border-amber-300', err: 'border-red-300' }[kind] || 'border-indigo/10';
    var col = { ok: 'text-emerald-600', warn: 'text-amber-600', err: 'text-red-600' }[kind] || 'text-indigo';
    return el('div', { class: 'bg-white border ' + ring + ' p-4' }, [
      el('p', { class: 'text-xs uppercase tracking-wide text-indigo/50', text: title }),
      el('p', { class: 'font-serif text-3xl ' + col, text: String(value) }),
      el('p', { class: 'text-xs text-indigo/40', text: sub })
    ]);
  }

  // ---- Inbound (new arrival) form: creates a lot + sieve entry ------------
  function inbound(lot, container) {
    var products = Store.all('products');
    var isEdit = !!lot;
    var body = el('div', {});

    var head = el('div', {}, [
      UI.grid(2, [
        UI.field({ key: 'productId', label: '產品', type: 'select', required: true,
          options: [{ value: '', label: '— 選產品 —' }].concat(products.map(function (p) { return { value: p.id, label: p.name }; })),
          value: lot ? lot.productId : '' }),
        UI.field({ key: 'lotCode', label: '批次號', type: 'text', value: lot ? lot.lotCode : '', placeholder: '例如 A1001' })
      ]),
      UI.grid(3, [
        UI.field({ key: 'qty', label: '數量', type: 'number', required: true, value: lot ? lot.qty : '' }),
        UI.field({ key: 'unit', label: '單位', type: 'text', value: lot ? lot.unit : '' }),
        UI.field({ key: 'storageLocation', label: '存放位置', type: 'text', value: lot ? lot.storageLocation : '' })
      ]),
      UI.grid(3, [
        UI.field({ key: 'inboundTime', label: '入庫時間', type: 'date', value: lot ? (lot.inboundTime || '').slice(0, 10) : new Date().toISOString().slice(0, 10) }),
        UI.field({ key: 'weightPerBox', label: '每盒重量', type: 'number', unit: 'kg', value: lot ? lot.weightPerBox : '' }),
        UI.field({ key: 'piecesPerBox', label: '每盒件數', type: 'number', value: lot ? lot.piecesPerBox : '' })
      ]),
      UI.grid(3, [
        UI.field({ key: 'expiryDate', label: '保存期限', type: 'date', value: lot ? lot.expiryDate : '', help: '留空會依產品保存期自動計算' }),
        UI.field({ key: 'sieveCount', label: '本次篩數', type: 'number', value: lot ? lot.sieveCount : '', help: '到貨嘅篩數量' }),
        UI.field({ key: 'deliveryAddress', label: '送貨地址(可選)', type: 'text', value: lot ? lot.deliveryAddress : '' })
      ])
    ]);
    body.appendChild(head);

    // auto expiry when product changes
    head.querySelector('[data-key=productId]').addEventListener('change', function (e) {
      var p = Store.get('products', e.target.value);
      var unit = head.querySelector('[data-key=unit]');
      var wp = head.querySelector('[data-key=weightPerBox]');
      var pp = head.querySelector('[data-key=piecesPerBox]');
      var exp = head.querySelector('[data-key=expiryDate]');
      if (p) {
        if (!unit.value) unit.value = p.unit || '';
        if (!wp.value && p.weightPerBox) wp.value = p.weightPerBox;
        if (!pp.value && p.piecesPerBox) pp.value = p.piecesPerBox;
        if (!exp.value && p.shelfLifeDays) {
          var ib = head.querySelector('[data-key=inboundTime]').value || new Date().toISOString().slice(0, 10);
          var d = new Date(ib); d.setDate(d.getDate() + Number(p.shelfLifeDays)); exp.value = d.toISOString().slice(0, 10);
        }
      }
    });

    UI.modal({
      title: isEdit ? '編輯批次' : '入庫（新到貨）', width: 'max-w-3xl', body: body,
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: isEdit ? '儲存' : '確認入庫', kind: 'primary', onClick: function (close) {
          var d = UI.readForm(head);
          if (!d.productId) { UI.toast('請選擇產品', 'err'); return false; }
          if (!d.qty) { UI.toast('請輸入數量', 'err'); return false; }
          // auto expiry
          if (!d.expiryDate) {
            var p = Store.get('products', d.productId);
            if (p && p.shelfLifeDays) { var dd = new Date(d.inboundTime || Date.now()); dd.setDate(dd.getDate() + Number(p.shelfLifeDays)); d.expiryDate = dd.toISOString().slice(0, 10); }
          }
          d.inboundTime = d.inboundTime ? new Date(d.inboundTime).toISOString() : Store.nowISO();
          if (isEdit) {
            Store.update('stockLots', lot.id, d);
          } else {
            var code = d.lotCode || ('L' + Date.now().toString(36).slice(-5).toUpperCase());
            d.lotCode = code;
            d.qrId = 'DLH-L-' + code;
            d.sieveReturned = 0;
            d.status = 'in_stock';
            var newLot = Store.insert('stockLots', d);
            // record sieve intake (req 8)
            if (Number(d.sieveCount) > 0) {
              var prod = Store.get('products', d.productId);
              Store.insert('sieveLog', { date: (d.inboundTime || '').slice(0, 10), type: 'in', qty: Number(d.sieveCount), supplierName: prod ? prod.supplierName : '', note: '到貨批次 ' + code });
            }
            lot = newLot;
          }
          UI.toast('已入庫', 'ok'); close(); render(container);
          UI.confirmModal('要即刻列印此批次嘅 QR 標籤嗎？', function () { root.Modules.labels.printLot(lot.id); });
        } }
      ]
    });
  }

  root.Modules = root.Modules || {};
  root.Modules.inventory = { id: 'inventory', label: '庫存管理', icon: '🏭', render: render, inbound: inbound };

})(typeof window !== 'undefined' ? window : this);
