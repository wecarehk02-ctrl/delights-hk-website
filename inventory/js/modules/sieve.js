/* Module: 篩具計數 (req 8) — daily sieve intake, periodic returns, outstanding counter */
(function (root) {
  'use strict';
  var UI = root.UI, Store = root.Store, Biz = root.Biz, el = UI.el;

  function render(container) {
    var right = el('div', { class: 'flex gap-2 flex-wrap' }, [
      UI.iconBtn('＋ 到貨篩（入）', 'primary', function () { entry('in', container); }),
      UI.iconBtn('↩ 回篩（還）', 'accent', function () { entry('return', container); })
    ]);
    container.innerHTML = '';
    container.appendChild(UI.sectionTitle('篩具計數', '記錄每日到貨嘅篩，追蹤未回篩數量', right));

    var balance = Biz.sieveBalance();
    var totalOut = Biz.sieveTotalOutstanding();

    // big counter
    container.appendChild(el('div', { class: 'bg-indigo text-rice-paper p-6 mb-6 flex items-center justify-between flex-wrap gap-4' }, [
      el('div', {}, [
        el('p', { class: 'text-rice-paper/70 text-sm uppercase tracking-wide', text: '未回篩總數 Outstanding sieves' }),
        el('p', { class: 'font-serif text-5xl', text: String(totalOut) })
      ]),
      el('p', { class: 'text-rice-paper/60 text-sm max-w-xs', text: '此數 = 累計到貨篩數 − 已回篩數。定期回篩後於此更新。' })
    ]));

    // per supplier
    var cols = [
      { label: '供應商', render: function (r) { return '<b>' + r.supplier + '</b>'; } },
      { label: '到貨篩總數', class: 'text-right', render: function (r) { return String(r.inQty); } },
      { label: '已回篩', class: 'text-right', render: function (r) { return String(r.returnQty); } },
      { label: '未回篩', class: 'text-right', render: function (r) { return '<span class="' + (r.outstanding > 0 ? 'text-terracotta font-bold' : 'text-emerald-600') + '">' + r.outstanding + '</span>'; } },
      { label: '操作', class: 'text-right', render: function (r) {
        return el('button', { class: 'text-terracotta hover:underline text-xs', text: '回篩', onclick: function () { entry('return', container, r.supplier); } });
      } }
    ];
    container.appendChild(el('div', { class: 'bg-white border border-indigo/10 p-4 mb-6' }, [
      el('h3', { class: 'font-serif text-lg text-indigo mb-3', text: '各供應商結存' }),
      UI.table(cols, balance, { empty: '未有篩具紀錄。' })
    ]));

    // ledger
    var log = Store.all('sieveLog').slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''); });
    var logCols = [
      { label: '日期', render: function (e) { return UI.fmtDate(e.date); } },
      { label: '類型', render: function (e) { return e.type === 'in' ? UI.badge('到貨 IN', 'info') : UI.badge('回篩 RETURN', 'ok'); } },
      { label: '供應商', render: function (e) { return e.supplierName || '—'; } },
      { label: '數量', class: 'text-right', render: function (e) { return (e.type === 'in' ? '+' : '−') + e.qty; } },
      { label: '備註', render: function (e) { return e.note || '—'; } },
      { label: '', class: 'text-right', render: function (e) { return el('button', { class: 'text-red-600 hover:underline text-xs', text: '刪', onclick: function () { UI.confirmModal('刪除此紀錄？', function () { Store.remove('sieveLog', e.id); render(container); }, { danger: true }); } }); } }
    ];
    container.appendChild(el('div', { class: 'bg-white border border-indigo/10 p-4' }, [
      el('h3', { class: 'font-serif text-lg text-indigo mb-3', text: '篩具流水紀錄' }),
      UI.table(logCols, log, { empty: '未有紀錄。' })
    ]));
  }

  function entry(type, container, presetSupplier) {
    var suppliers = {};
    Store.all('products').forEach(function (p) { if (p.supplierName) suppliers[p.supplierName] = 1; });
    Store.all('sieveLog').forEach(function (e) { if (e.supplierName) suppliers[e.supplierName] = 1; });
    var supList = Object.keys(suppliers);

    var body = el('div', {}, [
      UI.grid(2, [
        UI.field({ key: 'date', label: '日期', type: 'date', value: new Date().toISOString().slice(0, 10) }),
        UI.field({ key: 'qty', label: type === 'in' ? '到貨篩數量' : '回篩數量', type: 'number', required: true })
      ]),
      UI.field({ key: 'supplierName', label: '供應商', type: supList.length ? 'select' : 'text',
        options: supList.length ? [{ value: '', label: '— 選 —' }].concat(supList.map(function (x) { return { value: x, label: x }; })) : null,
        value: presetSupplier || '' }),
      UI.field({ key: 'note', label: '備註', type: 'text' })
    ]);

    UI.modal({
      title: type === 'in' ? '記錄到貨篩' : '記錄回篩', width: 'max-w-lg', body: body,
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '儲存', kind: 'primary', onClick: function (close) {
          var d = UI.readForm(body);
          if (!d.qty || Number(d.qty) <= 0) { UI.toast('請輸入數量', 'err'); return false; }
          Store.insert('sieveLog', { date: d.date, type: type, qty: Number(d.qty), supplierName: d.supplierName, note: d.note });
          UI.toast('已記錄', 'ok'); close(); render(container);
        } }
      ]
    });
  }

  root.Modules = root.Modules || {};
  root.Modules.sieve = { id: 'sieve', label: '篩具計數', icon: '🧺', render: render };

})(typeof window !== 'undefined' ? window : this);
