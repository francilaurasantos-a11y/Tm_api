require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const ytSearch = require('yt-search');
const { spawn } = require('child_process');
const os = require('os');

const app = express();
const port = process.env.PORT || 3000;

// CONFIGURAÇÕES DE CONTROLE
const ADMIN_CODE = "@2207";

// Gerenciamento de Sites (3 Sites)
let sites = {
  "site1": { name: "Site 1 (Principal)", enabled: true, domain: "tminfinity.x10.mx", requests: 0 },
  "site2": { name: "Site 2 (Reserva)", enabled: true, domain: "site2.com", requests: 0 },
  "site3": { name: "Site 3 (Teste)", enabled: true, domain: "site3.com", requests: 0 }
};

// CONFIGURAÇÃO CRÍTICA PARA NGINX/PROXY
app.set('trust proxy', 1);

// Sistema de Métricas
const stats = {
  totalRequests: 0,
  totalStreams: 0,
  activeStreams: 0,
  blockedRequests: 0,
  startTime: Date.now()
};

const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Range', 'x-site-id'], credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware de Verificação de Status por Site
const checkSiteStatus = (req, res, next) => {
  if (req.path.startsWith('/admin')) return next();

  const siteId = req.headers['x-site-id'] || 'site1'; // Padrão é site1 se não enviado
  const site = sites[siteId];

  if (!site || !site.enabled) {
    stats.blockedRequests++;
    return res.status(503).json({ error: `O acesso para o ${site ? site.name : 'Site'} está desativado.` });
  }

  site.requests++;
  stats.totalRequests++;
  next();
};

app.use(checkSiteStatus);

/**
 * PAINEL ADMINISTRATIVO (GERENCIADOR DE SITES)
 */
app.get('/admin', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>TM Infinity - Admin</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: sans-serif; background: #121212; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .login-box { background: #1e1e1e; padding: 30px; border-radius: 10px; border: 1px solid #333; text-align: center; width: 300px; }
        input { width: 100%; padding: 10px; margin: 10px 0; border-radius: 5px; border: 1px solid #444; background: #222; color: #fff; box-sizing: border-box; }
        button { width: 100%; padding: 10px; background: #1db954; border: none; color: #fff; font-weight: bold; border-radius: 5px; cursor: pointer; }
        h1 { color: #1db954; font-size: 20px; }
      </style>
    </head>
    <body>
      <div class="login-box">
        <h1>🔐 Login Admin</h1>
        <form action="/admin/dashboard" method="POST">
          <input type="password" name="code" placeholder="Digite o código @..." required>
          <button type="submit">Entrar</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post('/admin/dashboard', (req, res) => {
  const { code } = req.body;
  if (code !== ADMIN_CODE) return res.send('<h1>Código Inválido! <a href="/admin">Voltar</a></h1>');

  const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
  
  const sitesHtml = Object.entries(sites).map(([id, site]) => `
    <div class="card">
      <h3>${site.name}</h3>
      <p>Domínio: <strong>${site.domain}</strong></p>
      <p>Requisições: <strong>${site.requests}</strong></p>
      <div style="font-weight: bold; color: ${site.enabled ? '#1db954' : '#ff4444'}; margin-bottom: 10px;">
        STATUS: ${site.enabled ? 'LIBERADO' : 'BLOQUEADO'}
      </div>
      <form action="/admin/toggle" method="POST">
        <input type="hidden" name="code" value="${ADMIN_CODE}">
        <input type="hidden" name="siteId" value="${id}">
        <button type="submit" class="btn ${site.enabled ? 'btn-off' : 'btn-on'}">
          ${site.enabled ? 'BLOQUEAR SITE' : 'LIBERAR SITE'}
        </button>
      </form>
    </div>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>TM Infinity - Dashboard</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: sans-serif; background: #121212; color: #fff; padding: 20px; }
        .card { background: #1e1e1e; padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #333; }
        h1 { color: #1db954; }
        .btn { padding: 10px 20px; font-weight: bold; border-radius: 5px; cursor: pointer; border: none; color: #fff; }
        .btn-on { background: #1db954; }
        .btn-off { background: #ff4444; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 20px; }
      </style>
    </head>
    <body>
      <h1>⚙️ Gerenciador de Sites TM Infinity</h1>
      
      <div class="stats-grid">
        <div class="card"><div>Total Geral</div><div style="font-size: 20px; color: #1db954;">${stats.totalRequests}</div></div>
        <div class="card"><div>Bloqueios</div><div style="font-size: 20px; color: #ff4444;">${stats.blockedRequests}</div></div>
        <div class="card"><div>Streams Ativos</div><div style="font-size: 20px; color: #1db954;">${stats.activeStreams}</div></div>
      </div>

      <div class="grid">
        ${sitesHtml}
      </div>
      
      <p><a href="/admin" style="color: #666;">Sair do Painel</a></p>
    </body>
    </html>
  `);
});

app.post('/admin/toggle', (req, res) => {
  const { code, siteId } = req.body;
  if (code === ADMIN_CODE && sites[siteId]) {
    sites[siteId].enabled = !sites[siteId].enabled;
    res.send(`
      <form id="back" action="/admin/dashboard" method="POST">
        <input type="hidden" name="code" value="${ADMIN_CODE}">
      </form>
      <script>document.getElementById('back').submit();</script>
    `);
  } else {
    res.status(403).send('Acesso negado.');
  }
});

// Endpoints de Música
app.get('/categories', (req, res) => res.json(MUSIC_CATEGORIES.map(cat => ({ id: cat.id, name: cat.name }))));

app.get('/category/:id', async (req, res) => {
  const categoryId = req.params.id;
  const category = MUSIC_CATEGORIES.find(c => c.id === categoryId);
  if (!category) return res.status(404).json({ error: 'Categoria não encontrada.' });
  try {
    const cachedResult = cache.get(`category_${categoryId}`);
    if (cachedResult) return res.json(cachedResult);
    const r = await ytSearch(category.query);
    const songs = r.videos.slice(0, 20).map(v => ({ title: v.title, artist: v.author.name, thumbnail: v.thumbnail, duration: v.timestamp, videoId: v.videoId }));
    cache.set(`category_${categoryId}`, songs);
    res.json(songs);
  } catch (e) { res.status(500).json({ error: 'Erro ao carregar categoria.' }); }
});

app.get('/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'O parâmetro "q" é obrigatório.' });
  try {
    const cachedResult = cache.get(`search_${query}`);
    if (cachedResult) return res.json(cachedResult);
    const r = await ytSearch(query);
    const songs = r.videos.slice(0, 15).map(v => ({ title: v.title, artist: v.author.name, thumbnail: v.thumbnail, duration: v.timestamp, videoId: v.videoId }));
    cache.set(`search_${query}`, songs);
    res.json(songs);
  } catch (e) { res.status(500).json({ error: 'Erro na busca.' }); }
});

app.get('/stream/:id', (req, res) => {
  const videoId = req.params.id;
  const youtubeCookie = process.env.YOUTUBE_COOKIE || '';
  stats.totalStreams++;
  stats.activeStreams++;
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const ytdlp = spawn('/usr/local/bin/yt-dlp', ['--add-header', `Cookie:${youtubeCookie}`, '-f', 'ba/b', '--limit-rate', '1M', '-o', '-', `https://www.youtube.com/watch?v=${videoId}`]);
  const ffmpeg = spawn('ffmpeg', ['-i', 'pipe:0', '-acodec', 'libmp3lame', '-ab', '128k', '-f', 'mp3', 'pipe:1']);
  ytdlp.stdout.pipe(ffmpeg.stdin);
  ffmpeg.stdout.pipe(res);
  req.on('close', () => { stats.activeStreams = Math.max(0, stats.activeStreams - 1); ytdlp.kill(); ffmpeg.kill(); });
});

const MUSIC_CATEGORIES = [
  { id: 'pop', name: 'Pop Music', query: 'pop music 2024' },
  { id: 'rock', name: 'Rock', query: 'rock classics' },
  { id: 'lofi', name: 'Lofi Hip Hop', query: 'lofi hip hop radio' },
  { id: 'jazz', name: 'Jazz', query: 'jazz relaxante' },
  { id: 'electronic', name: 'Electronic/EDM', query: 'electronic dance music' },
  { id: 'acoustic', name: 'Acoustic', query: 'acoustic covers' },
  { id: 'classical', name: 'Classical', query: 'classical music' },
  { id: 'hiphop', name: 'Hip Hop', query: 'hip hop hits' },
  { id: 'brazil', name: 'Brasil Hits', query: 'musicas mais tocadas brasil' }
];

app.get('/', (req, res) => res.send('API TM Infinity com Gerenciador de Sites rodando!'));
app.listen(port, () => console.log(`Servidor na porta ${port}`));
