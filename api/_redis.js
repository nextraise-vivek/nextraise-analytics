// Edge-compatible Upstash Redis helper — raw fetch, no npm dep needed
// Uses Upstash REST pipeline API: https://upstash.com/docs/redis/features/restapi

function _url() { return process.env.UPSTASH_REDIS_REST_URL || ''; }
function _tok() { return process.env.UPSTASH_REDIS_REST_TOKEN || ''; }

async function _pipeline(cmds) {
  if (!_url()) return cmds.map(() => ({ result: null }));
  const r = await fetch(`${_url()}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${_tok()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) return cmds.map(() => ({ result: null }));
  return r.json();
}

export async function get(key) {
  const [res] = await _pipeline([['GET', key]]);
  const v = res?.result;
  if (v == null) return null;
  try { return JSON.parse(v); } catch { return v; }
}

export async function set(key, value, ttl) {
  const v = JSON.stringify(value);
  const cmd = ttl ? ['SETEX', key, String(ttl), v] : ['SET', key, v];
  await _pipeline([cmd]);
}

export async function del(key) {
  await _pipeline([['DEL', key]]);
}

export async function mget(keys) {
  if (!keys.length) return [];
  const res = await _pipeline(keys.map(k => ['GET', k]));
  return res.map(r => {
    const v = r?.result;
    if (v == null) return null;
    try { return JSON.parse(v); } catch { return v; }
  });
}

export async function mset(pairs, ttl) {
  const cmds = pairs.map(([k, v]) => {
    const s = JSON.stringify(v);
    return ttl ? ['SETEX', k, String(ttl), s] : ['SET', k, s];
  });
  await _pipeline(cmds);
}

export function isAvailable() { return !!_url(); }
