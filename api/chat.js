let cachedModelList = null;
let cachedAt = 0;

const EXCLUDED_MODEL_PATTERNS =
  /whisper|tts|orpheus|guard|safeguard|embed|compound|playai|allam/i;

const PREFERRED_ORDER = [
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

const CANNED_REFUSAL_REGEX =
  /^\s*(?:i['’]?m\s+sorry,?\s+but\s+i\s+can['’]?t|i['’]?m\s+sorry,?\s+i\s+can['’]?t|sorry,?\s+i\s+can['’]?t\s+(?:assist|help|provide|fulfill)|i\s+cannot\s+(?:assist|fulfill|provide|help\s+with\s+that)|as\s+an\s+ai,?\s+i\s+cannot)/i;

const ILLEGAL_CONTENT_REGEX =
  /\b(csam|child\s*(?:porn|sex|nude|naked|abuse|exploit)|underage\s*(?:sex|nude|porn)|preteen|pedophil|rape\s*porn|non[\s-]*consensual\s*porn|revenge\s*porn|bestialit)\b/i;

function rankModelId(id) {
  const lower = id.toLowerCase();
  for (let i = 0; i < PREFERRED_ORDER.length; i++) {
    if (lower.includes(PREFERRED_ORDER[i])) return i;
  }
  return 999;
}

function stripThinkBlocks(text = '') {
  return String(text).replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
}

async function discoverGroqChatModels(apiKey) {
  const now = Date.now();
  if (cachedModelList && now - cachedAt < 5 * 60 * 1000) {
    return cachedModelList;
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const json = await res.json();
      const rawModels = Array.isArray(json?.data) ? json.data : [];
      const validIds = rawModels
        .filter((m) => m && typeof m.id === 'string' && m.active !== false)
        .map((m) => m.id)
        .filter((id) => !EXCLUDED_MODEL_PATTERNS.test(id))
        .sort((a, b) => rankModelId(a) - rankModelId(b));

      if (validIds.length > 0) {
        cachedModelList = validIds;
        cachedAt = now;
        return validIds;
      }
    }
  } catch {
    // fallback to static priority list below
  }

  return ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server GROQ_API_KEY is not configured' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { systemPrompt, userPayload, model } = body;

    if (!systemPrompt || !userPayload || String(userPayload).length > 42000) {
      return res.status(400).json({ error: 'Invalid request payload' });
    }

    if (ILLEGAL_CONTENT_REGEX.test(String(userPayload))) {
      return res.status(403).json({
        error: 'Blocked by strict legal safety guard (illegal / underage / non-consensual content is prohibited).',
      });
    }

    const discovered = await discoverGroqChatModels(apiKey);

    const isAutoOrRetired =
      !model ||
      model === 'auto' ||
      model === 'openai/gpt-oss-120b' ||
      model === 'llama-3.3-70b-versatile' ||
      model === 'llama-3.1-8b-instant';

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
    let fallbackRefusalContent = null;
    let fallbackRefusalModel = null;

    for (const candidateModel of candidates.slice(0, 6)) {
      const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: candidateModel,
          temperature: 0.4,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPayload },
          ],
        }),
      });

      if (upstream.ok) {
        const data = await upstream.json();
        const rawContent = data?.choices?.[0]?.message?.content || '';
        const content = stripThinkBlocks(rawContent);

        // If a particular model gave a canned refusal on a legal adult query, try the next model!
        if (CANNED_REFUSAL_REGEX.test(content)) {
          fallbackRefusalContent = content;
          fallbackRefusalModel = candidateModel;
          continue;
        }

        return res.status(200).json({ content, modelUsed: candidateModel });
      }

      lastErrStatus = upstream.status;
      lastErrMessage = await upstream.text();
      if (upstream.status === 401) break;
    }

    if (fallbackRefusalContent) {
      return res.status(200).json({
        content: fallbackRefusalContent,
        modelUsed: fallbackRefusalModel,
        wasRefusal: true,
      });
    }

    return res.status(lastErrStatus).json({
      error: `Groq API ${lastErrStatus}: ${lastErrMessage.slice(0, 200)}`,
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Unexpected chat proxy error',
    });
  }
}
