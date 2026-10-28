const LOG = "[Jarvis Search][popup]";
const form = document.getElementById("search-form");
const input = document.getElementById("query");
const button = document.getElementById("search-button");
const statusNode = document.getElementById("status");
const resultsNode = document.getElementById("results");

console.log(LOG, "Popup script loaded");

function renderResults(results) {
  console.log(LOG, "Rendering results", { count: results.length });
  resultsNode.replaceChildren();
  for (const result of results) {
    const article = document.createElement("article");
    const link = document.createElement("a");
    link.href = result.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = result.title;
    const snippet = document.createElement("p");
    snippet.textContent = result.snippet || result.url;
    article.append(link, snippet);
    resultsNode.append(article);
  }
}

chrome.storage.local.get(["lastQuery"], (saved) => {
  if (chrome.runtime.lastError) console.error(LOG, "Could not read saved query", chrome.runtime.lastError.message);
  if (saved.lastQuery) input.value = saved.lastQuery;
  console.log(LOG, "Restored popup state", { hasLastQuery: Boolean(saved.lastQuery) });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) {
    console.warn(LOG, "Search submitted with an empty query");
    return;
  }

  console.log(LOG, "Search submitted", { query });
  button.disabled = true;
  button.textContent = "Searching…";
  resultsNode.replaceChildren();
  statusNode.textContent = "Searching Google in a temporary background tab…";

  try {
    console.log(LOG, "Sending JARVIS_SEARCH to background service worker");
    const response = await chrome.runtime.sendMessage({ type: "JARVIS_SEARCH", query });
    console.log(LOG, "Background response received", {
      ok: response?.ok,
      resultCount: response?.results?.length ?? 0,
      cachedInJarvis: response?.cachedInJarvis,
      error: response?.error || response?.cacheError
    });
    if (!response?.ok) throw new Error(response?.error || "Search failed.");
    renderResults(response.results || []);
    if (response.cachedInJarvis) {
      statusNode.textContent = "Found " + response.results.length + " results. Saved to Jarvis; the temporary Google tab was closed.";
    } else {
      statusNode.textContent = "Found " + response.results.length + " results, but Jarvis could not cache them" +
        (response.cacheError ? " (" + response.cacheError + ")" : "") +
        ". Check that the local API is running. The temporary Google tab was closed.";
    }
    chrome.storage.local.set({ lastQuery: query }, () => {
      if (chrome.runtime.lastError) console.error(LOG, "Could not save last query", chrome.runtime.lastError.message);
      else console.log(LOG, "Saved last query");
    });
  } catch (error) {
    console.error(LOG, "Search failed", error);
    statusNode.textContent = error instanceof Error ? error.message : "Search failed.";
  } finally {
    button.disabled = false;
    button.textContent = "Search";
    console.log(LOG, "Search handler finished");
  }
});
