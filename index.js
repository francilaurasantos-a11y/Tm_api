const express = require("express");
const cors = require("cors");
const NodeCache = require("node-cache");
const ytSearch = require("yt-search");
const { spawn } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const rateLimit = require("express-rate-limit");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// --- CONFIGURAÇÃO PARA CLOUDFLARE ---
app.set('trust proxy', 1);

// CONFIGURAÇÕES DE CONTROLE
const ADMIN_CODE = process.env.ADMIN_CODE || "@2207";
const cache = new NodeCache({ stdTTL: 86400 });

let authorizedDomains = new Set();
let pendingRequests = new Set();

const DOMAINS_FILE = path.join(__dirname, 'authorized_domains.json');

try {
  if (fs.existsSync(DOMAINS_FILE)) {
    const domainsData = JSON.parse(fs.readFileSync(DOMAINS_FILE, 'utf8'));
    authorizedDomains = new Set(domainsData);
  } else {
    authorizedDomains.add('http://localhost:3000');
    authorizedDomains.add('https://api.tminfinity.store');
    authorizedDomains.add('https://tminfinityweb.shop');
    authorizedDomains.add('https://tminfinity.x10.mx');
    fs.writeFileSync(DOMAINS_FILE, JSON.stringify(Array.from(authorizedDomains)));
  }
} catch (e) {
  console.error('Erro ao carregar domínios:', e);
}

let requestCount = 0;

// --- MIDDLEWARES ---
app.use(cors());
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  message: "Muitas requisições, tente novamente mais tarde."
});
app.use(apiLimiter);

app.use((req, res, next) => {
  requestCount++;
  next();
});

// Middleware de Autorização de Domínios
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (req.path.startsWith('/admin') || req.path === '/status' || req.path.startsWith('/stream') || !origin) {
    return next();
  }

  if (authorizedDomains.has(origin)) {
    next();
  } else {
    if (!pendingRequests.has(origin)) {
      pendingRequests.add(origin);
    }
    res.status(403).json({ error: 'Acesso negado. Domínio não autorizado.' });
  }
});

// CATEGORIAS DISPONÍVEIS (72 CATEGORIAS)
const categories = {
  'sertanejo-raiz': { name: 'Sertanejo Raiz', query: 'sertanejo raiz clássicos' },
  'sertanejo-universitario': { name: 'Sertanejo Universitário', query: 'sertanejo universitário sucessos' },
  'sertanejo-romantico': { name: 'Sertanejo Romântico', query: 'sertanejo romântico sucessos' },
  'modao': { name: 'Modão', query: 'modão sertanejo clássicos' },
  'sertanejo-pop': { name: 'Sertanejo Pop', query: 'sertanejo pop sucessos' },
  'samba-tradicional': { name: 'Samba Tradicional', query: 'samba tradicional clássicos' },
  'samba-de-raiz': { name: 'Samba de Raiz', query: 'samba de raiz sucessos' },
  'partido-alto': { name: 'Partido Alto', query: 'partido alto sucessos' },
  'samba-enredo': { name: 'Samba-enredo', query: 'samba enredo clássicos' },
  'samba-cancao': { name: 'Samba-canção', query: 'samba canção clássicos' },
  'pagode-90': { name: 'Pagode 90', query: 'pagode anos 90 sucessos' },
  'pagode-romantico': { name: 'Pagode Romântico', query: 'pagode romântico sucessos' },
  'pagode-moderno': { name: 'Pagode Moderno', query: 'pagode moderno sucessos' },
  'funk-carioca': { name: 'Funk Carioca', query: 'funk carioca sucessos' },
  'funk-ostentacao': { name: 'Funk Ostentação', query: 'funk ostentação sucessos' },
  'funk-consciente': { name: 'Funk Consciente', query: 'funk consciente sucessos' },
  'funk-proibidao': { name: 'Funk Proibidão', query: 'funk proibidão sucessos' },
  'funk-rave': { name: 'Funk Rave', query: 'funk rave sucessos' },
  'funk-melody': { name: 'Funk Melody', query: 'funk melody sucessos' },
  'mpb-classica': { name: 'MPB Clássica', query: 'mpb clássica sucessos' },
  'mpb-moderna': { name: 'MPB Moderna', query: 'mpb moderna sucessos' },
  'mpb-acustica': { name: 'MPB Acústica', query: 'mpb acústica sucessos' },
  'forro-pe-de-serra': { name: 'Forró Pé de Serra', query: 'forró pé de serra sucessos' },
  'forro-eletronico': { name: 'Forró Eletrônico', query: 'forró eletrônico sucessos' },
  'forro-universitario': { name: 'Forró Universitário', query: 'forró universitário sucessos' },
  'axe-classico': { name: 'Axé Clássico', query: 'axé clássico sucessos' },
  'axe-pop': { name: 'Axé Pop', query: 'axé pop sucessos' },
  'brega-tradicional': { name: 'Brega Tradicional', query: 'brega tradicional sucessos' },
  'tecnobrega': { name: 'Tecnobrega', query: 'tecnobrega sucessos' },
  'brega-funk': { name: 'Brega Funk', query: 'brega funk sucessos' },
  'brega-romantico': { name: 'Brega Romântico', query: 'brega romântico sucessos' },
  'arrocha-romantico': { name: 'Arrocha Romântico', query: 'arrocha romântico sucessos' },
  'arrocha-moderno': { name: 'Arrocha Moderno', query: 'arrocha moderno sucessos' },
  'piseiro-eletronico': { name: 'Piseiro Eletrônico', query: 'piseiro eletrônico sucessos' },
  'piseiro-tradicional': { name: 'Piseiro Tradicional', query: 'piseiro tradicional sucessos' },
  'rap-nacional': { name: 'Rap Nacional', query: 'rap nacional clássicos' },
  'trap-br': { name: 'Trap BR', query: 'trap brasil sucessos' },
  'drill-br': { name: 'Drill BR', query: 'drill brasil sucessos' },
  'boom-bap-br': { name: 'Boom Bap BR', query: 'boom bap brasil sucessos' },
  'rock-nacional': { name: 'Rock Nacional', query: 'rock nacional clássicos' },
  'rock-alternativo-br': { name: 'Rock Alternativo BR', query: 'rock alternativo brasil' },
  'indie-br': { name: 'Indie BR', query: 'indie brasil sucessos' },
  'jazz-brasileiro': { name: 'Jazz Brasileiro', query: 'jazz brasileiro sucessos' },
  'bossa-nova': { name: 'Bossa Nova', query: 'bossa nova clássicos' },
  'samba-jazz': { name: 'Samba-jazz', query: 'samba jazz sucessos' },
  'carimbo': { name: 'Carimbó', query: 'carimbó sucessos' },
  'baiao': { name: 'Baião', query: 'baião clássicos' },
  'xote': { name: 'Xote', query: 'xote sucessos' },
  'xaxado': { name: 'Xaxado', query: 'xaxado sucessos' },
  'maracatu': { name: 'Maracatu', query: 'maracatu sucessos' },
  'frevo': { name: 'Frevo', query: 'frevo sucessos' },
  'choro': { name: 'Choro', query: 'choro clássicos' },
  'moda-de-viola': { name: 'Moda de Viola', query: 'moda de viola clássicos' },
  'vanerao': { name: 'Vanerão', query: 'vanerão sucessos' },
  'musica-gaucha': { name: 'Música Gaúcha', query: 'música gaúcha sucessos' },
  'gospel-tradicional': { name: 'Gospel Tradicional', query: 'gospel tradicional sucessos' },
  'gospel-pentecostal': { name: 'Gospel Pentecostal', query: 'gospel pentecostal sucessos' },
  'worship': { name: 'Worship', query: 'worship gospel sucessos' },
  'lo-fi-br': { name: 'Lo-fi BR', query: 'lo-fi brasil sucessos' },
  'instrumental': { name: 'Instrumental', query: 'música instrumental brasileira' },
  'infantil': { name: 'Infantil', query: 'música infantil sucessos' },
  'trilhas-sonoras': { name: 'Trilhas Sonoras', query: 'trilhas sonoras filmes brasileiros' }
};

// ==========================================
// ROTA DO PAINEL ADM
// ==========================================
app.get("/admin/panel", (req, res) => {
  const code = req.query.code;
  if (code !== ADMIN_CODE) return res.status(403).send("Acesso negado.");

  const domainsList = Array.from(authorizedDomains).map(d => 
    `<li>${d} <button onclick="handleAction('remove-domain', '${d}')" style="background: #dc3545; padding: 5px; margin-left: 10px;">Remover</button></li>`
  ).join('');

  const pendingList = Array.from(pendingRequests).map(d => 
    `<li>${d} 
      <div style="margin-top: 5px;">
        <button onclick="handleAction('add-domain', '${d}')" style="background: #28a745;">✅ Autorizar</button>
        <button onclick="handleAction('reject-domain', '${d}')" style="background: #dc3545; margin-left: 5px;">❌ Recusar</button>
      </div>
    </li>`
  ).join('');

  const categoriesGrid = Object.keys(categories).map(id => {
    const data = cache.get(`category_${id}`);
    return `<div class="card">${categories[id].name}: <span class="status">${data ? data.length : 0} músicas</span></div>`;
  }).join("");

  let html = `
    <html>
      <head>
        <title>Painel ADM - TM Infinity</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: sans-serif; padding: 10px; background: #121212; color: white; }
          .card { background: #1e1e1e; padding: 15px; margin-bottom: 10px; border-radius: 8px; }
          button { padding: 10px 15px; cursor: pointer; background: #0099ff; color: white; border: none; border-radius: 4px; font-weight: bold; }
          .status { color: #00ff00; font-weight: bold; }
          .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
          ul { list-style: none; padding: 0; }
          li { background: #252525; padding: 10px; margin-bottom: 5px; border-radius: 4px; display: flex; flex-direction: column; }
          @media (min-width: 600px) { li { flex-direction: row; justify-content: space-between; align-items: center; } }
          .pending-section { border: 2px solid #ffc107; }
        </style>
      </head>
      <body>
        <h1>🚀 Painel ADM TM Infinity</h1>
        <div class="card pending-section">
          <h3>🔔 Solicitações de Acesso Pendentes (${pendingRequests.size})</h3>
          <ul id="pendingList">${pendingList || '<li>Nenhuma solicitação pendente.</li>'}</ul>
        </div>
        <div class="card">
          <h3>📊 Status do Servidor</h3>
          <p>Uptime: ${Math.floor(process.uptime() / 3600)}h | Requisições: ${requestCount}</p>
          <p>Memória: ${(((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(2)}% em uso</p>
        </div>
        <div class="card">
          <h3>🛡️ Domínios Autorizados</h3>
          <ul id="domainList">${domainsList}</ul>
        </div>
        <div class="card">
          <h3>🗄️ Gerenciar Cache</h3>
          <button onclick="handleAction('clear-cache')">Limpar Todo o Cache</button>
        </div>
        <h3>📂 Categorias no Cache (${Object.keys(categories).length})</h3>
        <div class="grid">${categoriesGrid}</div>
        <script>
          const code = '${ADMIN_CODE}';
          function handleAction(action, domain = '') {
            let url = '/admin/' + action + '?code=' + code;
            if (domain) url += '&domain=' + encodeURIComponent(domain);
            if (action === 'remove-domain' && !confirm('Remover ' + domain + '?')) return;
            fetch(url).then(r => r.json()).then(res => { alert(res.message); location.reload(); }).catch(err => alert('Erro: ' + err));
          }
        </script>
      </body>
    </html>
  `;
  res.send(html);
});

app.get("/admin/clear-cache", (req, res) => {
  const code = req.query.code;
  if (code !== ADMIN_CODE) return res.status(403).json({ error: "Acesso negado." });
  cache.flushAll();
  res.json({ success: true, message: "Cache limpo com sucesso." });
});

app.get("/admin/add-domain", (req, res) => {
  const code = req.query.code;
  const domain = req.query.domain;
  if (code !== ADMIN_CODE) return res.status(403).json({ error: "Acesso negado." });
  if (!domain) return res.status(400).json({ error: "Domínio não fornecido." });
  authorizedDomains.add(domain);
  pendingRequests.delete(domain);
  fs.writeFileSync(DOMAINS_FILE, JSON.stringify(Array.from(authorizedDomains)));
  res.json({ success: true, message: "Domínio autorizado." });
});

app.get("/admin/remove-domain", (req, res) => {
  const code = req.query.code;
  const domain = req.query.domain;
  if (code !== ADMIN_CODE) return res.status(403).json({ error: "Acesso negado." });
  if (!domain) return res.status(400).json({ error: "Domínio não fornecido." });
  authorizedDomains.delete(domain);
  fs.writeFileSync(DOMAINS_FILE, JSON.stringify(Array.from(authorizedDomains)));
  res.json({ success: true, message: "Domínio removido." });
});

app.get("/admin/reject-domain", (req, res) => {
  const code = req.query.code;
  const domain = req.query.domain;
  if (code !== ADMIN_CODE) return res.status(403).json({ error: "Acesso negado." });
  pendingRequests.delete(domain);
  res.json({ success: true, message: "Solicitação recusada." });
});

app.get("/status", (req, res) => {
  const uptime = process.uptime();
  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  res.json({
    status: "online",
    uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
    memory: { usage: `${(((totalMem - freeMem) / totalMem) * 100).toFixed(2)}%` },
    requests: requestCount,
    cache: { size: cache.keys().length }
  });
});

app.get("/category/:id", async (req, res) => {
  const categoryId = req.params.id;
  const category = categories[categoryId];
  if (!category) return res.status(404).json({ error: "Categoria não encontrada." });
  const cachedResult = cache.get(`category_${categoryId}`);
  if (cachedResult) return res.json(cachedResult);

  const baseQuery = category.query;
  const queryVariations = [baseQuery, `${baseQuery} 2024`, `${baseQuery} hits`, `${baseQuery} melhores` ];
  let allSongs = [];
  let uniqueVideoIds = new Set();

  try {
    const r = await ytSearch({ query: baseQuery, pages: 1 });
    if (r && r.videos) {
      r.videos.forEach(v => {
        if (!uniqueVideoIds.has(v.videoId)) {
          uniqueVideoIds.add(v.videoId);
          allSongs.push({ title: v.title, artist: v.author.name, thumbnail: v.thumbnail, duration: v.timestamp, videoId: v.videoId });
        }
      });
    }
    if (allSongs.length > 0) res.json(allSongs);

    const performBackgroundSearch = async () => {
      for (const currentQuery of queryVariations) {
        if (allSongs.length >= 100) break;
        try {
          // GARIMPO LENTO: Aumentei o delay para 5 segundos para evitar bloqueios
          await new Promise(resolve => setTimeout(resolve, 5000));
          const r = await ytSearch({ query: currentQuery, pages: 1 });
          if (r && r.videos) {
            for (const v of r.videos) {
              if (allSongs.length >= 100) break;
              if (!uniqueVideoIds.has(v.videoId)) {
                uniqueVideoIds.add(v.videoId);
                allSongs.push({ title: v.title, artist: v.author.name, thumbnail: v.thumbnail, duration: v.timestamp, videoId: v.videoId });
              }
            }
            cache.set(`category_${categoryId}`, allSongs);
          }
        } catch (error) { console.error(`Erro em background: ${error.message}`); }
      }
    };
    performBackgroundSearch();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: "Erro ao carregar." });
  }
});

app.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Query necessária." });
  try {
    const r = await ytSearch(query);
    const videos = r.videos.slice(0, 20).map(v => ({ title: v.title, artist: v.author.name, thumbnail: v.thumbnail, duration: v.timestamp, videoId: v.videoId }));
    res.json(videos);
  } catch (e) { res.status(500).json({ error: "Erro na busca." }); }
});

app.get("/stream/:id", (req, res) => {
  const videoId = req.params.id;
  res.setHeader("Content-Type", "audio/mpeg");
  
  const ytdlp = spawn("yt-dlp", [
    "-f", "bestaudio",
    "--extract-audio",
    "--audio-format", "mp3",
    "-o", "-",
    `https://www.youtube.com/watch?v=${videoId}`
  ]);

  ytdlp.stdout.pipe(res);

  ytdlp.on("error", (err) => {
    console.error("Erro no streaming:", err);
    if (!res.headersSent) res.status(500).end();
  });

  req.on("close", () => {
    ytdlp.kill();
  });
});

app.listen(port, () => { console.log(`API rodando na porta ${port}`); });
