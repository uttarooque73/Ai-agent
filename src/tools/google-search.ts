import { chromium } from "playwright";
import { getExtensionSearchResults } from "./extension-search-cache.js";
import { duckDuckGoMcpSearch } from "./duckduckgo-mcp.js";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  searchedAt: string;
  provider?: string;
}

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESULTS = 5;
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function cleanText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function safeResult(title: string, rawUrl: string, snippet: string): SearchResult | null {
  let url: URL;

  try {
    url = new URL(rawUrl);
    if (url.protocol !== "https:") return null;
    if (/(^|\.)google\.[a-z.]+$/i.test(url.hostname)) return null;
    if (/(^|\.)duckduckgo\.com$/i.test(url.hostname)) {
      const destination = url.searchParams.get("uddg");
      if (!destination) return null;
      url = new URL(destination);
      if (url.protocol !== "https:") return null;
    }
  } catch {
    return null;
  }

  const cleanedTitle = cleanText(title);
  if (!cleanedTitle || !url.hostname) return null;

  return {
    title: cleanedTitle,
    url: url.toString(),
    snippet: cleanText(snippet).replace(cleanedTitle, "").trim(),
  };
}

async function searchDuckDuckGoHtml(query: string): Promise<SearchResult[]> {
  const searchUrl = new URL("https://html.duckduckgo.com/html/");
  searchUrl.searchParams.set("q", query);

  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo returned HTTP ${response.status}`);
  }

  const html = await response.text();
  if (/anomaly-modal|bots use duckduckgo|captcha/i.test(html)) {
    throw new Error("DuckDuckGo returned an anti-automation page.");
  }

  // Parse each result container and its title link/snippet without an additional dependency.
  const blocks = html.match(/<div\b[^>]*class=["'][^"']*\bresult\b[^"']*["'][^>]*>[\s\S]*?(?=<div\b[^>]*class=["'][^"']*\bresult\b|$)/gi) ?? [];
  const results: SearchResult[] = [];

  for (const block of blocks) {
    const anchor = block.match(/<a\b(?=[^>]*\bclass=["'][^"']*\bresult__a\b[^"']*["'])[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;

    const snippetMatch = block.match(/<[^>]*class=["'][^"']*\bresult__snippet\b[^"']*["'][^>]*>([\s\S]*?)<\//i);
    const href = anchor[1].replace(/&amp;/g, "&");
    const result = safeResult(anchor[2], href, snippetMatch?.[1] ?? "");

    if (result && !results.some((item) => item.url === result.url)) {
      results.push(result);
    }
    if (results.length >= MAX_RESULTS) break;
  }

  if (results.length === 0) {
    throw new Error("DuckDuckGo returned no extractable search results.");
  }

  return results;
}

async function searchGoogle(query: string): Promise<SearchResult[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      locale: "en-US",
      userAgent: USER_AGENT,
      viewport: { width: 1365, height: 900 },
      extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(REQUEST_TIMEOUT_MS);

    const searchUrl = new URL("https://www.google.com/search");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("hl", "en");
    searchUrl.searchParams.set("gl", "in");
    searchUrl.searchParams.set("gbv", "1");

    await page.goto(searchUrl.toString(), { waitUntil: "domcontentloaded" });
    const bodyText = await page.locator("body").innerText({ timeout: 8_000 }).catch(() => "");
    const finalUrl = page.url();

    if (
      /\/sorry\//i.test(finalUrl) ||
      /unusual traffic|automated queries|verify you are human|captcha|our systems have detected unusual traffic/i.test(bodyText)
    ) {
      throw new Error("Google returned an anti-automation or CAPTCHA page.");
    }

    const rawResults = await page.locator("a:has(h3)").evaluateAll((anchors) =>
      anchors.map((anchor) => {
        const heading = anchor.querySelector("h3");
        const container =
          anchor.closest("div.MjjYud") ??
          anchor.parentElement?.parentElement ??
          anchor.parentElement;
        return {
          title: heading?.textContent ?? "",
          url: (anchor as HTMLAnchorElement).href,
          snippet: container?.textContent ?? "",
        };
      }),
    );

    const results: SearchResult[] = [];
    for (const raw of rawResults) {
      const result = safeResult(raw.title, raw.url, raw.snippet);
      if (!result || results.some((item) => item.url === result.url)) continue;
      results.push(result);
      if (results.length >= MAX_RESULTS) break;
    }

    if (results.length === 0) {
      throw new Error("Google returned no extractable organic results.");
    }
    return results;
  } finally {
    await browser.close();
  }
}

export async function googleSearch(query: string): Promise<SearchResponse> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery || normalizedQuery.length > 500) {
    throw new Error("Search query must contain between 1 and 500 characters.");
  }

  const duckDuckGoMcpUrl = process.env.DUCKDUCKGO_MCP_URL?.trim();
  if (duckDuckGoMcpUrl) {
    const response = await duckDuckGoMcpSearch(normalizedQuery, duckDuckGoMcpUrl);
    return { ...response, provider: "duckduckgo-mcp" };
  }

  const extensionResults = getExtensionSearchResults(normalizedQuery);
  if (extensionResults) return { ...extensionResults, provider: "browser-extension-cache" };

  const failures: string[] = [];

  try {
    const results = await searchDuckDuckGoHtml(normalizedQuery);
    return {
      query: normalizedQuery,
      results,
      searchedAt: new Date().toISOString(),
      provider: "duckduckgo-html",
    };
  } catch (error) {
    failures.push(`DuckDuckGo HTML: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const results = await searchGoogle(normalizedQuery);
    return {
      query: normalizedQuery,
      results,
      searchedAt: new Date().toISOString(),
      provider: "google-playwright",
    };
  } catch (error) {
    failures.push(`Google Playwright: ${error instanceof Error ? error.message : String(error)}`);
  }

  throw new Error(`All web search providers failed. ${failures.join(" | ")}`);
}
