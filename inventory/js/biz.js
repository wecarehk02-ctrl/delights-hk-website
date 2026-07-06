/*
 * biz.js — business logic shared across modules: stock levels, expiry checks,
 * low-stock reordering (email draft + webhook), and sieve counters.
 */
(function (root) {
  'use strict';
  var Store = root.Store;

  var Biz = {
    // ---- Stock ------------------------------------------------------------
    lotsForProduct: function (productId) {
      return Store.all('stockLots').filter(function (l) { return l.productId === productId && l.status !== 'shipped'; });
    },
    availableQty: function (productId) {
      return this.lotsForProduct(productId).reduce(function (sum, l) { return sum + Number(l.qty || 0); }, 0);
    },
    stockSummary: function () {
      var products = Store.all('products');
      return products.map(function (p) {
        var qty = Biz.availableQty(p.id);
        var reorder = Number(p.reorderLevel || 0);
        return { product: p, qty: qty, reorderLevel: reorder, low: reorder > 0 && qty < reorder };
      });
    },

    // ---- Expiry -----------------------------------------------------------
    expiringLots: function (withinDays) {
      var warn = withinDays == null ? Number(Store.settings().expiryWarnDays || 14) : withinDays;
      var out = [];
      Store.all('stockLots').forEach(function (l) {
        if (l.status === 'shipped' || !l.expiryDate) return;
        var d = new Date(l.expiryDate); var today = new Date(); today.setHours(0, 0, 0, 0);
        var days = Math.round((d - today) / 86400000);
        if (days <= warn) out.push({ lot: l, days: days, expired: days < 0 });
      });
      return out.sort(function (a, b) { return a.days - b.days; });
    },

    // ---- Low-stock reorder (req 3) ---------------------------------------
    lowStockItems: function () {
      return this.stockSummary().filter(function (s) { return s.low; });
    },
    reorderEmail: function (items) {
      var s = Store.settings();
      var to = '';
      var emails = {};
      items.forEach(function (it) { if (it.product.supplierEmail) emails[it.product.supplierEmail] = 1; });
      to = Object.keys(emails).join(',') || s.defaultSupplierEmail || '';
      var subject = '【' + s.companyName + '】補貨申請 Purchase / Restock Request ' + new Date().toISOString().slice(0, 10);
      var lines = items.map(function (it) {
        var qty = Number(it.product.reorderQty || (it.reorderLevel - it.qty)) || 0;
        return '• ' + (it.product.sku || '') + ' ' + it.product.name +
          '｜現存 ' + it.qty + ' ' + (it.product.unit || '') +
          '｜安全庫存 ' + it.reorderLevel +
          '｜建議補貨 ' + qty + ' ' + (it.product.unit || '');
      });
      var body = '您好，\n\n以下貨品庫存低於安全水平，煩請安排補貨：\n\n' + lines.join('\n') +
        '\n\n收貨地址：' + (s.companyAddress || '') +
        '\n聯絡：' + (s.companyPhone || '') + ' ' + (s.companyEmail || '') +
        '\n\n此致\n' + s.companyName;
      return { to: to, subject: subject, body: body };
    },
    mailtoLink: function (mail) {
      return 'mailto:' + encodeURIComponent(mail.to) +
        '?subject=' + encodeURIComponent(mail.subject) +
        '&body=' + encodeURIComponent(mail.body);
    },
    postWebhook: function (items) {
      var s = Store.settings();
      if (!s.reorderWebhook) return Promise.reject(new Error('未設定 Webhook URL（請到「設定」填寫）'));
      var payload = {
        type: 'reorder',
        company: s.companyName,
        createdAt: new Date().toISOString(),
        items: items.map(function (it) {
          return {
            sku: it.product.sku, name: it.product.name,
            onHand: it.qty, reorderLevel: it.reorderLevel,
            reorderQty: Number(it.product.reorderQty || 0),
            unit: it.product.unit || '', supplierEmail: it.product.supplierEmail || ''
          };
        })
      };
      return fetch(s.reorderWebhook, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      }).then(function (r) {
        if (!r.ok) throw new Error('Webhook 回應 ' + r.status);
        return r;
      });
    },

    // ---- Stock deduction on shipping (FIFO by expiry) --------------------
    deductStock: function (productId, qty) {
      var lots = Biz.lotsForProduct(productId).slice().sort(function (a, b) {
        return new Date(a.expiryDate || '2999-12-31') - new Date(b.expiryDate || '2999-12-31');
      });
      var remaining = qty, touched = [];
      for (var i = 0; i < lots.length && remaining > 0; i++) {
        var l = lots[i];
        var take = Math.min(Number(l.qty || 0), remaining);
        var newQty = Number(l.qty) - take;
        Store.update('stockLots', l.id, {
          qty: newQty,
          status: newQty <= 0 ? 'shipped' : 'in_stock',
          outboundTime: newQty <= 0 ? Store.nowISO() : l.outboundTime
        });
        remaining -= take; touched.push({ lotId: l.id, taken: take });
      }
      return { fulfilled: qty - remaining, short: remaining, touched: touched };
    },

    // ---- Sieve counters (req 8) ------------------------------------------
    sieveBalance: function () {
      // outstanding sieves = received - returned, grouped by supplier
      var bySupplier = {};
      Store.all('sieveLog').forEach(function (e) {
        var k = e.supplierName || '(未指定)';
        if (!bySupplier[k]) bySupplier[k] = { supplier: k, inQty: 0, returnQty: 0 };
        if (e.type === 'in') bySupplier[k].inQty += Number(e.qty || 0);
        else bySupplier[k].returnQty += Number(e.qty || 0);
      });
      return Object.keys(bySupplier).map(function (k) {
        var r = bySupplier[k]; r.outstanding = r.inQty - r.returnQty; return r;
      });
    },
    sieveTotalOutstanding: function () {
      return this.sieveBalance().reduce(function (s, r) { return s + r.outstanding; }, 0);
    }
  };

  root.Biz = Biz;
})(typeof window !== 'undefined' ? window : this);
