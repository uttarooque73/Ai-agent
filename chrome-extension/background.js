const pendingByTab = new Map();
const SEARCH_TIMEOUT_MS = 30000;

function finish(tabId, payload) {
  const pending = pendingByTab.get(tabId);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingByTab.delete(tabId);
  pending.respond(payload);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "JARVIS_SEARCH") {
    const query = typeof message.query === "string" ? message.query.trim() : "";
    if (!query || query.length > 500) {
      sendResponse({ ok: false, error: "Enter a search query of 1–500 characters." });
      return false;
    }

    const searchUrl = new URL("https://www.google.com/search");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("hl", "en");
    searchUrl.searchParams.set("gl", "in");

    chrome.tabs.create({ url: searchUrl.toString(), active: false }, (tab) => {
      if (chrome.runtime.lastError || !tab?.id) {
        sendResponse({ ok: false, error: chrome.runtime.lastError?.message || "Could not open Google." });
        return;
      }

      const tabId = tab.id;
      const timer = setTimeout(() => {
        // Keep the tab open on timeout so the user can inspect a consent or CAPTCHA page.
        finish(tabId, {
          ok: false,
          error: "Google did not provide readable results in time. Check the opened tab for consent, sign-in, or CAPTCHA prompts."
        });
      }, SEARCH_TIMEOUT_MS);

      pendingByTab.set(tabId, { query, respond: sendResponse, timer });
    });
    return true;
  }

  if (message?.type === "JARVIS_GOOGLE_RESULTS" && sender.tab?.id) {
    const tabId = sender.tab.id;
    const pending = pendingByTab.get(tabId);
    if (!pending) return false;

    if (message.challenge) {
      finish(tabId, {
        ok: false,
        error: "Google is showing a consent or anti-automation challenge. Complete it in the opened Google tab, then start the search again."
      });
      return false;
    }

    const results = Array.isArray(message.results) ? message.results.slice(0, 8) : [];
    if (!results.length) {
      finish(tabId, {
        ok: false,
        error: "No organic results were found on the Google page. Google may have changed its page or shown a challenge."
      });
      return false;
    }

    const query = pending.query;
    const cacheRequest = fetch("http://127.0.0.1:3000/api/search/extension-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, results })
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error("Jarvis API returned HTTP " + response.status);
      }
      return response.json();
    });

    // Cache the results before responding. Close the temporary Google tab after
    // successful extraction so repeated searches do not leave duplicate tabs.
    void cacheRequest
      .then(() => {
        finish(tabId, { ok: true, query, results, cachedInJarvis: true });
        chrome.tabs.remove(tabId, () => void chrome.runtime.lastError);
      })
      .catch((error) => {
        finish(tabId, {
          ok: true,
          query,
          results,
          cachedInJarvis: false,
          cacheError: error instanceof Error ? error.message : "Could not cache results in Jarvis."
        });
        // Results were extracted, so close the temporary tab even if Jarvis is offline.
        chrome.tabs.remove(tabId, () => void chrome.runtime.lastError);
      });
    return false;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const pending = pendingByTab.get(tabId);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingByTab.delete(tabId);
  pending.respond({ ok: false, error: "The Google search tab was closed before results were extracted." });
});
