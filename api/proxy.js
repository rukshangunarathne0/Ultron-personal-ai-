function isBlockedPrivateHost(hostname = '') {
  const h = hostname.trim().toLowerCase();
  if (
    !h ||
    h === 'localhost' ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h === '[::1]'
  ) {
    return true;
  }
  // IPv4 private / loopback / link-local ranges
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [_, a, b] = ipv4.map(Number);
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return true;
    }
  }
  return false;
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildReaderHtml(html, finalUrl) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? titleMatch[1].replace(/\s+/g, ' ').trim()
    : finalUrl;

  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '');

  // Extract headings and paragraphs
  const blocks = [];
  const blockRe = /<(h1|h2|h3|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = blockRe.exec(cleaned)) && blocks.length < 90) {
    const tag = m[1].toLowerCase();
    const text = m[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length >= (tag.startsWith('h') ? 4 : 28)) {
      blocks.push({ tag, text });
    }
  }

  const bodyHtml =
    blocks.length > 0
      ? blocks
          .map((b) =>
            b.tag.startsWith('h')
              ? `<${b.tag} style="color:#ffccd5;margin:18px 0 8px;font-family:Orbitron,sans-serif;font-size:${
                  b.tag === 'h1' ? '18px' : '14px'
                };">${escapeHtml(b.text)}</${b.tag}>`
              : `<p style="margin:0 0 11px;line-height:1.6;color:#f8e9ec;font-size:13.5px;">${escapeHtml(
                  b.text
                )}</p>`
          )
          .join('\n')
      : `<p style="color:#fca5a5;">Page uses dynamic client rendering — switch tab mode to PROXY or DIRECT above to interact with the full page.</p>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  body { background:#080104; color:#f8e9ec; font-family:system-ui,-apple-system,sans-serif; padding:16px 18px 40px; margin:0; }
  a { color:#fbbf24; }
  .src { font-family:monospace; font-size:11px; color:#fda4af; border-bottom:1px solid rgba(255,255,255,0.15); padding-bottom:8px; margin-bottom:14px; word-break:break-all; }
</style>
</head>
<body>
  <div class="src">ULTRON READER // ${escapeHtml(finalUrl)}</div>
  <h1 style="font-size:19px;color:#fff;margin:0 0 14px;">${escapeHtml(title)}</h1>
  ${bodyHtml}
  <script>
    try { window.parent.postMessage({ type: 'ULTRON_TAB_META', title: document.title, url: ${JSON.stringify(
      finalUrl
    )} }, '*'); } catch (e) {}
  </script>
</body>
</html>`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Explicitly allow embedding inside Ultron's in-app mini browser panel!
  res.removeHeader?.('X-Frame-Options');
  res.removeHeader?.('Content-Security-Policy');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  try {
    const reqUrlObj = new URL(req.url, 'http://localhost');
    const rawTarget = req.query?.url || reqUrlObj.searchParams.get('url') || '';
    const mode = req.query?.mode || reqUrlObj.searchParams.get('mode') || 'embed';

    if (!rawTarget) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end('<h3>Missing ?url= parameter</h3>');
    }

    const normalizedUrl = /^https?:\/\//i.test(rawTarget.trim())
      ? rawTarget.trim()
      : `https://${rawTarget.trim()}`;

    let parsed;
    try {
      parsed = new URL(normalizedUrl);
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end('<h3>Invalid URL</h3>');
    }

    if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedPrivateHost(parsed.hostname)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end('<h3>Blocked host</h3>');
    }

    const upstream = await fetch(parsed.toString(), {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(14000),
    });

    const finalUrl = upstream.url || parsed.toString();
    const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';

    // Binary / non-HTML passthrough (images, videos, PDFs, etc.)
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      const arrayBuf = await upstream.arrayBuffer();
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.end(Buffer.from(arrayBuf));
    }

    let html = await upstream.text();

    if (mode === 'reader') {
      const readerDoc = buildReaderHtml(html, finalUrl);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(readerDoc);
    }

    // Strip meta CSP / X-Frame-Options tags so framing works cleanly
    html = html
      .replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '')
      .replace(/<meta[^>]*http-equiv=["']?X-Frame-Options["']?[^>]*>/gi, '');

    const baseHref = new URL('.', finalUrl).toString();
    const bridgeSnippet = `
<base href="${escapeHtml(baseHref)}" />
<script>
(function(){
  try {
    window.parent.postMessage({
      type: 'ULTRON_TAB_META',
      title: document.title || ${JSON.stringify(new URL(finalUrl).hostname)},
      url: ${JSON.stringify(finalUrl)}
    }, '*');
    window.addEventListener('DOMContentLoaded', function() {
      window.parent.postMessage({
        type: 'ULTRON_TAB_META',
        title: document.title || ${JSON.stringify(new URL(finalUrl).hostname)},
        url: ${JSON.stringify(finalUrl)}
      }, '*');
    });
    document.addEventListener('click', function(ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!a) return;
      var rawHref = a.getAttribute('href') || '';
      if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) return;
      var abs = a.href;
      if (abs && /^https?:\\/\\//i.test(abs)) {
        ev.preventDefault();
        window.parent.postMessage({ type: 'ULTRON_TAB_NAVIGATE', url: abs }, '*');
      }
    }, true);
  } catch (e) {}
})();
</script>`;

    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head[^>]*>/i, (match) => `${match}${bridgeSnippet}`);
    } else {
      html = `${bridgeSnippet}\n${html}`;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(html);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(`<!doctype html>
<html><body style="background:#090104;color:#fecdd3;font-family:monospace;padding:20px;">
  <h3 style="color:#fb7185;margin-top:0;">ULTRON PROXY NOTICE</h3>
  <p>Could not proxy-render this target (${escapeHtml(msg)}).</p>
  <p>Switch tab mode to <b>DIRECT</b> above to try direct browser embedding, or tap <b>↗</b> to open externally.</p>
</body></html>`);
  }
}
