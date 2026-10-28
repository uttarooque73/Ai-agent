import { ChatOllama } from "@langchain/ollama";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const model = new ChatOllama({
  baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
  model: process.env.OLLAMA_MODEL ?? "qwen3:4b",
  temperature: 0.2,
});

export async function askLocalModel(question: string, webContext?: string): Promise<string> {
  const systemPrompt = webContext
    ? "You are Jarvis, a precise and helpful AI research assistant. Answer the user's question using the supplied web search results when relevant. Do not claim that a source says something unless its title/snippet supports it. Include source URLs in your answer. If the results are insufficient or conflicting, say so clearly."
    : "You are Jarvis, a precise and helpful AI assistant. If you do not know a current fact, say you need a web source rather than inventing one.";

  const userPrompt = webContext
    ? `Question: ${question}\n\nWeb search context:\n${webContext}`
    : question;

  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ]);

  if (typeof response.content === "string") return response.content;
  return response.content.map((part) => (typeof part === "string" ? part : "text" in part ? part.text : "")).join("");
}
