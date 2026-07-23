export const config = { runtime: 'edge' };

import { get as rGet, set as rSet, mget, mset, isAvailable } from './_redis.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

// Key helpers
const KEY = {
  pay:    rid => `inf:pay::${rid}`,
  hist:   rid => `inf:hist::${rid}`,
  bank:   rid => `inf:bank::${rid}`,
  social: rid => `inf:social::${rid}`,
  // Namespace index — set of all known rids
  index:  () => 'inf:index',
};

const TYPES = ['pay', 'hist', 'bank', 'social'];

async function getIndex() {
  const v = await rGet(KEY.index());
  return Array.isArray(v) ? v : [];
}

async function addToIndex(rid) {
  const idx = await getIndex();
  if (!idx.includes(rid)) {
    idx.push(rid);
    await rSet(KEY.index(), idx);
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  if (!isAvailable()) return json({ error: 'Redis not configured' }, 503);

  const url = new URL(req.url);

  // GET /api/inf-data?type=all          → entire dataset
  // GET /api/inf-data?type=pay&rid=...  → single record
  if (req.method === 'GET') {
    const type = url.searchParams.get('type') || 'all';
    const rid = url.searchParams.get('rid');

    if (type !== 'all' && !TYPES.includes(type)) return json({ error: 'Invalid type' }, 400);

    if (type === 'all') {
      const index = await getIndex();
      if (!index.length) return json({ pay: {}, hist: {}, bank: {}, social: {} });

      // Fetch all keys in one pipeline
      const keys = index.flatMap(r => TYPES.map(t => KEY[t](r)));
      const values = await mget(keys);

      const result = { pay: {}, hist: {}, bank: {}, social: {} };
      index.forEach((r, i) => {
        TYPES.forEach((t, j) => {
          const v = values[i * TYPES.length + j];
          if (v != null) result[t][r] = v;
        });
      });
      return json(result);
    }

    if (!rid) return json({ error: 'rid required' }, 400);
    const v = await rGet(KEY[type](rid));
    return json({ [type]: { [rid]: v } });
  }

  // POST /api/inf-data  {type, rid, data}
  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const { type, rid, data } = body || {};

    if (!TYPES.includes(type)) return json({ error: 'Invalid type' }, 400);
    if (!rid) return json({ error: 'rid required' }, 400);
    if (data === undefined) return json({ error: 'data required' }, 400);

    await rSet(KEY[type](rid), data);
    await addToIndex(rid);
    return json({ ok: true });
  }

  // POST /api/inf-data/bulk  {pay:{}, hist:{}, bank:{}, social:{}}  — bulk import from localStorage
  if (req.method === 'DELETE') {
    const rid = url.searchParams.get('rid');
    const type = url.searchParams.get('type');
    if (!rid) return json({ error: 'rid required' }, 400);
    if (type && TYPES.includes(type)) {
      await rSet(KEY[type](rid), null);
    } else {
      // Delete all types for this rid
      await mset(TYPES.map(t => [KEY[t](rid), null]));
    }
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
