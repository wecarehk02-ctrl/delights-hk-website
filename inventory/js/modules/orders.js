/* Module: 下單系統 (req 2) — order date, delivery address, daily items, price */
(function (root) {
  'use strict';
  var UI = root.UI, Store = root.Store, Biz = root.Biz, el = UI.el;

  function customerName(id) { var c = Store.get('customers', id); return c ? c.name : '—'; }
  function productName(id) { var p = Store.get('products', id); return p ? p.name : id; }

  function render(container) {
    var orders = Store.all('orders').slice().sort(function (a, b) { return (b.orderDate || '').localeCompare(a.orderDate || ''); });
    var right = el('div', { class: 'flex gap-2' }, [UI.iconBtn('＋ 新下單', 'primary', function () { editOrder(null, container); })]);

    var cols = [
      { label: '單號', render: function (o) { return '<b>' + (o.orderNo || '') + '</b>'; } },
      { label: '客戶', render: function (o) { return customerName(o.customerId); } },
      { label: '下單日', render: function (o) { return UI.fmtDate(o.orderDate); } },
      { label: '送貨日', render: function (o) { return UI.fmtDate(o.deliveryDate); } },
      { label: '送貨地址', class: 'max-w-xs', render: function (o) { return '<span class="text-indigo/70">' + (o.deliveryAddress || '—') + '</span>'; } },
      { label: '項目', render: function (o) { return (o.lines || []).length + ' 項'; } },
      { label: '金額', class: 'text-right', render: function (o) { return UI.fmtMoney(orderTotal(o), Store.settings().currency); } },
      { label: '狀態', render: function (o) { return statusBadge(o.status); } },
      { label: '操作', class: 'text-right whitespace-nowrap', render: function (o) {
        return el('div', { class: 'flex gap-2 justify-end' }, [
          el('button', { class: 'text-terracotta hover:underline text-xs', text: '編輯', onclick: function () { editOrder(o, container); } }),
          el('button', { class: 'text-indigo hover:underline text-xs', text: '複製', onclick: function () { editOrder(o, container, true); } }),
          el('button', { class: 'text-indigo hover:underline text-xs', text: '送貨單', onclick: function () { root.Modules.delivery.print(o.id); } }),
          el('button', { class: 'text-red-600 hover:underline text-xs', text: '刪除', onclick: function () {
            UI.confirmModal('刪除單號 ' + o.orderNo + '？', function () { Store.remove('orders', o.id); UI.toast('已刪除', 'ok'); render(container); }, { danger: true });
          } })
        ]);
      } }
    ];

    container.innerHTML = '';
    container.appendChild(UI.sectionTitle('下單系統', '銷售落單、選送貨日期同地址、每日出貨項目及價錢', right));
    container.appendChild(el('div', { class: 'bg-white border border-indigo/10 p-4' }, [UI.table(cols, orders, { empty: '未有訂單。' })]));
  }

  function statusBadge(st) {
    if (st === 'shipped') return UI.badge('已出貨', 'ok');
    if (st === 'invoiced') return UI.badge('已開單', 'info');
    return UI.badge('待處理', 'warn');
  }
  function orderTotal(o) {
    return (o.lines || []).reduce(function (s, l) { return s + Number(l.qty || 0) * Number(l.unitPrice || 0); }, 0);
  }

  function editOrder(o, container, isClone) {
    var editing = o && !isClone;            // true = update existing; clone = prefill but insert
    var products = Store.all('products');
    var customers = Store.all('customers');
    var currency = Store.settings().currency;
    var lines = o ? JSON.parse(JSON.stringify(o.lines || [])) : [];

    var head = el('div', {}, [
      UI.grid(2, [
        UI.field({ key: 'customerId', label: '客戶', type: 'select', required: true,
          options: [{ value: '', label: '— 選擇客戶 —' }].concat(customers.map(function (c) { return { value: c.id, label: c.name }; })),
          value: o ? o.customerId : '' }),
        UI.field({ key: 'status', label: '狀態', type: 'select',
          options: [{ value: 'pending', label: '待處理' }, { value: 'shipped', label: '已出貨' }, { value: 'invoiced', label: '已開單' }],
          value: editing ? o.status : 'pending' })
      ]),
      UI.grid(2, [
        UI.field({ key: 'orderDate', label: '下單日期', type: 'date', required: true, value: editing ? o.orderDate : new Date().toISOString().slice(0, 10) }),
        UI.field({ key: 'deliveryDate', label: '送貨日期', type: 'date', required: true, value: editing ? o.deliveryDate : new Date().toISOString().slice(0, 10) })
      ]),
      UI.field({ key: 'deliveryAddress', label: '送貨地址', type: 'textarea', rows: 2, value: o ? o.deliveryAddress : '' })
    ]);

    // when customer changes, prefill address from customer record
    head.querySelector('[data-key=customerId]').addEventListener('change', function (e) {
      var c = Store.get('customers', e.target.value);
      var addr = head.querySelector('[data-key=deliveryAddress]');
      if (c && !addr.value) addr.value = c.address || '';
      drawLines();
    });

    var linesWrap = el('div', {});
    var totalWrap = el('div', { class: 'text-right font-serif text-lg text-indigo mt-3' });

    function priceFor(productId, qty) {
      var p = Store.get('products', productId);
      if (!p) return 0;
      var cust = Store.get('customers', head.querySelector('[data-key=customerId]').value);
      var tier = cust && cust.pricingTierId ? Store.get('pricingTiers', cust.pricingTierId) : null;
      return UI.tierPrice(p.unitPrice, qty, tier).unit;
    }

    function drawLines() {
      linesWrap.innerHTML = '';
      lines.forEach(function (ln, idx) {
        var row = el('div', { class: 'grid grid-cols-12 gap-2 items-end mb-2' }, [
          el('div', { class: 'col-span-5' }, [UI.field({ key: 'productId', label: idx === 0 ? '產品' : '', type: 'select',
            options: [{ value: '', label: '— 選產品 —' }].concat(products.map(function (p) {
              return { value: p.id, label: p.name + '（存 ' + Biz.availableQty(p.id) + '）' };
            })), value: ln.productId })]),
          el('div', { class: 'col-span-2' }, [UI.field({ key: 'qty', label: idx === 0 ? '數量' : '', type: 'number', value: ln.qty })]),
          el('div', { class: 'col-span-3' }, [UI.field({ key: 'unitPrice', label: idx === 0 ? '單價' : '', type: 'number', value: ln.unitPrice })]),
          el('div', { class: 'col-span-1 text-sm text-indigo/70 pb-2 text-right', text: UI.fmtMoney(Number(ln.qty || 0) * Number(ln.unitPrice || 0), currency).replace('HKD ', '') }),
          el('div', { class: 'col-span-1 pb-1' }, [el('button', { class: 'text-red-600 hover:text-red-800', text: '✕', onclick: function () { lines.splice(idx, 1); drawLines(); } })])
        ]);
        var sel = row.querySelector('[data-key=productId]');
        var qtyI = row.querySelector('[data-key=qty]');
        var priceI = row.querySelector('[data-key=unitPrice]');
        function sync() { ln.productId = sel.value; ln.qty = Number(qtyI.value || 0); ln.unitPrice = Number(priceI.value || 0); recalc(); }
        sel.addEventListener('change', function () { ln.productId = sel.value; ln.qty = Number(qtyI.value || 0); priceI.value = priceFor(sel.value, ln.qty); sync(); });
        qtyI.addEventListener('input', function () { ln.qty = Number(qtyI.value || 0); if (ln.productId) priceI.value = priceFor(ln.productId, ln.qty); sync(); });
        priceI.addEventListener('input', sync);
        linesWrap.appendChild(row);
      });
      recalc();
    }
    function recalc() {
      var t = lines.reduce(function (s, l) { return s + Number(l.qty || 0) * Number(l.unitPrice || 0); }, 0);
      totalWrap.textContent = '總金額：' + UI.fmtMoney(t, currency);
    }

    var addBtn = el('button', { class: 'text-terracotta hover:underline text-sm mt-1', text: '＋ 加一項', onclick: function () { lines.push({ productId: '', qty: 1, unitPrice: 0 }); drawLines(); } });

    var body = el('div', {}, [
      head,
      el('div', { class: 'border-t border-indigo/10 mt-4 pt-4' }, [
        el('p', { class: 'text-xs font-bold uppercase tracking-wide text-indigo/60 mb-2', text: '出貨項目（每日送嘅 item）' }),
        linesWrap, addBtn, totalWrap
      ])
    ]);
    if (!lines.length) { lines.push({ productId: '', qty: 1, unitPrice: 0 }); }
    drawLines();

    UI.modal({
      title: editing ? '編輯訂單 ' + o.orderNo : (isClone ? '複製為新單（' + o.orderNo + '）' : '新下單'), width: 'max-w-4xl', body: body,
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '儲存訂單', kind: 'primary', onClick: function (close) {
          var d = UI.readForm(head);
          if (!d.customerId) { UI.toast('請選擇客戶', 'err'); return false; }
          var clean = lines.filter(function (l) { return l.productId && Number(l.qty) > 0; });
          if (!clean.length) { UI.toast('請最少加入一項產品', 'err'); return false; }
          var payload = {
            customerId: d.customerId, orderDate: d.orderDate, deliveryDate: d.deliveryDate,
            deliveryAddress: d.deliveryAddress, status: d.status, lines: clean
          };
          var wasShipped = editing && o.status === 'shipped';
          if (editing) { Store.update('orders', o.id, payload); }
          else { payload.orderNo = Store.nextSeq('order', 'SO'); o = Store.insert('orders', payload); editing = true; }

          // On transition to "shipped", deduct stock (FIFO) and check reorder
          if (payload.status === 'shipped' && !wasShipped) {
            var shortItems = [];
            clean.forEach(function (l) {
              var res = Biz.deductStock(l.productId, Number(l.qty));
              if (res.short > 0) shortItems.push(productName(l.productId) + '（欠 ' + res.short + '）');
            });
            if (shortItems.length) UI.toast('部分貨品庫存不足：' + shortItems.join('、'), 'warn');
            checkReorderAfter();
          }
          UI.toast('訂單已儲存', 'ok'); close(); render(container);
        } }
      ]
    });
  }

  function checkReorderAfter() {
    var low = Biz.lowStockItems();
    if (!low.length) return;
    var names = low.map(function (i) { return i.product.name; }).join('、');
    UI.modal({
      title: '⚠ 庫存不足 — 需要補貨', width: 'max-w-lg',
      body: el('div', {}, [
        el('p', { class: 'text-sm text-indigo/80 mb-3', text: '以下貨品低於安全庫存：' + names }),
        el('p', { class: 'text-xs text-indigo/50', text: 'POST Webhook 若失敗（或未設定）會自動存入「任務佇列」，唔會漏單。' })
      ]),
      actions: [
        { label: '稍後', kind: 'ghost' },
        { label: 'POST Webhook', kind: 'ghost', onClick: function (close) {
          Biz.sendRestockOrQueue(low).then(function (r) {
            UI.toast(r.sent ? '已送出補貨要求' : '已存入任務佇列（' + (r.reason || '待處理') + '）', r.sent ? 'ok' : 'warn'); close();
          }); return false;
        } },
        { label: '生成補貨 Email', kind: 'accent', onClick: function (close) {
          var mail = Biz.reorderEmail(low); window.location.href = Biz.mailtoLink(mail); close();
        } }
      ]
    });
  }

  root.Modules = root.Modules || {};
  root.Modules.orders = { id: 'orders', label: '下單系統', icon: '🧾', render: render };

})(typeof window !== 'undefined' ? window : this);
