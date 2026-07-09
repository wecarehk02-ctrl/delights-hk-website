import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

import { loadPersonas, getPersonaById } from "./lib/personas.js";
import { listTasks, getTask, createTask, updateTask } from "./lib/store.js";
import { runTask, isMockMode } from "./lib/claudeClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---- API ----

app.get("/api/personas", (req, res) => {
  const personas = loadPersonas().map(({ id, title, description }) => ({
    id,
    title,
    description,
  }));
  res.json({ personas, mockMode: isMockMode() });
});

app.get("/api/tasks", (req, res) => {
  res.json({ tasks: listTasks() });
});

app.get("/api/tasks/:id", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json({ task });
});

app.post("/api/tasks", async (req, res) => {
  const { personaId, description } = req.body || {};

  if (!personaId || !description || !description.trim()) {
    return res
      .status(400)
      .json({ error: "personaId 同 description 都係必填" });
  }

  const persona = getPersonaById(personaId);
  if (!persona) {
    return res.status(400).json({ error: `搵唔到persona: ${personaId}` });
  }

  const task = {
    id: randomUUID(),
    personaId,
    personaTitle: persona.title,
    description: description.trim(),
    status: "executing",
    result: null,
    usage: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  createTask(task);

  // 即時response，等前端可以馬上見到張card喺「執行中」，唔使等Claude覆完先render
  res.status(201).json({ task });

  // 之後background完成先update task狀態(dashboard會poll攞返最新狀態)
  try {
    const { text, usage } = await runTask(persona.content, task.description);
    updateTask(task.id, {
      status: "completed",
      result: text,
      usage,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    updateTask(task.id, {
      status: "failed",
      error: err.message || String(err),
      updatedAt: new Date().toISOString(),
    });
  }
});

app.listen(PORT, () => {
  console.log(`AI辦公室 dashboard 行緊喺 http://localhost:${PORT}`);
  if (isMockMode()) {
    console.log(
      "⚠ MOCK MODE：未偵測到AWS credentials，Claude回覆會係假資料。填好.env先攞到真回覆。"
    );
  }
});
