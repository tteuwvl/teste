const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const SECRET = process.env.BACKEND_SECRET || 'change_this_secret';

// Discord OAuth Configuration
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1469311909533581487';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || 'B8AeWBbvwoQ9Vj0F910X-8mUM4w29bKe';
const DISCORD_TOKEN_ENDPOINT = 'https://discord.com/api/v10/oauth2/token';
const DISCORD_USER_ENDPOINT = 'https://discord.com/api/v10/users/@me';

// Discord OAuth Token Exchange Endpoint (PUBLIC - sem autenticação)
// POST /api/discord/token { code, redirectUri }
app.post('/api/discord/token', async (req, res) => {
  try {
    const { code, redirectUri } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    // Trocar código por access token
    const tokenResponse = await fetch(DISCORD_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri || 'http://127.0.0.1:5500/discord-callback.html'
      })
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json();
      console.error('Discord token error:', error);
      return res.status(400).json({ error: 'Failed to exchange code for token', details: error });
    }

    const tokenData = await tokenResponse.json();

    // Obter informações do usuário
    const userResponse = await fetch(DISCORD_USER_ENDPOINT, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'User-Agent': 'CL-Fury-OAuth'
      }
    });

    if (!userResponse.ok) {
      const error = await userResponse.json();
      console.error('Discord user info error:', error);
      return res.status(400).json({ error: 'Failed to fetch user info', details: error });
    }

    const userData = await userResponse.json();

    // Retornar token e dados do usuário
    res.json({
      token: tokenData,
      user: userData
    });

  } catch (error) {
    console.error('Discord OAuth error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

// Middleware simples para proteger o proxy com um segredo
// Aplicado APÓS o endpoint de Discord para deixar ele público
app.use((req, res, next) => {
  const key = req.headers['x-backend-secret'];
  if (!key || key !== SECRET) {
    return res.status(401).json({ error: 'Unauthorized. Missing or invalid x-backend-secret header.' });
  }
  next();
});

// Proxy POST endpoint: receber { url, method, body } e opcional token no corpo
app.post('/proxy', async (req, res) => {
  const { url, method = 'GET', body } = req.body;
  const token = req.body.token || req.headers['authorization'];

  if (!url) return res.status(400).json({ error: 'Missing url in request body.' });

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.authorization = token;

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const text = await response.text();
    res.status(response.status).send(text);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.listen(PORT, () => console.log(`Proxy server running on http://localhost:${PORT} (use BACKEND_SECRET env var)`));
