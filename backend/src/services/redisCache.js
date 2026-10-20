// Redis compartido, con degradación automática a la caché local si no está disponible.
const { createClient } = require('redis');
const local = new Map();
const pending = new Map();
let client;
let connecting;
const MAX_LOCAL = 300;

async function redis() {
  if (!process.env.REDIS_URL) return null;
  if (client?.isReady) return client;
  if (!connecting) {
    client = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 1200, reconnectStrategy: () => false } });
    client.on('error', () => {});
    connecting = client.connect().then(() => client).catch(() => { client = null; return null; }).finally(() => { connecting = null; });
  }
  return connecting;
}

async function cached(key, ttlSeconds, producer, { cacheNull = true } = {}) {
  const entry = local.get(key);
  if (entry && entry.expires > Date.now()) return entry.value;
  if (entry) local.delete(key);
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    const r = await redis();
    if (r) {
      try {
        const value = await r.get(key);
        if (value !== null) {
          const parsed = JSON.parse(value);
          putLocal(key, parsed, ttlSeconds);
          return parsed;
        }
      } catch { /* seguir sin Redis */ }
    }
    const result = await producer();
    if (result !== null && result !== undefined || cacheNull) {
      putLocal(key, result, ttlSeconds);
      if (r?.isReady) {
        try { await r.set(key, JSON.stringify(result), { EX: ttlSeconds }); } catch { /* seguir sin Redis */ }
      }
    }
    return result;
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}
function putLocal(key, value, ttl) {
  if (local.size >= MAX_LOCAL) local.delete(local.keys().next().value);
  local.set(key, { value, expires: Date.now() + ttl * 1000 });
}
module.exports = { cached };
