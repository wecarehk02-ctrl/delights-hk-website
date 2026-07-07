/*
 * supabase-adapter.js — offline-first cloud sync for the inventory system.
 *
 * Design: the UI keeps reading synchronously from the LOCAL cache (localStorage
 * via Store.LocalAdapter), so nothing in the app blocks on the network and it
 * keeps working offline. Writes go to the cache immediately, then push to
 * Supabase in the background. On boot / realtime change, cloud data is pulled
 * back into the cache and the current view re-renders.
 *
 * Storage model — ROW-LEVEL (see inventory/DATABASE.md): one row PER DOCUMENT
 * in table public.inventory_docs (collection, doc_id, data jsonb, deleted).
 * Writes diff each collection and upsert only the changed documents, so two
 * devices editing DIFFERENT records never clobber each other. Singleton
 * collections (settings/_seq/productSchema) are stored as one row, doc_id='_doc'.
 *
 * Config (URL + anon key + auth choice) lives in a raw localStorage key, NOT in
 * a synced collection. Credentials are entered by the user in Settings.
 */
(function (root) {
  'use strict';
  var Store = root.Store;
  var cache = Store.LocalAdapter;            // synchronous offline cache
  var TABLE = 'inventory_docs';
  var CFG_KEY = 'delights_inv_cloud_cfg';
  var OPS_KEY = 'delights_inv_cloud_ops';    // pending per-document sync ops
  var SEP = '::';

  // Collections stored as one row PER document (items must carry an `id`).
  // Everything else (settings, _seq, productSchema) is a singleton blob.
  var DOC_COLLECTIONS = {
    products: 1, customers: 1, orders: 1, invoices: 1,
    stockLots: 1, pricingTiers: 1, sieveLog: 1, queue: 1
  };
  function isDocCollection(c) { return DOC_COLLECTIONS.hasOwnProperty(c); }

  function loadRaw(key, def) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function saveRaw(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  var Cloud = {
    client: null,
    session: null,
    status: 'off',        // off | connecting | online | offline | auth-required | error
    lastError: '',
    _listeners: [],
    _flushTimer: null,

    // ---- config ----------------------------------------------------------
    config: function () {
      return Object.assign({ url: '', anonKey: '', enabled: false, requireAuth: true }, loadRaw(CFG_KEY, {}));
    },
    saveConfig: function (patch) { var next = Object.assign(this.config(), patch); saveRaw(CFG_KEY, next); return next; },
    isEnabled: function () { var c = this.config(); return !!(c.enabled && c.url && c.anonKey); },
    available: function () { return !!(root.supabase && root.supabase.createClient); },

    onStatus: function (fn) { this._listeners.push(fn); },
    _setStatus: function (s, err) { this.status = s; this.lastError = err || ''; this._listeners.forEach(function (f) { try { f(s, err); } catch (e) {} }); },

    // ---- the adapter Store uses -----------------------------------------
    adapter: {
      ready: function () { return true; },
      readAll: function (c) { return cache.readAll(c); },
      writeAll: function (c, data) {
        var old = cache.readAll(c);           // snapshot BEFORE overwrite, for diff
        cache.writeAll(c, data);
        Cloud.enqueueDiff(c, old, data);
        Cloud.scheduleFlush();
        return true;
      },
      keys: function () { return cache.keys(); }
    },

    // ---- pending per-document ops (offline-resilient, row-level) ---------
    // ops key = "collection<SEP>doc_id" -> { collection, docId, op:'up'|'del', data }
    _ops: function () { return loadRaw(OPS_KEY, {}); },
    _saveOps: function (o) { saveRaw(OPS_KEY, o); },
    _enqueue: function (collection, docId, op, data) {
      var o = this._ops();
      o[collection + SEP + docId] = { collection: collection, docId: docId, op: op, data: data };
      this._saveOps(o);
    },
    // Diff a collection's old vs new value and enqueue only what changed.
    enqueueDiff: function (collection, oldVal, newVal) {
      if (!isDocCollection(collection)) {      // singleton -> single blob row
        this._enqueue(collection, '_doc', 'up', newVal == null ? [] : newVal);
        return;
      }
      var oldArr = Array.isArray(oldVal) ? oldVal : [];
      var newArr = Array.isArray(newVal) ? newVal : [];
      var oldById = {}, newById = {};
      oldArr.forEach(function (d) { if (d && d.id != null) oldById[d.id] = d; });
      newArr.forEach(function (d) { if (d && d.id != null) newById[d.id] = d; });
      var self = this;
      newArr.forEach(function (d) {
        if (d && d.id != null) {
          var prev = oldById[d.id];
          if (!prev || JSON.stringify(prev) !== JSON.stringify(d)) self._enqueue(collection, String(d.id), 'up', d);
        }
      });
      Object.keys(oldById).forEach(function (id) {
        if (!newById.hasOwnProperty(id)) self._enqueue(collection, String(id), 'del', oldById[id]);
      });
    },

    // ---- lifecycle -------------------------------------------------------
    init: function () {
      var c = this.config();
      if (!this.isEnabled()) return false;
      if (!this.available()) { this._setStatus('error', 'Supabase 程式庫未載入（可能離線）'); return false; }
      try {
        this.client = root.supabase.createClient(c.url, c.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
      } catch (e) { this._setStatus('error', e.message); return false; }
      Store.adapter = this.adapter;           // route all reads/writes through cache+sync
      var self = this;
      this.client.auth.onAuthStateChange(function (_evt, session) {
        self.session = session;
        if (session) { self._setStatus('online'); self.flush(); }
      });
      // flush the queue whenever the network returns
      root.addEventListener('online', function () { self.flush(); self.pull(); });
      return true;
    },

    // Full startup: handle login gate, pull cloud data, seed if empty, subscribe.
    // Calls done() when the app is ready to render.
    start: function (done) {
      var self = this;
      var c = this.config();
      if (!this.init()) { Store.ensureSeed(); done(); return; }
      this._setStatus('connecting');
      this.client.auth.getSession().then(function (res) {
        self.session = (res.data && res.data.session) || null;
        if (c.requireAuth && !self.session) {
          self._setStatus('auth-required');
          self.showLogin(function () { self._afterAuth(done); });
        } else {
          self._afterAuth(done);
        }
      }).catch(function (e) { self._setStatus('error', e.message); Store.ensureSeed(); done(); });
    },

    _afterAuth: function (done) {
      var self = this;
      this._setStatus('connecting');
      // Push any local offline edits first, then pull cloud state. Flushing
      // before pulling means our unsynced docs are not lost to the pull.
      this.flush().then(function () {
        return self.pull();
      }).then(function () {
        // first-time cloud: empty -> seed locally (auto-enqueues) then push up
        if (cache.readAll('productSchema') == null) { Store.ensureSeed(); return self.flush(); }
      }).then(function () {
        self.subscribe();
        self._setStatus('online');
        done();
      }).catch(function (e) {
        // offline / RLS error: fall back to whatever is cached
        self._setStatus('offline', e.message);
        if (cache.readAll('productSchema') == null) Store.ensureSeed();
        done();
      });
    },

    // ---- sync (row-level) ------------------------------------------------
    // Rebuild the local cache from cloud rows, one collection at a time.
    _applyRows: function (rows, onlyCollection) {
      var byColl = {};
      (rows || []).forEach(function (row) {
        var c = row.collection;
        if (!byColl[c]) byColl[c] = { docs: [], singleton: undefined };
        if (row.deleted) return;                      // skip tombstones
        if (row.doc_id === '_doc') byColl[c].singleton = row.data;
        else byColl[c].docs.push(row.data);
      });
      Object.keys(byColl).forEach(function (c) {
        if (onlyCollection && c !== onlyCollection) return;
        if (isDocCollection(c)) cache.writeAll(c, byColl[c].docs);       // pure cache write, no enqueue
        else if (byColl[c].singleton !== undefined) cache.writeAll(c, byColl[c].singleton);
      });
      Store._emit('*');
    },
    pull: function () {
      var self = this;
      if (!this.client) return Promise.resolve();
      return this.client.from(TABLE).select('collection,doc_id,data,deleted').then(function (res) {
        if (res.error) throw res.error;
        self._applyRows(res.data, null);
      });
    },
    pullOne: function (collection) {
      var self = this;
      if (!this.client) return;
      this.client.from(TABLE).select('collection,doc_id,data,deleted').eq('collection', collection).then(function (res) {
        if (res.error) return;
        self._applyRows(res.data, collection);
      });
    },
    scheduleFlush: function () {
      var self = this;
      clearTimeout(this._flushTimer);
      this._flushTimer = setTimeout(function () { self.flush(); }, 700);
    },
    flush: function () {
      var self = this;
      if (!this.client) return Promise.resolve();
      var c = this.config();
      if (c.requireAuth && !this.session) return Promise.resolve(); // wait until logged in
      var ops = this._ops();
      var keys = Object.keys(ops);
      if (!keys.length) return Promise.resolve();
      var rows = keys.map(function (k) {
        var o = ops[k];
        return { collection: o.collection, doc_id: o.docId, data: o.data == null ? {} : o.data, deleted: o.op === 'del', updated_at: new Date().toISOString() };
      });
      return this.client.from(TABLE).upsert(rows, { onConflict: 'collection,doc_id' }).then(function (res) {
        if (res.error) { self._setStatus('offline', res.error.message); throw res.error; }
        // clear only ops we flushed AND that were not re-edited during the flush
        var cur = self._ops();
        keys.forEach(function (k) { if (cur[k] && JSON.stringify(cur[k]) === JSON.stringify(ops[k])) delete cur[k]; });
        self._saveOps(cur);
        self._setStatus('online');
      }).catch(function (e) { self._setStatus('offline', e.message); });
    },
    subscribe: function () {
      var self = this;
      if (!this.client || this.channel) return;
      this.channel = this.client.channel('inv_docs')
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, function (payload) {
          var coll = (payload.new && payload.new.collection) || (payload.old && payload.old.collection);
          if (coll) self.pullOne(coll);
        })
        .subscribe();
    },

    // ---- auth ------------------------------------------------------------
    login: function (email, password) {
      if (!this.client) return Promise.reject(new Error('未連接'));
      return this.client.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
        if (res.error) throw res.error; return res.data.session;
      });
    },
    logout: function () {
      var self = this;
      if (!this.client) return Promise.resolve();
      return this.client.auth.signOut().then(function () { self.session = null; self._setStatus('auth-required'); });
    },

    // ---- login screen ----------------------------------------------------
    showLogin: function (onSuccess) {
      var UI = root.UI, el = UI.el, self = this;
      var overlay = el('div', { class: 'fixed inset-0 z-[95] bg-indigo flex items-center justify-center p-6' });
      var form = el('div', { class: 'bg-rice-paper w-full max-w-sm p-8 shadow-2xl' }, [
        el('div', { class: 'font-serif text-2xl text-indigo mb-1', text: '帝樂倉存系統' }),
        el('p', { class: 'text-sm text-indigo/60 mb-6', text: '請登入以存取雲端資料' }),
        UI.field({ key: 'email', label: 'Email', type: 'text' }),
        el('div', { class: 'h-3' }),
        UI.field({ key: 'password', label: '密碼', type: 'password' }),
        el('div', { class: 'mt-6 flex flex-col gap-2' })
      ]);
      var btnWrap = form.lastChild;
      var btn = el('button', { class: UI.btnClass('primary') + ' w-full justify-center', text: '登入' });
      var localBtn = el('button', { class: 'text-xs text-indigo/50 hover:text-terracotta', text: '暫時離線使用本地資料' });
      var errP = el('p', { class: 'text-sm text-red-600 mt-2 min-h-[1.2em]' });
      btnWrap.appendChild(btn); btnWrap.appendChild(errP); btnWrap.appendChild(localBtn);
      overlay.appendChild(form);
      document.body.appendChild(overlay);

      function submit() {
        var d = UI.readForm(form);
        btn.textContent = '登入中…'; btn.disabled = true; errP.textContent = '';
        self.login(d.email, d.password).then(function () {
          overlay.remove(); onSuccess();
        }).catch(function (e) { errP.textContent = translateAuthErr(e.message); btn.textContent = '登入'; btn.disabled = false; });
      }
      btn.addEventListener('click', submit);
      form.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
      localBtn.addEventListener('click', function () {
        // temporary local-only session: keep cache, skip cloud until reload
        overlay.remove(); self._setStatus('offline', '離線使用'); if (cache.readAll('productSchema') == null) Store.ensureSeed(); onSuccess();
      });
      setTimeout(function () { var i = form.querySelector('input'); if (i) i.focus(); }, 60);
    },

    // Switch back to pure local mode.
    disable: function () {
      this.saveConfig({ enabled: false });
      if (this.channel) { try { this.client.removeChannel(this.channel); } catch (e) {} this.channel = null; }
      Store.adapter = cache;
      this._setStatus('off');
    }
  };

  function translateAuthErr(m) {
    if (/Invalid login/i.test(m)) return 'Email 或密碼錯誤';
    if (/Email not confirmed/i.test(m)) return 'Email 尚未確認';
    if (/network|fetch/i.test(m)) return '網絡連線失敗';
    return m;
  }

  root.Cloud = Cloud;
})(typeof window !== 'undefined' ? window : this);
