/* Module: 任務佇列 — durable queue for failed/pending webhooks & emails (ported idea) */
(function (root) {
  'use strict';
  var UI = root.UI, Store = root.Store, Biz = root.Biz, el = UI.el;

  function render(container) {
    var tasks = Store.all('queue').slice().sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    var pending = tasks.filter(function (t) { return t.status === 'pending'; });

    var right = pending.length ? el('div', {}, [UI.iconBtn('↻ 全部重試', 'primary', function () { retryAll(container); })]) : null;
    container.innerHTML = '';
    container.appendChild(UI.sectionTitle('任務佇列', '補貨／通知等任務失敗唔會消失，喺呢度重試或手動處理', right));

    if (!tasks.length) {
      container.appendChild(el('div', { class: 'bg-white border border-indigo/10 p-8 text-center text-indigo/40' }, ['暫無任務。缺貨補貨若 webhook 失敗會自動出現喺呢度。']));
      return;
    }

    var cols = [
      { label: '建立', render: function (t) { return UI.fmtDateTime(t.createdAt); } },
      { label: '類型', render: function (t) { return typeBadge(t.type); } },
      { label: '內容', class: 'max-w-sm', render: function (t) { return '<span class="text-indigo/80">' + (t.title || '') + '</span>'; } },
      { label: '狀態', render: function (t) {
        if (t.status === 'done') return UI.badge('已完成', 'ok');
        if (t.status === 'failed') return UI.badge('失敗 ×' + (t.attempts || 0), 'err');
        return UI.badge('待處理', 'warn');
      } },
      { label: '最後錯誤', class: 'max-w-xs', render: function (t) { return t.lastError ? '<span class="text-red-600 text-xs">' + t.lastError + '</span>' : '—'; } },
      { label: '操作', class: 'text-right whitespace-nowrap', render: function (t) {
        return el('div', { class: 'flex gap-2 justify-end' }, [
          t.status !== 'done' ? el('button', { class: 'text-indigo hover:underline text-xs', text: '重試', onclick: function () { retry(t, container); } }) : null,
          t.status !== 'done' ? el('button', { class: 'text-terracotta hover:underline text-xs', text: '標記完成', onclick: function () { Store.update('queue', t.id, { status: 'done' }); render(container); } }) : null,
          el('button', { class: 'text-red-600 hover:underline text-xs', text: '刪除', onclick: function () { Store.remove('queue', t.id); render(container); } })
        ]);
      } }
    ];
    container.appendChild(el('div', { class: 'bg-white border border-indigo/10 p-4' }, [UI.table(cols, tasks)]));
  }

  function typeBadge(type) {
    if (type === 'restock-webhook') return UI.badge('補貨 Webhook', 'info');
    if (type === 'restock-email') return UI.badge('補貨 Email', 'info');
    if (type === 'invoice-email') return UI.badge('發票 Email', 'info');
    return UI.badge(type || '任務', 'muted');
  }

  function retry(t, container) {
    if (t.type === 'restock-webhook') {
      UI.toast('重試中…', 'info');
      Biz.runWebhook(t.payload).then(function () {
        Store.update('queue', t.id, { status: 'done', lastError: '' }); UI.toast('已送出', 'ok'); render(container);
      }).catch(function (e) {
        Store.update('queue', t.id, { status: 'failed', attempts: (t.attempts || 0) + 1, lastError: e.message }); UI.toast('仍然失敗：' + e.message, 'err'); render(container);
      });
    } else {
      UI.toast('此類型任務請手動處理後標記完成', 'warn');
    }
  }
  function retryAll(container) {
    var pending = Store.all('queue').filter(function (t) { return t.status !== 'done'; });
    pending.forEach(function (t) { retry(t, container); });
  }

  root.Modules = root.Modules || {};
  root.Modules.queue = { id: 'queue', label: '任務佇列', icon: '📮', render: render };

})(typeof window !== 'undefined' ? window : this);
