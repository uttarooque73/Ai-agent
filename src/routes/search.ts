import { Router } from "express";
import { z } from "zod";
import { saveExtensionSearchResults } from "../tools/extension-search-cache.js";
import { googleSearch } from "../tools/google-search.js";

const router = Router();
const searchSchema = z.object({ query: z.string().trim().min(1).max(500) });
const extensionResultsSchema = z.object({
  query: z.string().trim().min(1).max(500),
  results: z.array(z.object({
    title: z.string().trim().min(1).max(500),
    url: z.string().url().max(2048).refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && !/(^|\.)google\.[a-z.]+$/i.test(url.hostname);
      } catch {
        return false;
      }
    }, "Only public HTTPS result URLs are accepted."),
    snippet: z.string().max(5000).default(""),
  })).min(1).max(8),
});

router.post("/extension-results", (req, res) => {
  console.log("[Jarvis Search][api] Extension cache request received", {
    query: req.body?.query,
    resultCount: Array.isArray(req.body?.results) ? req.body.results.length : 0,
  });
  const parsed = extensionResultsSchema.safeParse(req.body);
  if (!parsed.success) {
    console.warn("[Jarvis Search][api] Rejected extension cache payload", parsed.error.flatten());
    res.status(400).json({ error: "Provide a valid query and 1–8 public HTTPS search results." });
    return;
  }

  const response = saveExtensionSearchResults(parsed.data.query, parsed.data.results);
  console.log("[Jarvis Search][api] Extension results cached", {
    query: response.query,
    cachedResults: response.results.length,
  });
  res.status(201).json({ ok: true, query: response.query, cachedResults: response.results.length });
});

router.post("/", async (req, res) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) {
    console.warn("[Jarvis Search][api] Rejected invalid search request", parsed.error.flatten());
    res.status(400).json({ error: "Provide a search query between 1 and 500 characters." });
    return;
  }

  console.log("[Jarvis Search][api] Search request received", { query: parsed.data.query });
  try {
    const response = await googleSearch(parsed.data.query);
    console.log("[Jarvis Search][api] Search completed", {
      query: response.query,
      resultCount: response.results.length,
      source: "extension-cache-or-playwright",
    });
    res.json(response);
  } catch (error) {
    console.error("[Jarvis Search][api] Web search failed", error);
    res.status(502).json({ error: error instanceof Error ? error.message : "Unable to search the web." });
  }
});

export default router;
