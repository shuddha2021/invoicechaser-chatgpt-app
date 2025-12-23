# InvoiceChaser

Monorepo with:

- `apps/mcp-server`: Vercel-deployable MCP server (Streamable HTTP + SSE) under `/api`
- `apps/web`: minimal Vite demo UI

## Quick start (local)

```bash
npm install

# TypeScript build/typecheck (both workspaces)
npm run build

# Run the web demo locally
npm run dev
```

> Tip: For local Vercel-function testing, you can install Vercel CLI and run `npm run dev -w @invoicechaser/mcp-server`.

## Deploy to Vercel (TWO projects)

You will create two separate Vercel projects from this same repo.

### Project 1: InvoiceChaser MCP server

- **Project Name**: `invoicechaser-mcp-server` (or similar)
- **Root Directory**: `apps/mcp-server`
- **Framework Preset**: Other
- **Build Command**: `npm run build`
- **Output Directory**: **leave blank** (do NOT set this)
- **Install Command**: default (`npm install`)

MCP URL to paste into ChatGPT must be:

- `https://<mcp-domain>/api`

> Common mistake: using the root URL (`https://<mcp-domain>`) instead of `.../api`.

### Project 2: InvoiceChaser Web demo

- **Project Name**: `invoicechaser-web` (or similar)
- **Root Directory**: `apps/web`
- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

## MCP server endpoints

### Health

- `GET /api/health` returns `{"ok":true}`

### MCP POST (Streamable HTTP)

- `POST /api` accepts JSON-RPC style MCP messages
- Important: **POST does NOT require** `Accept: text/event-stream` (it works with `application/json`, `*/*`, or no `Accept`)

### MCP GET (SSE attach)

- `GET /api` attaches an SSE stream
- Hard requirements:
  - must include `Accept: text/event-stream`
  - must include `MCP-Session-Id`
- Otherwise it returns `406` quickly (no hanging)

## Curl tests

Replace `<mcp-domain>` with your deployed MCP server domain.

### (1) Health

```bash
curl -i https://<mcp-domain>/api/health
```

### (2) POST /api tools/list with Accept: application/json

```bash
curl -i https://<mcp-domain>/api \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}'
```

### (2b) POST /api initialize includes protocolVersion

```bash
curl -i https://<mcp-domain>/api \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{"jsonrpc":"2.0","id":"init","method":"initialize","params":{}}'
```

### (3) GET /api without SSE accept returns 406 quickly

```bash
curl -i https://<mcp-domain>/api
```

## Common pitfalls (production)

- **Vercel Output Directory error**: For the MCP server project, the **Output Directory must be blank**.
- **Wrong MCP URL**: The MCP server base URL is `https://<mcp-domain>/api` (NOT the root domain).
- **406 Not Acceptable**: Only `GET /api` is strict about `Accept: text/event-stream` (by design). `POST /api` is not.
- **SSE hanging/timeouts**: `GET /api` returns `406` immediately if `MCP-Session-Id` is missing. When valid, it sets `Cache-Control: no-cache, no-transform` and sends an initial event quickly plus heartbeats.

## GitHub repo + push instructions

From repo root:

```bash
git init
git add -A
git commit -m "Initial InvoiceChaser scaffold"

# Create a new GitHub repo, then:
git branch -M main
git remote add origin https://github.com/<you>/invoicechaser.git
git push -u origin main
```

## Exact Vercel projects to create

1) **InvoiceChaser MCP server project**
   - Root Directory: `apps/mcp-server`
   - Build Command: `npm run build`
   - Output Directory: **blank**

2) **InvoiceChaser web project**
   - Root Directory: `apps/web`
   - Build Command: `npm run build`
   - Output Directory: `dist`

## Exact MCP URL to paste into ChatGPT

- `https://<mcp-domain>/api`
