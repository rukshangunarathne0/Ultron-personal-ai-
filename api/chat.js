let cachedModelList = null;
let cachedAt = 0;

const EXCLUDED_MODEL_PATTERNS =
  /whisper|tts|orpheus|guard|safeguard|embed|compound|playai|allam/i;

const PREFERRED_ORDER = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'moonshotai/kimi-k2',
  'meta-llama/llama-4-maverick',
  'meta-llama/llama-4-scout',
  'qwen/qwen3',
  'deepseek',
  'llama',
  'gemma',
];

function rankModelId(id) {
  const lower = id.toLowerCase();
  for (let i = 0; i < PREFERRED_ORDER.length; i++) {
    if (lower.includes(PREFERRED_ORDER[i])) return i;
  }
  return 999;
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

    if (!systemPrompt || !userPayload || String(userPayload).length > 36000) {
      return res.status(400).json({ error: 'Invalid request payload' });
    }

    const discovered = await discoverGroqChatModels(apiKey);

    // Remap retired/enterprise-only Llama 3.x IDs automatically to discovered production models
    const isLegacyRetired =
      !model ||
      model === 'auto' ||
      model === 'llama-3.3-70b-versatile' ||
      model === 'llama-3.1-8b-instant';

    const candidates = [];
    if (!isLegacyRetired) {
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

    for (const candidateModel of candidates.slice(0, 5)) {
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
      });

      if (upstream.ok) {
        const data = await upstream.json();
        const content = data?.choices?.[0]?.message?.content || '';
        return res.status(200).json({ content, modelUsed: candidateModel });
      }

      lastErrStatus = upstream.status;
      lastErrMessage = await upstream.text();
      // If auth failed (401), don't retry other models
      if (upstream.status === 401) break;
    }

    return res.status(lastErrStatus).json({
      error: `Groq API ${lastErrStatus}: ${lastErrMessage.slice(0, 200)}`,
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
}
