(() => {
  const LOG = "[Jarvis Search][content]";
  const MAX_WAIT_MS = 10000;
  const POLL_MS = 400;

  console.log(LOG, "Content script loaded", { url: location.href, readyState: document.readyState });

  function inspectChallenge() {
    const text = document.body?.innerText || "";
    return /unusual traffic|automated queries|verify you are human|captcha|before you continue to google|consent.google.com/i.test(text)
      || /\/sorry\//i.test(location.pathname)
      || /consent\.google\.com/i.test(location.hostname);
  }

  function extractResults() {
    const results = [];
    const seen = new Set();
    const headings = document.querySelectorAll("#search h3, h3");
    for (const heading of headings) {
      const anchor = heading.closest("a[href]");
      if (!anchor) continue;

      let url;
      try {
        url = new URL(anchor.href, location.href);
      } catch (error) {
        console.warn(LOG, "Skipping invalid result URL", { href: anchor.href, error: String(error) });
        continue;
      }

      if (!/^https?:$/.test(url.protocol)) continue;
      if (/(^|\.)google\.[a-z.]+$/i.test(url.hostname) || /(^|\.)googleusercontent\.com$/i.test(url.hostname)) continue;
      if (url.pathname.startsWith("/search") || url.pathname.startsWith("/url")) continue;
      if (seen.has(url.href)) continue;

      const container = anchor.closest("div.MjjYud")
        || anchor.closest("div.g")
        || anchor.closest("[data-sokoban-container]")
        || anchor.parentElement?.parentElement
        || anchor.parentElement;
      const title = heading.textContent?.replace(/\s+/g, " ").trim() || "";
      if (!title) continue;
      const rawSnippet = (container?.innerText || "").replace(/\s+/g, " ").trim();
      const snippet = rawSnippet.startsWith(title) ? rawSnippet.slice(title.length).trim() : rawSnippet;

      seen.add(url.href);
      results.push({ title, url: url.href, snippet });
      if (results.length >= 8) break;
    }
    return results;
  }

  async function waitForResults() {
    const started = Date.now();
    let results = [];
    while (Date.now() - started < MAX_WAIT_MS) {
      if (inspectChallenge()) {
        return { challenge: true, results: [] };
      }
      results = extractResults();
      if (results.length) return { challenge: false, results };
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    return { challenge: inspectChallenge(), results: extractResults() };
  }

  void (async () => {
    const query = new URL(location.href).searchParams.get("q") || "";
    const inspection = await waitForResults();
    console.log(LOG, "Page inspection and extraction complete", {
      url: location.href,
      title: document.title,
      bodyTextLength: document.body?.innerText?.length || 0,
      challenge: inspection.challenge,
      resultCount: inspection.results.length,
      sampleTitles: inspection.results.slice(0, 3).map((result) => result.title),
      waitedMs: MAX_WAIT_MS
    });

    if (inspection.challenge) {
      console.warn(LOG, "Detected Google consent/CAPTCHA page; not attempting to bypass it.");
    } else if (!inspection.results.length) {
      console.warn(LOG, "No result headings with external links found after waiting for the page to render.");
    }

    chrome.runtime.sendMessage({
      type: "JARVIS_GOOGLE_RESULTS",
      query,
      challenge: inspection.challenge,
      results: inspection.results
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(LOG, "Failed to send extracted results to extension background", chrome.runtime.lastError.message);
        return;
      }
      console.log(LOG, "Background acknowledged results message", response || "(no response payload)");
    });
  })();
})();
