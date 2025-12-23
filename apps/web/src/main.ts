const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app');

app.innerHTML = `
  <main style="max-width: 900px; margin: 40px auto; padding: 0 16px; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;">
    <h1 style="margin: 0 0 8px;">InvoiceChaser</h1>
    <p style="margin: 0 0 16px; color: #444;">
      Minimal web demo calling the MCP server's <code>/api</code>.
    </p>

    <label style="display:block; font-weight:600; margin: 16px 0 8px;">MCP Base URL</label>
    <input id="mcpUrl" style="width:100%; padding: 10px;" placeholder="https://your-mcp-domain.vercel.app/api" />

    <label style="display:block; font-weight:600; margin: 16px 0 8px;">Invoice Text</label>
    <textarea id="invoiceText" style="width:100%; height: 160px; padding: 10px;" placeholder="Paste invoice text here..."></textarea>

    <div style="display:flex; gap: 8px; margin: 16px 0;">
      <button id="btnList" style="padding: 10px 12px;">tools/list</button>
      <button id="btnPrepare" style="padding: 10px 12px;">tools/call invoicechaser_prepare</button>
    </div>

    <pre id="output" style="background:#111; color:#eee; padding: 12px; border-radius: 8px; overflow:auto;"></pre>
  </main>
`;

const mcpUrlInput = document.querySelector<HTMLInputElement>('#mcpUrl')!;
const invoiceTextInput = document.querySelector<HTMLTextAreaElement>('#invoiceText')!;
const output = document.querySelector<HTMLPreElement>('#output')!;

mcpUrlInput.value = localStorage.getItem('invoicechaser:mcpUrl') ?? '';
invoiceTextInput.value = localStorage.getItem('invoicechaser:invoiceText') ?? '';

function setOutput(value: unknown) {
  output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

async function mcpPost(baseUrl: string, body: unknown) {
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    // keep as text
  }
  return { status: res.status, json };
}

(document.querySelector('#btnList') as HTMLButtonElement).onclick = async () => {
  const baseUrl = mcpUrlInput.value.trim();
  localStorage.setItem('invoicechaser:mcpUrl', baseUrl);
  try {
    const result = await mcpPost(baseUrl, {
      jsonrpc: '2.0',
      id: '1',
      method: 'tools/list',
      params: {}
    });
    setOutput(result);
  } catch (err) {
    setOutput(String(err));
  }
};

(document.querySelector('#btnPrepare') as HTMLButtonElement).onclick = async () => {
  const baseUrl = mcpUrlInput.value.trim();
  const invoiceText = invoiceTextInput.value;
  localStorage.setItem('invoicechaser:mcpUrl', baseUrl);
  localStorage.setItem('invoicechaser:invoiceText', invoiceText);
  try {
    const result = await mcpPost(baseUrl, {
      jsonrpc: '2.0',
      id: '2',
      method: 'tools/call',
      params: {
        name: 'invoicechaser_prepare',
        arguments: {
          invoiceText,
          currency: 'USD',
          tone: 'neutral'
        }
      }
    });
    setOutput(result);
  } catch (err) {
    setOutput(String(err));
  }
};
