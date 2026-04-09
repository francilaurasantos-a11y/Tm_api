require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const NodeCache = require('node-cache');
const ytSearch = require('yt-search');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// CONFIGURAÇÕES DE CONTROLE
const ADMIN_CODE = "@2207";

// LISTA COMPLETA E EXPANDIDA DE CATEGORIAS DE MÚSICA BRASILEIRA 🇧🇷
const MUSIC_CATEGORIES = [
  // SERTANEJO
  { id: 'sertanejo-raiz', name: 'Sertanejo Raiz', query: 'sertanejo raiz modão' },
  { id: 'sertanejo-universitario', name: 'Sertanejo Universitário', query: 'sertanejo universitário 2024' },
  { id: 'sertanejo-romantico', name: 'Sertanejo Romântico', query: 'sertanejo romântico' },
  { id: 'modao', name: 'Modão', query: 'modão sertanejo' },
  { id: 'sertanejo-pop', name: 'Sertanejo Pop', query: 'sertanejo pop' },
  
  // SAMBA
  { id: 'samba-tradicional', name: 'Samba Tradicional', query: 'samba tradicional' },
  { id: 'samba-raiz', name: 'Samba de Raiz', query: 'samba de raiz' },
  { id: 'partido-alto', name: 'Partido Alto', query: 'partido alto samba' },
  { id: 'samba-enredo', name: 'Samba-Enredo', query: 'samba enredo 2024' },
  { id: 'samba-cancao', name: 'Samba-Canção', query: 'samba canção' },
  
  // PAGODE
  { id: 'pagode-90', name: 'Pagode 90', query: 'pagode anos 90' },
  { id: 'pagode-romantico', name: 'Pagode Romântico', query: 'pagode romântico' },
  { id: 'pagode-moderno', name: 'Pagode Moderno', query: 'pagode atual 2024' },
  
  // FUNK
  { id: 'funk-carioca', name: 'Funk Carioca', query: 'funk carioca' },
  { id: 'funk-ostentacao', name: 'Funk Ostentação', query: 'funk ostentação' },
  { id: 'funk-consciente', name: 'Funk Consciente', query: 'funk consciente' },
  { id: 'funk-proibidao', name: 'Funk Proibidão', query: 'funk proibidão' },
  { id: 'funk-rave', name: 'Funk Rave', query: 'funk rave' },
  { id: 'funk-melody', name: 'Funk Melody', query: 'funk melody' },
  
  // MPB
  { id: 'mpb-classica', name: 'MPB Clássica', query: 'mpb clássica' },
  { id: 'mpb-moderna', name: 'MPB Moderna', query: 'mpb moderna' },
  { id: 'mpb-acustica', name: 'MPB Acústica', query: 'mpb acústica' },
  
  // FORRÓ
  { id: 'forro-pe-de-serra', name: 'Forró Pé de Serra', query: 'forró pé de serra' },
  { id: 'forro-eletronico', name: 'Forró Eletrônico', query: 'forró eletrônico' },
  { id: 'forro-universitario', name: 'Forró Universitário', query: 'forró universitário' },
  
  // AXÉ
  { id: 'axe-classico', name: 'Axé Clássico', query: 'axé clássico' },
  { id: 'axe-pop', name: 'Axé Pop', query: 'axé pop' },
  
  // BREGA / TECNOBREGA
  { id: 'brega-tradicional', name: 'Brega Tradicional', query: 'brega tradicional' },
  { id: 'tecnobrega', name: 'Tecnobrega', query: 'tecnobrega' },
  { id: 'brega-funk', name: 'Brega Funk', query: 'brega funk 2024' },
  { id: 'brega-romantico', name: 'Brega Romântico', query: 'brega romântico' },
  
  // ARROCHA
  { id: 'arrocha-romantico', name: 'Arrocha Romântico', query: 'arrocha romântico' },
  { id: 'arrocha-moderno', name: 'Arrocha Moderno', query: 'arrocha moderno' },
  
  // PISEIRO
  { id: 'piseiro-eletronico', name: 'Piseiro Eletrônico', query: 'piseiro eletrônico' },
  { id: 'piseiro-tradicional', name: 'Piseiro Tradicional', query: 'piseiro tradicional' },
  
  // RAP / HIP HOP BR
  { id: 'rap-nacional', name: 'Rap Nacional', query: 'rap nacional' },
  { id: 'trap-br', name: 'Trap BR', query: 'trap brasil 2024' },
  { id: 'drill-br', name: 'Drill BR', query: 'drill brasil' },
  { id: 'boom-bap-br', name: 'Boom Bap BR', query: 'boom bap brasil' },
  
  // ROCK BRASILEIRO
  { id: 'rock-nacional', name: 'Rock Nacional', query: 'rock nacional clássicos' },
  { id: 'rock-alternativo-br', name: 'Rock Alternativo BR', query: 'rock alternativo brasil' },
  { id: 'indie-br', name: 'Indie BR', query: 'indie brasil' },
  
  // JAZZ / BLUES BRASILEIRO
  { id: 'jazz-brasileiro', name: 'Jazz Brasileiro', query: 'jazz brasileiro' },
  { id: 'bossa-nova', name: 'Bossa Nova', query: 'bossa nova' },
  { id: 'samba-jazz', name: 'Samba-Jazz', query: 'samba jazz' },
  
  // REGIONAL / FOLCLÓRICA
  { id: 'carimbo', name: 'Carimbó', query: 'carimbó' },
  { id: 'baiao', name: 'Baião', query: 'baião' },
  { id: 'xote', name: 'Xote', query: 'xote' },
  { id: 'xaxado', name: 'Xaxado', query: 'xaxado' },
  { id: 'maracatu', name: 'Maracatu', query: 'maracatu' },
  { id: 'frevo', name: 'Frevo', query: 'frevo' },
  { id: 'choro', name: 'Choro', query: 'chorinho brasileiro' },
  { id: 'moda-de-viola', name: 'Moda de Viola', query: 'moda de viola' },
  { id: 'vanerao', name: 'Vanerão', query: 'vanerão' },
  { id: 'musica-gaucha', name: 'Música Gaúcha', query: 'música gaúcha' },
  
  // GOSPEL
  { id: 'gospel-tradicional', name: 'Gospel Tradicional', query: 'gospel tradicional' },
  { id: 'gospel-pentecostal', name: 'Gospel Pentecostal', query: 'gospel pentecostal' },
  { id: 'worship', name: 'Worship', query: 'worship gospel' },
  
  // OUTROS
  { id: 'lofi-br', name: 'Lo-fi BR', query: 'lofi brasil' },
  { id: 'instrumental', name: 'Instrumental', query: 'instrumental brasileiro' },
  { id: 'infantil', name: 'Infantil', query: 'música infantil brasileira' },
  { id: 'trilhas-sonoras', name: 'Trilhas Sonoras', query: 'trilhas sonoras novelas' }
];

// Gerenciamento de Sites (3 Sites) com detecção automática de categorias
let sites = {
  "site1": { name: "Site 1 (Principal)", enabled: true, domain: "tminfinity.x10.mx", requests: 0, detectedCategories: {} },
  "site2": { name: "Site 2 (Reserva)", enabled: true, domain: "site2.com", requests: 0, detectedCategories: {} },
  "site3": { name: "Site 3 (Teste)", enabled: true, domain: "site3.com", requests: 0, detectedCategories: {} }
};

// CONFIGURAÇÃO CRÍTICA PARA NGINX/PROXY
app.set('trust proxy', 1);

// Sistema de Métricas Gerais
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

// Middleware de Verificação de Status e Validação de Site
const checkSiteStatus = (req, res, next) => {
  if (req.path.startsWith('/admin')) return next();
  const siteId = req.headers['x-site-id'] || 'site1';
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
 * PAINEL ADMINISTRATIVO (GERENCIADOR DE SITES COM DETECÇÃO AUTOMÁTICA)
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

  const sitesHtml = Object.entries(sites).map(([id, site]) => {
    const categoriesHtml = Object.entries(site.detectedCategories)
      .sort((a, b) => b[1] - a[1])
      .map(([catId, count]) => {
        const catName = MUSIC_CATEGORIES.find(c => c.id === catId)?.name || catId;
        return `<div style="display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px solid #222;">
                  <span>${catName}</span>
                  <strong style="color: #1db954;">${count}</strong>
                </div>`;
      }).join('');

    return `
      <div class="card">
        <h3>${site.name}</h3>
        <p>Domínio: <strong>${site.domain}</strong></p>
        <p>Requisições Totais: <strong>${site.requests}</strong></p>
        <div style="font-weight: bold; color: ${site.enabled ? '#1db954' : '#ff4444'}; margin-bottom: 10px;">
          STATUS: ${site.enabled ? 'LIBERADO' : 'BLOQUEADO'}
        </div>
        <form action="/admin/toggle" method="POST" style="margin-bottom: 15px;">
          <input type="hidden" name="code" value="${ADMIN_CODE}">
          <input type="hidden" name="siteId" value="${id}">
          <button type="submit" class="btn ${site.enabled ? 'btn-off' : 'btn-on'}">
            ${site.enabled ? 'BLOQUEAR SITE' : 'LIBERAR SITE'}
          </button>
        </form>
        <hr style="border: 0; border-top: 1px solid #333; margin: 10px 0;">
        <h4>Categorias Detectadas:</h4>
        <div style="font-size: 13px; color: #aaa; max-height: 200px; overflow-y: auto; padding-right: 5px;">
          ${categoriesHtml || '<p style="font-style: italic;">Nenhuma categoria detectada ainda.</p>'}
        </div>
      </div>
    `;
  }).join('');

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
        h4 { margin: 10px 0 5px 0; color: #1db954; }
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

// Endpoints de Música com Detecção Automática
app.get('/categories', (req, res) => {
  res.json(MUSIC_CATEGORIES.map(cat => ({ id: cat.id, name: cat.name })));
});

app.get('/category/:id', async (req, res) => {
  const categoryId = req.params.id;
  const siteId = req.headers['x-site-id'] || 'site1';
  const site = sites[siteId];
  if (!site) return res.status(403).json({ error: 'Site não identificado.' });
  if (site.detectedCategories[categoryId] === undefined) {
    site.detectedCategories[categoryId] = 1;
  } else {
    site.detectedCategories[categoryId]++;
  }
  const category = MUSIC_CATEGORIES.find(c => c.id === categoryId);
  if (!category) return res.status(404).json({ error: 'Categoria não encontrada.' });
  try {
    const cachedResult = cache.get(`category_${categoryId}`);
    if (cachedResult) return res.json(cachedResult);
    const r = await ytSearch(category.query);
    const songs = r.videos.slice(0, 100).map(v => ({ title: v.title, artist: v.author.name, thumbnail: v.thumbnail, duration: v.timestamp, videoId: v.videoId }));
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

app.get('/', (req, res) => res.send('API TM Infinity com Todas as Categorias Brasileiras rodando!'));
app.listen(port, () => console.log(`Servidor na porta ${port}`));
