(() => {
  const bodyText = document.body?.innerText || "";
  const challenge = /unusual traffic|automated queries|verify you are human|captcha|before you continue to google|consent.google.com/i.test(bodyText)
    || /\/sorry\//i.test(location.pathname);

  const results = [];
  const seen = new Set();

  if (!challenge) {
    for (const anchor of document.querySelectorAll("a:has(h3)")) {
      const heading = anchor.querySelector("h3");
      if (!heading) continue;

      let url;
      try {
        url = new URL(anchor.href);
      } catch {
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
  }

  chrome.runtime.sendMessage({
    type: "JARVIS_GOOGLE_RESULTS",
    query: new URL(location.href).searchParams.get("q") || "",
    challenge,
    results
  });
})();
