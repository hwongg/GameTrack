const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { User } = require('../models');
const { authenticate } = require('../middleware/auth');

function issueTokens(user) {
  const claims = { sub: user.id, role: user.role, email: user.email };
  return {
    accessToken: jwt.sign(claims, process.env.JWT_ACCESS_SECRET, { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m', algorithm: 'HS256' }),
    refreshToken: jwt.sign({ sub: user.id, type: 'refresh' }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d', algorithm: 'HS256' })
  };
}

router.post('/register',
  body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Nombre inválido.'),
  body('email').isEmail().normalizeEmail().withMessage('Correo inválido.'),
  body('password').isLength({ min: 10, max: 72 }).withMessage('La contraseña debe tener entre 10 y 72 caracteres.'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      const { name, email, password } = req.body;
      if (await User.findOne({ where: { email } })) return res.status(409).json({ error: 'El correo ya está registrado.' });
      const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12), role: 'normal' });
      res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
    } catch (err) { next(err); }
  }
);

router.post('/login', body('email').isEmail().normalizeEmail(), body('password').isString().isLength({ min: 1, max: 72 }), async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const user = await User.findOne({ where: { email: req.body.email } });
    if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) return res.status(401).json({ error: 'Credenciales incorrectas.' });
    const tokens = issueTokens(user);
    res.cookie('gametrack_refresh', tokens.refreshToken, { httpOnly: true, secure: process.env.COOKIE_SECURE === 'true', sameSite: 'strict', path: '/api/auth/refresh', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ accessToken: tokens.accessToken, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { next(err); }
});

function verifyOrigin(req, res, next) {
  const origin = req.get('Origin');
  const allowed = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(x => x.trim());
  if (!origin || !allowed.includes(origin)) return res.status(403).json({ error: 'Origen no autorizado.' });
  next();
}

router.post('/refresh', verifyOrigin, async (req, res) => {
  const token = req.cookies?.gametrack_refresh;
  if (!token) return res.status(401).json({ error: 'Refresh token requerido.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
    if (payload.type !== 'refresh') return res.status(401).json({ error: 'Refresh token inválido.' });
    const user = await User.findByPk(payload.sub);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado.' });
    const tokens = issueTokens(user);
    res.cookie('gametrack_refresh', tokens.refreshToken, { httpOnly: true, secure: process.env.COOKIE_SECURE === 'true', sameSite: 'strict', path: '/api/auth/refresh', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ accessToken: tokens.accessToken });
  } catch { res.status(401).json({ error: 'Refresh token inválido o expirado.' }); }
});

router.post('/logout', verifyOrigin, (req, res) => {
  res.clearCookie('gametrack_refresh', { httpOnly: true, secure: process.env.COOKIE_SECURE === 'true', sameSite: 'strict', path: '/api/auth/refresh' });
  res.status(204).end();
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.sub, { attributes: ['id', 'name', 'email', 'role', 'createdAt'] });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json(user);
  } catch (err) { next(err); }
});

module.exports = router;
