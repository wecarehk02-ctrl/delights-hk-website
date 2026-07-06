/* app.js — shell: tab navigation, QR deep-link handling, bootstrap */
(function (root) {
  'use strict';
  var UI = root.UI, Store = root.Store, el = UI.el;

  var ORDER = ['dashboard', 'products', 'customers', 'orders', 'inventory', 'delivery', 'labels', 'invoices', 'sieve', 'settings'];

  var App = {
    current: 'dashboard',
    go: function (id) {
      if (!root.Modules[id]) return;
      App.current = id;
      try { history.replaceState(null, '', '#' + id); } catch (e) {}
      App.renderNav();
      var main = document.getElementById('inv-main');
      main.scrollTop = 0;
      root.Modules[id].render(main);
    },
    renderNav: function () {
      var nav = document.getElementById('inv-nav');
      if (!nav) return;
      nav.innerHTML = '';
      ORDER.forEach(function (id) {
        var m = root.Modules[id];
        if (!m) return;
        var active = App.current === id;
        nav.appendChild(el('button', {
          class: 'w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ' +
            (active ? 'bg-indigo text-rice-paper' : 'text-indigo/80 hover:bg-indigo/10'),
          onclick: function () { App.go(id); closeMobileNav(); }
        }, [el('span', { class: 'text-lg', text: m.icon }), el('span', { text: m.label })]));
      });
    }
  };

  function closeMobileNav() {
    var side = document.getElementById('inv-side');
    if (side && window.innerWidth < 768) side.classList.add('-translate-x-full');
  }

  function handleHash() {
    var h = (location.hash || '').replace('#', '');
    // QR deep link: #lot=DLH-L-xxxx
    if (h.indexOf('lot=') === 0) {
      var qrId = decodeURIComponent(h.slice(4));
      App.go('labels');
      setTimeout(function () { root.Modules.labels.showLotView(qrId); }, 100);
      return;
    }
    if (h && root.Modules[h]) App.go(h);
    else App.go('dashboard');
  }

  function afterData() {
    App.renderNav();
    handleHash();
    window.addEventListener('hashchange', function () {
      var h = (location.hash || '').replace('#', '');
      if (h.indexOf('lot=') === 0) handleHash();
    });
    // re-render current view when cloud sync brings in changes
    Store.subscribe(function (c) { if (c === '*') { try { root.Modules[App.current].render(document.getElementById('inv-main')); } catch (e) {} } });
    var toggle = document.getElementById('inv-nav-toggle');
    var side = document.getElementById('inv-side');
    if (toggle && side) toggle.addEventListener('click', function () { side.classList.toggle('-translate-x-full'); });
  }

  function boot() {
    // QR self-test (fails loudly if the vendored generator is broken)
    try { root.DELIGHTS_QR.selfTest(); } catch (e) { console.error(e); }
    App.renderNav();
    // Cloud (Supabase) mode if configured & enabled; otherwise pure local.
    if (root.Cloud && root.Cloud.isEnabled()) {
      root.Cloud.start(function () { afterData(); });
    } else {
      Store.ensureSeed();
      afterData();
    }
  }

  root.App = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(typeof window !== 'undefined' ? window : this);
