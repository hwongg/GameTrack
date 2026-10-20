const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { Recommendation, Game } = require('../models');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/', async (req, res, next) => {
  try {
    const where = { userId: req.user.sub };
    if (req.query.status && ['pendiente', 'jugando', 'completado', 'abandonado'].includes(req.query.status)) where.status = req.query.status;
    const rows = await Recommendation.findAll({ where, include: [{ model: Game }], order: [['updatedAt', 'DESC']] });
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', body('gameId').isUUID(), body('status').optional().isIn(['pendiente', 'jugando', 'completado', 'abandonado']), body('hoursPlayed').optional().isFloat({ min: 0, max: 100000 }), body('favorite').optional().isBoolean(), async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (!(await Game.findByPk(req.body.gameId))) return res.status(404).json({ error: 'Juego no encontrado.' });
    const [item, created] = await Recommendation.findOrCreate({ where: { userId: req.user.sub, gameId: req.body.gameId }, defaults: { userId: req.user.sub, gameId: req.body.gameId, status: req.body.status || 'pendiente', hoursPlayed: req.body.hoursPlayed || 0 } });
    if (!created) return res.status(409).json({ error: 'El juego ya está en tu biblioteca.' });
    res.status(201).json(item);
  } catch (err) { next(err); }
});

router.patch('/:id', body('status').optional().isIn(['pendiente', 'jugando', 'completado', 'abandonado']), body('hoursPlayed').optional().isFloat({ min: 0, max: 100000 }), body('favorite').optional().isBoolean(), async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const item = await Recommendation.findOne({ where: { id: req.params.id, userId: req.user.sub } });
    if (!item) return res.status(404).json({ error: 'Registro no encontrado.' });
    const data = {};
    if (req.body.status !== undefined) data.status = req.body.status;
    if (req.body.hoursPlayed !== undefined) data.hoursPlayed = req.body.hoursPlayed;
    if (req.body.favorite !== undefined) data.favorite = req.body.favorite;
    await item.update(data);
    res.json(item);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const item = await Recommendation.findOne({ where: { id: req.params.id, userId: req.user.sub } });
    if (!item) return res.status(404).json({ error: 'Registro no encontrado.' });
    await item.destroy();
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
