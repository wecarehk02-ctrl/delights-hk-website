/* Module: 總覽 — at-a-glance dashboard */
(function (root) {
  'use strict';
  var UI = root.UI, Store = root.Store, Biz = root.Biz, el = UI.el;

  function render(container) {
    var low = Biz.lowStockItems();
    var expiring = Biz.expiringLots();
    var expired = expiring.filter(function (e) { return e.expired; });
    var orders = Store.all('orders');
    var pendingOrders = orders.filter(function (o) { return o.status !== 'invoiced'; });
    var sieveOut = Biz.sieveTotalOutstanding();
    var products = Store.all('products');
    var lots = Store.all('stockLots').filter(function (l) { return l.status !== 'shipped'; });

    container.innerHTML = '';
    container.appendChild(UI.sectionTitle('總覽', '帝樂倉存系統 · ' + new Date().toISOString().slice(0, 10), null));

    var stats = el('div', { class: 'grid grid-cols-2 md:grid-cols-4 gap-4 mb-8' }, [
      stat('產品項目', products.length, '📦', 'products'),
      stat('在庫批次', lots.length, '🏭', 'inventory'),
      stat('待處理訂單', pendingOrders.length, '🧾', 'orders'),
      stat('未回篩', sieveOut, '🧺', 'sieve')
    ]);
    container.appendChild(stats);

    // alerts
    var alerts = [];
    if (low.length) alerts.push(alertCard('err', '⚠ 補貨提示', low.length + ' 項貨品低於安全庫存', '去庫存', 'inventory'));
    if (expired.length) alerts.push(alertCard('err', '⏰ 已過期', expired.length + ' 個批次已過期', '去處理', 'inventory'));
    if (expiring.length - expired.length > 0) alerts.push(alertCard('warn', '⏳ 接近到期', (expiring.length - expired.length) + ' 個批次接近到期', '查看', 'inventory'));
    if (!alerts.length) alerts.push(alertCard('ok', '✓ 一切正常', '暫無庫存或到期警告', '', ''));
    container.appendChild(el('div', { class: 'grid grid-cols-1 md:grid-cols-3 gap-4 mb-8' }, alerts));

    // quick actions
    container.appendChild(el('div', { class: 'bg-white border border-indigo/10 p-5' }, [
      el('h3', { class: 'font-serif text-lg text-indigo mb-4', text: '快速操作' }),
      el('div', { class: 'flex flex-wrap gap-3' }, [
        UI.iconBtn('＋ 新下單', 'primary', function () { root.App.go('orders'); }),
        UI.iconBtn('＋ 入庫', 'accent', function () { root.App.go('inventory'); }),
        UI.iconBtn('生成發票', 'ghost', function () { root.App.go('invoices'); }),
        UI.iconBtn('列印送貨單', 'ghost', function () { root.App.go('delivery'); })
      ])
    ]));
  }

  function stat(label, value, icon, go) {
    return el('button', { class: 'bg-white border border-indigo/10 p-5 text-left hover:border-terracotta transition-colors', onclick: function () { if (go) root.App.go(go); } }, [
      el('div', { class: 'flex items-center justify-between' }, [
        el('span', { class: 'text-2xl', text: icon }),
        el('span', { class: 'font-serif text-4xl text-indigo', text: String(value) })
      ]),
      el('p', { class: 'text-sm text-indigo/60 mt-2', text: label })
    ]);
  }
  function alertCard(kind, title, sub, cta, go) {
    var ring = { ok: 'border-emerald-200 bg-emerald-50', warn: 'border-amber-300 bg-amber-50', err: 'border-red-300 bg-red-50' }[kind];
    return el('div', { class: 'border ' + ring + ' p-4 flex flex-col justify-between' }, [
      el('div', {}, [el('p', { class: 'font-bold text-indigo', text: title }), el('p', { class: 'text-sm text-indigo/70 mt-1', text: sub })]),
      cta ? el('button', { class: 'text-terracotta hover:underline text-sm font-bold mt-3 text-left', text: cta + ' →', onclick: function () { root.App.go(go); } }) : null
    ]);
  }

  root.Modules = root.Modules || {};
  root.Modules.dashboard = { id: 'dashboard', label: '總覽', icon: '📊', render: render };

})(typeof window !== 'undefined' ? window : this);
