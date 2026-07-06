/*
 * ui.js — shared UI helpers used by every module: DOM builders, form/field
 * rendering, tables, modal, toast, formatting, tiered-price calculation, and
 * the client-side label-protection password gate.
 */
(function (root) {
  'use strict';

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'value') node.value = attrs[k];
      else if (attrs[k] != null && attrs[k] !== false) node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function fmtMoney(n, currency) {
    n = Number(n || 0);
    return (currency || 'HKD') + ' ' + n.toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toISOString().slice(0, 10);
  }
  function fmtDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    var d = new Date(dateStr);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 86400000);
  }

  // ---- Toast ---------------------------------------------------------------
  function toast(msg, kind) {
    var wrap = document.getElementById('toast-wrap');
    if (!wrap) { wrap = el('div', { id: 'toast-wrap', class: 'fixed top-4 right-4 z-[100] space-y-2' }); document.body.appendChild(wrap); }
    var colors = { ok: 'bg-emerald-600', err: 'bg-red-600', warn: 'bg-amber-600', info: 'bg-indigo' };
    var t = el('div', { class: 'text-white px-4 py-3 shadow-lg text-sm ' + (colors[kind] || colors.info), text: msg });
    wrap.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 400); }, 2600);
  }

  // ---- Modal ---------------------------------------------------------------
  function modal(opts) {
    // opts: { title, body(node), width, actions:[{label,kind,onClick(close)}], onClose }
    var overlay = el('div', { class: 'fixed inset-0 z-[90] bg-black/50 flex items-start justify-center overflow-auto py-8 px-4' });
    var box = el('div', { class: 'bg-white w-full ' + (opts.width || 'max-w-2xl') + ' shadow-2xl my-auto' });
    var head = el('div', { class: 'flex items-center justify-between px-6 py-4 border-b border-indigo/10' }, [
      el('h3', { class: 'font-serif text-xl text-indigo', text: opts.title || '' }),
      el('button', { class: 'text-indigo/50 hover:text-terracotta text-2xl leading-none', html: '&times;', onclick: function () { close(); } })
    ]);
    var bodyWrap = el('div', { class: 'px-6 py-5' }, [opts.body]);
    var foot = el('div', { class: 'flex justify-end gap-2 px-6 py-4 border-t border-indigo/10 bg-rice-paper/40' });
    (opts.actions || [{ label: '關閉', kind: 'ghost' }]).forEach(function (a) {
      foot.appendChild(el('button', {
        class: btnClass(a.kind),
        text: a.label,
        onclick: function () { if (a.onClick) { if (a.onClick(close) === false) return; } else close(); }
      }));
    });
    box.appendChild(head); box.appendChild(bodyWrap); box.appendChild(foot);
    overlay.appendChild(box);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    function close() { overlay.remove(); if (opts.onClose) opts.onClose(); }
    return { close: close, box: box };
  }

  function btnClass(kind) {
    var base = 'px-4 py-2 text-sm font-bold transition-colors ';
    switch (kind) {
      case 'primary': return base + 'bg-indigo text-white hover:bg-terracotta';
      case 'accent': return base + 'bg-terracotta text-white hover:bg-terracotta/90';
      case 'danger': return base + 'bg-red-600 text-white hover:bg-red-700';
      case 'ghost': return base + 'border border-indigo/20 text-indigo hover:bg-indigo/5';
      default: return base + 'border border-indigo/20 text-indigo hover:bg-indigo/5';
    }
  }

  function confirmModal(message, onYes, opts) {
    opts = opts || {};
    modal({
      title: opts.title || '確認',
      width: 'max-w-md',
      body: el('p', { class: 'text-indigo/80', text: message }),
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: opts.yesLabel || '確定', kind: opts.danger ? 'danger' : 'primary', onClick: function (close) { onYes(); close(); } }
      ]
    });
  }

  // ---- Form field rendering (drives the "form-style" UI) -------------------
  // field: { key, label, type, options, unit, required, help, value }
  function field(f) {
    var id = 'f_' + f.key + '_' + Math.random().toString(36).slice(2, 6);
    var input;
    if (f.type === 'select') {
      input = el('select', { id: id, class: inputClass(), 'data-key': f.key },
        (f.options || []).map(function (o) {
          var val = typeof o === 'object' ? o.value : o;
          var lab = typeof o === 'object' ? o.label : o;
          var opt = el('option', { value: val, text: lab });
          if (String(f.value) === String(val)) opt.selected = true;
          return opt;
        }));
    } else if (f.type === 'textarea') {
      input = el('textarea', { id: id, class: inputClass(), rows: f.rows || 3, 'data-key': f.key });
      input.value = f.value == null ? '' : f.value;
    } else {
      input = el('input', {
        id: id, class: inputClass(), type: f.type || 'text', 'data-key': f.key,
        step: f.type === 'number' ? (f.step || 'any') : null,
        placeholder: f.placeholder || ''
      });
      input.value = f.value == null ? '' : f.value;
    }
    var labelText = f.label + (f.required ? ' *' : '') + (f.unit ? ' (' + f.unit + ')' : '');
    return el('div', { class: f.wrapClass || '' }, [
      el('label', { class: 'block text-xs font-bold uppercase tracking-wide text-indigo/60 mb-1', for: id, text: labelText }),
      input,
      f.help ? el('p', { class: 'text-xs text-indigo/50 mt-1', text: f.help }) : null
    ]);
  }
  function inputClass() {
    return 'w-full border border-indigo/20 bg-white px-3 py-2 text-sm text-indigo focus:outline-none focus:border-terracotta';
  }

  // read all [data-key] inputs inside a container into an object
  function readForm(container) {
    var out = {};
    container.querySelectorAll('[data-key]').forEach(function (inp) {
      var k = inp.getAttribute('data-key');
      var v = inp.value;
      if (inp.type === 'number') v = v === '' ? '' : Number(v);
      out[k] = v;
    });
    return out;
  }

  function grid(cols, nodes) {
    return el('div', { class: 'grid grid-cols-1 md:grid-cols-' + cols + ' gap-4' }, nodes);
  }

  // ---- Table ---------------------------------------------------------------
  // columns: [{label, render(row)->string|node, class}], rows, opts:{empty}
  function table(columns, rows, opts) {
    opts = opts || {};
    var thead = el('thead', {}, [el('tr', { class: 'text-left border-b-2 border-indigo/20' },
      columns.map(function (c) { return el('th', { class: 'py-2 px-3 text-xs font-bold uppercase tracking-wide text-indigo/60 ' + (c.class || ''), text: c.label }); }))]);
    var tbody = el('tbody', {}, rows.length ? rows.map(function (row) {
      return el('tr', { class: 'border-b border-indigo/10 hover:bg-rice-paper/50' },
        columns.map(function (c) {
          var content = c.render ? c.render(row) : row[c.key];
          var td = el('td', { class: 'py-2 px-3 text-sm align-top ' + (c.class || '') });
          if (content == null) content = '';
          if (typeof content === 'string' || typeof content === 'number') td.innerHTML = String(content);
          else td.appendChild(content);
          return td;
        }));
    }) : [el('tr', {}, [el('td', { class: 'py-8 text-center text-indigo/40', colspan: columns.length, text: opts.empty || '暫無資料' })])]);
    return el('div', { class: 'overflow-x-auto' }, [el('table', { class: 'w-full min-w-full' }, [thead, tbody])]);
  }

  function badge(text, kind) {
    var colors = {
      ok: 'bg-emerald-100 text-emerald-800', warn: 'bg-amber-100 text-amber-800',
      err: 'bg-red-100 text-red-800', info: 'bg-indigo/10 text-indigo', muted: 'bg-gray-100 text-gray-600'
    };
    return '<span class="inline-block px-2 py-0.5 text-xs font-bold rounded-sm ' + (colors[kind] || colors.info) + '">' + text + '</span>';
  }

  function sectionTitle(title, subtitle, right) {
    return el('div', { class: 'flex items-end justify-between mb-6 flex-wrap gap-3' }, [
      el('div', {}, [
        el('h2', { class: 'font-serif text-2xl md:text-3xl text-indigo', text: title }),
        subtitle ? el('p', { class: 'text-indigo/60 text-sm mt-1', text: subtitle }) : null
      ]),
      right || null
    ]);
  }

  function iconBtn(label, kind, onClick) {
    return el('button', { class: btnClass(kind), text: label, onclick: onClick });
  }

  // ---- Tiered pricing (跳bar) ----------------------------------------------
  // A tier defines quantity breakpoints with a discount %. Given a base price
  // and quantity, returns the effective unit price after the best applicable
  // discount. Editable per invoice line downstream.
  function tierPrice(basePrice, qty, tier) {
    basePrice = Number(basePrice || 0);
    if (!tier || !tier.tiers || !tier.tiers.length) return { unit: basePrice, discountPct: 0, band: null };
    var applicable = tier.tiers
      .filter(function (t) { return qty >= Number(t.minQty || 0); })
      .sort(function (a, b) { return Number(b.minQty) - Number(a.minQty); })[0];
    if (!applicable) return { unit: basePrice, discountPct: 0, band: null };
    var pct = Number(applicable.discountPct || 0);
    var unit = Math.round(basePrice * (1 - pct / 100) * 100) / 100;
    return { unit: unit, discountPct: pct, band: applicable };
  }

  // ---- Label-protection password gate (client-side) ------------------------
  // NOTE: browser-stored data is inherently readable by anyone with the
  // device; this is a deterrent/operational lock (hides sensitive label
  // fields behind a password prompt), not cryptographic security. Move the
  // check server-side when the cloud adapter lands for true protection.
  function simpleHash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return 'h' + h.toString(16);
  }
  var _unlockedUntil = 0;
  function isUnlocked() { return Date.now() < _unlockedUntil; }
  function unlockFor(minutes) { _unlockedUntil = Date.now() + minutes * 60000; }
  function requireUnlock(onOk) {
    if (isUnlocked()) { onOk(); return; }
    var s = root.Store.settings();
    if (!s.protectPasswordHash) { // no password set yet -> allow, prompt to set one
      onOk(); return;
    }
    var body = el('div', {}, [
      el('p', { class: 'text-sm text-indigo/70 mb-3', text: '呢啲係受保護資料，請輸入密碼解鎖（15分鐘內有效）。' }),
      field({ key: 'pw', label: '密碼', type: 'password' })
    ]);
    var m = modal({
      title: '🔒 解鎖受保護資料', width: 'max-w-md', body: body,
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '解鎖', kind: 'primary', onClick: function (close) {
          var pw = readForm(body).pw || '';
          if (simpleHash(pw) === s.protectPasswordHash) { unlockFor(15); close(); onOk(); }
          else { toast('密碼錯誤', 'err'); return false; }
        } }
      ]
    });
    setTimeout(function () { var i = body.querySelector('input'); if (i) i.focus(); }, 50);
  }

  root.UI = {
    el: el, fmtMoney: fmtMoney, fmtDate: fmtDate, fmtDateTime: fmtDateTime, daysUntil: daysUntil,
    toast: toast, modal: modal, confirmModal: confirmModal, btnClass: btnClass,
    field: field, readForm: readForm, grid: grid, table: table, badge: badge,
    sectionTitle: sectionTitle, iconBtn: iconBtn, inputClass: inputClass,
    tierPrice: tierPrice, simpleHash: simpleHash, requireUnlock: requireUnlock,
    isUnlocked: isUnlocked, unlockFor: unlockFor
  };

})(typeof window !== 'undefined' ? window : this);
