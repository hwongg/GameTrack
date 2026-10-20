const express = require('express');
const router = express.Router();

// Solo proveedores conocidos de portadas; nunca aceptar URLs arbitrarias.
const allowedHosts = new Set([
  'media.rawg.io',
  'images.igdb.com',
  'cdn.akamai.steamstatic.com',
  'shared.akamai.steamstatic.com',
  'cdn.cloudflare.steamstatic.com',
  'placehold.co'
]);
const MAX_BYTES = 5 * 1024 * 1024;

router.get('/', async (req, res) => {
  let url;
  try {
    url = new URL(String(req.query.url || ''));
  } catch {
    return res.status(400).json({ error: 'URL de portada inválida.' });
  }

  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname.toLowerCase()) ||
      url.port || url.username || url.password) {
    return res.status(400).json({ error: 'Proveedor de portada no permitido.' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let upstream;
    try {
      upstream = await fetch(url.href, {
        signal: controller.signal,
        redirect: 'error',
        headers: { Accept: 'image/jpeg,image/png,image/webp,image/*;q=0.8' }
      });
      if (!upstream.ok) return res.status(502).json({ error: 'No se pudo obtener la portada.' });
      const type = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
        return res.status(415).json({ error: 'Formato de imagen no admitido.' });
      }
      const size = Number(upstream.headers.get('content-length') || 0);
      if (size > MAX_BYTES) return res.status(413).json({ error: 'Portada demasiado grande.' });
      const chunks = [];
      let total = 0;
      for await (const chunk of upstream.body) {
        total += chunk.length;
        if (total > MAX_BYTES) {
          controller.abort();
          return res.status(413).json({ error: 'Portada demasiado grande.' });
        }
        chunks.push(chunk);
      }
      res.set('Content-Type', type);
      res.set('Cache-Control', 'private, max-age=3600');
      return res.send(Buffer.concat(chunks));
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error('Error al descargar portada:', error.message);
    return res.status(502).json({ error: 'No se pudo descargar la portada.' });
  }
});

module.exports = router;
