import {
  ChatMessage,
  SearchBundle,
  UltronBrowserTab,
  UltronBrowserTabKind,
  UltronBrowserViewMode,
} from '../types';

const KNOWN_SITE_SHORTCUTS: Record<string, { url: string; title: string }> = {
  google: { url: 'https://www.google.com/webhp?igu=1', title: 'Google' },
  wikipedia: { url: 'https://en.wikipedia.org', title: 'Wikipedia' },
  wiki: { url: 'https://en.wikipedia.org', title: 'Wikipedia' },
  github: { url: 'https://github.com', title: 'GitHub' },
  reddit: { url: 'https://old.reddit.com', title: 'Reddit' },
  youtube: { url: 'https://www.youtube.com', title: 'YouTube' },
  hackernews: { url: 'https://news.ycombinator.com', title: 'Hacker News' },
  'hacker news': { url: 'https://news.ycombinator.com', title: 'Hacker News' },
  bbc: { url: 'https://www.bbc.com/news', title: 'BBC News' },
  'bbc news': { url: 'https://www.bbc.com/news', title: 'BBC News' },
  cnn: { url: 'https://lite.cnn.com', title: 'CNN' },
  reuters: { url: 'https://www.reuters.com', title: 'Reuters' },
  stackoverflow: { url: 'https://stackoverflow.com', title: 'Stack Overflow' },
  'stack overflow': { url: 'https://stackoverflow.com', title: 'Stack Overflow' },
  mdn: { url: 'https://developer.mozilla.org', title: 'MDN Web Docs' },
  arxiv: { url: 'https://arxiv.org', title: 'arXiv' },
  npm: { url: 'https://www.npmjs.com', title: 'npm' },
  imdb: { url: 'https://www.imdb.com', title: 'IMDb' },
  archive: { url: 'https://archive.org', title: 'Internet Archive' },
  nasa: { url: 'https://www.nasa.gov', title: 'NASA' },
  spacex: { url: 'https://www.spacex.com', title: 'SpaceX' },
  vercel: { url: 'https://vercel.com', title: 'Vercel' },
};

const IMAGE_EXT_RE = /\.(?:jpe?g|png|gif|webp|avif|svg|bmp)(?:[?#].*)?$/i;
const DIRECT_VIDEO_EXT_RE = /\.(?:mp4|webm|ogg|mov|m4v|m3u8)(?:[?#].*)?$/i;

export function getProxyEndpointBase(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // Arena preview sandboxes restrict server-side outbound hosts; route proxy via deployed Vercel function!
    if (host.endsWith('.e2b.app')) {
      return 'https://ultron-personal-ai.vercel.app/api/proxy';
    }
  }
  return '/api/proxy';
}

export function buildProxiedWebUrl(targetUrl: string, mode: 'embed' | 'reader' = 'embed'): string {
  const base = getProxyEndpointBase();
  return `${base}?url=${encodeURIComponent(targetUrl)}&mode=${mode}`;
}

export function extractYouTubeEmbedUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    let videoId: string | null = null;
    if (host === 'youtu.be') {
      videoId = u.pathname.slice(1).split('/')[0] || null;
    } else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      if (u.pathname === '/watch') {
        videoId = u.searchParams.get('v');
      } else if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/')) {
        videoId = u.pathname.split('/')[2] || null;
      }
    }
    if (videoId && /^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
      return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
    }
  } catch {
    // ignore
  }
  return null;
}

export function extractVideoEmbedInfo(rawUrl: string): {
  isVideo: boolean;
  isDirectVideoFile: boolean;
  embedUrl?: string;
} {
  const yt = extractYouTubeEmbedUrl(rawUrl);
  if (yt) {
    return { isVideo: true, isDirectVideoFile: false, embedUrl: yt };
  }
  if (DIRECT_VIDEO_EXT_RE.test(rawUrl)) {
    return { isVideo: true, isDirectVideoFile: true, embedUrl: rawUrl };
  }
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) {
        return {
          isVideo: true,
          isDirectVideoFile: false,
          embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1`,
        };
      }
    }
    if (host.endsWith('dailymotion.com') && u.pathname.startsWith('/video/')) {
      const id = u.pathname.split('/')[2];
      if (id) {
        return {
          isVideo: true,
          isDirectVideoFile: false,
          embedUrl: `https://www.dailymotion.com/embed/video/${id}?autoplay=1`,
        };
      }
    }
  } catch {
    // ignore
  }
  return { isVideo: false, isDirectVideoFile: false };
}

export function createBrowserTabObject(params: {
  url: string;
  kind?: UltronBrowserTabKind;
  title?: string;
  embedUrl?: string;
  sourceUrl?: string;
  viewMode?: UltronBrowserViewMode;
}): UltronBrowserTab {
  let cleanInput = params.url.trim();
  const shortcut = KNOWN_SITE_SHORTCUTS[cleanInput.toLowerCase()];
  if (shortcut) {
    cleanInput = shortcut.url;
  } else if (!/^https?:\/\//i.test(cleanInput) && !cleanInput.startsWith('data:')) {
    cleanInput = `https://${cleanInput}`;
  }

  let kind: UltronBrowserTabKind = params.kind || 'web';
  let embedUrl = params.embedUrl;

  if (!params.kind) {
    if (IMAGE_EXT_RE.test(cleanInput)) {
      kind = 'image';
    } else {
      const vidInfo = extractVideoEmbedInfo(cleanInput);
      if (vidInfo.isVideo) {
        kind = 'video';
        embedUrl = embedUrl || vidInfo.embedUrl;
      }
    }
  } else if (kind === 'video' && !embedUrl) {
    const vidInfo = extractVideoEmbedInfo(cleanInput);
    embedUrl = vidInfo.embedUrl;
  }

  let defaultTitle = params.title?.trim() || shortcut?.title || '';
  if (!defaultTitle) {
    try {
      const parsed = new URL(cleanInput);
      defaultTitle = parsed.hostname.replace(/^www\./, '');
    } catch {
      defaultTitle = cleanInput.slice(0, 28);
    }
  }

  // Google igu=1 supports direct framing natively; most external websites work best via proxy!
  let defaultViewMode: UltronBrowserViewMode = params.viewMode || 'proxy';
  if (/google\.com\/webhp\?igu=1/i.test(cleanInput)) {
    defaultViewMode = 'direct';
  }

  return {
    id: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    kind,
    url: cleanInput,
    embedUrl,
    sourceUrl: params.sourceUrl,
    title: defaultTitle.slice(0, 48),
    viewMode: defaultViewMode,
    history: [cleanInput],
    createdAt: new Date().toISOString(),
  };
}

function parseOrdinalIndex(text: string): number {
  const low = text.toLowerCase();
  if (/\b(second|2nd|#2|number\s*2|two)\b/.test(low)) return 1;
  if (/\b(third|3rd|#3|number\s*3|three)\b/.test(low)) return 2;
  if (/\b(fourth|4th|#4|number\s*4|four)\b/.test(low)) return 3;
  if (/\b(fifth|5th|#5|number\s*5|five)\b/.test(low)) return 4;
  const numMatch = low.match(/\b(?:result|site|link|image|photo|pic|video|vid)\s*#?(\d+)\b/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    if (n >= 1) return n - 1;
  }
  return 0;
}

/**
 * Resolves natural-language commands like:
 * - "open wikipedia.org" / "open https://github.com" / "open reddit in a tab"
 * - "open this website" / "open the first site" / "open second link"
 * - "open the first photo" / "open second video" / "play this video inside ultron"
 * - "open spacex website" (returns siteSearchQuery so Brain fetches top site & opens it!)
 * - "close tab" / "close all tabs"
 */
export function detectInAppBrowserIntent(params: {
  userText: string;
  searchBundle?: SearchBundle | null;
  recentChat?: ChatMessage[];
}): {
  openTab?: {
    url: string;
    kind?: UltronBrowserTabKind;
    title?: string;
    embedUrl?: string;
    sourceUrl?: string;
  };
  closeTabTarget?: string;
  siteSearchQueryToOpen?: string;
} {
  const { userText, searchBundle, recentChat = [] } = params;
  const trimmed = userText.trim();
  const low = trimmed.toLowerCase();

  // Do NOT hijack WhatsApp / Telegram / Command Details / Mobile View commands!
  if (
    /\b(whatsapp|whats\s*app|telegram|command\s+details?|command\s+panel|mobile\s*view|desktop\s*view|voice\s*setup)\b/i.test(
      low
    )
  ) {
    return {};
  }

  // 1. Close tab(s)
  if (/\b(close|shut|exit)\b.*\b(all\s+)?(tabs?|browser\s*panel|web\s*panel|mini\s*panel)\b/i.test(low)) {
    return {
      closeTabTarget: /\ball\b/i.test(low) ? '*' : 'active',
    };
  }

  const hasOpenVerb =
    /\b(open(?:\s+up)?|launch|load|browse(?:\s+to)?|visit|go\s+to|play|view|watch)\b/i.test(low);
  if (!hasOpenVerb) return {};

  // Don't treat "open google and search for X" as just opening blank google.com!
  if (
    /\bopen\s+google\s+(?:and\s+)?(?:search|find|look|get|show)\b/i.test(low) ||
    /\bsearch\s+(?:on\s+|from\s+|in\s+)?google\b/i.test(low)
  ) {
    return {};
  }

  // 2. Explicit http(s):// URL or domain.tld in the user's message!
  const explicitUrlMatch = trimmed.match(/https?:\/\/[^\s<>")]+/i);
  if (explicitUrlMatch) {
    const rawUrl = explicitUrlMatch[0].replace(/[.,;!?]+$/, '');
    return { openTab: { url: rawUrl } };
  }

  const bareDomainMatch = trimmed.match(
    /\b([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|org|net|io|ai|app|dev|co|gov|edu|lk|uk|tv|me|gg|xyz|info|news)(?:\/[^\s<>")]*)?)\b/i
  );
  if (bareDomainMatch) {
    const dom = bareDomainMatch[1].replace(/[.,;!?]+$/, '');
    return { openTab: { url: `https://${dom}` } };
  }

  const idx = parseOrdinalIndex(low);

  // 3. Reference to an Image / Photo from search results ("open this image", "open the first photo")
  if (
    /\b(this|that|first|1st|second|2nd|third|3rd|fourth|4th|\d+)\s+(?:image|img|photo|pic|picture)\b/i.test(
      low
    ) ||
    /\bopen\s+(?:the\s+)?(?:image|photo|picture)\b/i.test(low)
  ) {
    if (searchBundle && searchBundle.images.length > 0) {
      const picked = searchBundle.images[Math.min(idx, searchBundle.images.length - 1)];
      return {
        openTab: {
          url: picked.imageUrl,
          kind: 'image',
          title: picked.title,
          sourceUrl: picked.sourceUrl,
        },
      };
    }
  }

  // 4. Reference to a Video from search results ("open/play this video", "open first video")
  if (
    /\b(this|that|first|1st|second|2nd|third|3rd|fourth|4th|\d+)\s+(?:video|vid|clip)\b/i.test(
      low
    ) ||
    /\b(?:open|play|watch)\s+(?:the\s+)?(?:video|vid|clip)\b/i.test(low)
  ) {
    if (searchBundle && searchBundle.videos.length > 0) {
      const picked = searchBundle.videos[Math.min(idx, searchBundle.videos.length - 1)];
      return {
        openTab: {
          url: picked.watchUrl,
          embedUrl: picked.embedUrl,
          kind: 'video',
          title: picked.title,
        },
      };
    }
  }

  // 5. Reference to "this website" / "first website" / "second link" / "that site"
  if (
    /\b(this|that|the|first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|\d+)\s+(?:web\s*site|site|link|page|url|result|tab)\b/i.test(
      low
    )
  ) {
    if (searchBundle && searchBundle.web.length > 0) {
      const picked = searchBundle.web[Math.min(idx, searchBundle.web.length - 1)];
      return {
        openTab: {
          url: picked.url,
          kind: 'web',
          title: picked.title,
        },
      };
    }
    // Check recent chat messages for the latest shared URL!
    for (let i = recentChat.length - 1; i >= 0; i--) {
      const m = recentChat[i].content.match(/https?:\/\/[^\s<>")]+/i);
      if (m) {
        return {
          openTab: {
            url: m[0].replace(/[.,;!?]+$/, ''),
          },
        };
      }
    }
  }

  // 6. Known site shortcuts ("open wikipedia", "open github", "open youtube", "open google in a tab")
  const cleanedTarget = low
    .replace(
      /^.*?\b(?:open(?:\s+up)?|launch|load|browse(?:\s+to)?|visit|go\s+to)\s+(?:the\s+|a\s+)?/,
      ''
    )
    .replace(
      /\s+(?:in\s+(?:a\s+)?(?:new\s+)?tab|inside\s+(?:the\s+)?(?:ultron(?:\s+web)?|web|panel|app)|web\s*site|site|page|tab|panel|please|now)\b.*$/g,
      ''
    )
    .replace(/[?.!]+$/, '')
    .trim();

  if (cleanedTarget && KNOWN_SITE_SHORTCUTS[cleanedTarget]) {
    return {
      openTab: {
        url: KNOWN_SITE_SHORTCUTS[cleanedTarget].url,
        kind: 'web',
        title: KNOWN_SITE_SHORTCUTS[cleanedTarget].title,
      },
    };
  }

  // 7. Named website request like "open spacex website" / "open marvel website in a tab"
  if (
    cleanedTarget &&
    cleanedTarget.length >= 2 &&
    cleanedTarget.length <= 50 &&
    /\b(web\s*site|site|web\s*page|in\s+(?:a\s+)?tab|inside\s+(?:the\s+)?(?:ultron|web|panel))\b/i.test(
      low
    )
  ) {
    return {
      siteSearchQueryToOpen: cleanedTarget,
    };
  }

  return {};
}
