import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

/**
 * Minimal MCP server for Vercel Serverless Functions.
 * - POST /api handles MCP JSON-RPC methods
 * - GET /api attaches an SSE stream (requires Accept: text/event-stream + MCP-Session-Id)
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type JsonRpcRequest = {
  jsonrpc?: '2.0';
  id?: string | number | null;
  method?: string;
  params?: any;
};

type Session = {
  id: string;
  createdAtIso: string;
  lastSeenMs: number;
  sse?: {
    res: ServerResponse;
  };
};

const sessions = new Map<string, Session>();

function nowIso() {
  return new Date().toISOString();
}

function setCors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Accept, MCP-Session-Id, Last-Event-ID, MCP-Protocol-Version'
  );
}

function getHeader(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

function acceptsEventStream(req: IncomingMessage): boolean {
  const accept = getHeader(req, 'accept');
  if (!accept) return false;
  return accept.toLowerCase().includes('text/event-stream');
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return null;
  return JSON.parse(raw);
}

function sseWrite(res: ServerResponse, data: unknown, event?: string) {
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function attachSse(req: IncomingMessage, res: ServerResponse) {
  // Hard requirements:
  // - GET /api requires Accept: text/event-stream and MCP-Session-Id
  // - otherwise return 406 quickly (no hanging)

  if (!acceptsEventStream(req)) {
    sendJson(res, 406, {
      ok: false,
      error: 'GET /api requires Accept: text/event-stream'
    });
    return;
  }

  const sessionId = getHeader(req, 'mcp-session-id');
  if (!sessionId) {
    sendJson(res, 406, {
      ok: false,
      error: 'GET /api requires MCP-Session-Id'
    });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    sendJson(res, 406, {
      ok: false,
      error: 'Unknown MCP session'
    });
    return;
  }

  session.lastSeenMs = Date.now();

  // SSE headers to prevent hanging/timeouts and buffering.
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Send an initial event quickly so clients know it's live.
  sseWrite(res, { ok: true, sessionId, connectedAt: nowIso() }, 'mcp:connected');

  // Heartbeat to keep the connection alive on intermediaries.
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      // ignore
    }
  }, 15000);

  session.sse = { res };

  const cleanup = () => {
    clearInterval(heartbeat);
    const s = sessions.get(sessionId);
    if (s?.sse?.res === res) {
      s.sse = undefined;
      s.lastSeenMs = Date.now();
    }
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
  res.on('close', cleanup);
}

const invoicechaserPrepareArgsSchema = z.object({
  invoiceText: z.string().min(1),
  currency: z.string().min(1).optional(),
  tone: z.enum(['friendly', 'neutral', 'firm']).optional(),
  today: z.string().min(1).optional()
});

function parseMoney(text: string): { amount: string | null; currency: string | null } {
  const currencyMatch = text.match(/\b(USD|EUR|GBP|INR|AUD|CAD)\b/i);
  const currency = currencyMatch ? currencyMatch[1].toUpperCase() : null;

  // Common amount patterns: 1,234.56 or 1234.56 or 1234
  const amountMatch = text.match(/\b(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)\b/);
  const amount = amountMatch ? amountMatch[1].replace(/,/g, '') : null;

  return { amount, currency };
}

function parseInvoiceNumber(text: string): string | null {
  const m = text.match(/\b(?:invoice\s*(?:no\.|#|number)?|inv\s*(?:no\.|#)?)\s*[:#]?\s*([A-Za-z0-9-]+)\b/i);
  return m ? m[1] : null;
}

function parseDueDate(text: string): string | null {
  // Prefer ISO-like dates first.
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  // US format MM/DD/YYYY
  const us = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (us) {
    const mm = us[1].padStart(2, '0');
    const dd = us[2].padStart(2, '0');
    const yyyy = us[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}

function parseVendor(text: string): string | null {
  const firstLine = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0];
  if (!firstLine) return null;
  // Avoid returning obvious non-vendor labels.
  if (/^invoice\b/i.test(firstLine)) return null;
  return firstLine.slice(0, 120);
}

function parsePaymentTerms(text: string): string | null {
  const m = text.match(/\bnet\s*(\d{1,3})\b/i);
  if (m) return `Net ${m[1]}`;
  if (/\bdue\s+on\s+receipt\b/i.test(text)) return 'Due on receipt';
  return null;
}

function daysBetween(earlier: Date, later: Date) {
  const ms = later.getTime() - earlier.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function safeDateFromIso(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildEmails(opts: {
  vendor: string | null;
  invoiceNumber: string | null;
  amount: string | null;
  currency: string;
  dueDate: string | null;
  daysOverdue: number | null;
}) {
  const vendor = opts.vendor ?? 'there';
  const inv = opts.invoiceNumber ? `Invoice ${opts.invoiceNumber}` : 'the invoice';
  const amt = opts.amount ? `${opts.currency} ${opts.amount}` : `${opts.currency} [amount]`;
  const due = opts.dueDate ? `due on ${opts.dueDate}` : 'now due';
  const overdue =
    typeof opts.daysOverdue === 'number' && opts.daysOverdue > 0
      ? ` (${opts.daysOverdue} days overdue)`
      : '';

  const subject = `${inv} - Payment reminder`;

  const friendly = `Subject: ${subject}\n\nHi ${vendor},\n\nHope you’re doing well. Just a quick reminder that ${inv} for ${amt} was ${due}${overdue}.\n\nCould you confirm the payment status and the expected payment date? If you need anything from my side (PO, banking details, or a copy of the invoice), I’m happy to help.\n\nThanks so much,\n[Your Name]\n`;

  const neutral = `Subject: ${subject}\n\nHi ${vendor},\n\nFollowing up on ${inv} for ${amt}, which was ${due}${overdue}.\n\nPlease share an update on payment status and the planned payment date.\n\nBest regards,\n[Your Name]\n`;

  const firm = `Subject: ${inv} - Overdue payment\n\nHi ${vendor},\n\n${inv} for ${amt} is ${due}${overdue}.\n\nPlease arrange payment immediately or confirm the exact payment date today. If payment has already been sent, please reply with the remittance details.\n\nRegards,\n[Your Name]\n`;

  return { friendly, neutral, firm };
}

function toolInvoicechaserPrepare(args: z.infer<typeof invoicechaserPrepareArgsSchema>) {
  const invoiceText = args.invoiceText;
  const vendor = parseVendor(invoiceText);
  const invoiceNumber = parseInvoiceNumber(invoiceText);
  const dueDate = parseDueDate(invoiceText);
  const paymentTerms = parsePaymentTerms(invoiceText);
  const money = parseMoney(invoiceText);

  const currency = (args.currency ?? money.currency ?? 'USD').toUpperCase();
  const amount = money.amount;

  const today = args.today ? safeDateFromIso(args.today) : new Date();
  const due = dueDate ? safeDateFromIso(dueDate) : null;

  let daysOverdue: number | null = null;
  if (today && due) {
    const d = daysBetween(due, today);
    daysOverdue = d > 0 ? d : 0;
  }

  const summary: string[] = [
    `Prepared follow-up emails for ${invoiceNumber ? `invoice ${invoiceNumber}` : 'an invoice'}.`,
    `Detected amount: ${amount ? `${currency} ${amount}` : 'unknown'}.`,
    `Due date: ${dueDate ?? 'unknown'}${typeof daysOverdue === 'number' ? ` (days overdue: ${daysOverdue})` : ''}.`
  ];

  const nextSteps: string[] = [
    'Send the friendly email today if you have an ongoing relationship.',
    'If no response within 2 business days, send the neutral follow-up.',
    'If still unpaid after 5 business days, send the firm email and request a payment date.',
    'If overdue continues, consider pausing service and escalating per contract terms.'
  ];

  const redFlags: string[] = [];
  if (!invoiceNumber) redFlags.push('Invoice number not detected.');
  if (!amount) redFlags.push('Invoice amount not detected.');
  if (!dueDate) redFlags.push('Due date not detected.');
  if (!paymentTerms) redFlags.push('Payment terms not detected.');

  const followUpEmails = buildEmails({
    vendor,
    invoiceNumber,
    amount,
    currency,
    dueDate,
    daysOverdue
  });

  return {
    summary,
    extracted: {
      vendor,
      amount,
      currency,
      invoiceNumber,
      dueDate,
      daysOverdue,
      paymentTerms
    },
    followUpEmails,
    nextSteps,
    redFlags
  };
}

function mcpToolsListResult() {
  return {
    tools: [
      {
        name: 'invoicechaser_prepare',
        description:
          'Extracts key invoice fields and prepares friendly/neutral/firm follow-up emails (deterministic, no network calls).',
        inputSchema: {
          type: 'object',
          properties: {
            invoiceText: { type: 'string' },
            currency: { type: 'string' },
            tone: { type: 'string', enum: ['friendly', 'neutral', 'firm'] },
            today: { type: 'string', description: 'ISO date like 2025-12-23 (optional)' }
          },
          required: ['invoiceText']
        }
      }
    ]
  };
}

function jsonRpcResult(id: JsonRpcRequest['id'], result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function jsonRpcError(id: JsonRpcRequest['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function handleMcpRequest(body: JsonRpcRequest) {
  const id = body.id ?? null;
  const method = body.method;

  if (!method) return jsonRpcError(id, -32600, 'Invalid Request: missing method');

  if (method === 'initialize') {
    const sessionId = randomUUID();
    const session: Session = {
      id: sessionId,
      createdAtIso: nowIso(),
      lastSeenMs: Date.now()
    };
    sessions.set(sessionId, session);

    return jsonRpcResult(id, {
      protocolVersion: '2025-03-26',
      serverInfo: { name: 'InvoiceChaser', version: '0.1.0' },
      capabilities: {
        tools: { listChanged: false }
      },
      sessionId
    });
  }

  if (method === 'tools/list') {
    return jsonRpcResult(id, mcpToolsListResult());
  }

  if (method === 'tools/call') {
    const paramsSchema = z.object({
      name: z.string(),
      arguments: z.unknown().optional()
    });
    const parsed = paramsSchema.safeParse(body.params ?? {});
    if (!parsed.success) {
      return jsonRpcError(id, -32602, 'Invalid params');
    }

    if (parsed.data.name !== 'invoicechaser_prepare') {
      return jsonRpcError(id, -32601, `Unknown tool: ${parsed.data.name}`);
    }

    const argsParsed = invoicechaserPrepareArgsSchema.safeParse(parsed.data.arguments ?? {});
    if (!argsParsed.success) {
      return jsonRpcError(id, -32602, argsParsed.error.message);
    }

    const toolResult = toolInvoicechaserPrepare(argsParsed.data);
    return jsonRpcResult(id, {
      content: [
        {
          type: 'text',
          text: JSON.stringify(toolResult, null, 2)
        }
      ],
      structuredContent: toolResult as Json
    });
  }

  return jsonRpcError(id, -32601, `Method not found: ${method}`);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  setCors(res);

  // CORS preflight: must return permissive headers.
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Health-ish quick check for root /api routing mistakes.
  // (This stays JSON and works even if Accept is */* or missing.)
  if (req.method === 'GET') {
    attachSse(req, res);
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    return;
  }

  // POST /api must NOT require Accept: text/event-stream.
  // It should work with Accept: application/json, */*, or missing Accept.
  try {
    const body = await readJson(req);
    const response = handleMcpRequest(body ?? {});

    // If client provided MCP-Session-Id, update lastSeen and optionally emit an event.
    const sessionId = getHeader(req, 'mcp-session-id');
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (session) {
        session.lastSeenMs = Date.now();
        const sseRes = session.sse?.res;
        if (sseRes && !sseRes.writableEnded) {
          sseWrite(sseRes, { type: 'mcp:message', id: body?.id ?? null }, 'mcp:message');
        }
      }
    }

    sendJson(res, 200, response);
  } catch (err) {
    sendJson(res, 400, {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: err instanceof Error ? err.message : 'Parse error'
      }
    });
  }
}
