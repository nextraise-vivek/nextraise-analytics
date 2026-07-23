// Node.js runtime — MongoDB requires TCP, not supported in Edge Runtime
import { getDb, COLL } from './_mongodb.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  let db;
  try { db = await getDb(); } catch (e) {
    return json({ error: 'DB unavailable: ' + e.message }, 503);
  }

  const url = new URL(req.url);

  // ── GET /api/inf-data?type=all  ──────────────────────────────────────
  // Returns {pay:{rid:{}}, hist:{rid:[]}, bank:{rid:{}}, social:{rid:{}}}
  if (req.method === 'GET') {
    const type = url.searchParams.get('type') || 'all';
    try {
      if (type === 'all') {
        const [infDocs, histDocs] = await Promise.all([
          db.collection(COLL.INF).find({}).toArray(),
          db.collection(COLL.HIST).find({}).toArray(),
        ]);
        const pay = {}, bank = {}, social = {};
        infDocs.forEach(d => {
          const rid = d._id;
          if (d.pay)    pay[rid]    = d.pay;
          if (d.bank)   bank[rid]   = d.bank;
          if (d.social) social[rid] = d.social;
        });
        const hist = {};
        histDocs.forEach(d => { hist[d._id] = d.entries || []; });
        return json({ pay, hist, bank, social });
      }
      return json({ error: 'Unknown type' }, 400);
    } catch (e) { return json({ error: e.message }, 500); }
  }

  // ── POST /api/inf-data  {type, rid, data}  ───────────────────────────
  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const { type, rid, data } = body || {};
    if (!rid) return json({ error: 'rid required' }, 400);

    try {
      if (type === 'pay' || type === 'bank' || type === 'social') {
        await db.collection(COLL.INF).updateOne(
          { _id: rid },
          { $set: { [type]: data, updatedAt: new Date() } },
          { upsert: true }
        );
      } else if (type === 'hist') {
        // data = full array for this rid
        await db.collection(COLL.HIST).updateOne(
          { _id: rid },
          { $set: { entries: data, updatedAt: new Date() } },
          { upsert: true }
        );
      } else {
        return json({ error: 'Invalid type' }, 400);
      }
      return json({ ok: true });
    } catch (e) { return json({ error: e.message }, 500); }
  }

  return json({ error: 'Method not allowed' }, 405);
}
