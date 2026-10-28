(() => {
  const LOG = "[Jarvis Search][content]";
  console.log(LOG, "Content script loaded", { url: location.href, readyState: document.readyState });

  const bodyText = document.body?.innerText || "";
  const challenge = /unusual traffic|automated queries|verify you are human|captcha|before you continue to google|consent.google.com/i.test(bodyText)
    || /\/sorry\//i.test(location.pathname);

  console.log(LOG, "Page inspection", {
    url: location.href,
    title: document.title,
    bodyTextLength: bodyText.length,
    challenge,
    hasH3: Boolean(document.querySelector("a h3"))
  });

  const results = [];
  const seen = new Set();

  if (!challenge) {
    const anchors = document.querySelectorAll("a:has(h3)");
    console.log(LOG, "Candidate result anchors", { count: anchors.length });

    for (const anchor of anchors) {
      const heading = anchor.querySelector("h3");
      if (!heading) continue;

      let url;
      try {
        url = new URL(anchor.href);
      } catch (error) {
        console.warn(LOG, "Skipping invalid result URL", { href: anchor.href, error: String(error) });
        continue;
      }

      if (url.protocol !== "https:" || /(^|\.)google\.[a-z.]+$/i.test(url.hostname)) continue;
      if (seen.has(url.href)) continue;

      const container = anchor.closest("div.MjjYud") || anchor.parentElement?.parentElement || anchor.parentElement;
      const title = heading.textContent?.replace(/\s+/g, " ").trim() || "";
      const snippet = (container?.innerText || "").replace(/\s+/g, " ").trim();
      if (!title) continue;

      seen.add(url.href);
      results.push({ title, url: url.href, snippet: snippet.startsWith(title) ? snippet.slice(title.length).trim() : snippet });
      if (results.length >= 8) break;
    }
  } else {
    console.warn(LOG, "Detected Google consent/CAPTCHA page; not attempting to bypass it.");
  }

  console.log(LOG, "Extraction complete", {
    query: new URL(location.href).searchParams.get("q") || "",
    challenge,
    resultCount: results.length,
    sampleTitles: results.slice(0, 3).map((result) => result.title)
  });

  chrome.runtime.sendMessage({
    type: "JARVIS_GOOGLE_RESULTS",
    query: new URL(location.href).searchParams.get("q") || "",
    challenge,
    results
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error(LOG, "Failed to send extracted results to extension background", chrome.runtime.lastError.message);
      return;
    }
    console.log(LOG, "Background acknowledged results message", response || "(no response payload)");
  });
})();
