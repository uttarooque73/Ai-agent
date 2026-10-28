import { chromium, type Page } from "playwright";

export interface SearchResult { title: string; url: string; snippet: string; }
export interface SearchResponse { query: string; results: SearchResult[]; searchedAt: string; }

function isValidResultUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:"
      && !parsed.hostname.endsWith("google.com")
      && !parsed.hostname.endsWith("googleusercontent.com")
      && !parsed.hostname.endsWith("duckduckgo.com")
      && !parsed.hostname.endsWith("bing.com");
  } catch { return false; }
}

async function extractDuckDuckGoResults(page: Page): Promise<SearchResult[]> {
  return page.locator("a.result__a, a[data-testid='result-title-a']").evaluateAll((anchors) => anchors.flatMap((anchor) => {
    const title = anchor.textContent?.trim() ?? "";
    const rawUrl = (anchor as HTMLAnchorElement).href;
    let url = rawUrl;
    try {
      const parsed = new URL(rawUrl);
      const redirected = parsed.searchParams.get("uddg");
      if (redirected) url = redirected;
    } catch { /* URL validation below rejects invalid URLs. */ }
    const container = anchor.closest(".result, [data-testid='result']");
    const snippet = container?.querySelector(".result__snippet, [data-testid='result-snippet']")?.textContent?.trim() ?? "";
    if (!title || !url) return [];
    return [{ title, url, snippet }];
  }));
}

async function extractGoogleResults(page: Page): Promise<SearchResult[]> {
  return page.locator("a:has(h3)").evaluateAll((anchors) => anchors.flatMap((anchor) => {
    const heading = anchor.querySelector("h3");
    const title = heading?.textContent?.trim() ?? "";
    const url = (anchor as HTMLAnchorElement).href;
    const container = anchor.closest("div.MjjYud") ?? anchor.parentElement?.parentElement;
    const snippet = container?.querySelector("div.VwiC3b, [data-sncf]")?.textContent?.trim() ?? "";
    if (!title || !url) return [];
    return [{ title, url, snippet }];
  }));
}

async function extractBingResults(page: Page): Promise<SearchResult[]> {
  return page.locator("li.b_algo h2 a, main ol li h2 a, a:has(h2)").evaluateAll((anchors) => anchors.flatMap((anchor) => {
    const title = anchor.textContent?.trim() ?? "";
    const url = (anchor as HTMLAnchorElement).href;
    const container = anchor.closest("li.b_algo, li") ?? anchor.parentElement?.parentElement;
    const snippet = container?.querySelector(".b_caption p, p, .snippet")?.textContent?.trim() ?? "";
    if (!title || !url) return [];
    return [{ title, url, snippet }];
  }));
}

export async function googleSearch(query: string): Promise<SearchResponse> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery || normalizedQuery.length > 500) {
    throw new Error("Search query must contain between 1 and 500 characters.");
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "en-US",
    });
    const errors: string[] = [];
    const searchEngines = [
      {
        name: "DuckDuckGo",
        url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(normalizedQuery)}`,
        extract: extractDuckDuckGoResults,
      },
      {
        name: "Bing",
        url: `https://www.bing.com/search?q=${encodeURIComponent(normalizedQuery)}`,
        extract: extractBingResults,
      },
      {
        name: "Google",
        url: `https://www.google.com/search?q=${encodeURIComponent(normalizedQuery)}`,
        extract: extractGoogleResults,
      },
    ];

    for (const engine of searchEngines) {
      try {
        const response = await page.goto(engine.url, { waitUntil: "domcontentloaded", timeout: 20000 });
        const title = await page.title();
        if (/captcha|unusual traffic|access denied|verify you are human/i.test(title)) {
          errors.push(`${engine.name} blocked the automated request (page title: "${title}")`);
          continue;
        }
        const results = (await engine.extract(page))
          .filter((result) => isValidResultUrl(result.url))
          .slice(0, 5);
        if (results.length > 0) {
          return { query: normalizedQuery, results, searchedAt: new Date().toISOString() };
        }
        const status = response ? `HTTP ${response.status()}` : "no HTTP response";
        errors.push(`${engine.name} returned no extractable results (${status}; page title: "${title || "empty"}")`);
      } catch (error) {
        errors.push(`${engine.name}: ${error instanceof Error ? error.message : "request failed"}`);
      }
    }

    throw new Error(`No search results extracted from DuckDuckGo, Bing, or Google. ${errors.join("; ")}`);
  } finally {
    await browser.close();
  }
}
