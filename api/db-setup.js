// One-time setup: creates TTL index on query_cache.expiresAt
// Call GET /api/db-setup once after deploy
import { getDb, COLL } from './_mongodb.js';

const CORS = { 'Access-Control-Allow-Origin': '*' };

export default async function handler(req) {
  try {
    const db = await getDb();
    await db.collection(COLL.CACHE).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await db.collection(COLL.INF).createIndex({ updatedAt: 1 });
    await db.collection(COLL.HIST).createIndex({ updatedAt: 1 });
    return new Response(JSON.stringify({ ok: true, msg: 'Indexes created' }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
}
