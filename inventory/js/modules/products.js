/* Module: 產品目錄 — expandable product list with add/remove columns (req 1) */
(function (root) {
  'use strict';
  var UI = root.UI, Store = root.Store, el = UI.el;

  function schema() { return Store.all('productSchema'); }
  function fieldTypes() {
    return [{ value: 'text', label: '文字' }, { value: 'number', label: '數字' }, { value: 'date', label: '日期' }, { value: 'select', label: '選項' }];
  }

  function render(container) {
    var s = schema();
    var products = Store.all('products');

    var right = el('div', { class: 'flex gap-2 flex-wrap' }, [
      UI.iconBtn('＋ 新增產品', 'primary', function () { editProduct(null, container); }),
      UI.iconBtn('⚙ 管理欄位', 'ghost', function () { manageColumns(container); })
    ]);

    var cols = s.map(function (f) {
      return { label: f.label, render: function (p) { return formatCell(p[f.key], f); } };
    });
    cols.push({
      label: '操作', class: 'text-right whitespace-nowrap', render: function (p) {
        var wrap = el('div', { class: 'flex gap-1 justify-end' }, [
          el('button', { class: 'text-terracotta hover:underline text-xs', text: '編輯', onclick: function () { editProduct(p, container); } }),
          el('button', { class: 'text-red-600 hover:underline text-xs ml-2', text: '刪除', onclick: function () {
            UI.confirmModal('確定刪除「' + p.name + '」？', function () { Store.remove('products', p.id); UI.toast('已刪除', 'ok'); render(container); }, { danger: true });
          } })
        ]);
        return wrap;
      }
    });

    container.innerHTML = '';
    container.appendChild(UI.sectionTitle('產品目錄', '共 ' + products.length + ' 項產品 · ' + s.length + ' 個資料欄位（可自由增減）', right));
    container.appendChild(el('div', { class: 'bg-white border border-indigo/10 p-4' }, [UI.table(cols, products, { empty: '未有產品，按「新增產品」開始。' })]));
  }

  function formatCell(v, f) {
    if (v == null || v === '') return '<span class="text-indigo/30">—</span>';
    if (f.key === 'unitPrice') return UI.fmtMoney(v, Store.settings().currency);
    if (f.type === 'number') return String(v) + (f.unit ? ' <span class="text-indigo/40 text-xs">' + f.unit + '</span>' : '');
    return String(v);
  }

  function editProduct(p, container) {
    var s = schema();
    var body = el('div', {}, [
      UI.grid(2, s.map(function (f) {
        return UI.field({
          key: f.key, label: f.label, type: f.type, unit: f.unit, required: f.required,
          options: f.type === 'select' ? (f.options || []) : null,
          value: p ? p[f.key] : ''
        });
      }))
    ]);
    UI.modal({
      title: p ? '編輯產品' : '新增產品', width: 'max-w-3xl', body: body,
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '儲存', kind: 'primary', onClick: function (close) {
          var data = UI.readForm(body);
          if (!data.name) { UI.toast('請輸入貨品名稱', 'err'); return false; }
          if (p) Store.update('products', p.id, data);
          else Store.insert('products', data);
          UI.toast('已儲存', 'ok'); close(); render(container);
        } }
      ]
    });
  }

  // ---- Column manager (the "increase/decrease columns" feature) -----------
  function manageColumns(container) {
    var body = el('div', {});
    function draw() {
      var s = schema();
      body.innerHTML = '';
      var list = el('div', { class: 'space-y-2 mb-5' }, s.map(function (f, idx) {
        return el('div', { class: 'flex items-center gap-2 border border-indigo/10 px-3 py-2' }, [
          el('span', { class: 'flex-1 text-sm', html: '<b>' + f.label + '</b> <span class="text-indigo/40">' + f.key + ' · ' + f.type + (f.core ? ' · 核心' : '') + '</span>' }),
          el('button', { class: 'text-indigo/40 hover:text-indigo disabled:opacity-20', text: '↑', disabled: idx === 0, onclick: function () { move(idx, -1); } }),
          el('button', { class: 'text-indigo/40 hover:text-indigo disabled:opacity-20', text: '↓', disabled: idx === s.length - 1, onclick: function () { move(idx, 1); } }),
          f.core ? el('span', { class: 'text-xs text-indigo/30 w-10 text-right', text: '鎖定' })
                 : el('button', { class: 'text-red-600 hover:underline text-xs w-10 text-right', text: '刪除', onclick: function () {
                     UI.confirmModal('刪除欄位「' + f.label + '」？現有產品資料會保留但唔再顯示。', function () {
                       Store.saveAll('productSchema', schema().filter(function (x) { return x.key !== f.key; }));
                       draw();
                     }, { danger: true });
                   } })
        ]);
      }));

      var nf = el('div', { class: 'border-t border-indigo/10 pt-4' }, [
        el('p', { class: 'text-xs font-bold uppercase tracking-wide text-indigo/60 mb-2', text: '新增欄位' }),
        UI.grid(3, [
          UI.field({ key: 'nlabel', label: '欄位名稱', type: 'text', placeholder: '例如：批次備註' }),
          UI.field({ key: 'ntype', label: '類型', type: 'select', options: fieldTypes() }),
          UI.field({ key: 'nunit', label: '單位(可選)', type: 'text', placeholder: 'kg / 件' })
        ]),
        UI.field({ key: 'noptions', label: '選項(只限「選項」類型，逗號分隔)', type: 'text', placeholder: '甲, 乙, 丙' }),
        el('div', { class: 'mt-3' }, [
          UI.iconBtn('＋ 加入欄位', 'accent', function () {
            var d = UI.readForm(nf);
            if (!d.nlabel) { UI.toast('請輸入欄位名稱', 'err'); return; }
            var key = 'c_' + UI.slug(d.nlabel);
            if (schema().some(function (x) { return x.key === key; })) { UI.toast('欄位已存在', 'err'); return; }
            var col = { key: key, label: d.nlabel, type: d.ntype || 'text' };
            if (d.nunit) col.unit = d.nunit;
            if (d.ntype === 'select' && d.noptions) col.options = d.noptions.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
            var arr = schema(); arr.push(col); Store.saveAll('productSchema', arr);
            UI.toast('已加入欄位「' + d.nlabel + '」', 'ok'); draw();
          })
        ])
      ]);

      body.appendChild(el('p', { class: 'text-sm text-indigo/60 mb-3', text: '拖動排序、刪除或新增產品資料欄位。核心欄位（系統需要）不可刪除。' }));
      body.appendChild(list);
      body.appendChild(nf);
    }
    function move(idx, dir) {
      var s = schema(); var j = idx + dir; if (j < 0 || j >= s.length) return;
      var t = s[idx]; s[idx] = s[j]; s[j] = t; Store.saveAll('productSchema', s); draw();
    }
    draw();
    UI.modal({ title: '管理產品欄位', width: 'max-w-2xl', body: body, actions: [{ label: '完成', kind: 'primary', onClick: function (close) { close(); render(container); } }] });
  }

  root.Modules = root.Modules || {};
  root.Modules.products = { id: 'products', label: '產品目錄', icon: '📦', render: render };

  // small slug helper (kept here to avoid bloating UI)
  UI.slug = UI.slug || function (s) {
    return String(s).trim().toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '_').replace(/^_|_$/g, '') || ('f' + Date.now().toString(36));
  };

})(typeof window !== 'undefined' ? window : this);
