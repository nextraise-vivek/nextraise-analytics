export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.POSTHOG_API_KEY;
  if (!key) return res.status(500).json({ error: 'POSTHOG_API_KEY not configured' });

  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: 'Missing query' });

  try {
    const r = await fetch('https://us.posthog.com/api/projects/399417/query/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
      },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
    });

    const j = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: j.detail || j.error || 'PostHog API error' });
    }

    return res.json({ columns: j.columns, results: j.results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
