# InvoiceChaser

Turn invoice text into ready-to-send payment reminder emails (friendly → firm).

## What it does

- Paste invoice text (or a messy email thread) and get a clean summary + extracted fields.
- Generates 3 complete follow-up emails (friendly, neutral, firm) you can send today.
- Suggests a simple follow-up schedule (what to send, when).
- Flags common red flags (missing invoice number, due date, payment terms, etc.).

## Who it’s for

- Freelancers who need to chase payments without sounding awkward.
- Agencies managing multiple client invoices.
- Small business finance/admin teams.
- Founders doing everything themselves.

## How to use in ChatGPT

1) Deploy the MCP server (Vercel recommended, Render supported).
2) Copy your MCP Server URL in this exact format:

   `https://<your-mcp-domain>/api`

3) In ChatGPT → **Connectors / Tools** → add a new MCP server.
4) Paste the URL and finish connector setup.
5) In chat, paste your invoice text and ask for follow-ups.

## Example: input → output

**Input invoice text**

```text
Acme Design Studio

INVOICE #INV-1042
Date: 2025-11-15
Bill To: Northwind Ventures

Total Due: USD 2,450.00
Payment terms: Net 15
Due Date: 2025-11-30

Services:
- Website homepage refresh (design + copy)
- QA + handoff

Please pay via bank transfer.
```

**Output (high-level)**

- Summary bullets (what was found + what’s missing)
- Extracted fields (vendor, amount, invoice #, due date, days overdue, payment terms)
- 3 follow-up emails: friendly → neutral → firm
- A recommended next-step schedule + red flags

## Tools

### `invoicechaser_prepare`

Input:

```json
{
  "invoiceText": "string",
  "currency": "string (optional)",
  "tone": "friendly | neutral | firm (optional)",
  "today": "YYYY-MM-DD (optional)"
}
```

Returns JSON with:

- `summary`: 3 bullets
- `extracted`: `{ vendor, amount, currency, invoiceNumber, dueDate, daysOverdue, paymentTerms }`
- `followUpEmails`: `{ friendly, neutral, firm }` (each is a complete email)
- `nextSteps`: ordered list
- `redFlags`: list

## Privacy & Safety

- Deterministic processing (no randomness).
- No external API calls.
- No database/storage: the server does not persist invoice contents.
- You control what you paste into ChatGPT and what gets sent to your server.

## Production notes

- Render free tier may cold-start after inactivity, causing slower first responses.
- Recommended for reliability: use a paid instance / always-on service.

## Quick verification (curl)

Replace `<mcp-domain>` with your deployed MCP server domain.

### Health

```bash
curl -i https://<mcp-domain>/api/health
```

### Initialize (must include protocolVersion)

```bash
curl -i https://<mcp-domain>/api \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{"jsonrpc":"2.0","id":"init","method":"initialize","params":{}}'
```

### tools/list

```bash
curl -i https://<mcp-domain>/api \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}'
```

## Deploy

This repo is a monorepo:

- MCP server: `apps/mcp-server`
- Web demo: `apps/web`

### Vercel (recommended): TWO projects

Create two separate Vercel projects from the same repo.

**Project 1: InvoiceChaser MCP server**

- Root Directory: `apps/mcp-server`
- Framework Preset: Other
- Build Command: `npm run build`
- Output Directory: **leave blank** (IMPORTANT)

MCP URL to paste into ChatGPT:

- `https://<mcp-domain>/api`

**Project 2: InvoiceChaser web demo**

- Root Directory: `apps/web`
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

### Render (supported)

Render runs the Express entrypoint.

- Root Directory: repo root (or configure as needed)
- Build Command: `npm run build -w @invoicechaser/mcp-server`
- Start Command: `npm run start -w @invoicechaser/mcp-server`
- Must provide `PORT` (Render sets this automatically)

## Local development

```bash
npm install
npm run build

# Web demo
npm run dev
```

## Roadmap

- Escalation ladder tool (polite → firm → final notice)
- Template library per industry
- CSV batch mode (multiple invoices)
- Reminder scheduling (send nudges on a cadence)
- Team mode (shared templates + roles)

## Status

InvoiceChaser is currently under review for the ChatGPT Apps Directory.

Monetization options and commercial offerings may be introduced in a future release.

## Get updates / Contact

- X: @yourhandle
- Email: you@example.com

---

## Copy for App Store

**App Name**

InvoiceChaser

**App Description (short)**

Turn invoice text into ready-to-send payment reminder emails — from friendly to firm.

**App Description (long)**

InvoiceChaser helps you follow up on unpaid invoices with less stress and more professionalism. Paste invoice text and get a clear summary, extracted details, and three complete follow-up emails (friendly, neutral, firm), plus a suggested schedule and red flags. Built to be deterministic, private-by-default, and easy to deploy.

**3 example prompts**

1) “Here’s an invoice — generate a friendly reminder email and a 2-week follow-up schedule.”
2) “Extract the invoice number, due date, amount, and draft a firm follow-up.”
3) “Rewrite this follow-up message to be neutral and professional.”

**3 keywords**

- invoicing
- collections
- email templates

---

## Gumroad listing copy

**Title**

InvoiceChaser — Payment Reminder Emails (Friendly → Firm)

**Pitch**

Stop staring at overdue invoices. InvoiceChaser turns messy invoice text into clear next steps and ready-to-send emails so you can get paid faster without sounding awkward.

**What you get**

- A deployable MCP server (Vercel/Render)
- Deterministic tool: `invoicechaser_prepare`
- Web demo for quick testing
- Documentation + curl verification commands

**Who it’s for**

Freelancers, agencies, small businesses, founders, and anyone who needs professional payment follow-ups.

**Refund note**

[Add your refund policy here]

**Suggested pricing tiers (guidance)**

- $9/mo solo
- $19/mo agency
- $49/mo team
