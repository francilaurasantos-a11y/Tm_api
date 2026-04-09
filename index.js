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

// CONFIGURAÇÃO CRÍTICA PARA NGINX/PROXY
app.set('trust proxy', 1);

// Sistema de Métricas em Memória
const stats = {
  totalRequests: 0,
  totalStreams: 0,
  activeStreams: 0,
  topSongs: {},
  startTime: Date.now()
};

// Configuração de Cache
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

// Middlewares de Segurança
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false,
}));

// Configuração de CORS ULTRA-PERMISSIVA
app.use(cors({
  origin: '*',
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Range', 'Authorization'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  credentials: true
}));

app.use(express.json());

// Middleware para contar requisições
app.use((req, res, next) => {
  stats.totalRequests++;
  next();
});

// Rate Limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Muitas requisições, tente novamente mais tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Lista de categorias
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

/**
 * PAINEL DE MONITORAMENTO (HTML)
 */
app.get('/stats', (req, res) => {
  const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
  const cpuLoad = os.loadavg()[0].toFixed(2);
  const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
  const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);

  const topSongsHtml = Object.entries(stats.topSongs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => `<li>ID: <strong>${id}</strong> - ${count} plays</li>`)
    .join('');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>TM Infinity - Monitoramento</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: sans-serif; background: #121212; color: #fff; padding: 20px; }
        .card { background: #1e1e1e; padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #333; }
        h1 { color: #1db954; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
        .stat-val { font-size: 24px; font-weight: bold; color: #1db954; }
        ul { padding-left: 20px; }
        li { margin-bottom: 5px; }
      </style>
      <meta http-equiv="refresh" content="5">
    </head>
    <body>
      <h1>📊 TM Infinity - Monitoramento</h1>
      <div class="grid">
        <div class="card">
          <div>Requisições Totais</div>
          <div class="stat-val">${stats.totalRequests}</div>
        </div>
        <div class="card">
          <div>Streams Totais</div>
          <div class="stat-val">${stats.totalStreams}</div>
        </div>
        <div class="card">
          <div>Streams Ativos</div>
          <div class="stat-val">${stats.activeStreams}</div>
        </div>
        <div class="card">
          <div>Uptime (Segundos)</div>
          <div class="stat-val">${uptime}s</div>
        </div>
      </div>
      <div class="grid">
        <div class="card">
          <h2>💻 Servidor (VPS)</h2>
          <p>Carga CPU: <strong>${cpuLoad}</strong></p>
          <p>Memória Livre: <strong>${freeMem}GB / ${totalMem}GB</strong></p>
        </div>
        <div class="card">
          <h2>🔥 Top 5 Músicas</h2>
          <ul>${topSongsHtml || 'Nenhuma música tocada ainda.'}</ul>
        </div>
      </div>
      <p style="color: #666; font-size: 12px;">Atualiza automaticamente a cada 5 segundos.</p>
    </body>
    </html>
  `);
});

app.get('/categories', (req, res) => {
  res.json(MUSIC_CATEGORIES.map(cat => ({ id: cat.id, name: cat.name })));
});

app.get('/category/:id', async (req, res) => {
  const categoryId = req.params.id;
  const category = MUSIC_CATEGORIES.find(c => c.id === categoryId);
  if (!category) return res.status(404).json({ error: 'Categoria não encontrada.' });

  try {
    const cachedResult = cache.get(`category_${categoryId}`);
    if (cachedResult) return res.json(cachedResult);

    const r = await ytSearch(category.query);
    const videos = r.videos.slice(0, 20);
    const songs = videos.map(video => ({
      title: video.title,
      artist: video.author.name,
      thumbnail: video.thumbnail,
      duration: video.timestamp,
      videoId: video.videoId
    }));
    cache.set(`category_${categoryId}`, songs);
    res.json(songs);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar músicas da categoria.' });
  }
});

app.get('/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'O parâmetro "q" é obrigatório.' });

  try {
    const cachedResult = cache.get(`search_${query}`);
    if (cachedResult) return res.json(cachedResult);

    const r = await ytSearch(query);
    const videos = r.videos.slice(0, 15);
    const songs = videos.map(video => ({
      title: video.title,
      artist: video.author.name,
      thumbnail: video.thumbnail,
      duration: video.timestamp,
      videoId: video.videoId
    }));
    cache.set(`search_${query}`, songs);
    res.json(songs);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar músicas no YouTube.' });
  }
});

/**
 * 4. Stream de áudio (COM MONITORAMENTO)
 */
app.get('/stream/:id', (req, res) => {
  const videoId = req.params.id;
  const youtubeCookie = process.env.YOUTUBE_COOKIE || '';

  // Atualizar métricas
  stats.totalStreams++;
  stats.activeStreams++;
  stats.topSongs[videoId] = (stats.topSongs[videoId] || 0) + 1;

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const ytdlpArgs = [
    '--add-header', `Cookie:${youtubeCookie}`,
    '-f', 'ba/b',
    '--limit-rate', '1M',
    '-o', '-',
    `https://www.youtube.com/watch?v=${videoId}`
  ];

  const ytdlp = spawn('/usr/local/bin/yt-dlp', ytdlpArgs);

  const ffmpeg = spawn('ffmpeg', [
    '-i', 'pipe:0',
    '-acodec', 'libmp3lame',
    '-ab', '128k',
    '-f', 'mp3',
    'pipe:1'
  ]);

  ytdlp.stdout.pipe(ffmpeg.stdin);
  ffmpeg.stdout.pipe(res);

  ytdlp.stderr.on('data', (data) => {
    const msg = data.toString();
    if (msg.includes('ERROR')) console.error(`yt-dlp ERROR: ${msg}`);
  });

  req.on('close', () => {
    stats.activeStreams = Math.max(0, stats.activeStreams - 1);
    ytdlp.kill();
    ffmpeg.kill();
  });
});

app.get('/', (req, res) => {
  res.send('YouTube Music API (Monitoramento Ativo) está rodando!');
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
