import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'ruk-ai-store.json');

export const DEFAULT_SEED_STATE = {
  memories: [
    {
      id: 'mem_seed_operator',
      type: 'fact',
      text: 'Operator name is Rukshan — creator and commander of RUK-AI (Ultron Personal AI).',
      isProfile: true,
      createdAt: '2026-11-06T06:00:00.000Z',
      updatedAt: '2026-11-06T06:00:00.000Z',
    },
    {
      id: 'mem_seed_style',
      type: 'preference',
      text: 'Rukshan prefers clear, direct answers — short by default, detailed only when asked.',
      isProfile: true,
      createdAt: '2026-11-06T06:00:00.000Z',
      updatedAt: '2026-11-06T06:00:00.000Z',
    },
    {
      id: 'mem_seed_vision',
      type: 'project',
      text: 'Building Ultron Personal AI (RUK-AI) with persistent memory, voice comms, and task execution as phase 1 of a larger vision.',
      isProfile: false,
      createdAt: '2026-11-06T06:00:00.000Z',
      updatedAt: '2026-11-06T06:00:00.000Z',
    },
  ],
  tasks: [
    {
      id: 'task_seed_1',
      title: 'Initialize RUK-AI neural memory & voice core',
      status: 'active',
      createdAt: '2026-11-06T06:00:00.000Z',
    },
    {
      id: 'task_seed_2',
      title: 'Connect custom Ultron TTS voice & cloud LLM key',
      status: 'queued',
      createdAt: '2026-11-06T06:00:00.000Z',
    },
  ],
  messages: [
    {
      id: 'msg_seed_welcome',
      role: 'assistant',
      content:
        'RUK-AI online, Rukshan. Neural memory vault active. Tap MIC on the right to speak to me, or open TEXT to transmit a directive.',
      timestamp: '2026-11-06T06:00:00.000Z',
      emotion: 'sentinel',
    },
  ],
};

export function readStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_FILE)) {
      fs.writeFileSync(STORE_FILE, JSON.stringify(DEFAULT_SEED_STATE, null, 2), 'utf-8');
      return DEFAULT_SEED_STATE;
    }
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return DEFAULT_SEED_STATE;
  }
}

export function writeStore(nextState: unknown) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(STORE_FILE, JSON.stringify(nextState, null, 2), 'utf-8');
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

export function rukAiApiMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
) {
  const url = (req.url || '').split('?')[0];

  if (url === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, { status: 'ok', system: 'RUK-AI // ULTRON CORE' });
    return;
  }

  if (url === '/api/state' && req.method === 'GET') {
    sendJson(res, 200, readStore());
    return;
  }

  if (url === '/api/state' && req.method === 'POST') {
    readJsonBody(req).then((body) => {
      const current = readStore();
      const updated = {
        memories: Array.isArray(body.memories) ? body.memories : current.memories,
        tasks: Array.isArray(body.tasks) ? body.tasks : current.tasks,
        messages: Array.isArray(body.messages) ? body.messages.slice(-60) : current.messages,
      };
      writeStore(updated);
      sendJson(res, 200, { ok: true });
    });
    return;
  }

  if (url === '/api/reset' && req.method === 'DELETE') {
    writeStore(DEFAULT_SEED_STATE);
    sendJson(res, 200, DEFAULT_SEED_STATE);
    return;
  }

  if (url === '/api/proxy' && (req.method === 'GET' || req.method === 'OPTIONS')) {
    const proxyModPath = '../api/proxy.js';
    import(proxyModPath)
      .then((mod) => mod.default(req, res))
      .catch((err) =>
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : 'Proxy handler error',
        })
      );
    return;
  }

  if (
    url === '/api/search' ||
    url === '/api/comms' ||
    (url === '/api/chat' &&
      Boolean(process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY))
  ) {
    readJsonBody(req).then(async (body) => {
      try {
        const modPath =
          url === '/api/search'
            ? '../api/search.js'
            : url === '/api/comms'
            ? '../api/comms.js'
            : '../api/chat.js';
        const mod = await import(modPath);
        const handler = mod.default;
        const vercelLikeReq = Object.assign(req, { body });
        const vercelLikeRes = Object.assign(res, {
          status(code: number) {
            res.statusCode = code;
            return vercelLikeRes;
          },
          json(payload: unknown) {
            sendJson(res, res.statusCode || 200, payload);
            return vercelLikeRes;
          },
        });
        await handler(vercelLikeReq, vercelLikeRes);
      } catch (err) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : 'Serverless proxy error',
        });
      }
    });
    return;
  }

  next();
}
