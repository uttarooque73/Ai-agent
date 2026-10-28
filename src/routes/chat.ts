import { Router } from "express";
import { z } from "zod";
import { askLocalModel } from "../llm/ollama.js";
import { googleSearch } from "../tools/google-search.js";

const router = Router();
const chatSchema = z.object({
  question: z.string().trim().min(1).max(5000),
  // Set useWebSearch=true to ground the answer in current search results.
  // searchQuery should match the query used in the Jarvis Chrome extension.
  useWebSearch: z.boolean().optional().default(false),
  searchQuery: z.string().trim().min(1).max(500).optional(),
});

router.post("/", async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Provide a question between 1 and 5000 characters and, if supplied, a valid search query.",
      details: parsed.error.flatten(),
    });
    return;
  }

  const { question, useWebSearch, searchQuery } = parsed.data;
  let webContext: string | undefined;
  let webSearch: {
    requested: boolean;
    success: boolean;
    query?: string;
    resultCount: number;
    sources: Array<{ title: string; url: string; snippet: string }>;
    error?: string;
  } = { requested: useWebSearch, success: false, resultCount: 0, sources: [] };

  if (useWebSearch) {
    const query = searchQuery ?? question;
    console.log("[Jarvis Chat] Web search requested", { query });
    try {
      const search = await googleSearch(query);
      webSearch = {
        requested: true,
        success: search.results.length > 0,
        query: search.query,
        resultCount: search.results.length,
        sources: search.results,
      };
      webContext = [
        "The following are web search results. Use them as evidence, distinguish facts from inference, and cite sources in the answer using their URLs.",
        ...search.results.map((result, index) =>
          `[${index + 1}] ${result.title}\nURL: ${result.url}\nSnippet: ${result.snippet}`
        ),
      ].join("\n\n");
      console.log("[Jarvis Chat] Web search results ready", {
        query: search.query,
        resultCount: search.results.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Web search failed.";
      webSearch = {
        requested: true,
        success: false,
        query,
        resultCount: 0,
        sources: [],
        error: message,
      };
      console.error("[Jarvis Chat] Web search failed; continuing with local model only", {
        query,
        error: message,
      });
    }
  }

  try {
    const answer = await askLocalModel(question, webContext);
    res.json({
      answer,
      model: process.env.OLLAMA_MODEL ?? "qwen3:4b",
      source: webSearch.success ? "local-model+web-search" : "local",
      webSearch,
    });
  } catch (error) {
    console.error("[Jarvis Chat] Local model request failed:", error);
    res.status(502).json({
      error: "Could not reach the local model. Check that Ollama is running and the configured model is installed.",
      webSearch,
    });
  }
});

export default router;
