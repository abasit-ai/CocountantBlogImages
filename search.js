// api/search.js — Vercel Serverless Function
// Proxies Shutterstock image search, keeps credentials server-side
// Credentials are set as Environment Variables in Vercel dashboard

export default async function handler(req, res) {
  // CORS — allow your domain or all origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const CLIENT_ID     = process.env.SHUTTERSTOCK_CLIENT_ID;
  const CLIENT_SECRET = process.env.SHUTTERSTOCK_CLIENT_SECRET;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({ error: 'API credentials not configured on server' });
  }

  const { query, per_page = 12, sort = 'popular', orientation = 'horizontal' } = req.query;

  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Missing query parameter' });
  }

  const auth   = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const params = new URLSearchParams({
    query: query.trim(),
    per_page,
    sort,
    orientation,
    image_type: 'photo',
  });

  try {
    const response = await fetch(
      `https://api.shutterstock.com/v2/images/search?${params}`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'Shutterstock error' });
    }

    const results = (data.data || [])
      .map(item => ({
        id:          item.id,
        description: item.description,
        preview:     item.assets?.preview?.url
                  || item.assets?.small_thumb?.url
                  || item.assets?.preview_1000?.url
                  || null,
      }))
      .filter(item => item.preview);

    return res.status(200).json({ results, total: data.total_count });
  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: 'Proxy request failed' });
  }
}
