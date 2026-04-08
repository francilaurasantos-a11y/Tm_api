require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const ytSearch = require('yt-search');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));
app.use(cors({ origin: '*', methods: ['GET', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Range'], credentials: true }));
app.use(express.json());

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

/**
 * STREAMING USANDO YT-DLP (MUITO MAIS RESISTENTE A BLOQUEIOS)
 */
app.get('/stream/:id', (req, res) => {
  const videoId = req.params.id;
  const cookiePath = path.join(__dirname, 'cookies.txt');

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Access-Control-Allow-Origin', '*');

  console.log(`Iniciando stream com yt-dlp para: ${videoId}`);

  // Comando yt-dlp para extrair áudio e converter para mp3 via pipe
  const ytdlp = spawn('yt-dlp', [
    '--cookies', cookiePath,
    '-f', 'bestaudio',
    '--limit-rate', '1M',
    '-o', '-',
    `https://www.youtube.com/watch?v=${videoId}`
  ]);

  const ffmpeg = spawn('ffmpeg', [
    '-i', 'pipe:0',
    '-acodec', 'libmp3lame',
    '-ab', '128k',
    '-f', 'mp3',
    'pipe:1'
  ]);

  ytdlp.stdout.pipe(ffmpeg.stdin);
  ffmpeg.stdout.pipe(res);

  ytdlp.stderr.on('data', (data) => console.log(`yt-dlp stderr: ${data}`));
  ffmpeg.stderr.on('data', (data) => { /* logs do ffmpeg se necessário */ });

  req.on('close', () => {
    ytdlp.kill();
    ffmpeg.kill();
  });
});

app.get('/', (req, res) => res.send('API TM Infinity com yt-dlp rodando!'));
app.listen(port, () => console.log(`Servidor na porta ${port}`));

