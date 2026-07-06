/*
 * supabase-adapter.js — offline-first cloud sync for the inventory system.
 *
 * Design: the UI keeps reading synchronously from the LOCAL cache (localStorage
 * via Store.LocalAdapter), so nothing in the app blocks on the network and it
 * keeps working offline. Writes go to the cache immediately, then push to
 * Supabase in the background. On boot / realtime change, cloud data is pulled
 * back into the cache and the current view re-renders.
 *
 * Storage model mirrors the local one exactly: one row per collection holding
 * the whole JSON blob (table public.inventory_store: collection PK, data jsonb).
 * Whole-collection, last-write-wins — simple and robust for a small team.
 *
 * Config (URL + anon key + auth choice) lives in a raw localStorage key, NOT in
 * a synced collection. Credentials are entered by the user in Settings.
 */
(function (root) {
  'use strict';
  var Store = root.Store;
  var cache = Store.LocalAdapter;            // synchronous offline cache
  var CFG_KEY = 'delights_inv_cloud_cfg';
  var DIRTY_KEY = 'delights_inv_cloud_dirty';

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
      writeAll: function (c, data) { cache.writeAll(c, data); Cloud.markDirty(c); Cloud.scheduleFlush(); return true; },
      keys: function () { return cache.keys(); }
    },

    // ---- dirty queue (for offline resilience) ---------------------------
    markDirty: function (c) { var d = loadRaw(DIRTY_KEY, {}); d[c] = 1; saveRaw(DIRTY_KEY, d); },
    _dirtyList: function () { return Object.keys(loadRaw(DIRTY_KEY, {})); },
    _clearDirty: function (c) { var d = loadRaw(DIRTY_KEY, {}); delete d[c]; saveRaw(DIRTY_KEY, d); },

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
      this.pull().then(function () {
        // first-time cloud: empty -> seed locally then push up
        if (cache.readAll('productSchema') == null) { Store.ensureSeed(); self._markAllDirty(); }
        return self.flush();
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

    _markAllDirty: function () {
      var cols = ['productSchema', 'products', 'customers', 'stockLots', 'orders', 'invoices', 'pricingTiers', 'sieveLog', 'settings', '_seq'];
      cols.forEach(function (c) { if (cache.readAll(c) != null) Cloud.markDirty(c); });
    },

    // ---- sync ------------------------------------------------------------
    pull: function () {
      if (!this.client) return Promise.resolve();
      return this.client.from('inventory_store').select('collection,data').then(function (res) {
        if (res.error) throw res.error;
        (res.data || []).forEach(function (row) { cache.writeAll(row.collection, row.data); });
        Store._emit('*');
      });
    },
    pullOne: function (collection) {
      if (!this.client) return;
      this.client.from('inventory_store').select('data').eq('collection', collection).maybeSingle().then(function (res) {
        if (res.error || !res.data) return;
        cache.writeAll(collection, res.data.data);
        Store._emit('*');
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
      var dirty = this._dirtyList();
      if (!dirty.length) return Promise.resolve();
      var rows = dirty.map(function (col) {
        var data = cache.readAll(col); if (data == null) data = [];
        return { collection: col, data: data, updated_at: new Date().toISOString() };
      });
      return this.client.from('inventory_store').upsert(rows, { onConflict: 'collection' }).then(function (res) {
        if (res.error) { self._setStatus('offline', res.error.message); throw res.error; }
        dirty.forEach(function (col) { self._clearDirty(col); });
        self._setStatus('online');
      }).catch(function (e) { self._setStatus('offline', e.message); });
    },
    subscribe: function () {
      var self = this;
      if (!this.client || this.channel) return;
      this.channel = this.client.channel('inv_store')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_store' }, function (payload) {
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
