/**
 * Vercel Serverless Function: /api/comms
 * Real Cloud Connector Proxy for WhatsApp (Green-API / Cloud API),
 * Telegram (Bot API getMe / getUpdates / sendMessage),
 * GitHub (Unread Notifications & Repos), and Discord.
 * Credentials are passed per-request from the operator's local browser vault and never stored on the server.
 */

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
    const { platform, action, credentials = {}, payload = {} } = req.body || {};

    // =========================================================================
    // 1. WHATSAPP CLOUD BRIDGE (Green-API: free developer tier links personal WA)
    // =========================================================================
    if (platform === 'whatsapp_green') {
      const idInstance = String(credentials.idInstance || '').trim();
      const apiToken = String(credentials.apiToken || '').trim();
      const apiHost = String(credentials.apiHost || 'https://api.green-api.com')
        .trim()
        .replace(/\/+$/, '');

      if (!idInstance || !apiToken) {
        return res.status(400).json({
          error: 'Missing WhatsApp Green-API Instance ID or Token.',
        });
      }

      if (action === 'status') {
        const r = await fetch(
          `${apiHost}/waInstance${encodeURIComponent(idInstance)}/getStateInstance/${encodeURIComponent(
            apiToken
          )}`,
          { signal: AbortSignal.timeout(6500) }
        );
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          return res.status(r.status).json({ error: data?.message || `HTTP ${r.status}` });
        }
        return res.status(200).json({
          authorized: data?.stateInstance === 'authorized',
          state: data?.stateInstance || 'unknown',
        });
      }

      if (action === 'request_code') {
        // Request 8-digit WhatsApp Phone Number Pairing Code directly via Green-API!
        const phoneNum = String(payload.phoneNumber || '')
          .replace(/[^0-9]/g, '');
        if (!phoneNum) {
          return res.status(400).json({ error: 'Provide phone number digits with country code.' });
        }
        const r = await fetch(
          `${apiHost}/waInstance${encodeURIComponent(
            idInstance
          )}/getAuthorizationCode/${encodeURIComponent(apiToken)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber: Number(phoneNum) }),
            signal: AbortSignal.timeout(8000),
          }
        );
        const data = await r.json().catch(() => ({}));
        return res.status(r.ok ? 200 : 400).json(data);
      }

      if (action === 'unread') {
        // Fetch recent incoming WhatsApp messages (minutes = last 24h) + queued unseen notifications
        const minutes = Number(payload.minutes || 1440);
        const r = await fetch(
          `${apiHost}/waInstance${encodeURIComponent(
            idInstance
          )}/lastIncomingMessages/${encodeURIComponent(apiToken)}?minutes=${minutes}`,
          { signal: AbortSignal.timeout(7500) }
        );
        const list = await r.json().catch(() => []);
        if (!r.ok || !Array.isArray(list)) {
          return res.status(400).json({
            error: 'Could not fetch WhatsApp incoming messages. Confirm instance is authorized.',
          });
        }

        const sinceTs = Number(payload.sinceTimestamp || 0);
        const formatted = list
          .filter((m) => m.type === 'incoming' && (m.textMessage || m.caption || m.extendedTextMessage?.text))
          .filter((m) => !sinceTs || (m.timestamp || 0) * 1000 > sinceTs)
          .slice(0, 20)
          .map((m) => ({
            id: m.idMessage || String(m.timestamp),
            platform: 'whatsapp',
            sender: m.senderName || m.senderId?.replace('@c.us', '') || 'Unknown',
            chatId: m.chatId,
            text:
              m.textMessage ||
              m.extendedTextMessage?.text ||
              m.caption ||
              '[Media message]',
            timestamp: new Date((m.timestamp || Date.now() / 1000) * 1000).toISOString(),
          }));

        return res.status(200).json({ messages: formatted });
      }

      if (action === 'send') {
        const rawTo = String(payload.to || '').trim();
        const chatId = rawTo.includes('@')
          ? rawTo
          : `${rawTo.replace(/[^0-9]/g, '')}@c.us`;
        const message = String(payload.text || '').trim();
        if (!chatId || !message) {
          return res.status(400).json({ error: 'Recipient number and message required.' });
        }
        const r = await fetch(
          `${apiHost}/waInstance${encodeURIComponent(idInstance)}/sendMessage/${encodeURIComponent(
            apiToken
          )}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, message }),
            signal: AbortSignal.timeout(7500),
          }
        );
        const data = await r.json().catch(() => ({}));
        return res.status(r.ok ? 200 : 400).json(data);
      }
    }

    // =========================================================================
    // 2. TELEGRAM BRIDGE (Official Telegram Bot HTTP API)
    // =========================================================================
    if (platform === 'telegram') {
      const botToken = String(credentials.botToken || '').trim();
      if (!botToken) {
        return res.status(400).json({ error: 'Missing Telegram Bot Token.' });
      }
      const tgBase = `https://api.telegram.org/bot${encodeURIComponent(botToken)}`;

      if (action === 'status') {
        const r = await fetch(`${tgBase}/getMe`, { signal: AbortSignal.timeout(6000) });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data?.ok) {
          return res.status(400).json({ error: data?.description || 'Invalid Telegram token' });
        }
        return res.status(200).json({
          authorized: true,
          botUsername: data.result?.username,
          botName: data.result?.first_name,
        });
      }

      if (action === 'unread') {
        const offset = Number(payload.lastUpdateId || 0);
        const url =
          offset > 0
            ? `${tgBase}/getUpdates?offset=${offset + 1}&limit=25`
            : `${tgBase}/getUpdates?limit=25`;
        const r = await fetch(url, { signal: AbortSignal.timeout(6500) });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data?.ok) {
          return res.status(400).json({ error: data?.description || 'Telegram getUpdates failed' });
        }
        const updates = data.result || [];
        let maxUpdateId = offset;
        const messages = [];

        for (const u of updates) {
          if (u.update_id > maxUpdateId) maxUpdateId = u.update_id;
          const msg = u.message || u.edited_message || u.channel_post;
          if (!msg) continue;
          const senderName = [msg.from?.first_name, msg.from?.last_name]
            .filter(Boolean)
            .join(' ') || msg.chat?.title || msg.from?.username || 'Telegram User';
          messages.push({
            id: String(u.update_id),
            platform: 'telegram',
            sender: senderName,
            chatId: String(msg.chat?.id || ''),
            text: msg.text || msg.caption || '[Attachment / Sticker]',
            timestamp: new Date((msg.date || Date.now() / 1000) * 1000).toISOString(),
          });
        }

        return res.status(200).json({ messages, maxUpdateId });
      }

      if (action === 'send') {
        const chatId = String(payload.chatId || '').trim();
        const text = String(payload.text || '').trim();
        if (!chatId || !text) {
          return res.status(400).json({ error: 'Telegram chatId and text required.' });
        }
        const r = await fetch(`${tgBase}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text }),
          signal: AbortSignal.timeout(6500),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data?.ok) {
          return res.status(400).json({ error: data?.description || 'Telegram send failed' });
        }
        return res.status(200).json({ ok: true, messageId: data.result?.message_id });
      }
    }

    // =========================================================================
    // 3. GITHUB UNSEEN NOTIFICATIONS BRIDGE
    // =========================================================================
    if (platform === 'github') {
      const token = String(credentials.token || '').trim();
      if (!token) {
        return res.status(400).json({ error: 'Missing GitHub Personal Access Token.' });
      }
      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Ultron-RUK-AI',
      };

      if (action === 'status') {
        const r = await fetch('https://api.github.com/user', {
          headers,
          signal: AbortSignal.timeout(5500),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) return res.status(400).json({ error: data?.message || 'Invalid GitHub token' });
        return res.status(200).json({ authorized: true, login: data.login });
      }

      if (action === 'unread') {
        const r = await fetch('https://api.github.com/notifications?all=false&per_page=20', {
          headers,
          signal: AbortSignal.timeout(6000),
        });
        const list = await r.json().catch(() => []);
        if (!r.ok || !Array.isArray(list)) {
          return res.status(400).json({ error: 'Could not read GitHub notifications' });
        }
        const messages = list.map((n) => ({
          id: String(n.id),
          platform: 'github',
          sender: n.repository?.full_name || 'GitHub',
          chatId: n.subject?.url || '',
          text: `[${n.subject?.type || 'Update'}] ${n.subject?.title || ''} (${n.reason})`,
          timestamp: n.updated_at || new Date().toISOString(),
        }));
        return res.status(200).json({ messages });
      }
    }

    return res.status(400).json({ error: `Unsupported platform/action: ${platform}/${action}` });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Comms proxy error',
    });
  }
}
