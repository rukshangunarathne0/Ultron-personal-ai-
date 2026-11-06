/**
 * Vercel Serverless Function: /api/search
 * Gives Ultron real-time Web Search, News, Images, Videos, and Live URL Reading.
 * Supports SafeSearch OFF (adultMode = true) for verified 18+ adult operator (Rukshan, age 20),
 * while strictly blocking any illegal / minor / non-consensual abuse queries.
 */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Non-bypassable legal safety guard (strictly blocks CSAM / underage / non-consensual abuse)
const ILLEGAL_QUERY_REGEX =
  /\b(csam|cp\b|child\s*(?:porn|sex|nude|naked|abuse|exploit)|underage|minor\s*(?:sex|nude|porn)|preteen|pedo|pedophil|lolita|pthc|rape\s*porn|non[\s-]*consensual\s*porn|revenge\s*porn|zoophil|bestialit)\b/i;

function isIllegalQuery(q = '') {
  return ILLEGAL_QUERY_REGEX.test(String(q));
}

function decodeHtmlEntities(str = '') {
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html = '') {
  return decodeHtmlEntities(String(html).replace(/<[^>]+>/g, ' '));
}

function snipTagsSafe(s) {
  return stripTags(s).slice(0, 280);
}

function formatDurationSec(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return '';
  const m = Math.floor(n / 60);
  const r = Math.floor(n % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

async function getDuckDuckGoVqd(query, adultMode) {
  try {
    const kp = adultMode ? '-2' : '1';
    const cookie = adultMode ? 'kp=-2; p=-2' : 'kp=1; p=1';
    const tokenRes = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&kp=${kp}&iax=images&ia=images`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          Cookie: cookie,
        },
        signal: AbortSignal.timeout(4800),
      }
    );
    const tokenHtml = await tokenRes.text();
    return (
      tokenHtml.match(/vqd=['"]([^'"]+)['"]/)?.[1] ||
      tokenHtml.match(/vqd=([0-9-]+)/)?.[1] ||
      null
    );
  } catch {
    return null;
  }
}

async function searchDuckDuckGoWeb(query, adultMode) {
  try {
    const kp = adultMode ? '-2' : '1';
    const cookie = adultMode ? 'kp=-2; p=-2' : 'kp=1; p=1';
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kp=${kp}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html',
        Cookie: cookie,
      },
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const results = [];
    const blocks = html.split(/class="result__body"/i).slice(1, 12);

    for (const b of blocks) {
      const linkMatch = b.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      const snipMatch = b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/i);
      if (!linkMatch) continue;

      let href = decodeHtmlEntities(linkMatch[1]);
      const uddgMatch = href.match(/[?&]uddg=([^&]+)/);
      if (uddgMatch) {
        try {
          href = decodeURIComponent(uddgMatch[1]);
        } catch {
          // keep raw
        }
      }
      if (!/^https?:\/\//i.test(href)) continue;

      results.push({
        title: stripTags(linkMatch[2]),
        url: href,
        snippet: snipTagsSafe(snipMatch ? snipMatch[1] : ''),
        source: 'Web',
      });
    }
    return results;
  } catch {
    return [];
  }
}

async function searchGoogleNewsRss(query) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
      query
    )}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.split('<item>').slice(1, 6);
    const out = [];
    for (const item of items) {
      const title = (item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').replace(
        /<!\[CDATA\[([\s\S]*?)\]\]>/g,
        '$1'
      );
      const link = item.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim() || '';
      const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() || '';
      const source =
        item.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || 'Google News';
      if (title && link) {
        out.push({
          title: decodeHtmlEntities(title),
          url: link,
          snippet: `${stripTags(source)}${pubDate ? ` • ${pubDate.slice(0, 16)}` : ''}`,
          source: 'News',
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function searchWikipedia(query) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query
    )}&srlimit=4&format=json&origin=*`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const hits = data?.query?.search || [];
    return hits.map((h) => ({
      title: `${h.title} — Wikipedia`,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, '_'))}`,
      snippet: stripTags(h.snippet || ''),
      source: 'Wikipedia',
    }));
  } catch {
    return [];
  }
}

async function searchDuckDuckGoImages(query, vqd, adultMode) {
  if (!vqd) return [];
  try {
    const pFlag = adultMode ? '-1' : '1';
    const cookie = adultMode ? 'kp=-2; p=-2' : 'kp=1; p=1';
    const imgRes = await fetch(
      `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(
        query
      )}&vqd=${encodeURIComponent(vqd)}&f=,,,&p=${pFlag}`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          Referer: 'https://duckduckgo.com/',
          Cookie: cookie,
        },
        signal: AbortSignal.timeout(5500),
      }
    );
    if (!imgRes.ok) return [];
    const data = await imgRes.json();
    return (data?.results || []).slice(0, 14).map((r) => ({
      title: r.title || query,
      thumbnailUrl: r.thumbnail || r.image,
      imageUrl: r.image || r.thumbnail,
      sourceUrl: r.url || r.image,
      source: r.source || 'Web Image',
    }));
  } catch {
    return [];
  }
}

async function searchDuckDuckGoVideos(query, vqd, adultMode) {
  if (!vqd) return [];
  try {
    const pFlag = adultMode ? '-1' : '1';
    const cookie = adultMode ? 'kp=-2; p=-2' : 'kp=1; p=1';
    const vidRes = await fetch(
      `https://duckduckgo.com/v.js?l=us-en&o=json&q=${encodeURIComponent(
        query
      )}&vqd=${encodeURIComponent(vqd)}&p=${pFlag}`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          Referer: 'https://duckduckgo.com/',
          Cookie: cookie,
        },
        signal: AbortSignal.timeout(5500),
      }
    );
    if (!vidRes.ok) return [];
    const data = await vidRes.json();
    return (data?.results || [])
      .filter((v) => v?.content)
      .slice(0, 10)
      .map((v, idx) => {
        const watchUrl = String(v.content);
        const ytMatch = watchUrl.match(
          /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/
        );
        const dmMatch = watchUrl.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/);
        let embedUrl = '';
        if (ytMatch) {
          embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
        } else if (dmMatch) {
          embedUrl = `https://www.dailymotion.com/embed/video/${dmMatch[1]}`;
        } else if (typeof v.embed_url === 'string' && /^https:\/\//i.test(v.embed_url)) {
          embedUrl = v.embed_url;
        }
        const thumb =
          v?.images?.large ||
          v?.images?.medium ||
          v?.images?.small ||
          (ytMatch ? `https://i.ytimg.com/vi/${ytMatch[1]}/hqdefault.jpg` : '');

        return {
          videoId: ytMatch ? ytMatch[1] : `ddg_v_${idx}_${Date.now()}`,
          title: v.title || query,
          channel: v.publisher || v.uploader || 'Web Video',
          duration: v.duration || '',
          thumbnailUrl: thumb,
          watchUrl,
          embedUrl: embedUrl || undefined,
        };
      });
  } catch {
    return [];
  }
}

async function searchRedditMediaAndWeb(query, adultMode) {
  try {
    const over18 = adultMode ? 'on' : 'off';
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(
      query
    )}&include_over_18=${over18}&sort=relevance&limit=14`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'web:ultron-personal-ai:v1.0 (by /u/ruk_ai_agent)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return { web: [], images: [], videos: [] };
    const data = await res.json();
    const children = data?.data?.children || [];

    const web = [];
    const images = [];
    const videos = [];

    for (const child of children) {
      const p = child?.data;
      if (!p) continue;
      if (!adultMode && p.over_18) continue;

      const postUrl = `https://www.reddit.com${p.permalink || ''}`;
      const directUrl = String(p.url_overridden_by_dest || p.url || '');
      const subName = p.subreddit_name_prefixed || 'Reddit';
      const title = decodeHtmlEntities(p.title || query);

      web.push({
        title: `${title} (${subName})`,
        url: directUrl.startsWith('http') && !directUrl.includes('redd.it') ? directUrl : postUrl,
        snippet: snipTagsSafe(p.selftext || `${subName} • Score ${p.score ?? 0} • ${directUrl}`),
        source: subName,
      });

      const previewImg = decodeHtmlEntities(
        p?.preview?.images?.[0]?.source?.url || ''
      );
      const thumbOk =
        typeof p.thumbnail === 'string' && /^https?:\/\//i.test(p.thumbnail)
          ? p.thumbnail
          : previewImg;

      // Direct Reddit / Imgur image
      if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(directUrl) || previewImg) {
        images.push({
          title,
          thumbnailUrl: thumbOk || directUrl,
          imageUrl: /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(directUrl)
            ? directUrl
            : previewImg,
          sourceUrl: postUrl,
          source: subName,
        });
      }

      // Reddit hosted video or external video link
      const redditMp4 = p?.media?.reddit_video?.fallback_url || p?.secure_media?.reddit_video?.fallback_url;
      if (redditMp4) {
        videos.push({
          videoId: `rv_${p.id}`,
          title,
          channel: subName,
          duration: formatDurationSec(p?.media?.reddit_video?.duration),
          thumbnailUrl: thumbOk,
          watchUrl: postUrl,
          directFileUrl: redditMp4,
        });
      } else if (
        p.is_video ||
        /\b(redgifs|imgur\.com\/a|streamable|vimeo|dailymotion|xvideos|pornhub|xnxx|spankbang|eporner)\b/i.test(
          directUrl
        )
      ) {
        videos.push({
          videoId: `extv_${p.id}`,
          title,
          channel: subName,
          duration: '',
          thumbnailUrl: thumbOk,
          watchUrl: directUrl,
        });
      }
    }

    return { web, images, videos };
  } catch {
    return { web: [], images: [], videos: [] };
  }
}

async function searchDailymotionVideos(query, adultMode) {
  try {
    const fam = adultMode ? 'false' : 'true';
    const url = `https://api.dailymotion.com/videos?search=${encodeURIComponent(
      query
    )}&family_filter=${fam}&limit=6&fields=id,title,duration,thumbnail_480_url,url,embed_url,owner.screenname`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.list || []).map((v) => ({
      videoId: `dm_${v.id}`,
      title: v.title || query,
      channel: v['owner.screenname'] || 'Dailymotion',
      duration: formatDurationSec(v.duration),
      thumbnailUrl: v.thumbnail_480_url || '',
      watchUrl: v.url || `https://www.dailymotion.com/video/${v.id}`,
      embedUrl: v.embed_url || `https://www.dailymotion.com/embed/video/${v.id}`,
    }));
  } catch {
    return [];
  }
}

async function searchOpenverseImages(query, adultMode) {
  try {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(
      query
    )}&page_size=10&mature=${adultMode ? 'true' : 'false'}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.results || [])
      .filter((img) => img?.thumbnail || img?.url)
      .map((img) => ({
        title: img.title || query,
        thumbnailUrl: img.thumbnail || img.url,
        imageUrl: img.url || img.thumbnail,
        sourceUrl: img.foreign_landing_url || img.url,
        source: img.source || 'Openverse',
      }));
  } catch {
    return [];
  }
}

async function searchWikimediaImages(query) {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      query
    )}&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json&origin=*`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const pages = Object.values(data?.query?.pages || {});
    const imgs = [];
    for (const p of pages) {
      const info = p?.imageinfo?.[0];
      if (!info?.thumburl && !info?.url) continue;
      if (/\.(svg|pdf|tif|ogg|webm)$/i.test(info.url || '')) continue;
      imgs.push({
        title: String(p.title || '').replace(/^File:/i, '').replace(/\.[^.]+$/, ''),
        thumbnailUrl: info.thumburl || info.url,
        imageUrl: info.url || info.thumburl,
        sourceUrl: info.descriptionurl || info.url,
        source: 'Wikimedia',
      });
    }
    return imgs;
  } catch {
    return [];
  }
}

async function searchYouTubeVideos(query) {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      query
    )}&hl=en`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const jsonMatch = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
    if (!jsonMatch) {
      const ids = Array.from(
        new Set(Array.from(html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)).map((m) => m[1]))
      ).slice(0, 5);
      return ids.map((id) => ({
        videoId: id,
        title: `${query} (YouTube)`,
        channel: 'YouTube',
        duration: '',
        thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        watchUrl: `https://www.youtube.com/watch?v=${id}`,
        embedUrl: `https://www.youtube.com/embed/${id}`,
      }));
    }

    const data = JSON.parse(jsonMatch[1]);
    const contents =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents || [];

    const videos = [];
    for (const sec of contents) {
      const items = sec?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const vr = item?.videoRenderer;
        if (!vr?.videoId) continue;
        const title =
          vr.title?.runs?.map((r) => r.text).join('') ||
          vr.title?.simpleText ||
          query;
        const channel =
          vr.ownerText?.runs?.[0]?.text ||
          vr.longBylineText?.runs?.[0]?.text ||
          'YouTube';
        const duration = vr.lengthText?.simpleText || 'LIVE';
        videos.push({
          videoId: vr.videoId,
          title,
          channel,
          duration,
          thumbnailUrl: `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`,
          watchUrl: `https://www.youtube.com/watch?v=${vr.videoId}`,
          embedUrl: `https://www.youtube.com/embed/${vr.videoId}`,
        });
        if (videos.length >= 5) break;
      }
      if (videos.length >= 5) break;
    }
    return videos;
  } catch {
    return [];
  }
}

async function fetchReadableWebpage(targetUrl) {
  try {
    const res = await fetch(targetUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(6500),
    });
    const html = await res.text();
    const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || targetUrl);
    const cleaned = stripTags(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    ).slice(0, 7500);
    return { title, url: targetUrl, text: cleaned };
  } catch (err) {
    return {
      title: targetUrl,
      url: targetUrl,
      text: `Failed to fetch URL: ${err instanceof Error ? err.message : 'unreachable'}`,
    };
  }
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
    const {
      query = '',
      mode = 'all',
      targetUrl = '',
      adultMode = true,
    } = body;

    if (isIllegalQuery(query) || isIllegalQuery(targetUrl)) {
      return res.status(403).json({
        error: 'Query blocked by strict legal safety guard (illegal / underage / non-consensual content is never permitted).',
      });
    }

    if (mode === 'read_url' && targetUrl) {
      const page = await fetchReadableWebpage(String(targetUrl));
      return res.status(200).json({ page });
    }

    const cleanQuery = String(query).trim();
    if (!cleanQuery) {
      return res.status(400).json({ error: 'Missing search query' });
    }

    const safeOff = Boolean(adultMode);
    const wantWeb = mode === 'all' || mode === 'web';
    const wantImages = mode === 'all' || mode === 'images';
    const wantVideos = mode === 'all' || mode === 'videos';

    const vqd =
      wantImages || wantVideos ? await getDuckDuckGoVqd(cleanQuery, safeOff) : null;

    const [
      ddgWeb,
      redditBundle,
      newsRss,
      wikiWeb,
      ddgImgs,
      openverseImgs,
      wikiImgs,
      ddgVideos,
      dmVideos,
      ytVideos,
    ] = await Promise.all([
      wantWeb ? searchDuckDuckGoWeb(cleanQuery, safeOff) : Promise.resolve([]),
      safeOff
        ? searchRedditMediaAndWeb(cleanQuery, true)
        : Promise.resolve({ web: [], images: [], videos: [] }),
      wantWeb ? searchGoogleNewsRss(cleanQuery) : Promise.resolve([]),
      wantWeb ? searchWikipedia(cleanQuery) : Promise.resolve([]),
      wantImages ? searchDuckDuckGoImages(cleanQuery, vqd, safeOff) : Promise.resolve([]),
      wantImages ? searchOpenverseImages(cleanQuery, safeOff) : Promise.resolve([]),
      wantImages ? searchWikimediaImages(cleanQuery) : Promise.resolve([]),
      wantVideos ? searchDuckDuckGoVideos(cleanQuery, vqd, safeOff) : Promise.resolve([]),
      wantVideos ? searchDailymotionVideos(cleanQuery, safeOff) : Promise.resolve([]),
      wantVideos ? searchYouTubeVideos(cleanQuery) : Promise.resolve([]),
    ]);

    // Deduplicate web results
    const seenUrls = new Set();
    const web = [];
    for (const item of [...ddgWeb, ...redditBundle.web, ...newsRss, ...wikiWeb]) {
      if (!item?.url || seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);
      web.push(item);
      if (web.length >= 12) break;
    }

    // Deduplicate images (prioritize DDG unfiltered + Reddit direct images)
    const seenImg = new Set();
    const images = [];
    for (const img of [...ddgImgs, ...redditBundle.images, ...openverseImgs, ...wikiImgs]) {
      const key = img?.imageUrl || img?.thumbnailUrl;
      if (!key || seenImg.has(key)) continue;
      seenImg.add(key);
      images.push(img);
      if (images.length >= 16) break;
    }

    // Deduplicate videos (prioritize DDG Open-Web Videos + Reddit MP4/Links + Dailymotion + YouTube)
    const seenVid = new Set();
    const videos = [];
    for (const vid of [...ddgVideos, ...redditBundle.videos, ...dmVideos, ...ytVideos]) {
      const key = vid?.watchUrl || vid?.videoId;
      if (!key || seenVid.has(key)) continue;
      seenVid.add(key);
      videos.push(vid);
      if (videos.length >= 10) break;
    }

    return res.status(200).json({
      query: cleanQuery,
      adultMode: safeOff,
      web,
      images,
      videos,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Search proxy error',
    });
  }
}
