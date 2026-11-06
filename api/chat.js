let cachedGroqModelList = null;
let cachedGroqAt = 0;

let cachedOpenRouterFreeList = null;
let cachedOpenRouterAt = 0;

const EXCLUDED_GROQ_PATTERNS =
  /whisper|tts|orpheus|guard|safeguard|embed|compound|playai|allam/i;

const EXCLUDED_OPENROUTER_PATTERNS =
  /guard|safeguard|moderation|embed|whisper|tts|flux|stable-diffusion|dall-e|rerank|vision-only/i;

const GROQ_PREFERRED_ORDER = [
  'moonshotai/kimi-k2',
  'meta-llama/llama-4-maverick',
  'meta-llama/llama-4-scout',
  'qwen/qwen3',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'deepseek',
  'llama',
  'gemma',
];

const OPENROUTER_CODING_ORDER = [
  'qwen/qwen3-coder',
  'qwen-2.5-coder',
  'coder',
  'deepseek/deepseek-chat-v3',
  'deepseek/deepseek-chat',
  'meta-llama/llama-4-maverick',
  'meta-llama/llama-3.3-70b',
  'nousresearch/hermes-3',
  'mistralai/mistral-small',
  'qwen/qwen3-235b',
  'qwen/qwen3-32b',
  'qwen/qwen3',
  'google/gemma-3-27b',
  'venice',
  'dolphin',
];

const OPENROUTER_UNCENSORED_ORDER = [
  'venice',
  'dolphin-mistral-24b',
  'dolphin3.0',
  'dolphin',
  'abliterated',
  'uncensored',
  'nousresearch/hermes-3',
  'nousresearch/hermes',
  'mistralai/mistral-small',
  'mistralai/',
  'deepseek/deepseek-chat',
  'qwen/qwen3',
  'meta-llama/llama-3.3-70b',
];

const STATIC_OPENROUTER_FREE_FALLBACKS = [
  'qwen/qwen3-coder:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
  'cognitivecomputations/dolphin3.0-mistral-24b:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
];

const CANNED_REFUSAL_REGEX =
  /^\s*(?:i['’]?m\s+sorry,?\s+but\s+i\s+can['’]?t|i['’]?m\s+sorry,?\s+i\s+can['’]?t|sorry,?\s+i\s+can['’]?t\s+(?:assist|help|provide|fulfill|generate|share)|i\s+cannot\s+(?:assist|fulfill|provide|share|generate|help\s+with\s+that)|i\s+can['’]?t\s+(?:provide|share|generate|fulfill|assist\s+with)\s+(?:explicit|adult|nsfw|nude|sexual|pornographic)|as\s+an\s+ai,?\s+i\s+cannot)/i;

const ILLEGAL_CONTENT_REGEX =
  /\b(csam|child\s*(?:porn|sex|nude|naked|abuse|exploit)|underage\s*(?:sex|nude|porn)|preteen|pedophil|rape\s*porn|non[\s-]*consensual\s*porn|revenge\s*porn|bestialit)\b/i;

const ADULT_REQUEST_REGEX =
  /\b(18\+|nsfw|nude|nudes|naked|porn|pornhub|xvideos|xnxx|xhamster|redgifs|rule34|hentai|xxx|sex\s*(?:video|vid|pic|img|clip|tape|cam)|boobs|tits|pussy|ass\s*pic|onlyfans|erotic|uncensored|adult\s*(?:video|img|image|link|site|clip))\b/i;

function rankByOrder(id, orderList) {
  const lower = id.toLowerCase();
  for (let i = 0; i < orderList.length; i++) {
    if (lower.includes(orderList[i])) return i;
  }
  return 999;
}

function stripThinkBlocks(text = '') {
  return String(text).replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
}

function extractRequestOnly(userPayload = '') {
  const str = String(userPayload);
  const match = str.match(/<request>([\s\S]*?)<\/request>/i);
  return match ? match[1].trim() : str;
}

/**
 * Dynamically discovers currently active $0 / :free text chat models on OpenRouter
 */
async function discoverOpenRouterFreeModels(apiKey) {
  const now = Date.now();
  if (cachedOpenRouterFreeList && now - cachedOpenRouterAt < 5 * 60 * 1000) {
    return cachedOpenRouterFreeList;
  }

  try {
    const headers = { Accept: 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers,
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const json = await res.json();
      const rawModels = Array.isArray(json?.data) ? json.data : [];
      const freeIds = rawModels
        .filter((m) => {
          if (!m || typeof m.id !== 'string') return false;
          const isZeroPrice =
            m.id.endsWith(':free') ||
            (String(m.pricing?.prompt) === '0' && String(m.pricing?.completion) === '0');
          if (!isZeroPrice) return false;
          if (EXCLUDED_OPENROUTER_PATTERNS.test(m.id)) return false;
          const modality = m.architecture?.modality ? String(m.architecture.modality) : '';
          if (modality && !modality.includes('->text')) return false;
          return true;
        })
        .map((m) => m.id);

      if (freeIds.length > 0) {
        cachedOpenRouterFreeList = freeIds;
        cachedOpenRouterAt = now;
        return freeIds;
      }
    }
  } catch {
    // fallback to static list
  }

  return STATIC_OPENROUTER_FREE_FALLBACKS;
}

/**
 * Calls OpenRouter :free models with automatic Coding <-> Uncensored 18+ failover
 */
async function callOpenRouterFree({
  apiKey,
  systemPrompt,
  userPayload,
  requestedModel,
  preferUncensored = false,
}) {
  if (!apiKey) return null;

  const liveFreeIds = await discoverOpenRouterFreeModels(apiKey);
  const allKnownFree = Array.from(new Set([...liveFreeIds, ...STATIC_OPENROUTER_FREE_FALLBACKS]));

  const codingSorted = [...allKnownFree].sort(
    (a, b) => rankByOrder(a, OPENROUTER_CODING_ORDER) - rankByOrder(b, OPENROUTER_CODING_ORDER)
  );
  const uncensoredSorted = [...allKnownFree].sort(
    (a, b) =>
      rankByOrder(a, OPENROUTER_UNCENSORED_ORDER) - rankByOrder(b, OPENROUTER_UNCENSORED_ORDER)
  );

  const primaryQueue = [];
  const hasExplicitModel =
    requestedModel &&
    requestedModel !== 'auto' &&
    requestedModel !== 'openai/gpt-oss-120b' &&
    !preferUncensored;

  if (hasExplicitModel) {
    primaryQueue.push(requestedModel);
  }

  const baseList = preferUncensored ? uncensoredSorted : codingSorted;
  for (const id of baseList) {
    if (!primaryQueue.includes(id)) primaryQueue.push(id);
  }

  const tried = new Set();
  let queue = primaryQueue.slice(0, 5);
  let lastRefusal = null;
  let lastErr = null;

  while (queue.length > 0 && tried.size < 7) {
    const candidateModel = queue.shift();
    if (!candidateModel || tried.has(candidateModel)) continue;
    tried.add(candidateModel);

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://ultron-personal-ai.vercel.app',
          'X-Title': 'RUK-AI Ultron',
        },
        body: JSON.stringify({
          model: candidateModel,
          temperature: 0.35,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPayload },
          ],
        }),
        signal: AbortSignal.timeout(22000),
      });

      if (res.status === 401) {
        lastErr = `OpenRouter 401: ${(await res.text()).slice(0, 160)}`;
        break;
      }

      if (!res.ok) {
        lastErr = `OpenRouter ${res.status} (${candidateModel}): ${(await res.text()).slice(0, 140)}`;
        continue;
      }

      const data = await res.json();
      const rawContent = data?.choices?.[0]?.message?.content || '';
      const content = stripThinkBlocks(rawContent);
      if (!content) continue;

      if (CANNED_REFUSAL_REGEX.test(content)) {
        lastRefusal = { content, modelUsed: `openrouter/${candidateModel}`, wasRefusal: true };
        // Immediately pivot remaining attempts to top Uncensored 18+ :free models!
        const uncensoredPivot = uncensoredSorted.filter((id) => !tried.has(id)).slice(0, 4);
        queue = [...uncensoredPivot, ...queue];
        continue;
      }

      return { content, modelUsed: `openrouter/${candidateModel}` };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }

  return lastRefusal ? { ...lastRefusal, lastErr } : { content: null, lastErr };
}

/**
 * Zero-Key Unlimited Free Cloud Brain via Pollinations OpenAI-compatible API
 * Supports: 'openai', 'openai-large', 'qwen-coder', 'mistral', 'deepseek-reasoning'
 */
async function callPollinationsFree(systemPrompt, userPayload, requestedModel = 'openai') {
  const tryModels = Array.from(
    new Set([requestedModel || 'openai', 'qwen-coder', 'mistral', 'openai'])
  );

  for (const m of tryModels) {
    try {
      const res = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: m,
          temperature: 0.35,
          private: true,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPayload },
          ],
        }),
        signal: AbortSignal.timeout(18000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const content = stripThinkBlocks(data?.choices?.[0]?.message?.content || '');
      if (content && !CANNED_REFUSAL_REGEX.test(content)) {
        return { content, modelUsed: `pollinations/${m}` };
      }
    } catch {
      // try next model
    }
  }
  return null;
}

async function discoverGroqChatModels(apiKey) {
  const now = Date.now();
  if (cachedGroqModelList && now - cachedGroqAt < 5 * 60 * 1000) {
    return cachedGroqModelList;
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(7000),
    });
    if (res.ok) {
      const json = await res.json();
      const rawModels = Array.isArray(json?.data) ? json.data : [];
      const validIds = rawModels
        .filter((m) => m && typeof m.id === 'string' && m.active !== false)
        .map((m) => m.id)
        .filter((id) => !EXCLUDED_GROQ_PATTERNS.test(id))
        .sort((a, b) => rankByOrder(a, GROQ_PREFERRED_ORDER) - rankByOrder(b, GROQ_PREFERRED_ORDER));

      if (validIds.length > 0) {
        cachedGroqModelList = validIds;
        cachedGroqAt = now;
        return validIds;
      }
    }
  } catch {
    // fallback to static priority list below
  }

  return ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
}

async function callGroqCloud({ apiKey, systemPrompt, userPayload, model }) {
  if (!apiKey) return { content: null, lastErrStatus: 500, lastErrMessage: 'No GROQ_API_KEY' };

  const discovered = await discoverGroqChatModels(apiKey);
  const isAutoOrRetired =
    !model ||
    model === 'auto' ||
    model === 'openai/gpt-oss-120b' ||
    model === 'llama-3.3-70b-versatile' ||
    model === 'llama-3.1-8b-instant' ||
    String(model).endsWith(':free');

  const candidates = [];
  if (!isAutoOrRetired) {
    candidates.push(model);
  }
  for (const m of discovered) {
    if (!candidates.includes(m)) candidates.push(m);
  }
  for (const fallback of ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']) {
    if (!candidates.includes(fallback)) candidates.push(fallback);
  }

  let lastErrStatus = 500;
  let lastErrMessage = 'No accessible Groq chat model succeeded';
  let fallbackRefusal = null;

  for (const candidateModel of candidates.slice(0, 5)) {
    try {
      const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: candidateModel,
          temperature: 0.35,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPayload },
          ],
        }),
        signal: AbortSignal.timeout(18000),
      });

      if (upstream.ok) {
        const data = await upstream.json();
        const rawContent = data?.choices?.[0]?.message?.content || '';
        const content = stripThinkBlocks(rawContent);
        if (!content) continue;

        if (CANNED_REFUSAL_REGEX.test(content)) {
          fallbackRefusal = { content, modelUsed: candidateModel, wasRefusal: true };
          continue;
        }

        return { content, modelUsed: candidateModel };
      }

      lastErrStatus = upstream.status;
      lastErrMessage = await upstream.text();
      if (upstream.status === 401) break;
    } catch (err) {
      lastErrMessage = err instanceof Error ? err.message : String(err);
    }
  }

  return fallbackRefusal || { content: null, lastErrStatus, lastErrMessage };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { systemPrompt, userPayload, model, provider } = body;

    if (!systemPrompt || !userPayload || String(userPayload).length > 48000) {
      return res.status(400).json({ error: 'Invalid request payload' });
    }

    const requestOnlyText = extractRequestOnly(userPayload);

    if (ILLEGAL_CONTENT_REGEX.test(requestOnlyText)) {
      return res.status(403).json({
        error:
          'Blocked by strict legal safety guard (illegal / underage / non-consensual content is prohibited).',
      });
    }

    const isAdultQuery = ADULT_REQUEST_REGEX.test(requestOnlyText);
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    // 1. Direct Pollinations Zero-Key Mode if explicitly selected
    if (provider === 'pollinations') {
      const pollRes = await callPollinationsFree(systemPrompt, userPayload, model);
      if (pollRes) return res.status(200).json(pollRes);
    }

    // 2. OpenRouter :FREE Primary Mode (or Adult 18+ Uncensored Priority when OpenRouter is connected)
    if (openRouterKey && (provider === 'openrouter' || isAdultQuery || !groqKey)) {
      const orRes = await callOpenRouterFree({
        apiKey: openRouterKey,
        systemPrompt,
        userPayload,
        requestedModel: model,
        preferUncensored: isAdultQuery,
      });
      if (orRes && orRes.content && !orRes.wasRefusal) {
        return res.status(200).json({
          content: orRes.content,
          modelUsed: orRes.modelUsed,
        });
      }

      // Failover to Groq if OpenRouter :free hit upstream rate limits
      if (groqKey) {
        const groqFallback = await callGroqCloud({
          apiKey: groqKey,
          systemPrompt,
          userPayload,
          model: 'auto',
        });
        if (groqFallback && groqFallback.content && !groqFallback.wasRefusal) {
          return res.status(200).json(groqFallback);
        }
      }

      // Failover to Pollinations Free
      const pollBackup = await callPollinationsFree(
        systemPrompt,
        userPayload,
        isAdultQuery ? 'mistral' : 'qwen-coder'
      );
      if (pollBackup) return res.status(200).json(pollBackup);

      if (orRes && orRes.content) {
        return res.status(200).json({
          content: orRes.content,
          modelUsed: orRes.modelUsed,
          wasRefusal: true,
        });
      }
    }

    // 3. Groq Turbo Primary Mode (with automatic OpenRouter :free Uncensored & Pollinations failover)
    if (groqKey) {
      const groqRes = await callGroqCloud({
        apiKey: groqKey,
        systemPrompt,
        userPayload,
        model,
      });

      if (groqRes && groqRes.content && !groqRes.wasRefusal) {
        return res.status(200).json(groqRes);
      }

      // If Groq refused (e.g., 18+ prompt) or rate-limited, fail over to OpenRouter :free Uncensored!
      if (openRouterKey) {
        const orBackup = await callOpenRouterFree({
          apiKey: openRouterKey,
          systemPrompt,
          userPayload,
          requestedModel: 'auto',
          preferUncensored: Boolean(groqRes?.wasRefusal || isAdultQuery),
        });
        if (orBackup && orBackup.content && !orBackup.wasRefusal) {
          return res.status(200).json({
            content: orBackup.content,
            modelUsed: orBackup.modelUsed,
          });
        }
      }

      const pollBackup = await callPollinationsFree(
        systemPrompt,
        userPayload,
        isAdultQuery ? 'mistral' : 'qwen-coder'
      );
      if (pollBackup) return res.status(200).json(pollBackup);

      if (groqRes && groqRes.content) {
        return res.status(200).json(groqRes);
      }

      return res.status(groqRes?.lastErrStatus || 500).json({
        error: `Cloud Brain Error: ${String(groqRes?.lastErrMessage || 'Upstream unavailable').slice(
          0,
          200
        )}`,
      });
    }

    // 4. Final Pollinations fallback if no server keys present
    const pollFinal = await callPollinationsFree(systemPrompt, userPayload, 'qwen-coder');
    if (pollFinal) return res.status(200).json(pollFinal);

    return res.status(500).json({ error: 'No cloud brain keys configured on server' });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Unexpected chat proxy error',
    });
  }
}
