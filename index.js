require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const ytSearch = require('yt-search');
const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');

const app = express();
const port = process.env.PORT || 3000;

// Configuração de Cache (1 hora de expiração padrão)
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

// Middlewares de Segurança e Utilidade
app.use(helmet({
  crossOriginResourcePolicy: false, // Permite carregar áudio em outros domínios
  contentSecurityPolicy: false, // Desativa CSP para evitar bloqueios de mídia
}));

// Configuração de CORS ULTRA-PERMISSIVA para produção
app.use(cors({
  origin: '*',
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Range', 'Authorization'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  credentials: true
}));

app.use(express.json());

// Rate Limit: 100 requisições a cada 15 minutos por IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Muitas requisições, tente novamente mais tarde.' }
});
app.use(limiter);

// Lista de categorias predefinidas
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
 * 1. Listar Categorias
 */
app.get('/categories', (req, res) => {
  res.json(MUSIC_CATEGORIES.map(cat => ({ id: cat.id, name: cat.name })));
});

/**
 * 2. Músicas por Categoria
 */
app.get('/category/:id', async (req, res) => {
  const categoryId = req.params.id;
  const category = MUSIC_CATEGORIES.find(c => c.id === categoryId);

  if (!category) {
    return res.status(404).json({ error: 'Categoria não encontrada.' });
  }

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
    console.error('Erro ao buscar categoria:', error);
    res.status(500).json({ error: 'Erro ao carregar músicas da categoria.' });
  }
});

/**
 * 3. Buscar músicas
 */
app.get('/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'O parâmetro "q" é obrigatório.' });
  }

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
    console.error('Erro na busca:', error);
    res.status(500).json({ error: 'Erro ao buscar músicas no YouTube.' });
  }
});

/**
 * 4. Stream de áudio (Otimizado para Player HTML5)
 */
app.get('/stream/:id', async (req, res) => {
  const videoId = req.params.id;
  
  try {
    const video = await ytSearch({ videoId: videoId });
    if (!video) return res.status(404).json({ error: 'Vídeo não encontrado.' });

    if (video.seconds > 600) {
      return res.status(403).json({ error: 'A música excede o limite de 10 minutos.' });
    }

    // Headers essenciais para streaming e player HTML5
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');

    const audioStream = ytdl(videoId, {
      quality: 'highestaudio',
      filter: 'audioonly',
      highWaterMark: 1 << 25
    });

    // Converter para MP3 em tempo real
    ffmpeg(audioStream)
      .audioBitrate(128)
      .format('mp3')
      .on('error', (err) => {
        console.error('Erro no FFmpeg:', err.message);
        if (!res.headersSent) {
          res.status(500).send('Erro no processamento de áudio.');
        }
      })
      .pipe(res, { end: true });

  } catch (error) {
    console.error('Erro no streaming:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro ao iniciar o streaming de áudio.' });
    }
  }
});

app.get('/', (req, res) => {
  res.send('YouTube Music API (HTTPS 143.14.79.216) está rodando!');
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
