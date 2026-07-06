/* Module: 設定 — company info, reorder webhook, label protection password, backup */
(function (root) {
  'use strict';
  var UI = root.UI, Store = root.Store, el = UI.el;

  function render(container) {
    var s = Store.settings();
    container.innerHTML = '';
    container.appendChild(UI.sectionTitle('設定', '公司資料、補貨接口、標籤密碼、資料備份', null));

    // ---- company / operations ----
    var form = el('div', {}, [
      card('公司資料', [
        UI.grid(2, [
          UI.field({ key: 'companyName', label: '公司名稱(中)', type: 'text', value: s.companyName }),
          UI.field({ key: 'companyNameEn', label: '公司名稱(英)', type: 'text', value: s.companyNameEn })
        ]),
        UI.field({ key: 'companyAddress', label: '地址', type: 'textarea', rows: 2, value: s.companyAddress }),
        UI.grid(3, [
          UI.field({ key: 'companyPhone', label: '電話', type: 'text', value: s.companyPhone }),
          UI.field({ key: 'companyEmail', label: 'Email', type: 'text', value: s.companyEmail }),
          UI.field({ key: 'companyBR', label: '商業登記 BR', type: 'text', value: s.companyBR })
        ]),
        UI.grid(2, [
          UI.field({ key: 'currency', label: '貨幣', type: 'text', value: s.currency }),
          UI.field({ key: 'deliveryNoteFooter', label: '送貨單簽收欄字句', type: 'text', value: s.deliveryNoteFooter })
        ])
      ]),
      card('庫存 / 補貨', [
        UI.grid(2, [
          UI.field({ key: 'expiryWarnDays', label: '到期警告日數', type: 'number', unit: '日', value: s.expiryWarnDays, help: '到期前幾多日開始警告' }),
          UI.field({ key: 'defaultSupplierEmail', label: '預設供應商 Email', type: 'text', value: s.defaultSupplierEmail, help: '補貨 email 收件人（產品未設定時用）' })
        ]),
        UI.field({ key: 'reorderWebhook', label: '補貨 Webhook URL（可選）', type: 'text', value: s.reorderWebhook, help: '缺貨時 POST JSON 到此網址（Zapier / Make / 自家 API）。需對方支援 CORS。' })
      ]),
      card('標籤', [
        UI.grid(2, [
          UI.field({ key: 'labelWidthMm', label: '標籤闊度', type: 'number', unit: 'mm', value: s.labelWidthMm }),
          UI.field({ key: 'labelHeightMm', label: '標籤高度', type: 'number', unit: 'mm', value: s.labelHeightMm })
        ])
      ])
    ]);
    container.appendChild(form);
    container.appendChild(el('div', { class: 'flex justify-end mb-8' }, [
      UI.iconBtn('儲存設定', 'primary', function () {
        var d = UI.readForm(form);
        Store.saveSettings(d); UI.toast('設定已儲存', 'ok');
      })
    ]));

    // ---- password protection ----
    container.appendChild(card('🔒 受保護標籤資料密碼', [
      el('p', { class: 'text-sm text-indigo/60 mb-3', text: '設定密碼後，標籤上嘅入/出庫時間、重量、件數、保存期、存放位置等資料需要密碼先睇到或印出。' }),
      el('p', { class: 'text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2 mb-3', text: '注意：純瀏覽器版嘅資料本質上可被有心人讀取，此密碼屬操作性遮蔽（deterrent），並非加密保護。日後接雲端後端可做真正權限控制。' }),
      (function () {
        var pwForm = el('div', {}, [
          UI.grid(2, [
            UI.field({ key: 'pw1', label: s.protectPasswordHash ? '新密碼' : '設定密碼', type: 'password' }),
            UI.field({ key: 'pw2', label: '再輸入一次', type: 'password' })
          ])
        ]);
        var actions = el('div', { class: 'flex gap-2 mt-2' }, [
          UI.iconBtn('儲存密碼', 'accent', function () {
            var d = UI.readForm(pwForm);
            if (!d.pw1) { UI.toast('請輸入密碼', 'err'); return; }
            if (d.pw1 !== d.pw2) { UI.toast('兩次密碼唔一致', 'err'); return; }
            Store.saveSettings({ protectPasswordHash: UI.simpleHash(d.pw1) });
            UI.toast('密碼已設定', 'ok'); render(container);
          }),
          s.protectPasswordHash ? UI.iconBtn('移除密碼', 'ghost', function () {
            UI.confirmModal('移除密碼？受保護資料將唔再需要密碼。', function () { Store.saveSettings({ protectPasswordHash: '' }); UI.toast('已移除', 'ok'); render(container); }, { danger: true });
          }) : null
        ]);
        return el('div', {}, [pwForm, actions]);
      })()
    ]));

    // ---- data backup ----
    container.appendChild(card('資料備份 / 還原', [
      el('p', { class: 'text-sm text-indigo/60 mb-3', text: '所有資料儲存喺此瀏覽器。定期匯出 JSON 作備份；換機或還原時匯入。' }),
      el('div', { class: 'flex gap-2 flex-wrap' }, [
        UI.iconBtn('⭳ 匯出備份 (JSON)', 'ghost', exportData),
        (function () {
          var wrap = el('label', { class: UI.btnClass('ghost') + ' cursor-pointer' }, [el('span', { text: '⭱ 匯入備份' })]);
          var inp = el('input', { type: 'file', accept: '.json', style: 'display:none' });
          inp.addEventListener('change', function () { importData(inp.files[0], container); });
          wrap.appendChild(inp);
          return wrap;
        })(),
        UI.iconBtn('⟲ 載入示範資料', 'ghost', function () { UI.confirmModal('清空並載入示範資料？現有資料會被覆蓋。', function () { Store.resetAll(); Store.ensureSeed(); UI.toast('已載入示範資料', 'ok'); location.reload(); }, { danger: true }); }),
        UI.iconBtn('🗑 清除所有資料', 'danger', function () { UI.confirmModal('確定清除所有資料？此動作不可還原。建議先匯出備份。', function () { Store.resetAll(); UI.toast('已清除', 'ok'); location.reload(); }, { danger: true, yesLabel: '清除' }); })
      ])
    ]));
  }

  function card(title, children) {
    return el('div', { class: 'bg-white border border-indigo/10 p-5 mb-5' }, [
      el('h3', { class: 'font-serif text-lg text-indigo mb-4', text: title })
    ].concat(children));
  }

  function exportData() {
    var data = Store.exportAll();
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'delights-inventory-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    UI.toast('已匯出備份', 'ok');
  }
  function importData(file, container) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var obj = JSON.parse(reader.result);
        Store.importAll(obj);
        UI.toast('已匯入，重新載入中…', 'ok');
        setTimeout(function () { location.reload(); }, 800);
      } catch (e) { UI.toast('匯入失敗：' + e.message, 'err'); }
    };
    reader.readAsText(file);
  }

  root.Modules = root.Modules || {};
  root.Modules.settings = { id: 'settings', label: '設定', icon: '⚙️', render: render };

})(typeof window !== 'undefined' ? window : this);
