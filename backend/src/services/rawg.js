const { cached } = require('./redisCache');
const RAWG_BASE_URL = 'https://api.rawg.io/api';

// Caché LRU por réplica: acelera consultas repetidas sin cambiar resultados.
const responseCache = new Map();
const inflight = new Map();
const CACHE_LIMIT = 250;
function cacheTtl(path) {
  if (/^\/games\/\d+\/screenshots$/.test(path)) return 6 * 60 * 60 * 1000;
  if (/^\/games\/\d+$/.test(path)) return 6 * 60 * 60 * 1000;
  return 5 * 60 * 1000;
}


const PLATFORM_IDS = {
  PC: 4, 'PlayStation 3': 16, 'PlayStation 4': 18, 'PlayStation 5': 187,
  'Xbox 360': 14, 'Xbox One': 1, 'Xbox Series X|S': 186,
  'Nintendo Switch': 7, 'Wii U': 10, Wii: 11, 'Nintendo 3DS': 8,
  'Nintendo DS': 9, Android: 21, iOS: 3, Linux: 6, Mac: 5
};

function getApiKey() {
  if (!process.env.RAWG_API_KEY) throw new Error('RAWG_API_KEY no está configurada.');
  return process.env.RAWG_API_KEY;
}

async function rawgRequest(path, params = {}) {
  const url = new URL(`${RAWG_BASE_URL}${path}`);
  url.searchParams.set('key', getApiKey());
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const key = url.toString();
  return cached(`rawg:${key}`, Math.floor(cacheTtl(path) / 1000), () => rawgFetchUncached(url, key, path));
}

async function rawgFetchUncached(url, key, path) {
  const cached = responseCache.get(key);
  if (cached && cached.expires > Date.now()) {
    responseCache.delete(key);
    responseCache.set(key, cached);
    return cached.data;
  }
  if (cached) responseCache.delete(key);
  if (inflight.has(key)) return inflight.get(key);

  const task = (async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`RAWG respondió ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }
    const data = await response.json();
    if (responseCache.size >= CACHE_LIMIT) responseCache.delete(responseCache.keys().next().value);
    responseCache.set(key, { data, expires: Date.now() + cacheTtl(path) });
    return data;
  })();
  inflight.set(key, task);
  try { return await task; } finally { inflight.delete(key); }
}

function mapGame(game) {
  const platforms = (game.platforms || []).map(item => item.platform?.name).filter(Boolean);
  const genres = (game.genres || []).map(item => item.name).filter(Boolean);
  return {
    id: `rawg:${game.id}`, externalId: `rawg:${game.id}`, rawgId: game.id,
    title: game.name, platform: platforms.join(', ') || 'Plataforma no especificada',
    genre: genres.join(', ') || 'Videojuego', description: game.description_raw || null,
    coverUrl: game.background_image || null, releaseDate: game.released || null,
    rating: game.rating || null, metacritic: game.metacritic || null,
    developer: (game.developers || []).map(x => x.name).filter(Boolean).join(', ') || null,
    publisher: (game.publishers || []).map(x => x.name).filter(Boolean).join(', ') || null
  };
}

// Expansiones y equivalencias conocidas. Se pueden ampliar sin tocar el algoritmo.
const ALIASES = [
  [/^gta\s*(?:3|iii)$/i, 'Grand Theft Auto III'],
  [/^gta\s*(?:4|iv)$/i, 'Grand Theft Auto IV'],
  [/^gta\s*(?:5|v)$/i, 'Grand Theft Auto V'],
  [/^gta\s*(?:6|vi)$/i, 'Grand Theft Auto VI'],
  [/^gta\s*(?:sa|san andreas)$/i, 'Grand Theft Auto San Andreas'],
  [/^gta\s*(?:vc|vice city)$/i, 'Grand Theft Auto Vice City'],
  [/^gta\s*(?:online)$/i, 'Grand Theft Auto Online'],
  [/^rdr\s*(1|2)$/i, (_, n) => `Red Dead Redemption ${n}`],
  [/^rdr$/i, 'Red Dead Redemption'],
  [/^re\s*(\d+)$/i, (_, n) => `Resident Evil ${n}`],
  [/^tlou\s*(?:part\s*)?(1|i)$/i, 'The Last of Us Part I'],
  [/^tlou\s*(?:part\s*)?(2|ii)$/i, 'The Last of Us Part II'],
  [/^tlou$/i, 'The Last of Us'],
  [/^gow\s*(?:ragnarok|rag)?$/i, value => /rag/i.test(value) ? 'God of War Ragnarok' : 'God of War'],
  [/^cod\s*(?:mw\s*)?(\d+)$/i, (_, n) => `Call of Duty Modern Warfare ${n}`],
  [/^cod\s*(?:bo|black ops)\s*(\d+)$/i, (_, n) => `Call of Duty Black Ops ${n}`],
  [/^cod$/i, 'Call of Duty'],
  [/^cs\s*(?:2|go)$/i, value => /2/.test(value) ? 'Counter Strike 2' : 'Counter Strike Global Offensive'],
  [/^csgo$/i, 'Counter Strike Global Offensive'],
  [/^pubg$/i, 'PUBG Battlegrounds'],
  [/^dbd$/i, 'Dead by Daylight'],
  [/^dbz\s*(.*)$/i, (_, suffix) => `Dragon Ball Z ${suffix}`.trim()],
  [/^db\s*sparking\s*zero$/i, 'Dragon Ball Sparking Zero'],
  [/^ff\s*(\d+)$/i, (_, n) => `Final Fantasy ${n}`],
  [/^ff\s*(vii|viii|ix|x|xii|xiii|xiv|xv|xvi)$/i, (_, n) => `Final Fantasy ${n}`],
  [/^ac\s*(odyssey|origins|valhalla|mirage|shadows|unity|syndicate|black flag)$/i, (_, n) => `Assassins Creed ${n}`],
  [/^acnh$/i, 'Animal Crossing New Horizons'],
  [/^botw$/i, 'The Legend of Zelda Breath of the Wild'],
  [/^totk$/i, 'The Legend of Zelda Tears of the Kingdom'],
  [/^hzd$/i, 'Horizon Zero Dawn'],
  [/^hfw$/i, 'Horizon Forbidden West'],
  [/^mhw$/i, 'Monster Hunter World'],
  [/^mhr$/i, 'Monster Hunter Rise'],
  [/^ds\s*(1|2|3)$/i, (_, n) => `Dark Souls ${n}`],
  [/^dmc\s*(\d+)$/i, (_, n) => `Devil May Cry ${n}`],
  [/^nfs\s*(.*)$/i, (_, suffix) => `Need for Speed ${suffix}`.trim()],
  [/^gt\s*(\d+)$/i, (_, n) => `Gran Turismo ${n}`],
  [/^fh\s*(\d+)$/i, (_, n) => `Forza Horizon ${n}`],
  [/^fm\s*(\d+)$/i, (_, n) => `Forza Motorsport ${n}`],
  [/^pes\s*(\d+)$/i, (_, n) => `Pro Evolution Soccer ${n}`],
  [/^mgs\s*(\d+)$/i, (_, n) => `Metal Gear Solid ${n}`],
  [/^spiderman\s*(\d+)?$/i, (_, n) => `Marvel Spider Man${n ? ` ${n}` : ''}`],
  [/^mc$/i, 'Minecraft'],
  [/^lol$/i, 'League of Legends'],
  [/^wow$/i, 'World of Warcraft'],
  [/^hsr$/i, 'Honkai Star Rail'],
  [/^bg\s*(\d+)$/i, (_, n) => `Baldurs Gate ${n}`],
  [/^hk$/i, 'Hollow Knight'],
  [/^silksong$/i, 'Hollow Knight Silksong']
];

function normalize(text) {
  return String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, ' and ').replace(/\biii\b/g, '3')
    .replace(/\biv\b/g, '4').replace(/\bvi\b/g, '6').replace(/\bv\b/g, '5')
    .replace(/\bii\b/g, '2').replace(/\bi\b/g, '1')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function expandQuery(input) {
  const original = String(input || '').trim().slice(0, 100);
  for (const [pattern, replacement] of ALIASES) {
    if (pattern.test(original)) return typeof replacement === 'function' ? original.replace(pattern, replacement) : replacement;
  }
  return original;
}

function editDistance(a, b, limit = 3) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

const EXTRA_TERMS = /\b(dlc|expansion|season pass|soundtrack|demo|beta|trial|add on|episode|episodes|pack|bundle|the frozen wilds|hearts of stone|blood and wine)\b/i;
const EDITION_TERMS = /\b(remastered|remake|definitive|complete|ultimate|deluxe|goty|game of the year|enhanced|edition|directors cut)\b/i;

function relevanceScore(game, search) {
  const query = normalize(search);
  const title = normalize(game.title);
  if (!query || !title) return 0;
  const qTokens = query.split(' ');
  const tTokens = title.split(' ');
  let score = 0;
  if (title === query) score += 1200;
  else if (title.startsWith(`${query} `)) score += 850;
  else if (title.includes(query)) score += 650;
  const matched = qTokens.filter(q => tTokens.includes(q)).length;
  score += (matched / qTokens.length) * 350;
  if (matched === qTokens.length) score += 180;
  if (matched === 0 && !title.includes(query)) {
    const threshold = query.length <= 5 ? 1 : query.length <= 12 ? 2 : 3;
    const d = editDistance(query, title, threshold);
    if (d <= threshold) score += 280 - d * 55;
  }
  if (title !== query) score -= Math.min(160, Math.max(0, tTokens.length - qTokens.length) * 22);
  if (EXTRA_TERMS.test(title) && !EXTRA_TERMS.test(query)) score -= 250;
  if (EDITION_TERMS.test(title) && !EDITION_TERMS.test(query)) score -= 35;
  // Solo desempate: popularidad no debe superar una coincidencia de título.
  score += Math.min(5, Number(game.rating) || 0);
  score += Math.min(5, (Number(game.metacritic) || 0) / 20);
  return score;
}

async function searchGames({ search = '', platform = '', page = 1, pageSize = 24, ordering = '-rating' } = {}) {
  const rawSearch = String(search || '').trim().slice(0, 100);
  const expanded = expandQuery(rawSearch);
  const size = Math.min(Math.max(Number(pageSize) || 24, 1), 40);
  const currentPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const params = { page: currentPage, page_size: rawSearch ? 40 : size, ordering };
  if (platform && platform !== 'Todas' && PLATFORM_IDS[platform]) params.platforms = PLATFORM_IDS[platform];

  if (!rawSearch) {
    const data = await rawgRequest('/games', params);
    return { total: data.count || 0, next: data.next || null, items: (data.results || []).map(mapGame) };
  }

  // Consultar primero el nombre interpretado. Evitar una segunda solicitud
  // cuando la búsqueda expandida ya produjo coincidencias relevantes.
  const collect = async (term) => {
    const data = await rawgRequest('/games', { ...params, page: 1, search: term, search_precise: true });
    return (data.results || []).map(mapGame);
  };

  // A diferencia de ordenar solamente, este filtro descarta juegos que
  // comparten una palabra aislada pero no el nombre solicitado.
  const isRelevant = game => {
    const query = normalize(expanded);
    const title = normalize(game.title);
    if (!query || !title) return false;
    if (title === query || title.startsWith(query + ' ') || title.includes(' ' + query + ' ')) return true;

    const queryTokens = query.split(' ');
    const titleTokens = title.split(' ');
    // Para consultas de varias palabras exigimos TODAS, no solo "Ring".
    if (queryTokens.every(token => titleTokens.includes(token))) return true;

    // Tolerancia conservadora a un error de escritura en el título completo.
    // No aplicar a consultas de una palabra: evitar falsos positivos.
    if (queryTokens.length >= 2 && Math.abs(title.length - query.length) <= 2) {
      return editDistance(query, title, 2) <= 2;
    }
    return false;
  };

  let candidates = await collect(expanded);
  let relevant = candidates.filter(isRelevant);
  if (!relevant.length && normalize(expanded) !== normalize(rawSearch)) {
    const fallback = await collect(rawSearch);
    candidates = [...candidates, ...fallback];
    relevant = candidates.filter(isRelevant);
  }

  const unique = new Map();
  for (const game of relevant) if (!unique.has(game.id)) unique.set(game.id, game);
  const ranked = [...unique.values()].sort((a, b) => {
    const diff = relevanceScore(b, expanded) - relevanceScore(a, expanded);
    return diff || String(a.title).localeCompare(String(b.title), 'es');
  });
  return { total: ranked.length, next: null, items: ranked.slice(0, size) };
}

async function searchByPlatforms(platforms, pageSize = 30) {
  const ids = [...new Set(platforms.map(platform => PLATFORM_IDS[platform]).filter(Boolean))];
  if (!ids.length) return { total: 0, items: [] };
  const data = await rawgRequest('/games', { platforms: ids.slice(0, 4).join(','), page_size: Math.min(pageSize, 40), ordering: '-rating' });
  return { total: data.count || 0, items: (data.results || []).map(mapGame) };
}

async function getGameDetails(rawgId) {
  const id = String(rawgId);
  if (!/^\d+$/.test(id)) throw new Error('Identificador RAWG inválido');
  const [data, screenshots] = await Promise.all([
    rawgRequest(`/games/${id}`),
    rawgRequest(`/games/${id}/screenshots`, { page_size: 12 }).catch(() => null)
  ]);
  const item = mapGame(data);
  item.screenshots = (screenshots?.results || []).map(x => x.image).filter(Boolean).slice(0, 12);
  return item;
}

async function findGameByTitle(title) {
  const query = String(title || '').trim().slice(0, 160);
  if (!query) return null;
  const result = await searchGames({ search: query, pageSize: 40 });
  return result.items.find(x => normalize(x.title) === normalize(query)) || null;
}

module.exports = { PLATFORM_IDS, searchGames, searchByPlatforms, getGameDetails, findGameByTitle };
