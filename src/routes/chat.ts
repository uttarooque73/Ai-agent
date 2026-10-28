import { Router } from "express";
import { z } from "zod";
import { askLocalModel } from "../llm/ollama.js";

const router = Router();
const chatSchema = z.object({ question: z.string().trim().min(1).max(5000) });

router.post("/", async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide a question between 1 and 5000 characters." });
    return;
  }

  try {
    const answer = await askLocalModel(parsed.data.question);
    res.json({ answer, model: process.env.OLLAMA_MODEL ?? "qwen3:4b", source: "local" });
  } catch (error) {
    console.error("Local model request failed:", error);
    res.status(502).json({ error: "Could not reach the local model. Check that Ollama is running and the configured model is installed." });
  }
});

export default router;
