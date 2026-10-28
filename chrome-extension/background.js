const pendingByTab = new Map();
const SEARCH_TIMEOUT_MS = 30000;
const LOG = "[Jarvis Search][background]";

function finish(tabId, payload) {
  const pending = pendingByTab.get(tabId);
  if (!pending) {
    console.warn(LOG, "finish() called but no pending search exists", { tabId, payload });
    return;
  }
  clearTimeout(pending.timer);
  pendingByTab.delete(tabId);
  console.log(LOG, "Completing search", {
    tabId, query: pending.query, ok: payload?.ok,
    resultCount: payload?.results?.length ?? 0,
    cachedInJarvis: payload?.cachedInJarvis,
    error: payload?.error || payload?.cacheError
  });
  pending.respond(payload);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(LOG, "Received runtime message", {
    type: message?.type, senderTabId: sender.tab?.id
  });

  if (message?.type === "JARVIS_SEARCH") {
    const query = typeof message.query === "string" ? message.query.trim() : "";
    console.log(LOG, "Starting search", { queryLength: query.length, query });
    if (!query || query.length > 500) {
      console.warn(LOG, "Rejected invalid query");
      sendResponse({ ok: false, error: "Enter a search query of 1–500 characters." });
      return false;
    }

    const searchUrl = new URL("https://www.google.com/search");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("hl", "en");
    searchUrl.searchParams.set("gl", "in");
    console.log(LOG, "Opening temporary Google tab", searchUrl.toString());

    chrome.tabs.create({ url: searchUrl.toString(), active: false }, (tab) => {
      if (chrome.runtime.lastError || !tab?.id) {
        console.error(LOG, "Could not create Google tab", chrome.runtime.lastError?.message);
        sendResponse({ ok: false, error: chrome.runtime.lastError?.message || "Could not open Google." });
        return;
      }

      const tabId = tab.id;
      console.log(LOG, "Google tab created; waiting for content script", { tabId });
      const timer = setTimeout(() => {
        console.error(LOG, "Timed out waiting for content script results", { tabId, query });
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
    console.log(LOG, "Received results from content script", {
      tabId, hasPendingSearch: Boolean(pending), challenge: Boolean(message.challenge),
      resultCount: Array.isArray(message.results) ? message.results.length : 0
    });
    if (!pending) {
      console.warn(LOG, "Ignoring results because no search is pending for this tab", { tabId });
      sendResponse({ received: true, ignored: true });
      return false;
    }

    if (message.challenge) {
      console.warn(LOG, "Google consent/CAPTCHA challenge detected", { tabId, query: pending.query });
      finish(tabId, {
        ok: false,
        error: "Google is showing a consent or anti-automation challenge. Complete it in the opened Google tab, then start the search again."
      });
      sendResponse({ received: true, challenge: true });
      return false;
    }

    const results = Array.isArray(message.results) ? message.results.slice(0, 8) : [];
    if (!results.length) {
      console.warn(LOG, "Content script returned zero organic results", { tabId, query: pending.query });
      finish(tabId, {
        ok: false,
        error: "No organic results were found on the Google page. Google may have changed its page or shown a challenge."
      });
      sendResponse({ received: true, resultCount: 0 });
      return false;
    }

    const query = pending.query;
    console.log(LOG, "Posting extracted results to local Jarvis API", {
      query, resultCount: results.length, endpoint: "http://127.0.0.1:3000/api/search/extension-results"
    });
    const cacheRequest = fetch("http://127.0.0.1:3000/api/search/extension-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, results })
    }).then(async (response) => {
      console.log(LOG, "Jarvis cache endpoint responded", { status: response.status, ok: response.ok });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error("Jarvis API returned HTTP " + response.status + (body ? ": " + body : ""));
      }
      return response.json();
    });

    void cacheRequest
      .then((cacheResponse) => {
        console.log(LOG, "Results cached successfully", cacheResponse);
        finish(tabId, { ok: true, query, results, cachedInJarvis: true });
        chrome.tabs.remove(tabId, () => {
          if (chrome.runtime.lastError) console.warn(LOG, "Could not close temporary tab", chrome.runtime.lastError.message);
          else console.log(LOG, "Closed temporary Google tab", { tabId });
        });
      })
      .catch((error) => {
        console.error(LOG, "Failed to cache results in Jarvis", error);
        finish(tabId, {
          ok: true, query, results, cachedInJarvis: false,
          cacheError: error instanceof Error ? error.message : "Could not cache results in Jarvis."
        });
        chrome.tabs.remove(tabId, () => {
          if (chrome.runtime.lastError) console.warn(LOG, "Could not close temporary tab", chrome.runtime.lastError.message);
        });
      });
    // Acknowledge the content-script message immediately. The separate popup
    // response is completed by finish() after the cache request resolves.
    sendResponse({ received: true, resultCount: results.length });
    return false;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const pending = pendingByTab.get(tabId);
  console.log(LOG, "Tab removed", { tabId, hadPendingSearch: Boolean(pending) });
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingByTab.delete(tabId);
  pending.respond({ ok: false, error: "The Google search tab was closed before results were extracted." });
});
