# Jarvis — AI Web Research Agent

A step-by-step learning project for building a local-first AI agent with Node.js, TypeScript, Ollama, Playwright, and LangGraph.

## Goals

- Answer general questions using a local Ollama model.
- Search the web on demand with Playwright (no search API key required for this learning prototype).
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

Open http://localhost:3000/health after the server starts. Press Ctrl+C to stop the app.

> The script does not install Ollama itself. If it is missing, install it from the official download page and run `bash start.sh` again. The script never overwrites an existing `.env`.

## Environment

Set `OLLAMA_BASE_URL` and `OLLAMA_MODEL` in `.env`. Defaults are `http://127.0.0.1:11434` and `qwen3:4b`.

## API examples

Local chat:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"Explain how Node.js event loops work"}'
```

Web search:

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"latest Node.js release"}'
```

## Planned milestones

1. Express + TypeScript API scaffold.
2. Local Ollama chat endpoint.
3. Playwright-based Google search tool.
4. Public webpage extraction and source metadata.
5. Route questions between the local model and web tools.
6. LangGraph orchestration, tool policies, retries, and tracing.
7. Optional MCP tool integration and a simple chat UI.
8. Tests, security hardening, and documentation.

## Important limitations

Google may rate-limit or block automated browser traffic, and its page markup can change. This is a learning prototype, not a guaranteed search service. Any URL-fetching feature must validate destinations and defend against SSRF before being exposed to untrusted users.

## License

MIT. See [LICENSE](LICENSE).
