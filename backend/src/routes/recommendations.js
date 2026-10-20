const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { Recommendation, Game } = require('../models');
const { searchByPlatforms, searchGames } = require('../services/rawg');

router.get('/', authenticate, async (req, res, next) => {
  try {
    const history = await Recommendation.findAll({
      where: { userId: req.user.sub },
      include: [{ model: Game, attributes: ['id', 'title', 'genre', 'platform', 'externalId', 'coverUrl'] }]
    });

    if (!history.length) {
      return res.json({
        method: 'content-based-ai',
        message: 'Agrega juegos a tu biblioteca para recibir sugerencias.',
        recommendations: []
      });
    }

    const normalizeList = value =>
      String(value || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

    const platformCounts = new Map();

    for (const item of history) {
      for (const platform of normalizeList(item.Game.platform)) {
        platformCounts.set(
          platform,
          (platformCounts.get(platform) || 0) + (item.status === 'jugando' ? 2 : 1)
        );
      }
    }

    const topPlatforms = [...platformCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name]) => name);

    const catalog = await Game.findAll({
      attributes: ['id', 'title', 'genre', 'platform', 'externalId', 'coverUrl'],
      limit: 500
    });

    let externalCatalog = [];

    try {
      externalCatalog = (await searchByPlatforms(topPlatforms, 40)).items;
    } catch {}

    const playedExternalIds = new Set(
      history
        .map(item => item.Game.externalId)
        .filter(Boolean)
    );

    const playedTitles = new Set(
      history.map(item => item.Game.title.toLowerCase())
    );

    const merged = [
      ...catalog.map(game => ({
        game_id: game.id,
        title: game.title,
        genre: game.genre,
        platform: game.platform,
        external_id: game.externalId,
        cover_url: game.coverUrl
      })),
      ...externalCatalog.map(game => ({
        game_id: game.id,
        title: game.title,
        genre: game.genre,
        platform: game.platform,
        external_id: game.externalId,
        cover_url: game.coverUrl
      }))
    ]
      .filter((game, index, array) =>
        array.findIndex(item =>
          (item.external_id && item.external_id === game.external_id) ||
          item.title.toLowerCase() === game.title.toLowerCase()
        ) === index
      )
      .filter(game =>
        !playedExternalIds.has(game.external_id) &&
        !playedTitles.has(game.title.toLowerCase())
      );

    const response = await fetch(
      `${process.env.AI_SERVICE_URL || 'http://localhost:8000'}/recommend`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.AI_SERVICE_API_KEY
        },
        body: JSON.stringify({
          history: history.map(item => ({
            game_id: item.Game.id,
            title: item.Game.title,
            genre: item.Game.genre,
            platform: item.Game.platform,
            status: item.status,
            hours_played: Number(item.hoursPlayed)
          })),
          catalog: merged.slice(0, 500).map(game => ({
            game_id: game.game_id,
            title: game.title,
            genre: game.genre,
            platform: game.platform,
            external_id: game.external_id,
            cover_url: game.cover_url
          }))
        })
      }
    );

    if (!response.ok) {
      return res.status(502).json({
        error: 'El servicio de recomendaciones no está disponible.'
      });
    }

    const result = await response.json();

    const details = new Map(
      merged.map(game => [String(game.game_id), game])
    );

    const recommendations = [];

    for (const item of result.recommendations || []) {
      let recommendation = {
        ...item,
        ...(details.get(String(item.game_id)) || {})
      };

      if (!recommendation.cover_url && recommendation.title) {
        try {
          const rawgResult = await searchGames({
            search: recommendation.title,
            pageSize: 1
          });

          const rawgGame = rawgResult.items?.[0];

          if (rawgGame) {
            recommendation = {
              ...recommendation,
              game_id: recommendation.game_id || rawgGame.id,
              external_id: recommendation.external_id || rawgGame.externalId,
              title: recommendation.title || rawgGame.title,
              genre: recommendation.genre || rawgGame.genre,
              platform: recommendation.platform || rawgGame.platform,
              cover_url: rawgGame.coverUrl
            };
          }
        } catch {}
      }

      recommendations.push(recommendation);
    }

    result.recommendations = recommendations;
    result.method = 'content-based-ai + RAWG';
    result.message = 'Sugerencias calculadas a partir de tu biblioteca, géneros, plataformas y catálogo global.';

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
