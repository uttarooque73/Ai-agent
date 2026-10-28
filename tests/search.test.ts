import { afterEach, describe, expect, it, vi } from "vitest";
import { googleSearch } from "../src/tools/google-search.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("keyless web search", () => {
  it("extracts results from DuckDuckGo HTML without an API key", async () => {
    const html = `
      <div class="result">
        <a class="result__a" href="https://example.com/node">Node.js guide</a>
        <a class="result__snippet">A guide to Node.js features.</a>
      </div>
    `;
    const fetchMock = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await googleSearch("latest Node.js features");

    expect(result.query).toBe("latest Node.js features");
    expect(result.results[0]).toEqual({
      title: "Node.js guide",
      url: "https://example.com/node",
      snippet: "A guide to Node.js features.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("duckduckgo.com");
  });

  it("falls back to Bing RSS when DuckDuckGo is blocked", async () => {
    const rss = `<?xml version="1.0"?><rss><channel><item>
      <title>Node.js release notes</title>
      <link>https://nodejs.org/en/blog/release/</link>
      <description>Official release information.</description>
    </item></channel></rss>`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("blocked", { status: 403 }))
      .mockResolvedValueOnce(new Response(rss, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await googleSearch("latest Node.js features");

    expect(result.results[0]?.title).toBe("Node.js release notes");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects an empty query before making a network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(googleSearch("  ")).rejects.toThrow(
      "Search query must contain between 1 and 500 characters.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
