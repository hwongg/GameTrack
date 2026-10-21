const path = require('node:path');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_ACCESS_SECRET = 'secreto-solo-para-pruebas-0123456789abcdef';

const SRC = path.join(__dirname, '..', '..', 'src');

// Reemplaza un módulo de src/ por una simulación antes de que las rutas lo carguen.
function mockModule(relativePath, exports) {
  const resolved = require.resolve(path.join(SRC, relativePath));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

// Monta un router real con los manejadores de error reales.
function createApp(mountPath, routerFile) {
  const app = express();
  app.use(express.json());
  app.use(mountPath, require(path.join(SRC, 'routes', routerFile)));
  const { notFound, errorHandler } = require(path.join(SRC, 'middleware', 'errors'));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

async function startServer(app) {
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise(resolve => server.close(resolve))
  };
}

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
}

async function call(baseUrl, method, url, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(baseUrl + url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

module.exports = { mockModule, createApp, startServer, makeToken, call };