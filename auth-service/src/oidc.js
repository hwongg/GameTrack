const router = require('express').Router();
const crypto = require('crypto');
const { createRemoteJWKSet, jwtVerify } = require('jose');
const { User } = require('./models');
const jwt = require('jsonwebtoken');

const PUBLIC = process.env.OIDC_PUBLIC_URL || 'http://localhost:3000/identity';
const INTERNAL = process.env.OIDC_INTERNAL_URL || 'http://keycloak:8080/identity';
const REALM = 'gametrack';
const CLIENT = 'gametrack-web';

const redirect = 'http://localhost:3000/api/auth/oidc/callback';
const issuer = `${PUBLIC}/realms/${REALM}`;
const authBase = `${PUBLIC}/realms/${REALM}/protocol/openid-connect`;
const tokenBase = `${INTERNAL}/realms/${REALM}/protocol/openid-connect`;

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.COOKIE_SECURE === 'true',
  path: '/api/auth/oidc',
  maxAge: 600000
};

router.get('/login', (req, res) => {
  const state = crypto.randomBytes(24).toString('hex');
  const nonce = crypto.randomBytes(24).toString('hex');

  res.cookie('gt_oidc_state', state, cookieOptions);
  res.cookie('gt_oidc_nonce', nonce, cookieOptions);

  const q = new URLSearchParams({
    client_id: CLIENT,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: redirect,
    state,
    nonce
  });

  res.redirect(`${authBase}/auth?${q}`);
});

router.get('/callback', async (req, res, next) => {
  try {
    const state = req.cookies?.gt_oidc_state;
    const nonce = req.cookies?.gt_oidc_nonce;

    if (
      !state ||
      typeof req.query.state !== 'string' ||
      state !== req.query.state ||
      !req.query.code ||
      !nonce
    ) {
      return res.status(403).send('Estado OIDC inválido');
    }

    res.clearCookie('gt_oidc_state', { path: '/api/auth/oidc' });
    res.clearCookie('gt_oidc_nonce', { path: '/api/auth/oidc' });

    const response = await fetch(`${tokenBase}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT,
        code: String(req.query.code),
        redirect_uri: redirect
      })
    });

    if (!response.ok) {
      throw new Error('No se pudo intercambiar el código OIDC');
    }

    const tokens = await response.json();

    const jwks = createRemoteJWKSet(
      new URL(`${INTERNAL}/realms/${REALM}/protocol/openid-connect/certs`)
    );

    const { payload } = await jwtVerify(tokens.id_token, jwks, {
      issuer,
      audience: CLIENT
    });

    if (payload.nonce !== nonce || !payload.email) {
      return res.status(403).send('Identidad OIDC inválida o sin correo electrónico');
    }

    const [user] = await User.findOrCreate({
      where: {
        email: payload.email
      },
      defaults: {
        name: payload.name || payload.preferred_username || 'Jugador',
        passwordHash: crypto.randomBytes(40).toString('hex'),
        role: 'normal'
      }
    });

    const accessToken = jwt.sign(
      {
        sub: user.id,
        role: user.role,
        email: user.email
      },
      process.env.JWT_ACCESS_SECRET,
      {
        expiresIn: '15m',
        algorithm: 'HS256'
      }
    );

    const refreshToken = jwt.sign(
      {
        sub: user.id,
        type: 'refresh'
      },
      process.env.JWT_REFRESH_SECRET,
      {
        expiresIn: '7d',
        algorithm: 'HS256'
      }
    );

    res.cookie('gt_oidc_id_token', tokens.id_token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      path: '/api/auth/oidc',
      maxAge: 604800000
    });

    res.cookie('gametrack_refresh', refreshToken, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 604800000
    });

    res.cookie('gt_oidc_access', accessToken, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      path: '/api/auth/oidc',
      maxAge: 60000
    });

    res.redirect('/?oidc=success');
  } catch (err) {
    next(err);
  }
});

router.get('/result', (req, res) => {
  const token = req.cookies?.gt_oidc_access;

  if (!token) {
    return res.status(404).json({
      error: 'Sin sesión OIDC'
    });
  }

  res.clearCookie('gt_oidc_access', {
    path: '/api/auth/oidc'
  });

  res.json({
    accessToken: token
  });
});

router.get('/logout', (req, res) => {
  const idToken = req.cookies?.gt_oidc_id_token;
  const secure = process.env.COOKIE_SECURE === 'true';

  res.clearCookie('gt_oidc_id_token', {
    path: '/api/auth/oidc',
    httpOnly: true,
    sameSite: 'lax',
    secure
  });

  res.clearCookie('gt_oidc_access', {
    path: '/api/auth/oidc',
    httpOnly: true,
    sameSite: 'lax',
    secure
  });

  res.clearCookie('gt_oidc_state', {
    path: '/api/auth/oidc',
    httpOnly: true,
    sameSite: 'lax',
    secure
  });

  res.clearCookie('gt_oidc_nonce', {
    path: '/api/auth/oidc',
    httpOnly: true,
    sameSite: 'lax',
    secure
  });

  res.clearCookie('gametrack_refresh', {
    path: '/api/auth/refresh',
    httpOnly: true,
    sameSite: 'strict',
    secure
  });

  if (!idToken) {
    return res.redirect('/');
  }

  const q = new URLSearchParams({
    id_token_hint: idToken,
    post_logout_redirect_uri: 'http://localhost:3000/'
  });

  return res.redirect(`${authBase}/logout?${q.toString()}`);
});

module.exports = router;
