# Jarvis — AI Web Research Agent

A step-by-step learning project for building a local-first AI agent with Node.js, TypeScript, Ollama, Playwright, and LangGraph.

## Goals

- Answer general questions using a local Ollama model.
- Search Google using a headless Playwright browser without a search API key.
- Read public webpages and return sourced summaries.
- Show the sources used so answers can be checked.
- Add LangGraph orchestration and MCP tools in later steps.

## Prerequisites

- Node.js 20 or newer
- Ollama installed: https://ollama.com/download
- Internet access for installing dependencies, browser binaries, and pulling a model when needed

## Quick start (macOS/Linux)

```bash
git clone https://github.com/uttarooque73/Ai-agent.git
cd Ai-agent
bash start.sh
```

The startup script checks Node.js/npm and Ollama, creates `.env` if it is missing, attempts to start the Ollama server if needed, checks the configured model, offers to download it if missing, installs npm dependencies if needed, checks Playwright Chromium, and starts the development server.

Open http://localhost:3000/health after the server starts. Press Ctrl+C to stop it.

> The script does not install Ollama itself. If it is missing, install it from the official download page and run `bash start.sh` again. The script never overwrites an existing `.env`.

## Environment

Set `OLLAMA_BASE_URL` and `OLLAMA_MODEL` in `.env`. Defaults are `http://127.0.0.1:11434` and `qwen3:4b`. **Web search does not require an API key.**

## API examples

Local chat (model only):

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"Explain how Node.js event loops work"}'
```

Chat grounded in web results (no search API key required):

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"Summarize the current Node.js release","useWebSearch":true,"searchQuery":"current Node.js release"}'
```

When `useWebSearch` is true, Jarvis searches using `searchQuery` (or the question if omitted), passes the result titles, snippets, and URLs to Ollama, and returns a `webSearch` status object with the source URLs. If web search is blocked or unavailable, Jarvis continues with the local model and reports the web-search failure in `webSearch.error` instead of pretending the answer was verified.

Google web search:

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"latest Node.js release"}'
```

## Chrome extension (keyless search)

A Manifest V3 extension is available in `chrome-extension/`. It uses a regular Chrome tab rather than a separate headless browser session. Google may still show a CAPTCHA or consent page; the extension does not bypass those prompts.

1. Start Jarvis with `bash start.sh` so the local API is running at `http://127.0.0.1:3000`.
2. In Chrome, open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the repository's `chrome-extension` folder.
5. Pin **Jarvis Keyless Search** from the Extensions menu.
6. Open the extension, enter a query, and select **Search**. Google opens in a background tab and the popup displays extracted organic results when available.
7. If the extension reports a challenge, open the Google tab, complete any legitimate consent or verification prompt yourself, then retry the search.

When the local API is running, the extension sends results to `POST /api/search/extension-results`. Jarvis keeps those results in memory for ten minutes. A matching request to `POST /api/search` can use the cached results instead of starting headless Google search. The cache is not persisted across server restarts.

If the local API is stopped, the extension can still display results in its popup, but it cannot share them with Jarvis.

## Planned milestones

1. Express + TypeScript API scaffold.
2. Local Ollama chat endpoint.
3. Keyless Google search using Playwright.
4. Public webpage extraction and source metadata.
5. Route questions between the local model and web tools.
6. LangGraph orchestration, tool policies, retries, and tracing.
7. Optional MCP tool integration and a simple chat UI.
8. Tests, security hardening, and documentation.

## Important limitations

Google search runs in a headless Chromium browser through Playwright; it does not require a search API key or paid search account. Google may show a CAPTCHA, consent page, JavaScript challenge, or block automated traffic, and may change its page markup. In those cases, the search tool returns a clear error instead of inventing results. The project should be used in compliance with Google's terms and applicable network policies. Any URL-fetching feature must validate destinations and defend against SSRF before being exposed to untrusted users.

## License

MIT. See [LICENSE](LICENSE).
