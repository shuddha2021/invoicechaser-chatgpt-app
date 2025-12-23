import express from 'express';
import { createServer } from 'node:http';

// Reuse the existing Vercel function handlers verbatim to guarantee
// identical MCP logic, Accept header rules, and session behavior.
import mcpApiHandler from '../api/index.js';
import healthHandler from '../api/health.js';

const app = express();

// IMPORTANT: Do not add body-parsing middleware. The MCP handler reads the
// raw request stream itself.

// OpenAI domain verification (exact path + exact token, no newline)
app.get('/.well-known/openai-apps-challenge', (_req, res) => {
  res.status(200);
  res.setHeader('Content-Type', 'text/plain');
  res.send('fHczvLieSmC7hbrDAUCo3zlhoLattESKaGAK2qWtoeU');
});

app.all('/api', (req, res) => {
  // Express req/res are compatible with Node IncomingMessage/ServerResponse
  // types used by the existing handler.
  void (mcpApiHandler as unknown as (req: any, res: any) => Promise<void> | void)(
    req,
    res
  );
});

app.all('/api/health', (req, res) => {
  void (healthHandler as unknown as (req: any, res: any) => Promise<void> | void)(
    req,
    res
  );
});

// Basic 404 for everything else.
app.all('*', (_req, res) => {
  res.status(404).json({ ok: false, error: 'Not Found' });
});

const portRaw = process.env.PORT;
const port = portRaw ? Number(portRaw) : 3000;

createServer(app).listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`InvoiceChaser MCP server listening on :${port}`);
});
