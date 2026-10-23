const { suite, test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp, startServer } = require('./helpers/setup');
const router = require('../src/routes/covers');

function request(baseUrl, imageUrl) {
  const path = `/api/covers?url=${encodeURIComponent(imageUrl)}`;
  return new Promise((resolve, reject) => {
    http.get(baseUrl + path, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        type: response.headers['content-type'],
        body: Buffer.concat(chunks)
      }));
      response.on('error', reject);
    }).on('error', reject);
  });
}

suite('Descarga de portadas para PDF/JPG', () => {
  test('admite URLs directas de Wikimedia, Google, Facebook CDN y proveedores de videojuegos', () => {
    for (const url of [
      'https://upload.wikimedia.org/wikipedia/commons/a/ab/cover.jpg',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn%3AABC&s=10',
      'https://scontent.fgua1-1.fna.fbcdn.net/v/t39.30808-6/portada.jpg',
      'https://cdn.mobygames.com/covers/cover.webp',
      'https://cdn.steamgriddb.com/grid/example.png',
      'https://images.igdb.com/igdb/image/upload/test.jpg',
      'https://media.rawg.io/media/games/cover.jpg'
    ]) {
      assert.equal(router.isAllowedImageUrl(url), true, url);
    }
  });

  test('bloquea SSRF, URLs inseguras, páginas HTML y dominios que imitan los permitidos', () => {
    for (const url of [
      'http://encrypted-tbn0.gstatic.com/images?q=abc',
      'https://127.0.0.1/internal',
      'https://localhost/admin',
      'https://10.0.0.1/portada.png',
      'https://facebook.com/photo.php?fbid=123',
      'https://es.wikipedia.org/wiki/Videojuego',
      'https://encrypted-tbn0.gstatic.com.ejemplo.com/a.jpg',
      'https://scontent.fgua1-1.fna.fbcdn.net.ejemplo.com/a.jpg',
      'https://scontent.fgua1-1.fna.fbcdn.net:8080/a.jpg',
      'https://usuario:clave@upload.wikimedia.org/img.jpg',
      'file:///etc/passwd',
      'no es una URL'
    ]) {
      assert.equal(router.isAllowedImageUrl(url), false, url);
    }
  });

  test('entrega la imagen de una URL Google permitida, sin redirigir', async () => {
    const originalFetch = global.fetch;
    const server = await startServer(createApp('/api/covers', 'covers.js'));
    const imageUrl = 'https://encrypted-tbn0.gstatic.com/images?q=tbn%3AABC&s=10';
    let requestedUrl;
    let opts;
    global.fetch = async (url, options) => {
      requestedUrl = url;
      opts = options;
      return new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg', 'content-length': '4' }
      });
    };
    try {
      const response = await request(server.baseUrl, imageUrl);
      assert.equal(response.status, 200);
      assert.match(response.type, /image\/jpeg/);
      assert.deepEqual([...response.body], [0xff, 0xd8, 0xff, 0xd9]);
      assert.equal(requestedUrl, imageUrl);
      assert.equal(opts.redirect, 'error');
    } finally {
      global.fetch = originalFetch;
      await server.close();
    }
  });

  test('rechaza proveedores no autorizados sin intentar descargarlos', async () => {
    const originalFetch = global.fetch;
    const server = await startServer(createApp('/api/covers', 'covers.js'));
    let fetched = false;
    global.fetch = async () => { fetched = true; throw new Error('unexpected'); };
    try {
      const response = await request(server.baseUrl, 'https://localhost/admin');
      assert.equal(response.status, 400);
      assert.equal(fetched, false);
    } finally {
      global.fetch = originalFetch;
      await server.close();
    }
  });

  test('rechaza páginas HTML incluso si proceden de un CDN permitido', async () => {
    const originalFetch = global.fetch;
    const server = await startServer(createApp('/api/covers', 'covers.js'));
    global.fetch = async () => new Response('<html></html>', {
      status: 200, headers: { 'content-type': 'text/html' }
    });
    try {
      const response = await request(server.baseUrl, 'https://upload.wikimedia.org/wikipedia/commons/a/a.html');
      assert.equal(response.status, 415);
    } finally {
      global.fetch = originalFetch;
      await server.close();
    }
  });
});
