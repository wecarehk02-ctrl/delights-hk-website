/* Module: 客戶 — customer records, settlement type, assigned pricing tier */
(function (root) {
  'use strict';
  var UI = root.UI, Store = root.Store, el = UI.el;

  function render(container) {
    var customers = Store.all('customers');
    var right = el('div', {}, [UI.iconBtn('＋ 新增客戶', 'primary', function () { edit(null, container); })]);
    container.innerHTML = '';
    container.appendChild(UI.sectionTitle('客戶', '客戶資料、結算方式（單次／月結）、指派階梯價', right));

    var cols = [
      { label: '名稱', render: function (c) { return '<b>' + c.name + '</b>'; } },
      { label: '聯絡', render: function (c) { return c.contact || '—'; } },
      { label: 'Email', render: function (c) { return c.email || '—'; } },
      { label: '地址', class: 'max-w-xs', render: function (c) { return '<span class="text-indigo/70">' + (c.address || '—') + '</span>'; } },
      { label: '結算', render: function (c) { return c.settlementType === 'monthly' ? UI.badge('月結', 'info') : UI.badge('單次', 'muted'); } },
      { label: '階梯價', render: function (c) { var t = c.pricingTierId ? Store.get('pricingTiers', c.pricingTierId) : null; return t ? t.name : '<span class="text-indigo/30">標準</span>'; } },
      { label: '操作', class: 'text-right whitespace-nowrap', render: function (c) {
        return el('div', { class: 'flex gap-2 justify-end' }, [
          el('button', { class: 'text-terracotta hover:underline text-xs', text: '編輯', onclick: function () { edit(c, container); } }),
          el('button', { class: 'text-red-600 hover:underline text-xs', text: '刪除', onclick: function () { UI.confirmModal('刪除客戶「' + c.name + '」？', function () { Store.remove('customers', c.id); render(container); }, { danger: true }); } })
        ]);
      } }
    ];
    container.appendChild(el('div', { class: 'bg-white border border-indigo/10 p-4' }, [UI.table(cols, customers, { empty: '未有客戶。' })]));
  }

  function edit(c, container) {
    var tiers = Store.all('pricingTiers');
    var body = el('div', {}, [
      UI.grid(2, [
        UI.field({ key: 'name', label: '客戶名稱', type: 'text', required: true, value: c ? c.name : '' }),
        UI.field({ key: 'contact', label: '聯絡人', type: 'text', value: c ? c.contact : '' })
      ]),
      UI.grid(2, [
        UI.field({ key: 'email', label: 'Email', type: 'text', value: c ? c.email : '' }),
        UI.field({ key: 'phone', label: '電話', type: 'text', value: c ? c.phone : '' })
      ]),
      UI.field({ key: 'address', label: '送貨地址', type: 'textarea', rows: 2, value: c ? c.address : '' }),
      UI.grid(2, [
        UI.field({ key: 'settlementType', label: '結算方式', type: 'select', options: [{ value: 'per_order', label: '單次結算' }, { value: 'monthly', label: '月結' }], value: c ? c.settlementType : 'per_order' }),
        UI.field({ key: 'pricingTierId', label: '階梯價', type: 'select', options: [{ value: '', label: '標準價（無階梯）' }].concat(tiers.map(function (t) { return { value: t.id, label: t.name }; })), value: c ? c.pricingTierId : '' })
      ])
    ]);
    UI.modal({
      title: c ? '編輯客戶' : '新增客戶', width: 'max-w-2xl', body: body,
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '儲存', kind: 'primary', onClick: function (close) {
          var d = UI.readForm(body);
          if (!d.name) { UI.toast('請輸入名稱', 'err'); return false; }
          if (c) Store.update('customers', c.id, d); else Store.insert('customers', d);
          UI.toast('已儲存', 'ok'); close(); render(container);
        } }
      ]
    });
  }

  root.Modules = root.Modules || {};
  root.Modules.customers = { id: 'customers', label: '客戶', icon: '👥', render: render };

})(typeof window !== 'undefined' ? window : this);
