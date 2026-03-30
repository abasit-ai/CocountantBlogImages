// api/search.js — Vercel Serverless Function
// Secured with: origin check, rate limiting, query validation

// ── In-memory rate limiter ────────────────────────────────────────────────
const rateLimitMap = new Map();

function isRateLimited(ip) {
  const now    = Date.now();
  const window = 60 * 1000; // 1-minute window
  const limit  = 20;         // max 20 requests per IP per minute

  const entry = rateLimitMap.get(ip) || { count: 0, start: now };

  if (now - entry.start > window) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return false;
  }

  if (entry.count >= limit) return true;

  entry.count++;
  rateLimitMap.set(ip, entry);
  return false;
}

// ── Main handler ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  // 1. Only allow requests from your own Vercel domain
  //    Set ALLOWED_ORIGINS in Vercel env vars, e.g: https://your-project.vercel.app
  const origin = req.headers.origin || req.headers.referer || '';
  const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  const originAllowed = ALLOWED_ORIGINS.length === 0
    || ALLOWED_ORIGINS.some(a => origin.startsWith(a))
    || origin.includes('.vercel.app'); // allows all vercel preview URLs

  res.setHeader('Access-Control-Allow-Origin', originAllowed ? (origin || '*') : 'null');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (!originAllowed && ALLOWED_ORIGINS.length > 0) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  // 2. Rate limit by IP — prevents quota abuse
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
          || req.socket?.remoteAddress
          || 'unknown';

  if (isRateLimited(ip)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
  }

  // 3. Credentials — from Vercel env vars, never exposed to client
  const CLIENT_ID     = process.env.SHUTTERSTOCK_CLIENT_ID;
  const CLIENT_SECRET = process.env.SHUTTERSTOCK_CLIENT_SECRET;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({ error: 'Server credentials not configured' });
  }

  // 4. Validate and sanitise query
  const { query } = req.query;

  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Missing query parameter' });
  }

  if (query.length > 200) {
    return res.status(400).json({ error: 'Query too long' });
  }

  // Strip HTML tags to prevent injection
  const safeQuery = query.trim().replace(/<[^>]*>/g, '').substring(0, 200);

  // 5. Forward to Shutterstock — credentials never leave the server
  const auth   = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const params = new URLSearchParams({
    query:       safeQuery,
    per_page:    12,
    sort:        'popular',
    orientation: 'horizontal',
    image_type:  'photo',
  });

  try {
    const sstk = await fetch(
      `https://api.shutterstock.com/v2/images/search?${params}`,
      { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } }
    );

    const data = await sstk.json();

    if (!sstk.ok) {
      return res.status(sstk.status).json({ error: data.message || 'Shutterstock error' });
    }

    // 6. Return only what the UI needs — strip all other metadata
    const results = (data.data || [])
      .map(item => ({
        id:          item.id,
        description: item.description,
        preview:     item.assets?.preview?.url
                  || item.assets?.small_thumb?.url
                  || item.assets?.preview_1000?.url
                  || null,
      }))
      .filter(r => r.preview);

    return res.status(200).json({ results, total: data.total_count });

  } catch (err) {
    console.error('Proxy error:', err.message);
    return res.status(500).json({ error: 'Request failed' });
  }
}
