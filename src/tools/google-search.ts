export interface SearchResult { title: string; url: string; snippet: string; }
export interface SearchResponse { query: string; results: SearchResult[]; searchedAt: string; }

interface TavilySearchResponse {
  results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
  message?: string;
}

export async function googleSearch(query: string): Promise<SearchResponse> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery || normalizedQuery.length > 500) {
    throw new Error("Search query must contain between 1 and 500 characters.");
  }

  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Web search needs a search API key because Google, Bing, and DuckDuckGo are restricting automated browser requests. Create a free Tavily API key, add TAVILY_API_KEY=your_key to .env, then restart Jarvis. Get a key at https://app.tavily.com/"
    );
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: normalizedQuery,
      topic: "general",
      search_depth: "basic",
      max_results: 5,
      include_answer: false,
    }),
    signal: AbortSignal.timeout(20000),
  });

  const body = await response.json().catch(() => ({})) as TavilySearchResponse;
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Tavily rejected the API key. Check TAVILY_API_KEY in .env.");
    }
    if (response.status === 429) {
      throw new Error("Tavily API quota or rate limit reached. Check your Tavily account usage.");
    }
    throw new Error(`Tavily search failed with HTTP ${response.status}${body.message ? `: ${body.message}` : ""}.`);
  }

  const results = (body.results ?? [])
    .flatMap((item) => {
      const title = item.title?.trim() ?? "";
      const url = item.url?.trim() ?? "";
      const snippet = item.content?.trim() ?? "";
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:" || !title) return [];
      } catch { return []; }
      return [{ title, url, snippet }];
    })
    .slice(0, 5);

  if (results.length === 0) {
    throw new Error("Tavily returned no usable web results for this query.");
  }

  return { query: normalizedQuery, results, searchedAt: new Date().toISOString() };
}
