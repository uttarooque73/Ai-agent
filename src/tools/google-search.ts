export interface SearchResult { title: string; url: string; snippet: string; }
export interface SearchResponse { query: string; results: SearchResult[]; searchedAt: string; }

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RESULTS = 5;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\\d+);/g, (_, number: string) => String.fromCodePoint(Number(number)))
    .replace(/&#x([\\da-f]+);/gi, (_, number: string) => String.fromCodePoint(parseInt(number, 16)));
}

function cleanText(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\\s+/g, " ")).trim();
}

function safeResult(title: string, rawUrl: string, snippet: string): SearchResult | null {
  const cleanedTitle = cleanText(title);
  const cleanedSnippet = cleanText(snippet);
  let url: URL;
  try {
    url = new URL(decodeHtml(rawUrl.trim()));
    if (url.protocol !== "https:") return null;
    if (/(^|\\.)duckduckgo\\.com$|(^|\\.)bing\\.com$|(^|\\.)mojeek\\.com$/i.test(url.hostname)) {
      return null;
    }
  } catch {
    return null;
  }
  if (!cleanedTitle || !url.hostname) return null;
  return { title: cleanedTitle, url: url.toString(), snippet: cleanedSnippet };
}

function parseDuckDuckGo(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const blocks = html.match(/<div[^>]*class=["'][^"']*result[^"']*["'][\\s\\S]*?<\\/div>\\s*<\\/div>/gi) ?? [html];
  for (const block of blocks) {
    const anchor = block.match(/<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>/i)
      ?? block.match(/<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*result__a[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>/i);
    if (!anchor) continue;
    let href = decodeHtml(anchor[1]);
    try {
      const parsed = new URL(href, "https://duckduckgo.com");
      const redirect = parsed.searchParams.get("uddg");
      if (redirect) href = redirect;
      else href = parsed.toString();
    } catch { continue; }
    const snippetMatch = block.match(/<a[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>/i)
      ?? block.match(/<div[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>/i);
    const result = safeResult(anchor[2], href, snippetMatch?.[1] ?? "");
    if (result) results.push(result);
    if (results.length >= MAX_RESULTS) break;
  }
  return uniqueResults(results);
}

function parseBingRss(xml: string): SearchResult[] {
  const results: SearchResult[] = [];
  for (const item of xml.match(/<item>[\\s\\S]*?<\\/item>/gi) ?? []) {
    const title = item.match(/<title>([\\s\\S]*?)<\\/title>/i)?.[1] ?? "";
    const url = item.match(/<link>([\\s\\S]*?)<\\/link>/i)?.[1] ?? "";
    const description = item.match(/<description>([\\s\\S]*?)<\\/description>/i)?.[1] ?? "";
    const result = safeResult(title, url, description);
    if (result) results.push(result);
    if (results.length >= MAX_RESULTS) break;
  }
  return uniqueResults(results);
}

function parseMojeek(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const blocks = html.match(/<li[^>]*class=["'][^"']*result[^"']*["'][\\s\\S]*?<\\/li>/gi) ?? [];
  for (const block of blocks) {
    const anchor = block.match(/<a[^>]*href=["'](https?:[^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>/i);
    if (!anchor) continue;
    const result = safeResult(anchor[2], anchor[1], block);
    if (result) results.push(result);
    if (results.length >= MAX_RESULTS) break;
  }
  return uniqueResults(results);
}

function uniqueResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = result.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_RESULTS);
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

export async function googleSearch(query: string): Promise<SearchResponse> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery || normalizedQuery.length > 500) {
    throw new Error("Search query must contain between 1 and 500 characters.");
  }

  const encodedQuery = encodeURIComponent(normalizedQuery);
  const providers: Array<{ name: string; url: string; parse: (text: string) => SearchResult[] }> = [
    {
      name: "DuckDuckGo",
      url: `https://html.duckduckgo.com/html/?q=${encodedQuery}`,
      parse: parseDuckDuckGo,
    },
    {
      name: "Bing RSS",
      url: `https://www.bing.com/search?format=rss&q=${encodedQuery}`,
      parse: parseBingRss,
    },
    {
      name: "Mojeek",
      url: `https://www.mojeek.com/search?q=${encodedQuery}`,
      parse: parseMojeek,
    },
  ];

  const failures: string[] = [];
  for (const provider of providers) {
    try {
      const page = await fetchText(provider.url);
      const results = provider.parse(page);
      if (results.length > 0) {
        return { query: normalizedQuery, results, searchedAt: new Date().toISOString() };
      }
      failures.push(`${provider.name}: no extractable results`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "request failed";
      failures.push(`${provider.name}: ${message}`);
    }
  }

  throw new Error(
    `Keyless web search could not retrieve results from any public search provider (${failures.join("; ")}). No API key is required, but public search engines may throttle or block automated requests. Try again later or use a different network.`,
  );
}
