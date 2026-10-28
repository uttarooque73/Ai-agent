import "dotenv/config";
import cors from "cors";
import express from "express";
import chatRouter from "./routes/chat.js";
import searchRouter from "./routes/search.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "jarvis-web-research-agent" });
});

app.use("/api/chat", chatRouter);
app.use("/api/search", searchRouter);

app.listen(port, () => {
  console.log(`Jarvis API listening on http://localhost:${port}`);
});
