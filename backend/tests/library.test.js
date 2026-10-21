const { test, describe, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { mockModule, createApp, startServer, makeToken, call } = require('./helpers/setup');

const Game = {};
const Recommendation = {};
mockModule('models', { Game, Recommendation, sequelize: {} });

const USER_ID = '99999999-9999-4999-8999-999999999999';
const GAME_ID = '11111111-1111-4111-8111-111111111111';
const token = makeToken({ sub: USER_ID, role: 'user' });

describe('Rutas /api/library', () => {
  let server;
  before(async () => { server = await startServer(createApp('/api/library', 'library.js')); });
  after(async () => { await server.close(); });

  beforeEach(() => {
    Game.findByPk = mock.fn(async () => ({ id: GAME_ID }));
    Recommendation.findAll = mock.fn(async () => []);
    Recommendation.findOne = mock.fn(async () => null);
    Recommendation.findOrCreate = mock.fn(async () => [{ id: 'r1', gameId: GAME_ID }, true]);
  });

  describe('autenticación', () => {
    test('GET / devuelve 401 sin token', async () => {
      const res = await call(server.baseUrl, 'GET', '/api/library');
      assert.equal(res.status, 401);
    });

    test('POST / devuelve 401 sin token', async () => {
      const res = await call(server.baseUrl, 'POST', '/api/library', { body: { gameId: GAME_ID } });
      assert.equal(res.status, 401);
    });
  });

  describe('GET /', () => {
    test('filtra por el usuario del token', async () => {
      const res = await call(server.baseUrl, 'GET', '/api/library', { token });
      assert.equal(res.status, 200);
      assert.equal(Recommendation.findAll.mock.calls[0].arguments[0].where.userId, USER_ID);
    });

    test('ignora un status fuera de los permitidos', async () => {
      await call(server.baseUrl, 'GET', '/api/library?status=hackeado', { token });
      assert.equal('status' in Recommendation.findAll.mock.calls[0].arguments[0].where, false);
    });

    test('aplica un status permitido', async () => {
      await call(server.baseUrl, 'GET', '/api/library?status=jugando', { token });
      assert.equal(Recommendation.findAll.mock.calls[0].arguments[0].where.status, 'jugando');
    });
  });

  describe('POST /', () => {
    test('devuelve 400 si gameId no es UUID', async () => {
      const res = await call(server.baseUrl, 'POST', '/api/library', { token, body: { gameId: '123' } });
      assert.equal(res.status, 400);
    });

    test('devuelve 400 si status no está permitido', async () => {
      const res = await call(server.baseUrl, 'POST', '/api/library', { token, body: { gameId: GAME_ID, status: 'otro' } });
      assert.equal(res.status, 400);
    });

    test('devuelve 400 si hoursPlayed es negativo', async () => {
      const res = await call(server.baseUrl, 'POST', '/api/library', { token, body: { gameId: GAME_ID, hoursPlayed: -1 } });
      assert.equal(res.status, 400);
    });

    test('devuelve 404 si el juego no existe', async () => {
      Game.findByPk = mock.fn(async () => null);
      const res = await call(server.baseUrl, 'POST', '/api/library', { token, body: { gameId: GAME_ID } });
      assert.equal(res.status, 404);
    });

    test('devuelve 409 si el juego ya está en la biblioteca', async () => {
      Recommendation.findOrCreate = mock.fn(async () => [{ id: 'r1' }, false]);
      const res = await call(server.baseUrl, 'POST', '/api/library', { token, body: { gameId: GAME_ID } });
      assert.equal(res.status, 409);
    });

    test('devuelve 201 y usa el usuario del token con status pendiente por defecto', async () => {
      const res = await call(server.baseUrl, 'POST', '/api/library', { token, body: { gameId: GAME_ID } });
      assert.equal(res.status, 201);
      const args = Recommendation.findOrCreate.mock.calls[0].arguments[0];
      assert.equal(args.where.userId, USER_ID);
      assert.equal(args.defaults.status, 'pendiente');
      assert.equal(args.defaults.hoursPlayed, 0);
    });
  });

  describe('PATCH /:id', () => {
    test('devuelve 400 si status no está permitido', async () => {
      const res = await call(server.baseUrl, 'PATCH', '/api/library/r1', { token, body: { status: 'otro' } });
      assert.equal(res.status, 400);
    });

    test('devuelve 400 si hoursPlayed es negativo', async () => {
      const res = await call(server.baseUrl, 'PATCH', '/api/library/r1', { token, body: { hoursPlayed: -5 } });
      assert.equal(res.status, 400);
    });

    test('devuelve 400 si favorite no es booleano', async () => {
      const res = await call(server.baseUrl, 'PATCH', '/api/library/r1', { token, body: { favorite: 'quizas' } });
      assert.equal(res.status, 400);
    });

    test('devuelve 404 si el registro no existe o no es del usuario', async () => {
      const res = await call(server.baseUrl, 'PATCH', '/api/library/r1', { token, body: { status: 'jugando' } });
      assert.equal(res.status, 404);
      assert.equal(Recommendation.findOne.mock.calls[0].arguments[0].where.userId, USER_ID);
    });

    test('actualiza solo los campos enviados', async () => {
      const update = mock.fn(async () => {});
      Recommendation.findOne = mock.fn(async () => ({ id: 'r1', update }));
      const res = await call(server.baseUrl, 'PATCH', '/api/library/r1', { token, body: { status: 'jugando' } });
      assert.equal(res.status, 200);
      assert.deepEqual(update.mock.calls[0].arguments[0], { status: 'jugando' });
    });
  });

  describe('DELETE /:id', () => {
    test('devuelve 404 si el registro no existe', async () => {
      const res = await call(server.baseUrl, 'DELETE', '/api/library/r1', { token });
      assert.equal(res.status, 404);
    });

    test('devuelve 204 y elimina el registro', async () => {
      const destroy = mock.fn(async () => {});
      Recommendation.findOne = mock.fn(async () => ({ destroy }));
      const res = await call(server.baseUrl, 'DELETE', '/api/library/r1', { token });
      assert.equal(res.status, 204);
      assert.equal(destroy.mock.callCount(), 1);
    });
  });
});