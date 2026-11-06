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
    const rawText = String(body.text || '').trim().slice(0, 195);
    const voice = ['troy', 'daniel', 'austin', 'autumn', 'diana', 'hannah'].includes(body.voice)
      ? body.voice
      : 'troy';

    if (!rawText) {
      return res.status(400).json({ error: 'Missing text' });
    }

    const upstream = await fetch('https://api.groq.com/openai/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'canopylabs/orpheus-v1-english',
        voice,
        input: rawText,
        response_format: 'wav',
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(upstream.status).json({
        error: errText.slice(0, 300),
      });
    }

    const wavBuffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(wavBuffer);
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'TTS server error',
    });
  }
}
