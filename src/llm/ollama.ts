import { ChatOllama } from "@langchain/ollama";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const model = new ChatOllama({
  baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
  model: process.env.OLLAMA_MODEL ?? "qwen3:4b",
  temperature: 0.2,
});

export async function askLocalModel(question: string): Promise<string> {
  const response = await model.invoke([
    new SystemMessage("You are Jarvis, a precise and helpful AI assistant. If you do not know a current fact, say you need a web source rather than inventing one."),
    new HumanMessage(question),
  ]);

  if (typeof response.content === "string") return response.content;
  return response.content.map((part) => (typeof part === "string" ? part : "text" in part ? part.text : "")).join("");
}
