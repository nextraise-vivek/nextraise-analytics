// Node.js runtime — uses MongoDB for server-side query caching
import { getDb, COLL } from './_mongodb.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const CACHE_TTL_SEC = 300; // 5 minutes

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
  if (!result.error) setCache(db, key, result); // fire-and-forget
  return result;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });

  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'POSTHOG_API_KEY not configured' }), { status: 500, headers: CORS });

  // Get DB (non-blocking — if unavailable, queries still run uncached)
  let db = null;
  try { db = await getDb(); } catch {}

  const body = await req.json();

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
    return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  // Single mode: {query}
  const { query } = body || {};
  if (!query) return new Response(JSON.stringify({ error: 'Missing query' }), { status: 400, headers: CORS });

  try {
    const r = db ? await cachedQuery(db, apiKey, query) : await runQuery(apiKey, query);
    if (r.error && !r.results) return new Response(JSON.stringify({ error: r.error }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
    return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json', ...CORS } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}
