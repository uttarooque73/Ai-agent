import { googleSearch } from "./google-search.js";

async function main(): Promise<void> {
  const query = process.env.LIVE_SEARCH_QUERY?.trim() || "Node.js official website";

  console.log("LIVE WEB SEARCH SMOKE TEST");
  console.log(`Query: ${query}`);
  console.log("Connecting to a public search provider...");

  const response = await googleSearch(query);

  if (!response.results.length) {
    throw new Error("Search completed without any results.");
  }

  if (
    query === "Node.js official website" &&
    !response.results.some((result) => {
      try {
        return new URL(result.url).hostname === "nodejs.org";
      } catch {
        return false;
      }
    })
  ) {
    throw new Error("Search returned results, but not the expected official Node.js website.");
  }

  console.log(`Provider: ${response.provider ?? "unknown"}`);
  console.log(`Results returned: ${response.results.length}`);
  console.log(`Searched at: ${response.searchedAt}`);
  console.log("\nActual results:");

  response.results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.title}`);
    console.log(`   URL: ${result.url}`);
    if (result.snippet) console.log(`   Snippet: ${result.snippet}`);
  });

  console.log("\nPASS: live web search returned real result URLs.");
}

main().catch((error: unknown) => {
  console.error("\nFAIL: live web search did not return results.");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
