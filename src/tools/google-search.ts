import { chromium, type Page } from "playwright";

export interface SearchResult { title: string; url: string; snippet: string; }
export interface SearchResponse { query: string; results: SearchResult[]; searchedAt: string; }

function isValidResultUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" && !parsed.hostname.endsWith("google.com") && !parsed.hostname.endsWith("googleusercontent.com");
  } catch { return false; }
}

async function extractResults(page: Page): Promise<SearchResult[]> {
  return page.locator("div.MjjYud").evaluateAll((elements) => elements.flatMap((element) => {
    const anchor = element.querySelector("a");
    const heading = element.querySelector("h3");
    const snippet = element.querySelector("div.VwiC3b");
    const url = anchor?.href ?? "";
    const title = heading?.textContent?.trim() ?? "";
    const description = snippet?.textContent?.trim() ?? "";
    if (!title || !url) return [];
    return [{ title, url, snippet: description }];
  }));
}

export async function googleSearch(query: string): Promise<SearchResponse> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery || normalizedQuery.length > 500) throw new Error("Search query must contain between 1 and 500 characters.");

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(normalizedQuery)}`, { waitUntil: "domcontentloaded", timeout: 20000 });
    if (/captcha|unusual traffic/i.test(await page.title())) throw new Error("Google blocked the automated search request.");
    const results = (await extractResults(page)).filter((result) => isValidResultUrl(result.url)).slice(0, 5);
    if (results.length === 0) throw new Error("No search results extracted. Google may have changed its page structure or blocked the request.");
    return { query: normalizedQuery, results, searchedAt: new Date().toISOString() };
  } finally { await browser.close(); }
}
