const form = document.getElementById("search-form");
const input = document.getElementById("query");
const button = document.getElementById("search-button");
const statusNode = document.getElementById("status");
const resultsNode = document.getElementById("results");

function renderResults(results) {
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
  if (saved.lastQuery) input.value = saved.lastQuery;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) return;

  button.disabled = true;
  button.textContent = "Searching…";
  resultsNode.replaceChildren();
  statusNode.textContent = "Searching Google in a temporary background tab…";

  try {
    const response = await chrome.runtime.sendMessage({ type: "JARVIS_SEARCH", query });
    if (!response?.ok) throw new Error(response?.error || "Search failed.");
    renderResults(response.results || []);
    if (response.cachedInJarvis) {
      statusNode.textContent = "Found " + response.results.length + " results. Saved to Jarvis; the temporary Google tab was closed.";
    } else {
      statusNode.textContent = "Found " + response.results.length + " results, but Jarvis could not cache them" +
        (response.cacheError ? " (" + response.cacheError + ")" : "") +
        ". Check that the local API is running. The temporary Google tab was closed.";
    }
    chrome.storage.local.set({ lastQuery: query });
  } catch (error) {
    statusNode.textContent = error instanceof Error ? error.message : "Search failed.";
  } finally {
    button.disabled = false;
    button.textContent = "Search";
  }
});
