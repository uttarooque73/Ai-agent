import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { SearchResponse, SearchResult } from "./google-search.js";

const MAX_RESULTS = 5;
const MCP_TIMEOUT_MS = 20_000;

type JsonRecord = Record<string, unknown>;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\\s+/g, " ").trim() : "";
}

function toSafeResult(value: unknown): SearchResult | null {
  if (!value || typeof value !== "object") return null;
  const item = value as JsonRecord;
  const title = cleanText(item.title ?? item.name);
  const rawUrl = cleanText(item.url ?? item.link ?? item.href);
  const snippet = cleanText(item.snippet ?? item.description ?? item.content ?? item.summary);

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || !title || !url.hostname) return null;
    return { title, url: url.toString(), snippet };
  } catch {
    return null;
  }
}

function collectResults(value: unknown, results: SearchResult[], seen: Set<string>): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) collectResults(entry, results, seen);
    return;
  }

  const item = value as JsonRecord;
  const result = toSafeResult(item);
  if (result && !seen.has(result.url)) {
    seen.add(result.url);
    results.push(result);
  }

  for (const [key, child] of Object.entries(item)) {
    if (["results", "items", "organic_results", "web_results", "search_results", "data"].includes(key.toLowerCase())) {
      collectResults(child, results, seen);
    } else if (child && typeof child === "object") {
      collectResults(child, results, seen);
    }
  }
}

function parseMcpContent(response: unknown): SearchResult[] {
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  const payload = response as { structuredContent?: unknown; content?: Array<{ type?: string; text?: string }> };

  if (payload?.structuredContent) collectResults(payload.structuredContent, results, seen);

  for (const block of payload?.content ?? []) {
    if (block.type !== "text" || !block.text) continue;
    try {
      collectResults(JSON.parse(block.text), results, seen);
      if (results.length) continue;
    } catch {
      // Some MCP servers return human-readable Markdown instead of JSON.
    }

    const markdownLink = /(?:^|\n)\s*(?:[-*]\s*)?\[([^\]]+)\]\((https:\/\/[^)]+)\)([^\n]*)/g;
    for (const match of block.text.matchAll(markdownLink)) {
      const result = toSafeResult({
        title: match[1],
        url: match[2],
        snippet: match[3].replace(/^\s*[-:–—]\s*/, ""),
      });
      if (result && !seen.has(result.url)) {
        seen.add(result.url);
        results.push(result);
      }
    }

    // The reference DuckDuckGo MCP formats results as numbered titles followed by URL/Snippet lines.
    const lines = block.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (let index = 0; index < lines.length; index += 1) {
      const urlMatch = lines[index].match(/^URL:\s*(https:\/\/\S+)/i);
      if (!urlMatch) continue;
      const title = (lines[index - 1] ?? "").replace(/^\d+[.)]\s*/, "").replace(/^[-*]\s*/, "");
      const snippetLine = lines[index + 1] ?? "";
      const snippet = snippetLine.replace(/^(?:snippet|description):\s*/i, "");
      const result = toSafeResult({ title, url: urlMatch[1], snippet });
      if (result && !seen.has(result.url)) {
        seen.add(result.url);
        results.push(result);
      }
    }
  }

  return results.slice(0, MAX_RESULTS);
}

export async function duckDuckGoMcpSearch(query: string, endpoint: string): Promise<SearchResponse> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery || normalizedQuery.length > 500) {
    throw new Error("Search query must contain between 1 and 500 characters.");
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("DUCKDUCKGO_MCP_URL must be a valid HTTPS URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("DUCKDUCKGO_MCP_URL must use HTTPS.");
  }

  const transport = new StreamableHTTPClientTransport(url);
  const client = new Client({ name: "jarvis-web-research-agent", version: "0.1.0" });
  const timeout = setTimeout(() => {
    void transport.close().catch(() => undefined);
  }, MCP_TIMEOUT_MS);

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const searchTool = tools.find((tool) => /duckduck|web.?search|search/i.test(tool.name));
    if (!searchTool) {
      throw new Error(
        `The configured MCP server exposes no recognizable search tool. Available tools: ${tools.map((tool) => tool.name).join(", ") || "none"}.`,
      );
    }

    const schema = searchTool.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
    const properties = schema.properties ?? {};
    const queryField = ["query", "search_query", "searchQuery", "q", "search"].find((field) => field in properties);
    if (!queryField) {
      throw new Error(`MCP tool "${searchTool.name}" has no recognized query input field.`);
    }

    const args: Record<string, unknown> = { [queryField]: normalizedQuery };
    const resultLimitField = ["max_results", "num_results", "limit", "count"].find((field) => field in properties);
    if (resultLimitField) args[resultLimitField] = MAX_RESULTS;

    const response = await client.callTool({ name: searchTool.name, arguments: args });
    if (response.isError) {
      const contentBlocks = Array.isArray(response.content)
        ? (response.content as unknown as Array<{ text?: string }>)
        : [];
      const details = contentBlocks
        .map((block) => block.text ?? "")
        .filter(Boolean)
        .join("\\n");
      throw new Error(`DuckDuckGo MCP search failed: ${details || "the MCP tool returned an error"}`);
    }

    const results = parseMcpContent(response);
    if (!results.length) {
      throw new Error(
        `DuckDuckGo MCP tool "${searchTool.name}" returned no parseable HTTPS results. Check the MCP server's output format and tool schema.`,
      );
    }

    return { query: normalizedQuery, results, searchedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timeout);
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
  }
}
