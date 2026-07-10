const state = { personas: [], tasks: [] };

const personaSelect = document.getElementById("personaSelect");
const personaDescription = document.getElementById("personaDescription");
const taskForm = document.getElementById("taskForm");
const taskDescription = document.getElementById("taskDescription");
const submitBtn = document.getElementById("submitBtn");
const mockBadge = document.getElementById("mockBadge");
const modalOverlay = document.getElementById("modalOverlay");
const modalBody = document.getElementById("modalBody");
const modalClose = document.getElementById("modalClose");

async function loadPersonas() {
  const res = await fetch("/api/personas");
  const data = await res.json();
  state.personas = data.personas;

  if (data.mockMode) mockBadge.classList.remove("hidden");

  personaSelect.innerHTML = state.personas
    .map((p) => `<option value="${p.id}">${escapeHtml(p.title)}</option>`)
    .join("");

  updatePersonaDescription();
}

function updatePersonaDescription() {
  const p = state.personas.find((p) => p.id === personaSelect.value);
  personaDescription.textContent = p ? p.description : "";
}

personaSelect.addEventListener("change", updatePersonaDescription);

taskForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const personaId = personaSelect.value;
  const description = taskDescription.value.trim();
  if (!personaId || !description) return;

  const persona = state.personas.find((p) => p.id === personaId);

  // 樂觀更新：即刻喺「執行中」欄放一張暫時卡，唔使等 Claude 覆完先見到
  state.tasks.unshift({
    id: "temp-" + Date.now(),
    personaId,
    personaTitle: persona ? persona.title : personaId,
    description,
    status: "executing",
    createdAt: new Date().toISOString(),
  });
  renderBoard();

  submitBtn.disabled = true;
  submitBtn.textContent = "指派緊…";
  try {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personaId, description }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert("建立task失敗：" + (err.error || res.statusText));
    } else {
      taskDescription.value = "";
    }
  } catch (err) {
    alert("建立task失敗：" + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "指派task";
    await loadTasks();
  }
});

async function loadTasks() {
  const res = await fetch("/api/tasks");
  const data = await res.json();
  state.tasks = data.tasks || [];
  renderBoard();
}

function renderBoard() {
  const cols = { executing: [], completed: [], failed: [] };
  for (const t of state.tasks) {
    if (cols[t.status]) cols[t.status].push(t);
  }

  for (const status of Object.keys(cols)) {
    const el = document.getElementById(`col-${status}`);
    el.innerHTML = cols[status].map(cardHtml).join("") || emptyHint();
  }

  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", () => openModal(card.dataset.id));
  });
}

function emptyHint() {
  return `<p style="font-size:12px;color:var(--muted);">（暫時冇task）</p>`;
}

function cardHtml(t) {
  const time = new Date(t.createdAt).toLocaleString("zh-HK");
  return `
    <div class="card" data-id="${t.id}">
      <span class="persona-tag">${escapeHtml(t.personaTitle)}</span>
      <div class="desc">${escapeHtml(t.description)}</div>
      <div class="time">${time}</div>
    </div>
  `;
}

function openModal(id) {
  const t = state.tasks.find((t) => t.id === id);
  if (!t) return;

  let resultBlock = "";
  if (t.status === "executing") {
    resultBlock = `<p>⏳ 仲喺度處理緊…</p>`;
  } else if (t.status === "failed") {
    resultBlock = `<p style="color:var(--failed);">❌ 失敗：${escapeHtml(t.error || "")}</p>`;
  } else if (t.status === "completed") {
    const usage = t.usage
      ? `<div class="usage">Token用量：input ${t.usage.inputTokens} / output ${t.usage.outputTokens}</div>`
      : "";
    resultBlock = `<div class="result-text">${escapeHtml(t.result || "")}</div>${usage}`;
  }

  modalBody.innerHTML = `
    <h2>${escapeHtml(t.personaTitle)}</h2>
    <p style="color:var(--muted); font-size:13px;">${escapeHtml(t.description)}</p>
    <hr style="border:none;border-top:1px solid var(--border); margin:14px 0;" />
    ${resultBlock}
  `;
  modalOverlay.classList.remove("hidden");
}

modalClose.addEventListener("click", () => modalOverlay.classList.add("hidden"));
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) modalOverlay.classList.add("hidden");
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

// 每 3 秒 poll 一次，等執行緊嘅 task 有結果時自動 update
async function init() {
  await loadPersonas();
  await loadTasks();
  setInterval(loadTasks, 3000);
}

init();
