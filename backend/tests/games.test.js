const { test, describe, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { mockModule, createApp, startServer, makeToken, call } = require('./helpers/setup');

const Game = {};
mockModule('models', { Game, Recommendation: {}, sequelize: {} });
mockModule('services/rawg', {
  searchGames: async () => ({}),
  getGameDetails: async () => ({}),
  findGameByTitle: async () => null
});
mockModule('services/translation', { translateToSpanish: async text => text });

const adminToken = makeToken({ sub: 'admin-1', role: 'admin' });
const userToken = makeToken({ sub: 'user-1', role: 'user' });
const validGame = { title: 'Hades', platform: 'PC', genre: 'Roguelike', coverUrl: 'https://example.com/hades.jpg' };

describe('Rutas /api/games', () => {
  let server;
  before(async () => { server = await startServer(createApp('/api/games', 'games.js')); });
  after(async () => { await server.close(); });

  beforeEach(() => {
    Game.findAndCountAll = mock.fn(async () => ({ count: 0, rows: [] }));
    Game.findByPk = mock.fn(async () => null);
    Game.findOne = mock.fn(async () => null);
    Game.create = mock.fn(async data => ({ id: 'nuevo-id', ...data }));
  });

  describe('GET /', () => {
    test('limita el limit a 100 y usa orden por defecto si el sort no es válido', async () => {
      const res = await call(server.baseUrl, 'GET', '/api/games?limit=1000&sort=hack&order=desc');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { total: 0, items: [] });
      const args = Game.findAndCountAll.mock.calls[0].arguments[0];
      assert.equal(args.limit, 100);
      assert.deepEqual(args.order, [['title', 'DESC']]);
    });
  });

  describe('GET /details-by-title', () => {
    test('devuelve 400 si falta el título', async () => {
      const res = await call(server.baseUrl, 'GET', '/api/games/details-by-title');
      assert.equal(res.status, 400);
      assert.equal(typeof res.body.error, 'string');
    });
  });

  describe('POST /', () => {
    test('devuelve 401 sin token', async () => {
      const res = await call(server.baseUrl, 'POST', '/api/games', { body: validGame });
      assert.equal(res.status, 401);
    });

    test('devuelve 401 con token inválido', async () => {
      const res = await call(server.baseUrl, 'POST', '/api/games', { token: 'no-es-un-jwt', body: validGame });
      assert.equal(res.status, 401);
    });

    test('devuelve 403 si el usuario no es administrador', async () => {
      const res = await call(server.baseUrl, 'POST', '/api/games', { token: userToken, body: validGame });
      assert.equal(res.status, 403);
      assert.equal(Game.create.mock.callCount(), 0);
    });

    test('devuelve 400 si el título está vacío', async () => {
      const res = await call(server.baseUrl, 'POST', '/api/games', { token: adminToken, body: { ...validGame, title: '' } });
      assert.equal(res.status, 400);
      assert.ok(Array.isArray(res.body.errors));
      assert.equal(Game.create.mock.callCount(), 0);
    });

    test('devuelve 400 si coverUrl no es una URL http(s)', async () => {
      const res = await call(server.baseUrl, 'POST', '/api/games', { token: adminToken, body: { ...validGame, coverUrl: 'no-es-url' } });
      assert.equal(res.status, 400);
    });

    test('crea el juego con datos válidos', async () => {
      const res = await call(server.baseUrl, 'POST', '/api/games', { token: adminToken, body: validGame });
      assert.equal(res.status, 201);
      assert.equal(res.body.title, 'Hades');
      assert.equal(Game.create.mock.callCount(), 1);
      assert.equal(Game.create.mock.calls[0].arguments[0].externalId, null);
    });
  });

  describe('POST /import', () => {
    test('devuelve 401 sin token', async () => {
      const res = await call(server.baseUrl, 'POST', '/api/games/import', { body: { ...validGame, externalId: 'rawg:1' } });
      assert.equal(res.status, 401);
    });

    test('devuelve 400 si externalId es demasiado corto', async () => {
      const res = await call(server.baseUrl, 'POST', '/api/games/import', { token: userToken, body: { ...validGame, externalId: 'ab' } });
      assert.equal(res.status, 400);
    });
  });

  describe('PUT /:id', () => {
    test('devuelve 400 si no hay campos permitidos para actualizar', async () => {
      const res = await call(server.baseUrl, 'PUT', '/api/games/abc', { token: adminToken, body: { campoInvalido: 'x' } });
      assert.equal(res.status, 400);
      assert.equal(Game.findByPk.mock.callCount(), 0);
    });

    test('devuelve 404 si el juego no existe', async () => {
      const res = await call(server.baseUrl, 'PUT', '/api/games/abc', { token: adminToken, body: { title: 'Nuevo' } });
      assert.equal(res.status, 404);
    });

    test('devuelve 403 si no es administrador', async () => {
      const res = await call(server.baseUrl, 'PUT', '/api/games/abc', { token: userToken, body: { title: 'Nuevo' } });
      assert.equal(res.status, 403);
    });
  });

  describe('DELETE /:id', () => {
    test('devuelve 403 si no es administrador', async () => {
      const res = await call(server.baseUrl, 'DELETE', '/api/games/abc', { token: userToken });
      assert.equal(res.status, 403);
    });

    test('devuelve 404 si el juego no existe', async () => {
      const res = await call(server.baseUrl, 'DELETE', '/api/games/abc', { token: adminToken });
      assert.equal(res.status, 404);
    });

    test('devuelve 204 y elimina el juego existente', async () => {
      const destroy = mock.fn(async () => {});
      Game.findByPk = mock.fn(async () => ({ destroy }));
      const res = await call(server.baseUrl, 'DELETE', '/api/games/abc', { token: adminToken });
      assert.equal(res.status, 204);
      assert.equal(destroy.mock.callCount(), 1);
    });
  });
});