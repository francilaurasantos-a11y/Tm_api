const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');
const ytSearch = require('yt-search');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const app = express();
const port = process.env.PORT || 3000;

// CONFIGURAÇÕES DE CONTROLE
const ADMIN_CODE = "@2207";
const cache = new NodeCache({ stdTTL: 86400 }); // Cache de 24 horas

let requestCount = 0;

app.use(cors());
app.use(express.json());

// Middleware para contar requisições
app.use((req, res, next) => {
  requestCount++;
  next();
});

// CATEGORIAS DISPONÍVEIS
const categories = {
  'sertanejo-universitario': { name: 'Sertanejo Universitário', query: 'sertanejo universitário sucessos' },
  'funk-ostentacao': { name: 'Funk Ostentação', query: 'funk ostentação sucessos' },
  'rap-nacional': { name: 'Rap Nacional', query: 'rap nacional clássicos' },
  'pagode-90': { name: 'Pagode 90', query: 'pagode anos 90 sucessos' },
  'eletronica-hits': { name: 'Eletrônica Hits', query: 'eletrônica hits 2024' },
  'pop-brasil': { name: 'Pop Brasil', query: 'pop brasil as mais tocadas' },
  'rock-nacional': { name: 'Rock Nacional', query: 'rock nacional clássicos' },
  'gospel-sucessos': { name: 'Gospel Sucessos', query: 'gospel sucessos 2024' },
  'forro-piseiro': { name: 'Forró e Piseiro', query: 'forró piseiro 2024' },
  'trap-brasil': { name: 'Trap Brasil', query: 'trap brasil sucessos' }
};

// ==========================================
// ROTA DO PAINEL ADM (RESTAURADA)
// ==========================================
app.get('/admin/panel', (req, res) => {
  const code = req.query.code;
  if (code !== ADMIN_CODE) {
    return res.status(403).send('Acesso negado.');
  }

  let html = `
    <html>
      <head>
        <title>Painel ADM - TM Infinity</title>
        <style>
          body { font-family: sans-serif; padding: 20px; background: #121212; color: white; }
          .card { background: #1e1e1e; padding: 15px; margin-bottom: 10px; border-radius: 8px; }
          button { padding: 8px 15px; cursor: pointer; background: #0099ff; color: white; border: none; border-radius: 4px; }
          .status { color: #00ff00; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>🚀 Painel Administrativo TM Infinity</h1>
        <div class="card">
          <h3>📊 Status do Servidor</h3>
          <p>Uptime: ${Math.floor(process.uptime() / 3600)}h | Requisições: ${requestCount}</p>
          <p>Memória: ${(((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(2)}% em uso</p>
        </div>
        <div class="card">
          <h3>🗄️ Gerenciar Cache</h3>
          <button onclick="fetch('/admin/clear-cache?code=${ADMIN_CODE}').then(() => alert('Cache limpo!'))">Limpar Todo o Cache</button>
        </div>
        <div class="card">
          <h3>📂 Categorias no Cache</h3>
          <ul>
            ${Object.keys(categories).map(id => {
              const data = cache.get(`category_${id}`);
              return `<li>${categories[id].name}: <span class="status">${data ? data.length : 0} músicas</span></li>`;
            }).join('')}
          </ul>
        </div>
      </body>
    </html>
  `;
  res.send(html);
});

app.get('/admin/clear-cache', (req, res) => {
  const code = req.query.code;
  if (code !== ADMIN_CODE) return res.status(403).json({ error: 'Acesso negado.' });
  cache.flushAll();
  res.json({ success: true, message: 'Cache limpo com sucesso.' });
});

// ==========================================
// ENDPOINT DE STATUS PARA O BOT
// ==========================================
app.get('/status', (req, res) => {
  const uptime = process.uptime();
  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  const cpuUsage = os.loadavg();

  const cacheStats = {
    size: cache.keys().length,
    categories: cache.keys().map(key => {
      const data = cache.get(key);
      return { id: key.replace('category_', ''), count: Array.isArray(data) ? data.length : 0 };
    })
  };

  res.json({
    status: 'online',
    uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
    memory: {
      free: `${(freeMem / 1024 / 1024).toFixed(2)} MB`,
      total: `${(totalMem / 1024 / 1024).toFixed(2)} MB`,
      usage: `${(((totalMem - freeMem) / totalMem) * 100).toFixed(2)}%`
    },
    cpu: { loadAverage: cpuUsage },
    requests: requestCount,
    cache: cacheStats
  });
});

// ==========================================
// ENDPOINT DE CATEGORIAS (100 MÚSICAS)
// ==========================================
app.get('/category/:id', async (req, res) => {
  const categoryId = req.params.id;
  const category = categories[categoryId];

  if (!category) {
    return res.status(404).json({ error: 'Categoria não encontrada.' });
  }

  try {
    const cachedResult = cache.get(`category_${categoryId}`);
    if (cachedResult) return res.json(cachedResult);

    console.log(`Iniciando busca para: ${category.name}`);
    
    const baseQuery = category.query;
    const queryVariations = [
      baseQuery, `${baseQuery} 2024`, `${baseQuery} 2025`, 
      `${baseQuery} hits`, `${baseQuery} melhores`, `${baseQuery} top`,
      `${baseQuery} sucessos`, `${baseQuery} oficial`, `${baseQuery} playlist`, `${baseQuery} ao vivo`
    ];

    let allSongs = [];
    let uniqueVideoIds = new Set();
    const targetCount = 100;

    // TENTATIVA 1: BUSCA RÁPIDA (PARA RESPONDER LOGO)
    try {
      const r = await ytSearch({ query: baseQuery, pages: 1 });
      if (r && r.videos) {
        r.videos.forEach(v => {
          if (!uniqueVideoIds.has(v.videoId)) {
            uniqueVideoIds.add(v.videoId);
            allSongs.push({
              title: v.title, artist: v.author.name,
              thumbnail: v.thumbnail, duration: v.timestamp, videoId: v.videoId
            });
          }
        });
      }
    } catch (e) { console.error("Erro na busca rápida:", e); }

    // RESPONDE IMEDIATAMENTE COM O QUE ENCONTROU
    if (allSongs.length > 0) {
      res.json(allSongs);
    }

    // TENTATIVA 2: BUSCA PROFUNDA EM SEGUNDO PLANO
    const performBackgroundSearch = async () => {
      for (const currentQuery of queryVariations) {
        if (allSongs.length >= targetCount) break;
        
        try {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Delay anti-bloqueio
          const r = await ytSearch({ query: currentQuery, pages: 1 });
          if (r && r.videos) {
            for (const v of r.videos) {
              if (allSongs.length >= targetCount) break;
              if (!uniqueVideoIds.has(v.videoId)) {
                uniqueVideoIds.add(v.videoId);
                allSongs.push({
                  title: v.title, artist: v.author.name,
                  thumbnail: v.thumbnail, duration: v.timestamp, videoId: v.videoId
                });
              }
            }
            // Atualiza o cache progressivamente
            cache.set(`category_${categoryId}`, allSongs);
          }
        } catch (error) { console.error(`Erro em background: ${error.message}`); }
      }
      console.log(`Busca finalizada para ${category.name}. Total: ${allSongs.length}`);
      if (!res.headersSent && allSongs.length > 0) res.json(allSongs);
    };

    performBackgroundSearch();

  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ error: 'Erro ao carregar categoria.' });
  }
});

// ==========================================
// OUTRAS ROTAS (BUSCA E STREAMING)
// ==========================================
app.get('/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Query necessária.' });

  try {
    const r = await ytSearch(query);
    const videos = r.videos.slice(0, 20).map(v => ({
      title: v.title, artist: v.author.name,
      thumbnail: v.thumbnail, duration: v.timestamp, videoId: v.videoId
    }));
    res.json(videos);
  } catch (e) {
    res.status(500).json({ error: 'Erro na busca.' });
  }
});

app.get('/stream/:id', (req, res) => {
  const videoId = req.params.id;
  res.setHeader('Content-Type', 'audio/mpeg');
  
  const ytdlp = spawn('yt-dlp', [
    '-f', 'bestaudio',
    '--extract-audio',
    '--audio-format', 'mp3',
    '-o', '-',
    `https://www.youtube.com/watch?v=${videoId}`
  ]);

  ytdlp.stdout.pipe(res);
  
  ytdlp.on('error', (err) => {
    console.error('Erro no streaming:', err);
    if (!res.headersSent) res.status(500).end();
  });

  req.on('close', () => {
    ytdlp.kill();
  });
});

app.listen(port, () => {
  console.log(`API rodando na porta ${port}`);
});
