// Node.js runtime — MongoDB requires TCP
import { getDb, COLL } from './_mongodb.js';

const CACHE_TTL_SEC = 1800; // 30 min

function hashQuery(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36);
}

async function getCache(db, key) {
  try {
    const doc = await db.collection(COLL.CACHE).findOne({ _id: key, expiresAt: { $gt: new Date() } });
    return doc?.result ?? null;
  } catch { return null; }
}

async function setCache(db, key, result) {
  try {
    const expiresAt = new Date(Date.now() + CACHE_TTL_SEC * 1000);
    await db.collection(COLL.CACHE).updateOne(
      { _id: key },
      { $set: { result, expiresAt } },
      { upsert: true }
    );
  } catch {}
}

async function runQuery(apiKey, query) {
  const r = await fetch('https://us.posthog.com/api/projects/399417/query/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  const j = await r.json();
  return { columns: j.columns, results: j.results, error: j.detail || null };
}

async function cachedQuery(db, apiKey, query) {
  const clean = query.replace(/\s+/g, ' ').trim();
  const key = 'q::' + hashQuery(clean);
  const cached = await getCache(db, key);
  if (cached) return { ...cached, _cached: true };
  const result = await runQuery(apiKey, clean);
  if (!result.error) setCache(db, key, result);
  return result;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'POSTHOG_API_KEY not configured' }); return; }

  let db = null;
  try { db = await getDb(); } catch {}

  let body;
  try { body = await readBody(req); }
  catch { res.status(400).json({ error: 'Invalid JSON' }); return; }

  // Batch mode: [{id, query}, ...]
  if (Array.isArray(body)) {
    const results = await Promise.all(
      body.map(async ({ id, query }) => {
        try {
          const r = db ? await cachedQuery(db, apiKey, query) : await runQuery(apiKey, query);
          return { id, ...r };
        } catch (e) { return { id, error: e.message }; }
      })
    );
    res.status(200).json(results);
    return;
  }

  // Single mode: {query}
  const { query } = body || {};
  if (!query) { res.status(400).json({ error: 'Missing query' }); return; }

  try {
    const r = db ? await cachedQuery(db, apiKey, query) : await runQuery(apiKey, query);
    if (r.error && !r.results) { res.status(400).json({ error: r.error }); return; }
    res.status(200).json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
