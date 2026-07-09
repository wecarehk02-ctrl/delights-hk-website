import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERSONAS_DIR = path.join(__dirname, "..", "personas");

/**
 * 揀第一行 "# 標題" 做title，冇嘅話就用檔案名。
 * 揀標題之後第一段非空文字做簡短description，畀dashboard嘅下拉選單顯示。
 */
function parsePersona(id, content) {
  const lines = content.split("\n");
  let title = id;
  const headingLine = lines.find((l) => l.trim().startsWith("#"));
  if (headingLine) {
    title = headingLine.replace(/^#+\s*/, "").trim();
  }

  let description = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    description = trimmed;
    break;
  }
  if (description.length > 140) {
    description = description.slice(0, 140) + "…";
  }

  return { id, title, description, content };
}

/**
 * 掃描 personas/ 資料夾，讀取所有 .md 檔案。
 * 返回 { id, title, description, content } 嘅list，content會做system prompt用。
 */
export function loadPersonas() {
  if (!fs.existsSync(PERSONAS_DIR)) return [];

  const files = fs
    .readdirSync(PERSONAS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".md"));

  return files
    .map((filename) => {
      const id = filename.replace(/\.md$/i, "");
      const fullPath = path.join(PERSONAS_DIR, filename);
      const content = fs.readFileSync(fullPath, "utf-8");
      return parsePersona(id, content);
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function getPersonaById(id) {
  return loadPersonas().find((p) => p.id === id) || null;
}
