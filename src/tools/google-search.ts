import { chromium } from "playwright";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  searchedAt: string;
}

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESULTS = 5;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function safeResult(title: string, rawUrl: string, snippet: string): SearchResult | null {
  const cleanedTitle = cleanText(title);
  let url: URL;

  try {
    url = new URL(rawUrl);
    if (url.protocol !== "https:") return null;
    if (/(^|\.)google\.[a-z.]+$/i.test(url.hostname)) return null;
  } catch {
    return null;
  }

  if (!cleanedTitle || !url.hostname) return null;

  return {
    title: cleanedTitle,
    url: url.toString(),
    snippet: cleanText(snippet).replace(cleanedTitle, "").trim(),
  };
}

export async function googleSearch(query: string): Promise<SearchResponse> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery || normalizedQuery.length > 500) {
    throw new Error("Search query must contain between 1 and 500 characters.");
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      locale: "en-US",
      userAgent: USER_AGENT,
      viewport: { width: 1365, height: 900 },
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(REQUEST_TIMEOUT_MS);

    // Google's basic HTML mode avoids depending on its JavaScript-heavy result UI.
    // It remains keyless, though Google can still block automated traffic.
    const searchUrl = new URL("https://www.google.com/search");
    searchUrl.searchParams.set("q", normalizedQuery);
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
      throw new Error(
        "Google returned an anti-automation or CAPTCHA page. Search is keyless, but Google is blocking automated requests from this network. Open the Google search URL in a regular browser to check whether Google requires verification.",
      );
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

    const seen = new Set<string>();
    const results: SearchResult[] = [];
    for (const raw of rawResults) {
      const result = safeResult(raw.title, raw.url, raw.snippet);
      if (!result || seen.has(result.url)) continue;
      seen.add(result.url);
      results.push(result);
      if (results.length >= MAX_RESULTS) break;
    }

    if (results.length === 0) {
      throw new Error(
        "Google Search returned no extractable organic results. It may have served a consent page, CAPTCHA, or changed its markup.",
      );
    }

    return {
      query: normalizedQuery,
      results,
      searchedAt: new Date().toISOString(),
    };
  } finally {
    await browser.close();
  }
}
