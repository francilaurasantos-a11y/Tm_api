require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const ytSearch = require('yt-search');
const { spawn } = require('child_process');

const app = express();
const port = process.env.PORT || 3000;

// CONFIGURAÇÃO CRÍTICA PARA NGINX/PROXY
app.set('trust proxy', 1);

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

// Rate Limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
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
 * 4. Stream de áudio (ESTRATÉGIA DEFINITIVA COM YT-DLP E HEADERS)
 */
app.get('/stream/:id', (req, res) => {
  const videoId = req.params.id;
  const youtubeCookie = process.env.YOUTUBE_COOKIE || '';

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Access-Control-Allow-Origin', '*');

  console.log(`Iniciando stream definitivo para: ${videoId}`);

  // Argumentos para o yt-dlp usando o cookie via header para evitar erro de formato de arquivo
  const ytdlpArgs = [
    '--add-header', `Cookie:${youtubeCookie}`,
    '-f', 'bestaudio',
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
    ytdlp.kill();
    ffmpeg.kill();
  });
});

app.get('/', (req, res) => {
  res.send('YouTube Music API (Definitiva) está rodando!');
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
