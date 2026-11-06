/**
 * Vercel Serverless Function: /api/search
 * Gives Ultron real-time Web Search, News, Images (Openverse + Wikimedia + DDG),
 * Playable YouTube Videos, and Live URL Reading with zero API keys required.
 */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function decodeHtmlEntities(str = '') {
  return str
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
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '));
}

async function searchDuckDuckGoWeb(query) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const results = [];
    const blocks = html.split(/class="result__body"/i).slice(1, 10);

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

function snipTagsSafe(s) {
  return stripTags(s).slice(0, 280);
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
    const items = xml.split('<item>').slice(1, 7);
    const out = [];
    for (const item of items) {
      const title = (item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
      const link = item.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim() || '';
      const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() || '';
      const source = item.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || 'Google News';
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

async function searchOpenverseImages(query) {
  try {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(
      query
    )}&page_size=10`;
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
    )}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json&origin=*`;
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

async function searchDuckDuckGoImages(query) {
  try {
    const tokenRes = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
      {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(4500),
      }
    );
    const tokenHtml = await tokenRes.text();
    const vqd =
      tokenHtml.match(/vqd=['"]([^'"]+)['"]/)?.[1] ||
      tokenHtml.match(/vqd=([0-9-]+)/)?.[1];
    if (!vqd) return [];

    const imgRes = await fetch(
      `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(
        query
      )}&vqd=${encodeURIComponent(vqd)}&f=,,,&p=1`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          Referer: 'https://duckduckgo.com/',
        },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!imgRes.ok) return [];
    const data = await imgRes.json();
    return (data?.results || []).slice(0, 10).map((r) => ({
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
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const jsonMatch = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
    if (!jsonMatch) {
      // Regex fallback for videoIds if ytInitialData layout shifts
      const ids = Array.from(new Set(Array.from(html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)).map((m) => m[1]))).slice(0, 6);
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
        if (videos.length >= 6) break;
      }
      if (videos.length >= 6) break;
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
    const {
      query = '',
      mode = 'all', // 'all' | 'web' | 'images' | 'videos' | 'read_url'
      targetUrl = '',
    } = req.body || {};

    if (mode === 'read_url' && targetUrl) {
      const page = await fetchReadableWebpage(String(targetUrl));
      return res.status(200).json({ page });
    }

    const cleanQuery = String(query).trim();
    if (!cleanQuery) {
      return res.status(400).json({ error: 'Missing search query' });
    }

    const wantWeb = mode === 'all' || mode === 'web';
    const wantImages = mode === 'all' || mode === 'images';
    const wantVideos = mode === 'all' || mode === 'videos';

    const [ddgWeb, newsRss, wikiWeb, ddgImgs, openverseImgs, wikiImgs, ytVideos] =
      await Promise.all([
        wantWeb ? searchDuckDuckGoWeb(cleanQuery) : Promise.resolve([]),
        wantWeb ? searchGoogleNewsRss(cleanQuery) : Promise.resolve([]),
        wantWeb ? searchWikipedia(cleanQuery) : Promise.resolve([]),
        wantImages ? searchDuckDuckGoImages(cleanQuery) : Promise.resolve([]),
        wantImages ? searchOpenverseImages(cleanQuery) : Promise.resolve([]),
        wantImages ? searchWikimediaImages(cleanQuery) : Promise.resolve([]),
        wantVideos ? searchYouTubeVideos(cleanQuery) : Promise.resolve([]),
      ]);

    // Deduplicate web results by URL
    const seenUrls = new Set();
    const web = [];
    for (const item of [...ddgWeb, ...newsRss, ...wikiWeb]) {
      if (!item?.url || seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);
      web.push(item);
      if (web.length >= 10) break;
    }

    // Deduplicate images
    const seenImg = new Set();
    const images = [];
    for (const img of [...ddgImgs, ...openverseImgs, ...wikiImgs]) {
      const key = img?.imageUrl || img?.thumbnailUrl;
      if (!key || seenImg.has(key)) continue;
      seenImg.add(key);
      images.push(img);
      if (images.length >= 12) break;
    }

    return res.status(200).json({
      query: cleanQuery,
      web,
      images,
      videos: ytVideos.slice(0, 6),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Search proxy error',
    });
  }
}
