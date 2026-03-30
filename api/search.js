// api/search.js — Vercel Serverless Function
// CommonJS format — works on all Vercel Node.js runtimes without extra config
// Sources: Unsplash + Pexels (both free, no licensing costs)

// ── Rate limiter (in-memory) ───────────────────────────────────────────────
const rateLimitMap = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const WINDOW = 60 * 1000; // 1 minute
  const LIMIT  = 30;

  const entry = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > WINDOW) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return false;
  }
  if (entry.count >= LIMIT) return true;
  entry.count++;
  rateLimitMap.set(ip, entry);
  return false;
}

// ── Unsplash ───────────────────────────────────────────────────────────────
async function searchUnsplash(query, key) {
  try {
    const params = new URLSearchParams({
      query,
      per_page: 12,
      orientation: 'landscape',
      content_filter: 'high',
    });
    const r = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
      headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
    });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.results || []).map(img => ({
      id:          'u_' + img.id,
      source:      'Unsplash',
      description: img.alt_description || img.description || '',
      preview:     img.urls?.regular || img.urls?.small || null,
      author:      img.user?.name || '',
    })).filter(x => x.preview);
  } catch { return []; }
}

// ── Pexels ─────────────────────────────────────────────────────────────────
async function searchPexels(query, key) {
  try {
    const params = new URLSearchParams({
      query,
      per_page: 12,
      orientation: 'landscape',
    });
    const r = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: { Authorization: key },
    });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.photos || []).map(img => ({
      id:          'p_' + img.id,
      source:      'Pexels',
      description: img.alt || '',
      preview:     img.src?.large || img.src?.medium || null,
      author:      img.photographer || '',
    })).filter(x => x.preview);
  } catch { return []; }
}

// ── Handler ────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  // CORS
  const origin = req.headers.origin || req.headers.referer || '';
  const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(o => o.trim()).filter(Boolean);
  const allowed = ALLOWED.length === 0
    || ALLOWED.some(a => origin.startsWith(a))
    || origin.includes('.vercel.app');

  res.setHeader('Access-Control-Allow-Origin', allowed ? (origin || '*') : 'null');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (!allowed && ALLOWED.length > 0) return res.status(403).json({ error: 'Forbidden' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
          || 'unknown';
  if (isRateLimited(ip)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
  }

  // Credentials
  const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;
  const PEXELS_KEY   = process.env.PEXELS_API_KEY;

  if (!UNSPLASH_KEY && !PEXELS_KEY) {
    return res.status(500).json({ error: 'No API keys configured. Add UNSPLASH_ACCESS_KEY or PEXELS_API_KEY in Vercel environment variables.' });
  }

  // Validate query
  const { query } = req.query;
  if (!query || !query.trim()) return res.status(400).json({ error: 'Missing query' });
  const safeQuery = query.trim().replace(/<[^>]*>/g, '').substring(0, 200);

  // Search both sources in parallel
  const [unsplash, pexels] = await Promise.all([
    UNSPLASH_KEY ? searchUnsplash(safeQuery, UNSPLASH_KEY) : Promise.resolve([]),
    PEXELS_KEY   ? searchPexels(safeQuery,   PEXELS_KEY)   : Promise.resolve([]),
  ]);

  // Interleave results
  const results = [];
  const max = Math.max(unsplash.length, pexels.length);
  for (let i = 0; i < max; i++) {
    if (unsplash[i]) results.push(unsplash[i]);
    if (pexels[i])   results.push(pexels[i]);
  }

  return res.status(200).json({ results: results.slice(0, 20) });
};
