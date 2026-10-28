# Jarvis — AI Web Research Agent

A step-by-step learning project for building a local-first AI agent with Node.js, TypeScript, Ollama, Playwright, and LangGraph.

## Goals

- Answer general questions using a local Ollama model.
- Search the web on demand with Playwright (no search API key required for this learning prototype).
- Read public webpages and return sourced summaries.
- Show the sources used so answers can be checked.
- Add LangGraph orchestration and MCP tools in later steps.

## Current status

This repository is being initialized. Start with the setup steps below; features will be added incrementally and tested as they are implemented.

## Prerequisites

- Node.js 20 or newer
- npm
- [Ollama](https://ollama.com/) installed and running
- A local model, for example `qwen3:4b`

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env
ollama pull qwen3:4b
npm run dev
```

Check `http://localhost:3000/health` after the server starts.

## Environment

Set `OLLAMA_BASE_URL` and `OLLAMA_MODEL` in `.env`. Keep secrets and local configuration out of Git.

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
