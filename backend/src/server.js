require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { sequelize, Game } = require('./models');
const { notFound, errorHandler } = require('./middleware/errors');

const required = ['POSTGRES_PASSWORD', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'AI_SERVICE_API_KEY'];
for (const key of required) {
  if (!process.env[key] || process.env[key].length < 32 && key.includes('SECRET')) throw new Error(`Variable de entorno requerida o demasiado corta: ${key}`);
}
if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) throw new Error('Los secretos JWT de acceso y refresh deben ser diferentes.');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(value => value.trim()), credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }));
app.use(express.json({ limit: '12mb', strict: true }));
app.use(cookieParser());
app.use((req, res, next) => {
  console.log(JSON.stringify({ level: 'info', method: req.method, path: req.path, time: new Date().toISOString() }));
  next();
});
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'gametrack-backend' }));
app.use('/api/covers', require('./routes/covers'));
app.use('/api/games', require('./routes/games'));
app.use('/api/library', require('./routes/library'));
app.use('/api/recommendations', require('./routes/recommendations'));
app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT || 3001);
sequelize.authenticate()
  .then(() => sequelize.sync())
  .then(() => sequelize.query('ALTER TABLE \"juegos\" ALTER COLUMN \"platform\" TYPE TEXT'))
  .then(() => sequelize.query('ALTER TABLE \"recomendaciones\" ADD COLUMN IF NOT EXISTS \"favorite\" BOOLEAN NOT NULL DEFAULT FALSE'))
  .then(async () => {
    if (await Game.count() === 0) {
      await Game.bulkCreate([
        { id: '11111111-1111-4111-8111-111111111111', title: 'Cyberpunk 2077', platform: 'PC, PlayStation 4, PlayStation 5, Xbox One, Xbox Series X|S', genre: 'RPG', description: 'Explora Night City en una aventura futurista.', coverUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/1091500/library_600x900.jpg' },
        { id: '22222222-2222-4222-8222-222222222222', title: 'The Legend of Zelda: Tears of the Kingdom', platform: 'Nintendo Switch', genre: 'Aventura', description: 'Descubre los secretos de Hyrule.', coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co5vmg.jpg' },
        { id: '33333333-3333-4333-8333-333333333333', title: 'God of War Ragnarök', platform: 'PC, PlayStation 4, PlayStation 5', genre: 'Acción', description: 'Acompaña a Kratos y Atreus en los reinos nórdicos.', coverUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/2322010/library_600x900.jpg' },
        { id: '44444444-4444-4444-8444-444444444444', title: 'Minecraft', platform: 'PC, PlayStation 4, PlayStation 5, Xbox One, Xbox Series X|S, Nintendo Switch, Android, iOS', genre: 'Sandbox', description: 'Construye, explora y crea tu propio mundo.', coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co49x5.jpg' },
        { id: '55555555-5555-4555-8555-555555555555', title: 'Elden Ring', platform: 'PC, PlayStation 4, PlayStation 5, Xbox One, Xbox Series X|S', genre: 'RPG', description: 'Aventúrate en las Tierras Intermedias.', coverUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/1245620/library_600x900.jpg' },
        { id: '66666666-6666-4666-8666-666666666666', title: 'Stardew Valley', platform: 'PC, Mac, Linux, PlayStation 4, Xbox One, Nintendo Switch, iOS, Android', genre: 'Simulación', description: 'Construye una nueva vida en tu granja.', coverUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/413150/library_600x900.jpg' }
      ]);
    }
    const catalogFixes = [
      { title: 'Cyberpunk 2077', platform: 'PC, PlayStation 4, PlayStation 5, Xbox One, Xbox Series X|S', coverUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/1091500/library_600x900.jpg' },
      { title: 'The Legend of Zelda: Tears of the Kingdom', platform: 'Nintendo Switch', coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co5vmg.jpg' },
      { title: 'God of War Ragnarök', platform: 'PC, PlayStation 4, PlayStation 5', coverUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/2322010/library_600x900.jpg' },
      { title: 'Minecraft', platform: 'PC, PlayStation 4, PlayStation 5, Xbox One, Xbox Series X|S, Nintendo Switch, Android, iOS', coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co49x5.jpg' },
      { title: 'Elden Ring', platform: 'PC, PlayStation 4, PlayStation 5, Xbox One, Xbox Series X|S', coverUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/1245620/library_600x900.jpg' },
      { title: 'Stardew Valley', platform: 'PC, Mac, Linux, PlayStation 4, Xbox One, Nintendo Switch, iOS, Android', coverUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/413150/library_600x900.jpg' }
    ];
    for (const game of catalogFixes) await Game.update({ platform: game.platform, coverUrl: game.coverUrl }, { where: { title: game.title } });
  })
  .then(() => app.listen(port, '0.0.0.0', () => console.log(`GameTrack API disponible en puerto ${port}`)))
  .catch(error => { console.error('No se pudo iniciar GameTrack:', error.message); process.exit(1); });
