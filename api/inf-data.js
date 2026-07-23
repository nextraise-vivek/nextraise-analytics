// Node.js runtime — MongoDB requires TCP
import { getDb, COLL } from './_mongodb.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  let db;
  try { db = await getDb(); }
  catch (e) { res.status(503).json({ error: 'DB unavailable: ' + e.message }); return; }

  // GET /api/inf-data?type=all
  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
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
        res.status(200).json({ pay, hist, bank, social });
        return;
      }
      res.status(400).json({ error: 'Unknown type' });
    } catch (e) { res.status(500).json({ error: e.message }); }
    return;
  }

  // POST /api/inf-data {type, rid, data}
  if (req.method === 'POST') {
    let body;
    try { body = await readBody(req); }
    catch { res.status(400).json({ error: 'Invalid JSON' }); return; }

    const { type, rid, data } = body || {};
    if (!rid) { res.status(400).json({ error: 'rid required' }); return; }

    try {
      if (type === 'pay' || type === 'bank' || type === 'social') {
        await db.collection(COLL.INF).updateOne(
          { _id: rid },
          { $set: { [type]: data, updatedAt: new Date() } },
          { upsert: true }
        );
      } else if (type === 'hist') {
        await db.collection(COLL.HIST).updateOne(
          { _id: rid },
          { $set: { entries: data, updatedAt: new Date() } },
          { upsert: true }
        );
      } else {
        res.status(400).json({ error: 'Invalid type' }); return;
      }
      res.status(200).json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
