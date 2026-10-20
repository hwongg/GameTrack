const { cached } = require('./redisCache');
const { createHash } = require('node:crypto');
// Caché temporal de traducciones por réplica; no requiere dependencias nuevas.
const cache = new Map();
const pending = new Map();
const URL_TRANSLATE = process.env.TRANSLATE_URL || 'http://translate:5000/translate';
const TTL = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 300;

function store(key, value) {
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(key, { text: value, until: Date.now() + TTL });
}

async function translateChunk(chunk) {
  const response = await fetch(URL_TRANSLATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: chunk, source: 'auto', target: 'es', format: 'text' }),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`Traducción: ${response.status}`);
  const data = await response.json();
  if (!data.translatedText) throw new Error('Traducción vacía');
  return data.translatedText;
}

async function translateToSpanish(text) {
  const source = String(text || '').trim();
  if (!source) return null;
  const key = createHash('sha256').update(source).digest('hex');
  return cached(`translation:es:${key}`, 86400, () => translateLocally(source), { cacheNull: false });
}

async function translateLocally(text) {
  const source = String(text || '').trim();
  if (!source) return null;
  const hit = cache.get(source);
  if (hit && hit.until > Date.now()) return hit.text;
  if (hit) cache.delete(source);
  if (pending.has(source)) return pending.get(source);

  const task = (async () => {
    try {
      const parts = source.match(/[\s\S]{1,1200}/g)?.slice(0, 8) || [];
      // Máximo dos traducciones simultáneas para no saturar LibreTranslate.
      const results = new Array(parts.length);
      let cursor = 0;
      const worker = async () => {
        while (cursor < parts.length) {
          const index = cursor++;
          results[index] = await translateChunk(parts[index]);
        }
      };
      await Promise.all(Array.from({ length: Math.min(2, parts.length) }, worker));
      const translated = results.join(' ');
      store(source, translated);
      return translated;
    } catch (err) {
      console.warn('Traducción no disponible:', err.message);
      return null;
    }
  })();
  pending.set(source, task);
  try { return await task; } finally { pending.delete(source); }
}

module.exports = { translateToSpanish };
