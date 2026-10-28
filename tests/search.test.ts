import { afterEach, describe, expect, it, vi } from "vitest";
import { chromium } from "playwright";
import { googleSearch } from "../src/tools/google-search.js";

vi.mock("playwright", () => ({
  chromium: { launch: vi.fn() },
}));

afterEach(() => {
  vi.clearAllMocks();
});

function mockBrowser({
  results = [],
  bodyText = "Google Search",
  url = "https://www.google.com/search?q=test",
}: {
  results?: Array<{ title: string; url: string; snippet: string }>;
  bodyText?: string;
  url?: string;
} = {}) {
  const bodyLocator = {
    innerText: vi.fn().mockResolvedValue(bodyText),
  };
  const resultLocator = {
    evaluateAll: vi.fn().mockResolvedValue(results),
  };
  const page = {
    setDefaultNavigationTimeout: vi.fn(),
    goto: vi.fn().mockResolvedValue(null),
    url: vi.fn().mockReturnValue(url),
    locator: vi.fn((selector: string) =>
      selector === "body" ? bodyLocator : resultLocator,
    ),
  };
  const context = {
    newPage: vi.fn().mockResolvedValue(page),
  };
  const browser = {
    newContext: vi.fn().mockResolvedValue(context),
    close: vi.fn().mockResolvedValue(undefined),
  };
  vi.mocked(chromium.launch).mockResolvedValue(browser as never);
  return { browser, page };
}

describe("Google web search", () => {
  it("extracts organic results from Google without an API key", async () => {
    const { browser, page } = mockBrowser({
      results: [
        {
          title: "Node.js release notes",
          url: "https://nodejs.org/en/blog/release/",
          snippet: "Node.js release notes and features",
        },
      ],
    });

    const result = await googleSearch("latest Node.js features");

    expect(result.query).toBe("latest Node.js features");
    expect(result.results[0]).toEqual({
      title: "Node.js release notes",
      url: "https://nodejs.org/en/blog/release/",
      snippet: "and features",
    });
    expect(page.goto).toHaveBeenCalledWith(
      expect.stringContaining("https://www.google.com/search?"),
      { waitUntil: "domcontentloaded" },
    );
    expect(browser.newContext).toHaveBeenCalledOnce();
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it("reports a clear error when Google returns an anti-automation page", async () => {
    const { browser } = mockBrowser({
      bodyText: "Our systems have detected unusual traffic from your computer network.",
      url: "https://www.google.com/sorry/index",
    });

    await expect(googleSearch("latest Node.js features")).rejects.toThrow(
      "Google returned an anti-automation or CAPTCHA page",
    );
    expect(browser.close).toHaveBeenCalledOnce();
  });

  it("rejects an empty query before launching a browser", async () => {
    await expect(googleSearch("  ")).rejects.toThrow(
      "Search query must contain between 1 and 500 characters.",
    );
    expect(chromium.launch).not.toHaveBeenCalled();
  });

  it("uses cached Chrome extension results before launching Playwright", async () => {
    const query = "jarvis extension cache integration test";
    const cachedResults = [
      {
        title: "Extension search result",
        url: "https://example.com/extension-search-result",
        snippet: "Result delivered by the Chrome extension",
      },
    ];
    const { saveExtensionSearchResults } = await import("../src/tools/extension-search-cache.js");
    saveExtensionSearchResults(query, cachedResults);

    const result = await googleSearch(query.toUpperCase());

    expect(result.results).toEqual(cachedResults);
    expect(result.query).toBe(query);
    expect(chromium.launch).not.toHaveBeenCalled();
  });
});
