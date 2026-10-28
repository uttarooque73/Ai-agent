import { Router } from "express";
import { z } from "zod";
import { googleSearch } from "../tools/google-search.js";

const router = Router();
const searchSchema = z.object({ query: z.string().trim().min(1).max(500) });

router.post("/", async (req, res) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Provide a search query between 1 and 500 characters." }); return; }
  try { res.json(await googleSearch(parsed.data.query)); }
  catch (error) {
    console.error("Web search failed:", error);
    res.status(502).json({ error: error instanceof Error ? error.message : "Unable to search the web." });
  }
});

export default router;
