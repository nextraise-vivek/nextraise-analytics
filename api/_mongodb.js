// Singleton MongoDB client — reused across warm serverless invocations
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const DB  = 'nextraise';

let client = null;
let clientPromise = null;

export function getDb() {
  if (!uri) throw new Error('MONGODB_URI not set');
  if (!clientPromise) {
    client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 5000 });
    clientPromise = client.connect();
  }
  return clientPromise.then(c => c.db(DB));
}

// Collections
export const COLL = {
  INF:   'influencers',   // payment settings, bank details, social metrics per rid
  HIST:  'pay_history',   // payment history entries per rid
  CACHE: 'query_cache',   // cached PostHog query results
};
