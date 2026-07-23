// One-time setup: creates indexes. GET /api/db-setup
import { getDb, COLL } from './_mongodb.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const db = await getDb();
    await db.collection(COLL.CACHE).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await db.collection(COLL.INF).createIndex({ updatedAt: 1 });
    await db.collection(COLL.HIST).createIndex({ updatedAt: 1 });
    res.status(200).json({ ok: true, msg: 'Indexes created' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
