import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "tasks.json");

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]", "utf-8");
}

function readAll() {
  ensureDb();
  const raw = fs.readFileSync(DB_FILE, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeAll(tasks) {
  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(tasks, null, 2), "utf-8");
}

export function listTasks() {
  return readAll().sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

export function getTask(id) {
  return readAll().find((t) => t.id === id) || null;
}

export function createTask(task) {
  const tasks = readAll();
  tasks.push(task);
  writeAll(tasks);
  return task;
}

export function updateTask(id, patch) {
  const tasks = readAll();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  tasks[idx] = { ...tasks[idx], ...patch };
  writeAll(tasks);
  return tasks[idx];
}
