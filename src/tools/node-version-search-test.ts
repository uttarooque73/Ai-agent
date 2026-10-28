import { googleSearch } from "./google-search.js";

interface NodeRelease {
  version: string;
  date: string;
  lts: string | false;
}

const OFFICIAL_RELEASE_INDEX = "https://nodejs.org/dist/index.json";
const REQUEST_TIMEOUT_MS = 20_000;
const VERSION_PATTERN = /\bv?(\d{1,2}\.\d+\.\d+)\b/g;

function normalizeVersion(version: string): string {
  return version.replace(/^v/, "");
}

function extractVersions(text: string): string[] {
  return [...text.matchAll(VERSION_PATTERN)].map((match) => normalizeVersion(match[1]));
}

function isOfficialNodeUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" &&
      (url.hostname === "nodejs.org" || url.hostname.endsWith(".nodejs.org"));
  } catch {
    return false;
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Ai-agent-live-search-test/1.0",
      Accept: "text/html,application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }

  return response.text();
}

async function getLatestLtsVersion(): Promise<string> {
  const body = await fetchText(OFFICIAL_RELEASE_INDEX);
  const releases = JSON.parse(body) as NodeRelease[];

  const latestLts = releases
    .filter((release) => Boolean(release.lts))
    .sort((left, right) => right.date.localeCompare(left.date))[0];

  if (!latestLts?.version) {
    throw new Error("Official Node.js release index did not contain an LTS release.");
  }

  return normalizeVersion(latestLts.version);
}

async function main(): Promise<void> {
  const query =
    process.env.NODE_VERSION_SEARCH_QUERY?.trim() ||
    "latest Node.js LTS version site:nodejs.org/en/download";

  console.log("NODE.JS LTS SEARCH ACCURACY TEST");
  console.log(`Query: ${query}`);

  const response = await googleSearch(query);
  if (response.results.length === 0) {
    throw new Error("Search completed without any results.");
  }

  const officialResults = response.results.filter((result) => isOfficialNodeUrl(result.url));
  if (officialResults.length === 0) {
    throw new Error("Search results did not include an official nodejs.org source.");
  }

  const expectedVersion = await getLatestLtsVersion();
  const searchText = response.results
    .map((result) => `${result.title} ${result.snippet}`)
    .join(" ");
  const searchVersions = extractVersions(searchText);

  console.log(`Provider: ${response.provider ?? "unknown"}`);
  console.log(`Results returned: ${response.results.length}`);
  console.log(`Official latest LTS from release index: v${expectedVersion}`);
  console.log("Search result titles/snippets:");

  response.results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.title}`);
    console.log(`   URL: ${result.url}`);
    if (result.snippet) console.log(`   Snippet: ${result.snippet}`);
  });

  let verifiedSourceUrl: string | undefined;
  let verifiedSourceText = "";

  // Search snippets can omit version numbers. Verify the official result pages
  // themselves, but never fetch a third-party URL as a trusted version source.
  for (const result of officialResults.slice(0, 3)) {
    try {
      const pageText = htmlToText(await fetchText(result.url));
      if (extractVersions(pageText).includes(expectedVersion)) {
        verifiedSourceUrl = result.url;
        verifiedSourceText = pageText;
        break;
      }
    } catch (error) {
      console.warn(
        `Could not inspect official result ${result.url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (!verifiedSourceUrl) {
    throw new Error(
      `Search returned official Node.js URLs, but none of the first three official pages exposed the current LTS version v${expectedVersion}.`,
    );
  }

  const sourceVersions = extractVersions(verifiedSourceText);
  const versionInSnippet = searchVersions.includes(expectedVersion);

  console.log(`Verified official source: ${verifiedSourceUrl}`);
  console.log(`Version present in search title/snippet: ${versionInSnippet ? "yes" : "no (official page verified it)" }`);
  console.log(`Versions mentioned in search title/snippet: ${[...new Set(searchVersions)].join(", ") || "none"}`);
  console.log(`Official page contains latest LTS v${expectedVersion}: yes`);
  console.log("\nPASS: search returned an official Node.js result whose live page agrees with the official release index.");
}

main().catch((error: unknown) => {
  console.error("\nFAIL: Node.js LTS search accuracy test failed.");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
