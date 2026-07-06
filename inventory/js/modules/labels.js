/* Module: 標籤打印 (req 6) — per-lot QR label, protected fields + visible address */
(function (root) {
  'use strict';
  var UI = root.UI, Store = root.Store, el = UI.el;
  var QR = root.DELIGHTS_QR;

  function productName(id) { var p = Store.get('products', id); return p ? p.name : id; }
  function product(id) { return Store.get('products', id); }

  // QR payload = a reference URL back into the system; scanning opens the lot
  // view, where PROTECTED fields require the password. Sensitive data is NOT
  // embedded in the QR itself, so a generic scanner reveals only the reference.
  function qrPayload(lot) {
    var base = location.origin + location.pathname.replace(/[^/]*$/, '') + 'index.html';
    return base + '#lot=' + encodeURIComponent(lot.qrId);
  }

  function render(container) {
    var lots = Store.all('stockLots');
    container.innerHTML = '';
    container.appendChild(UI.sectionTitle('標籤打印', '為入庫貨品列印專屬 QR 標籤（Epson / 標籤機）', el('div', {}, [
      UI.badge(UI.isUnlocked() ? '🔓 受保護資料已解鎖' : '🔒 受保護資料已鎖', UI.isUnlocked() ? 'ok' : 'muted')
    ])));

    var cols = [
      { label: '批次', render: function (l) { return '<b>' + (l.lotCode || l.qrId) + '</b>'; } },
      { label: '貨品', render: function (l) { return productName(l.productId); } },
      { label: '數量', class: 'text-right', render: function (l) { return l.qty + ' ' + (l.unit || ''); } },
      { label: '到期日', render: function (l) { return UI.fmtDate(l.expiryDate); } },
      { label: '位置', render: function (l) { return l.storageLocation || '—'; } },
      { label: '狀態', render: function (l) { return l.status === 'shipped' ? UI.badge('已出貨', 'muted') : UI.badge('在庫', 'ok'); } },
      { label: '操作', class: 'text-right whitespace-nowrap', render: function (l) {
        return el('div', { class: 'flex gap-2 justify-end' }, [
          el('button', { class: 'text-indigo hover:underline text-xs', text: '預覽', onclick: function () { printLot(l.id); } }),
          el('button', { class: 'text-terracotta hover:underline text-xs', text: '直接列印', onclick: function () { printLot(l.id, true); } })
        ]);
      } }
    ];
    container.appendChild(el('div', { class: 'bg-white border border-indigo/10 p-4' }, [UI.table(cols, lots, { empty: '未有批次可列印。' })]));
  }

  // build the label DOM. showProtected controls whether sensitive fields print.
  function buildLabel(lot, showProtected) {
    var p = product(lot.productId);
    var s = Store.settings();
    var svg = QR.toSVG(qrPayload(lot), { ecLevel: 'M', scale: 4, quiet: 2 });

    function rowVisible(k, v) {
      return el('div', { class: 'lbl-row' }, [el('span', { class: 'lbl-k', text: k }), el('span', { class: 'lbl-v', text: v || '—' })]);
    }
    function rowProtected(k, v) {
      var val = showProtected ? (v || '—') : '••••••';
      return el('div', { class: 'lbl-row lbl-prot' }, [el('span', { class: 'lbl-k', text: k + ' 🔒' }), el('span', { class: 'lbl-v', text: val })]);
    }

    var label = el('div', { class: 'dlh-label' }, [
      el('div', { class: 'lbl-head' }, [
        el('div', {}, [
          el('div', { class: 'lbl-co', text: s.companyName }),
          el('div', { class: 'lbl-code', text: (lot.lotCode || lot.qrId) })
        ]),
        el('div', { class: 'lbl-qr', html: svg })
      ]),
      el('div', { class: 'lbl-name', text: (p ? p.name : lot.productId) + '  ×' + lot.qty + (lot.unit || '') }),
      // Visible data — delivery address always printed
      rowVisible('送貨地址', lot.deliveryAddress || s.companyAddress),
      el('div', { class: 'lbl-grid' }, [
        rowProtected('入庫', UI.fmtDateTime(lot.inboundTime)),
        rowProtected('出庫', lot.outboundTime ? UI.fmtDateTime(lot.outboundTime) : '未出'),
        rowProtected('每盒重量', (lot.weightPerBox != null && lot.weightPerBox !== '' ? lot.weightPerBox + ' kg' : '')),
        rowProtected('每盒件數', (lot.piecesPerBox != null && lot.piecesPerBox !== '' ? lot.piecesPerBox + ' 件' : '')),
        rowProtected('保存期至', UI.fmtDate(lot.expiryDate)),
        rowProtected('存放位置', lot.storageLocation)
      ]),
      el('div', { class: 'lbl-foot' }, [
        el('span', { text: lot.qrId }),
        el('span', { text: '篩 ' + (lot.sieveReturned || 0) + '/' + (lot.sieveCount || 0) })
      ])
    ]);
    return label;
  }

  function printLot(lotId, direct) {
    var lot = Store.get('stockLots', lotId);
    if (!lot) { UI.toast('搵唔到批次', 'err'); return; }

    var state = { showProtected: UI.isUnlocked() };
    var preview = el('div', { class: 'flex justify-center bg-rice-paper p-6' });
    var toggleWrap = el('div', { class: 'flex items-center gap-2 mb-3' });

    function draw() {
      preview.innerHTML = '';
      preview.appendChild(buildLabel(lot, state.showProtected));
    }
    function drawToggle() {
      toggleWrap.innerHTML = '';
      toggleWrap.appendChild(el('label', { class: 'flex items-center gap-2 text-sm text-indigo cursor-pointer' }, [
        (function () {
          var cb = el('input', { type: 'checkbox' });
          cb.checked = state.showProtected;
          cb.addEventListener('change', function () {
            if (cb.checked) {
              UI.requireUnlock(function () { state.showProtected = true; draw(); drawToggle(); });
              cb.checked = state.showProtected; // revert until unlocked
            } else { state.showProtected = false; draw(); drawToggle(); }
          });
          return cb;
        })(),
        el('span', { text: '在標籤上顯示受保護資料（需密碼）' })
      ]));
    }

    var styleEl = labelStyle();
    var body = el('div', {}, [toggleWrap, preview]);
    // inject preview style scoped
    body.appendChild(styleEl.cloneNode(true));
    drawToggle(); draw();

    function doPrint() {
      var w = window.open('', '_blank', 'width=480,height=420');
      var s = Store.settings();
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Label ' + (lot.lotCode || lot.qrId) + '</title>');
      w.document.write('<style>@page{size:' + s.labelWidthMm + 'mm ' + s.labelHeightMm + 'mm;margin:0;}body{margin:0;}</style>');
      w.document.write(styleEl.innerHTML.replace('<style>', '').replace('</style>', ''));
      w.document.write('</head><body>');
      w.document.write(buildLabel(lot, state.showProtected).outerHTML);
      w.document.write('</body></html>');
      w.document.close();
      w.focus();
      setTimeout(function () { w.print(); }, 300);
    }

    if (direct) { doPrint(); return; }

    UI.modal({
      title: '標籤預覽 — ' + (lot.lotCode || lot.qrId), width: 'max-w-xl', body: body,
      actions: [
        { label: '關閉', kind: 'ghost' },
        { label: '🖨 列印標籤', kind: 'primary', onClick: function (close) { doPrint(); } }
      ]
    });
  }

  function labelStyle() {
    var s = Store.settings();
    var css = '<style>' +
      '.dlh-label{width:' + s.labelWidthMm + 'mm;min-height:' + s.labelHeightMm + 'mm;box-sizing:border-box;padding:3mm;border:1px solid #000;background:#fff;color:#000;font-family:Helvetica,Arial,"Noto Sans TC",sans-serif;font-size:9pt;line-height:1.25;}' +
      '.lbl-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.5px solid #000;padding-bottom:1.5mm;margin-bottom:1.5mm;}' +
      '.lbl-co{font-weight:bold;font-size:9pt;}' +
      '.lbl-code{font-size:13pt;font-weight:bold;letter-spacing:.5px;}' +
      '.lbl-qr{width:22mm;height:22mm;}.lbl-qr svg{width:100%;height:100%;display:block;}' +
      '.lbl-name{font-weight:bold;font-size:10pt;margin-bottom:1mm;}' +
      '.lbl-row{display:flex;gap:2mm;padding:.3mm 0;}' +
      '.lbl-k{color:#000;min-width:18mm;font-size:7.5pt;opacity:.75;}' +
      '.lbl-v{font-size:8.5pt;flex:1;}' +
      '.lbl-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 3mm;margin-top:1mm;border-top:1px dotted #666;padding-top:1mm;}' +
      '.lbl-prot .lbl-v{font-family:monospace;}' +
      '.lbl-foot{display:flex;justify-content:space-between;border-top:1px solid #000;margin-top:1.5mm;padding-top:1mm;font-size:7pt;letter-spacing:.3px;}' +
      '</style>';
    var d = document.createElement('div'); d.innerHTML = css; return d.firstChild;
  }

  // Called by the #lot= deep link (scanning the QR) to show protected data.
  function showLotView(qrId) {
    var lot = Store.all('stockLots').find(function (l) { return l.qrId === qrId; });
    if (!lot) { UI.toast('搵唔到此標籤：' + qrId, 'err'); return; }
    var p = product(lot.productId);
    function view(unlocked) {
      var rows = [
        ['貨品', p ? p.name : lot.productId], ['批次', lot.lotCode || lot.qrId],
        ['數量', lot.qty + ' ' + (lot.unit || '')], ['送貨地址', lot.deliveryAddress || '—']
      ];
      var prot = [
        ['入庫時間', UI.fmtDateTime(lot.inboundTime)], ['出庫時間', lot.outboundTime ? UI.fmtDateTime(lot.outboundTime) : '未出'],
        ['每盒重量', lot.weightPerBox ? lot.weightPerBox + ' kg' : '—'], ['每盒件數', lot.piecesPerBox ? lot.piecesPerBox + ' 件' : '—'],
        ['保存期至', UI.fmtDate(lot.expiryDate)], ['存放位置', lot.storageLocation || '—']
      ];
      var body = el('div', {}, [
        el('div', { class: 'space-y-1 mb-4' }, rows.map(function (r) {
          return el('div', { class: 'flex justify-between border-b border-indigo/10 py-1 text-sm' }, [el('span', { class: 'text-indigo/60', text: r[0] }), el('span', { class: 'font-medium', text: r[1] })]);
        })),
        el('p', { class: 'text-xs font-bold uppercase tracking-wide text-indigo/60 mb-1', text: '🔒 受保護資料' }),
        unlocked ? el('div', { class: 'space-y-1' }, prot.map(function (r) {
          return el('div', { class: 'flex justify-between border-b border-indigo/10 py-1 text-sm' }, [el('span', { class: 'text-indigo/60', text: r[0] }), el('span', { class: 'font-medium', text: r[1] })]);
        })) : el('div', { class: 'text-center py-4' }, [el('button', { class: UI.btnClass('primary'), text: '🔓 輸入密碼查看', onclick: function () { UI.requireUnlock(function () { m.close(); showLotView(qrId); }); } })])
      ]);
      var m = UI.modal({ title: '標籤資料 · ' + lot.qrId, width: 'max-w-md', body: body, actions: [{ label: '關閉', kind: 'ghost' }] });
      return m;
    }
    view(UI.isUnlocked());
  }

  root.Modules = root.Modules || {};
  root.Modules.labels = { id: 'labels', label: '標籤打印', icon: '🏷️', render: render, printLot: printLot, showLotView: showLotView };

})(typeof window !== 'undefined' ? window : this);
