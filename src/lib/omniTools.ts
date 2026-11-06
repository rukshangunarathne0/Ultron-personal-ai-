import {
  CommsPlatform,
  CommsVaultConfig,
  SearchBundle,
  UnseenCommsMessage,
} from '../types';

export const DEFAULT_COMMS_VAULT: CommsVaultConfig = {
  whatsapp: {
    phoneNumber: '',
    bridgeMode: 'cloud_green',
    greenIdInstance: '',
    greenApiToken: '',
    localBridgeUrl: 'http://localhost:3005',
    authorized: false,
    awaitingPhoneInput: false,
    lastCheckedTimestamp: 0,
  },
  telegram: {
    botToken: '',
    defaultChatId: '',
    botUsername: '',
    authorized: false,
    awaitingTokenInput: false,
    lastUpdateId: 0,
  },
  github: {
    token: '',
    login: '',
    authorized: false,
  },
};

async function callServerlessJson(path: string, body: Record<string, unknown>): Promise<any> {
  let res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);

  const isJson = res && (res.headers.get('content-type') || '').includes('application/json');
  if (!res || res.status === 404 || !isJson) {
    res = await fetch(`https://ultron-personal-ai.vercel.app${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Endpoint ${path} returned ${res.status}`);
  }
  return data;
}

export async function runUltronWebSearch(
  query: string,
  mode: 'all' | 'web' | 'images' | 'videos' = 'all'
): Promise<SearchBundle> {
  const data = await callServerlessJson('/api/search', { query, mode });
  return {
    query: data.query || query,
    web: Array.isArray(data.web) ? data.web : [],
    images: Array.isArray(data.images) ? data.images : [],
    videos: Array.isArray(data.videos) ? data.videos : [],
    timestamp: data.timestamp || new Date().toISOString(),
  };
}

export async function readWebUrl(targetUrl: string): Promise<{ title: string; url: string; text: string }> {
  const data = await callServerlessJson('/api/search', {
    mode: 'read_url',
    targetUrl,
  });
  return data?.page || { title: targetUrl, url: targetUrl, text: '' };
}

/**
 * Detects if Rukshan's prompt wants live web search, Google info, images, or videos
 * so we pre-fetch real data before invoking the LLM!
 */
export function detectLiveSearchIntent(userText: string): {
  needed: boolean;
  query: string;
  mode: 'all' | 'web' | 'images' | 'videos';
  readUrl?: string;
} {
  const trimmed = userText.trim();
  const low = trimmed.toLowerCase();

  // Direct URL reading
  const urlMatch = trimmed.match(/https?:\/\/[^\s<>"]+/i);
  if (urlMatch && /\b(read|summarize|open|check|inspect|what is on|scrape)\b/i.test(low)) {
    return { needed: true, query: trimmed, mode: 'web', readUrl: urlMatch[0] };
  }

  // Skip personal memory / UI / voice / WhatsApp / Telegram commands
  if (
    /\b(whatsapp|whats app|telegram|unseen message|unread message|change your ui|swap your|your voice)\b/i.test(
      low
    )
  ) {
    return { needed: false, query: '', mode: 'all' };
  }

  const wantsImages = /\b(images?|photos?|pictures?|pics?|wallpapers?|show me (?:how|what)|look like)\b/i.test(low);
  const wantsVideos = /\b(videos?|youtube|watch|clips?|trailers?|tutorials?)\b/i.test(low);
  const explicitSearch =
    /\b(google|search(?:\s+for|\s+the\s+web)?|look\s+up|find\s+(?:info|information|out|me)|latest\s+news|current\s+price|weather\s+in|who\s+won|what\s+happened|news\s+about|browse)\b/i.test(
      low
    );

  if (!wantsImages && !wantsVideos && !explicitSearch) {
    return { needed: false, query: '', mode: 'all' };
  }

  const cleanQuery = trimmed
    .replace(
      /^(?:hey\s+ultron[, ]*|ultron[, ]*|please\s+|can\s+you\s+|go\s+(?:and\s+)?|do\s+a\s+)?(?:google\s+search(?:\s+for|\s+on)?|search(?:\s+google)?(?:\s+for|\s+about)?|find(?:\s+me)?|show(?:\s+me)?|get(?:\s+me)?|look\s+up)\s+/i,
      ''
    )
    .replace(/\b(?:images?|photos?|pictures?|pics?|videos?|on\s+youtube|information|and\s+videos?)\s+(?:of|for|about)\s+/gi, '')
    .replace(/[?.!]+$/, '')
    .trim();

  const mode: 'all' | 'web' | 'images' | 'videos' =
    wantsImages && !wantsVideos && !explicitSearch
      ? 'all'
      : wantsVideos && !wantsImages && !explicitSearch
      ? 'all'
      : 'all';

  return {
    needed: Boolean(cleanQuery),
    query: cleanQuery || trimmed,
    mode,
  };
}

/**
 * Checks real WhatsApp status (tries Local PC Companion Bridge on localhost:3005 first, then Cloud Green-API).
 */
export async function checkWhatsAppStatus(vault: CommsVaultConfig): Promise<{
  authorized: boolean;
  via: 'local_baileys' | 'cloud_green' | 'none';
  pairingCode?: string;
  detail?: string;
}> {
  // 1. Try local PC Baileys bridge (localhost:3005)
  const localBase = (vault.whatsapp.localBridgeUrl || 'http://localhost:3005').replace(/\/+$/, '');
  try {
    const r = await fetch(`${localBase}/whatsapp/status`, {
      signal: AbortSignal.timeout(1800),
    });
    if (r.ok) {
      const data = await r.json();
      if (data?.authorized) {
        return { authorized: true, via: 'local_baileys', detail: 'Connected via Local WA Bridge' };
      }
      if (data?.pairingCode) {
        return {
          authorized: false,
          via: 'local_baileys',
          pairingCode: data.pairingCode,
          detail: `Enter 8-digit code ${data.pairingCode} in WhatsApp -> Linked Devices`,
        };
      }
    }
  } catch {
    // Local bridge not running — check cloud Green-API next
  }

  // 2. Try Cloud Green-API
  if (vault.whatsapp.greenIdInstance.trim() && vault.whatsapp.greenApiToken.trim()) {
    try {
      const data = await callServerlessJson('/api/comms', {
        platform: 'whatsapp_green',
        action: 'status',
        credentials: {
          idInstance: vault.whatsapp.greenIdInstance,
          apiToken: vault.whatsapp.greenApiToken,
        },
      });
      return {
        authorized: Boolean(data?.authorized),
        via: 'cloud_green',
        detail: `Cloud state: ${data?.state || 'unknown'}`,
      };
    } catch (err) {
      return {
        authorized: false,
        via: 'cloud_green',
        detail: err instanceof Error ? err.message : 'Cloud WA check failed',
      };
    }
  }

  return { authorized: false, via: 'none' };
}

export async function requestCloudWhatsAppPairingCode(
  vault: CommsVaultConfig
): Promise<string> {
  const data = await callServerlessJson('/api/comms', {
    platform: 'whatsapp_green',
    action: 'request_code',
    credentials: {
      idInstance: vault.whatsapp.greenIdInstance,
      apiToken: vault.whatsapp.greenApiToken,
    },
    payload: {
      phoneNumber: vault.whatsapp.phoneNumber,
    },
  });
  if (data?.code) {
    return String(data.code);
  }
  throw new Error(data?.message || JSON.stringify(data));
}

export async function fetchUnseenCommsMessages(
  targetPlatform: CommsPlatform | 'all',
  vault: CommsVaultConfig
): Promise<{
  messages: UnseenCommsMessage[];
  updatedVault: CommsVaultConfig;
  errors: string[];
}> {
  const nextVault: CommsVaultConfig = JSON.parse(JSON.stringify(vault));
  const allMessages: UnseenCommsMessage[] = [];
  const errors: string[] = [];

  // 1. WhatsApp Unseen Messages
  if (targetPlatform === 'whatsapp' || targetPlatform === 'all') {
    const localBase = (vault.whatsapp.localBridgeUrl || 'http://localhost:3005').replace(/\/+$/, '');
    let handledLocal = false;
    try {
      const r = await fetch(`${localBase}/whatsapp/unread`, {
        signal: AbortSignal.timeout(2000),
      });
      if (r.ok) {
        const d = await r.json();
        if (Array.isArray(d?.messages)) {
          allMessages.push(...d.messages);
          nextVault.whatsapp.authorized = true;
          nextVault.whatsapp.lastCheckedTimestamp = Date.now();
          handledLocal = true;
        }
      }
    } catch {
      // fallback to cloud
    }

    if (
      !handledLocal &&
      vault.whatsapp.greenIdInstance.trim() &&
      vault.whatsapp.greenApiToken.trim()
    ) {
      try {
        const d = await callServerlessJson('/api/comms', {
          platform: 'whatsapp_green',
          action: 'unread',
          credentials: {
            idInstance: vault.whatsapp.greenIdInstance,
            apiToken: vault.whatsapp.greenApiToken,
          },
          payload: {
            minutes: 1440,
            sinceTimestamp: vault.whatsapp.lastCheckedTimestamp || 0,
          },
        });
        if (Array.isArray(d?.messages)) {
          allMessages.push(...d.messages);
          nextVault.whatsapp.authorized = true;
          nextVault.whatsapp.lastCheckedTimestamp = Date.now();
        }
      } catch (err) {
        errors.push(`WhatsApp: ${err instanceof Error ? err.message : 'not authorized yet'}`);
      }
    }
  }

  // 2. Telegram Unseen Messages
  if (
    (targetPlatform === 'telegram' || targetPlatform === 'all') &&
    vault.telegram.botToken.trim()
  ) {
    try {
      const d = await callServerlessJson('/api/comms', {
        platform: 'telegram',
        action: 'unread',
        credentials: { botToken: vault.telegram.botToken },
        payload: { lastUpdateId: vault.telegram.lastUpdateId || 0 },
      });
      if (Array.isArray(d?.messages)) {
        allMessages.push(...d.messages);
        if (d.maxUpdateId) {
          nextVault.telegram.lastUpdateId = d.maxUpdateId;
        }
        if (d.messages[0]?.chatId && !nextVault.telegram.defaultChatId) {
          nextVault.telegram.defaultChatId = d.messages[0].chatId;
        }
        nextVault.telegram.authorized = true;
      }
    } catch (err) {
      errors.push(`Telegram: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  // 3. GitHub Unread Notifications
  if (
    (targetPlatform === 'github' || targetPlatform === 'all') &&
    vault.github.token.trim()
  ) {
    try {
      const d = await callServerlessJson('/api/comms', {
        platform: 'github',
        action: 'unread',
        credentials: { token: vault.github.token },
      });
      if (Array.isArray(d?.messages)) {
        allMessages.push(...d.messages);
        nextVault.github.authorized = true;
      }
    } catch (err) {
      errors.push(`GitHub: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  return { messages: allMessages, updatedVault: nextVault, errors };
}

export async function sendCommsReply(params: {
  platform: 'whatsapp' | 'telegram';
  to: string;
  text: string;
  vault: CommsVaultConfig;
}): Promise<void> {
  const { platform, to, text, vault } = params;
  if (platform === 'whatsapp') {
    const localBase = (vault.whatsapp.localBridgeUrl || 'http://localhost:3005').replace(/\/+$/, '');
    try {
      const r = await fetch(`${localBase}/whatsapp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, text }),
        signal: AbortSignal.timeout(2200),
      });
      if (r.ok) return;
    } catch {
      // try cloud
    }

    await callServerlessJson('/api/comms', {
      platform: 'whatsapp_green',
      action: 'send',
      credentials: {
        idInstance: vault.whatsapp.greenIdInstance,
        apiToken: vault.whatsapp.greenApiToken,
      },
      payload: { to, text },
    });
    return;
  }

  if (platform === 'telegram') {
    await callServerlessJson('/api/comms', {
      platform: 'telegram',
      action: 'send',
      credentials: { botToken: vault.telegram.botToken },
      payload: { chatId: to || vault.telegram.defaultChatId, text },
    });
  }
}

export async function verifyTelegramToken(botToken: string): Promise<{ username: string; name: string }> {
  const d = await callServerlessJson('/api/comms', {
    platform: 'telegram',
    action: 'status',
    credentials: { botToken },
  });
  return {
    username: d?.botUsername || 'bot',
    name: d?.botName || 'Telegram Bot',
  };
}
