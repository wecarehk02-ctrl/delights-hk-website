/*
 * store.js — data layer for the Delights inventory system.
 *
 * Cloud-ready by design: every read/write goes through an *adapter*. Today the
 * LocalAdapter persists to the browser's localStorage. To move to a backend,
 * implement the same three methods (readAll / writeAll / ready) against your
 * API/Firebase/Supabase and assign it to Store.adapter — no module needs to
 * change. Method signatures already return values that a Promise-based adapter
 * can wrap later; UI code treats them as synchronous for now.
 */
(function (root) {
  'use strict';

  var NS = 'delights_inv_v1';

  // ---- Local storage adapter ----------------------------------------------
  var LocalAdapter = {
    ready: function () { return true; },
    readAll: function (collection) {
      try {
        var raw = localStorage.getItem(NS + ':' + collection);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },
    writeAll: function (collection, data) {
      localStorage.setItem(NS + ':' + collection, JSON.stringify(data));
      return true;
    },
    keys: function () {
      var out = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(NS + ':') === 0) out.push(k.slice(NS.length + 1));
      }
      return out;
    }
  };

  // ---- ID + helpers --------------------------------------------------------
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function nowISO() { return new Date().toISOString(); }

  var Store = {
    adapter: LocalAdapter,

    // Generic collection access -------------------------------------------
    all: function (collection) {
      var data = this.adapter.readAll(collection);
      return Array.isArray(data) ? data : [];
    },
    get: function (collection, id) {
      return this.all(collection).find(function (r) { return r.id === id; }) || null;
    },
    saveAll: function (collection, rows) {
      this.adapter.writeAll(collection, rows);
      Store._emit(collection);
      return rows;
    },
    insert: function (collection, row) {
      var rows = this.all(collection);
      if (!row.id) row.id = uid(collection.slice(0, 3));
      row.createdAt = row.createdAt || nowISO();
      row.updatedAt = nowISO();
      rows.push(row);
      this.saveAll(collection, rows);
      return row;
    },
    update: function (collection, id, patch) {
      var rows = this.all(collection);
      var i = rows.findIndex(function (r) { return r.id === id; });
      if (i < 0) return null;
      rows[i] = Object.assign({}, rows[i], patch, { updatedAt: nowISO() });
      this.saveAll(collection, rows);
      return rows[i];
    },
    upsert: function (collection, row) {
      if (row.id && this.get(collection, row.id)) return this.update(collection, row.id, row);
      return this.insert(collection, row);
    },
    remove: function (collection, id) {
      var rows = this.all(collection).filter(function (r) { return r.id !== id; });
      this.saveAll(collection, rows);
    },

    // Settings (single object) --------------------------------------------
    settings: function () {
      var s = this.adapter.readAll('settings');
      return Object.assign({}, DEFAULT_SETTINGS, s || {});
    },
    saveSettings: function (patch) {
      var next = Object.assign({}, this.settings(), patch);
      this.adapter.writeAll('settings', next);
      Store._emit('settings');
      return next;
    },

    // Sequential document numbers -----------------------------------------
    nextSeq: function (name, prefix) {
      var counters = this.adapter.readAll('_seq') || {};
      counters[name] = (counters[name] || 0) + 1;
      this.adapter.writeAll('_seq', counters);
      var n = String(counters[name]).padStart(4, '0');
      var y = new Date().getFullYear();
      return (prefix || name.toUpperCase()) + '-' + y + '-' + n;
    },

    // Change notification (very light pub/sub) ----------------------------
    _subs: [],
    subscribe: function (fn) { this._subs.push(fn); return function () {}; },
    _emit: function (collection) { this._subs.forEach(function (f) { try { f(collection); } catch (e) {} }); },

    // Backup / restore -----------------------------------------------------
    exportAll: function () {
      var out = { _meta: { app: 'delights-inventory', version: 1, exportedAt: nowISO() } };
      var cols = ['productSchema', 'products', 'customers', 'stockLots', 'orders',
        'invoices', 'pricingTiers', 'sieveLog', 'settings', '_seq'];
      cols.forEach(function (c) {
        var d = Store.adapter.readAll(c);
        if (d != null) out[c] = d;
      });
      return out;
    },
    importAll: function (obj) {
      if (!obj || obj._meta == null) throw new Error('唔係有效嘅備份檔案');
      Object.keys(obj).forEach(function (c) {
        if (c === '_meta') return;
        Store.adapter.writeAll(c, obj[c]);
      });
      Store._emit('*');
    },
    resetAll: function () {
      Store.adapter.keys().forEach(function (k) { localStorage.removeItem(NS + ':' + k); });
      Store._emit('*');
    },

    uid: uid,
    nowISO: nowISO
  };

  // ---- Default product schema (columns are user-editable) -----------------
  // core:true fields cannot be deleted; users add/remove the rest freely.
  var DEFAULT_SCHEMA = [
    { key: 'sku', label: '貨品編號', type: 'text', core: true, required: true },
    { key: 'name', label: '貨品名稱', type: 'text', core: true, required: true },
    { key: 'category', label: '分類', type: 'text', core: true },
    { key: 'unit', label: '單位', type: 'text', core: true },
    { key: 'unitPrice', label: '標準單價', type: 'number', core: true, unit: 'HKD' },
    { key: 'reorderLevel', label: '安全庫存', type: 'number', core: true },
    { key: 'reorderQty', label: '每次補貨量', type: 'number', core: true },
    { key: 'shelfLifeDays', label: '保存期(日)', type: 'number', core: true },
    { key: 'supplierName', label: '供應商', type: 'text', core: true },
    { key: 'supplierEmail', label: '供應商Email', type: 'text', core: true },
    { key: 'weightPerBox', label: '每盒重量(kg)', type: 'number' },
    { key: 'piecesPerBox', label: '每盒件數', type: 'number' }
  ];

  var DEFAULT_SETTINGS = {
    companyName: '帝樂香港有限公司',
    companyNameEn: 'Delights Hong Kong Limited',
    companyAddress: '香港',
    companyPhone: '',
    companyEmail: 'wecarehk02@gmail.com',
    companyBR: '',
    currency: 'HKD',
    expiryWarnDays: 14,            // warn this many days before expiry
    reorderWebhook: '',            // optional POST endpoint for auto-reorder
    defaultSupplierEmail: '',
    protectPasswordHash: '',       // hash of the label-protection password
    deliveryNoteFooter: '收貨人簽署 / Received by',
    labelWidthMm: 100,
    labelHeightMm: 70
  };

  Store.DEFAULT_SCHEMA = DEFAULT_SCHEMA;
  Store.DEFAULT_SETTINGS = DEFAULT_SETTINGS;

  // ---- Seed helpers --------------------------------------------------------
  Store.ensureSeed = function () {
    if (this.adapter.readAll('productSchema') == null) {
      this.adapter.writeAll('productSchema', DEFAULT_SCHEMA);
    }
    if (this.adapter.readAll('products') == null) {
      this.adapter.writeAll('products', SEED_PRODUCTS);
    }
    if (this.adapter.readAll('customers') == null) {
      this.adapter.writeAll('customers', SEED_CUSTOMERS);
    }
    if (this.adapter.readAll('pricingTiers') == null) {
      this.adapter.writeAll('pricingTiers', SEED_TIERS);
    }
    if (this.adapter.readAll('stockLots') == null) {
      this.adapter.writeAll('stockLots', SEED_LOTS());
    }
    if (this.adapter.readAll('sieveLog') == null) {
      this.adapter.writeAll('sieveLog', SEED_SIEVE());
    }
  };

  var SEED_PRODUCTS = [
    { id: 'prod_soup01', sku: 'DLH-SOUP-01', name: '米其林慢煮花膠雞湯', category: '湯品', unit: '盒', unitPrice: 128, reorderLevel: 40, reorderQty: 120, shelfLifeDays: 180, supplierName: '溫氏食品', supplierEmail: 'supply@wens.example', weightPerBox: 0.5, piecesPerBox: 1 },
    { id: 'prod_sauce01', sku: 'DLH-SAUCE-01', name: '主廚秘製XO醬', category: '醬料', unit: '樽', unitPrice: 88, reorderLevel: 60, reorderQty: 200, shelfLifeDays: 365, supplierName: '溫氏食品', supplierEmail: 'supply@wens.example', weightPerBox: 0.25, piecesPerBox: 1 },
    { id: 'prod_beef01', sku: 'DLH-BEEF-01', name: '慢煮和牛頰肉', category: '肉類', unit: '包', unitPrice: 168, reorderLevel: 30, reorderQty: 80, shelfLifeDays: 120, supplierName: '溫氏食品', supplierEmail: 'supply@wens.example', weightPerBox: 0.3, piecesPerBox: 2 }
  ];

  var SEED_CUSTOMERS = [
    { id: 'cust_hotel', name: '半島酒店餐飲部', contact: 'F&B Manager', email: 'fb@hotel.example', address: '香港九龍尖沙咀梳士巴利道22號', settlementType: 'monthly', pricingTierId: 'tier_hotel' },
    { id: 'cust_bistro', name: '中環 Bistro L', contact: '陳先生', email: 'order@bistrol.example', address: '香港中環威靈頓街1號', settlementType: 'per_order', pricingTierId: '' }
  ];

  var SEED_TIERS = [
    { id: 'tier_hotel', name: '酒店合約價 (階梯)', tiers: [{ minQty: 0, discountPct: 0 }, { minQty: 50, discountPct: 5 }, { minQty: 100, discountPct: 10 }, { minQty: 300, discountPct: 15 }] }
  ];

  function SEED_LOTS() {
    var today = new Date();
    function daysFrom(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString(); }
    return [
      { id: 'lot_a', qrId: 'DLH-L-A1001', lotCode: 'A1001', productId: 'prod_soup01', qty: 24, unit: '盒', inboundTime: daysFrom(today, -160), outboundTime: '', weightPerBox: 0.5, piecesPerBox: 1, expiryDate: daysFrom(today, 20).slice(0, 10), storageLocation: '凍倉 A-3-2', sieveCount: 4, sieveReturned: 0, deliveryAddress: '', status: 'in_stock' },
      { id: 'lot_b', qrId: 'DLH-L-B2002', lotCode: 'B2002', productId: 'prod_sauce01', qty: 60, unit: '樽', inboundTime: daysFrom(today, -30), outboundTime: '', weightPerBox: 0.25, piecesPerBox: 1, expiryDate: daysFrom(today, 335).slice(0, 10), storageLocation: '常溫倉 B-1-5', sieveCount: 6, sieveReturned: 2, deliveryAddress: '', status: 'in_stock' },
      { id: 'lot_c', qrId: 'DLH-L-C3003', lotCode: 'C3003', productId: 'prod_beef01', qty: 12, unit: '包', inboundTime: daysFrom(today, -110), outboundTime: '', weightPerBox: 0.3, piecesPerBox: 2, expiryDate: daysFrom(today, 8).slice(0, 10), storageLocation: '冰倉 C-2-1', sieveCount: 3, sieveReturned: 0, deliveryAddress: '', status: 'in_stock' }
    ];
  }

  function SEED_SIEVE() {
    var today = new Date().toISOString().slice(0, 10);
    return [
      { id: 'sv1', date: today, type: 'in', qty: 13, supplierName: '溫氏食品', note: '每日到貨篩' }
    ];
  }

  root.Store = Store;

})(typeof window !== 'undefined' ? window : this);
