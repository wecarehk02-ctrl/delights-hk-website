import personas from "../lib/personas.data.js";
import { isMockMode } from "../lib/openrouter.js";

export default function handler(req, res) {
  res.json({
    personas: personas.map(({ id, title, description }) => ({
      id,
      title,
      description,
    })),
    mockMode: isMockMode(),
  });
}
