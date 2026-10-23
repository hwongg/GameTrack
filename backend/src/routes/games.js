const router = require('express').Router();
const { Op } = require('sequelize');
const { body, validationResult } = require('express-validator');
const { Game } = require('../models');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { searchGames: searchRawgGames, getGameDetails, findGameByTitle } = require('../services/rawg');
const { translateToSpanish } = require('../services/translation');

router.get('/', async (req, res, next) => {
  try {
    const where = {};
    if (req.query.platform) where.platform = { [Op.iLike]: `%${String(req.query.platform).slice(0, 100)}%` };
    if (req.query.genre) where.genre = { [Op.iLike]: `%${String(req.query.genre).slice(0, 80)}%` };
    if (req.query.search) where.title = { [Op.iLike]: `%${String(req.query.search).slice(0, 100)}%` };
    const allowedSort = ['title', 'platform', 'genre', 'createdAt'];
    const sort = allowedSort.includes(req.query.sort) ? req.query.sort : 'title';
    const direction = String(req.query.order).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 24, 1), 100);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    const result = await Game.findAndCountAll({ where, order: [[sort, direction]], limit, offset });
    res.json({ total: result.count, items: result.rows });
  } catch (err) { next(err); }
});

// Datos e imágenes primero; la traducción se solicita por separado.
router.get('/global/:rawgId', async (req, res) => {
  try {
    const game = await getGameDetails(String(req.params.rawgId));
    res.json({ source: 'RAWG', item: game });
  } catch { res.status(502).json({ error: 'No fue posible obtener los detalles del juego.' }); }
});

router.get('/global/:rawgId/translation', async (req, res) => {
  try {
    const game = await getGameDetails(String(req.params.rawgId));
    const descriptionEs = await translateToSpanish(game.description);
    res.json({ descriptionEs });
  } catch { res.status(502).json({ error: 'No fue posible traducir la descripción.' }); }
});

router.get('/details-by-title', async (req, res) => {
  try {
    const title = String(req.query.title || '').trim().slice(0, 160);
    if (!title) return res.status(400).json({ error: 'Título requerido.' });
    const match = await findGameByTitle(title);
    if (!match) return res.json({ item: null });
    const game = await getGameDetails(match.rawgId);
    res.json({ source: 'RAWG', item: game });
  } catch { res.status(502).json({ error: 'No fue posible obtener detalles adicionales.' }); }
});

router.get('/global', async (req, res, next) => {
  try {
    const result = await searchRawgGames({
      search: String(req.query.search || '').slice(0, 100),
      platform: String(req.query.platform || ''),
      page: Number.parseInt(req.query.page, 10) || 1,
      pageSize: Number.parseInt(req.query.pageSize, 10) || 24,
      ordering: ['-rating', 'rating', 'name', '-released', 'released', '-metacritic'].includes(req.query.ordering) ? req.query.ordering : '-rating'
    });
    res.json({ source: 'RAWG', ...result });
  } catch (err) {
    const message = err.message.includes('RAWG_API_KEY') ? err.message : 'No fue posible consultar el catálogo global de videojuegos.';
    res.status(502).json({ error: message });
  }
});

router.post('/import', authenticate,
  body('externalId').isString().isLength({ min: 3, max: 100 }),
  body('title').isString().trim().isLength({ min: 1, max: 160 }),
  body('platform').isString().trim().isLength({ min: 1, max: 1000 }),
  body('genre').isString().trim().isLength({ min: 1, max: 80 }),
  body('description').optional({ nullable: true }).isString().isLength({ max: 5000 }),
  body('coverUrl').optional({ nullable: true }).isURL({ protocols: ['http', 'https'], require_protocol: true }).isLength({ max: 1000 }),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      let game = await Game.findOne({ where: { externalId: req.body.externalId } });
      if (game) return res.json(game);
      let data = {
        title: req.body.title,
        platform: req.body.platform,
        genre: req.body.genre,
        description: req.body.description || null,
        coverUrl: req.body.coverUrl || null,
        externalId: req.body.externalId
      };
      if (req.body.externalId.startsWith('rawg:')) {
        try {
          const details = await getGameDetails(req.body.externalId.slice(5));
          // Los metadatos externos también deben respetar VARCHAR(80).
          data = { ...data, title: details.title, platform: details.platform, genre: String(details.genre || data.genre).slice(0, 80), description: details.description, coverUrl: details.coverUrl };
        } catch { }
      }
      game = await Game.create(data);
      res.status(201).json(game);
    } catch (err) { next(err); }
  }
);

const validateReleaseDate = body('releaseDate').customSanitizer(value => value === '' ? null : value).optional({ nullable: true }).isString().matches(/^\d{4}-\d{2}-\d{2}$/).bail().isISO8601({ strict: true });

const validateScreenshots = body('screenshots').optional().custom(value => {
  if (!Array.isArray(value) || value.length > 8) throw new Error('Máximo 8 capturas.');
  if (!value.every(src => typeof src === 'string' && src.length <= 1400000 && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(src))) throw new Error('Las capturas deben ser imágenes JPG, PNG o WebP de hasta 1 MB.');
  return true;
});

router.post('/', authenticate, requireAdmin,
  validateReleaseDate,
  body('title').isString().trim().isLength({ min: 1, max: 160 }),
  body('platform').isString().trim().isLength({ min: 1, max: 1000 }),
  body('genre').isString().trim().isLength({ min: 1, max: 80 }),
  body('description').optional({ nullable: true }).isString().isLength({ max: 5000 }),
  body('coverUrl').optional({ nullable: true }).isURL({ protocols: ['http', 'https'], require_protocol: true }).isLength({ max: 1000 }),
  body('developer').optional({ nullable: true }).isString().isLength({ max: 200 }),
  body('publisher').optional({ nullable: true }).isString().isLength({ max: 200 }),
  validateScreenshots,
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const game = await Game.create({ title: req.body.title, platform: req.body.platform, genre: req.body.genre, releaseDate: req.body.releaseDate || null, description: req.body.description || null, coverUrl: req.body.coverUrl || null, externalId: req.body.externalId || null, developer: req.body.developer || null, publisher: req.body.publisher || null, screenshots: req.body.screenshots || [] });
      res.status(201).json(game);
    } catch (err) { next(err); }
  }
);

router.put('/:id', authenticate, requireAdmin,
  validateReleaseDate,
  body('title').optional().isString().trim().isLength({ min: 1, max: 160 }),
  body('platform').optional().isString().trim().isLength({ min: 1, max: 1000 }),
  body('genre').optional().isString().trim().isLength({ min: 1, max: 80 }),
  body('description').optional({ nullable: true }).isString().isLength({ max: 5000 }),
  body('coverUrl').optional({ nullable: true }).isURL({ protocols: ['http', 'https'], require_protocol: true }).isLength({ max: 1000 }),
  body('developer').optional({ nullable: true }).isString().isLength({ max: 200 }),
  body('publisher').optional({ nullable: true }).isString().isLength({ max: 200 }),
  validateScreenshots,
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const allowed = ['title', 'platform', 'genre', 'releaseDate', 'description', 'coverUrl', 'externalId', 'developer', 'publisher', 'screenshots'];
      if (req.body.screenshots !== undefined) {
        const check = validationResult(req);
        if (!check.isEmpty()) return res.status(400).json({ errors: check.array() });
        const captures = req.body.screenshots;
        if (!Array.isArray(captures) || captures.length > 8 || !captures.every(src => typeof src === 'string' && src.length <= 1400000 && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(src))) return res.status(400).json({ error: 'Capturas inválidas (máximo 8 imágenes JPG/PNG/WebP de 1 MB).' });
      }
      const data = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
      if (!Object.keys(data).length) return res.status(400).json({ error: 'No hay campos válidos para actualizar.' });
      const game = await Game.findByPk(req.params.id);
      if (!game) return res.status(404).json({ error: 'Juego no encontrado.' });
      await game.update(data);
      res.json(game);
    } catch (err) { next(err); }
  });

router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const game = await Game.findByPk(req.params.id);
    if (!game) return res.status(404).json({ error: 'Juego no encontrado.' });
    await game.destroy();
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
