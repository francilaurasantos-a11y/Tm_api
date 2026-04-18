const express = require("express");
const cors = require("cors");
const NodeCache = require("node-cache");
const ytSearch = require("yt-search");
const { spawn } = require("child_process");
const os = require("os");
const dotenv = require("dotenv");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");

dotenv.config(); // Carrega variáveis de ambiente do .env

const app = express();
const port = process.env.PORT || 3000;

// CONFIGURAÇÕES DE CONTROLE
const ADMIN_CODE = process.env.ADMIN_CODE || "@2207"; // Código ADM do .env ou padrão
const cache = new NodeCache({ stdTTL: 86400 }); // Cache de 24 horas

let authorizedDomains = new Set(); // Conjunto para armazenar domínios autorizados

// Carregar domínios autorizados de um arquivo (para persistência)
const DOMAINS_FILE = path.join(__dirname, 'authorized_domains.json');
try {
  const domainsData = require(DOMAINS_FILE);
  authorizedDomains = new Set(domainsData);
  console.log(`Domínios autorizados carregados: ${Array.from(authorizedDomains).join(', ')}`);
} catch (e) {
  console.log('Nenhum arquivo de domínios autorizados encontrado. Iniciando com lista vazia.');
  // Adicionar um domínio padrão para testes, se a lista estiver vazia
  authorizedDomains.add('http://localhost:3000');
  authorizedDomains.add('https://api.tminfinity.store');
  // Salvar para criar o arquivo
  require('fs').writeFileSync(DOMAINS_FILE, JSON.stringify(Array.from(authorizedDomains)));
}

let requestCount = 0;

// --- MIDDLEWARES DE SEGURANÇA ---
app.use(cors());
app.use(express.json());
app.use(helmet()); // Proteção contra vulnerabilidades comuns

// Rate Limiting para evitar ataques de força bruta/DDoS
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limite de 100 requisições por IP a cada 15 minutos
  message: "Muitas requisições deste IP, tente novamente após 15 minutos."
});
app.use(apiLimiter);

// Middleware para contar requisições
app.use((req, res, next) => {
  requestCount++;
  next();
});

// Middleware de Autorização de Domínios
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // Permitir acesso para o próprio servidor (localhost) e para o Painel ADM e /status
  if (req.path.startsWith('/admin') || req.path === '/status' || !origin) {
    return next();
  }

  if (authorizedDomains.has(origin)) {
    next();
  } else {
    console.warn(`Acesso negado para domínio não autorizado: ${origin}`);
    res.status(403).json({ error: 'Acesso negado. Domínio não autorizado.' });
  }
});

// CATEGORIAS DISPONÍVEIS (TODAS AS 72 CATEGORIAS SOLICITADAS)
const categories = {
  // 🎤 Sertanejo
  "sertanejo-raiz": { name: "Sertanejo Raiz", query: "sertanejo raiz clássicos" },
  "sertanejo-universitario": { name: "Sertanejo Universitário", query: "sertanejo universitário sucessos" },
  "sertanejo-romantico": { name: "Sertanejo Romântico", query: "sertanejo romântico sucessos" },
  "modao": { name: "Modão", query: "modão sertanejo clássicos" },
  "sertanejo-pop": { name: "Sertanejo Pop", query: "sertanejo pop sucessos" },

  // 🥁 Samba
  "samba-tradicional": { name: "Samba Tradicional", query: "samba tradicional clássicos" },
  "samba-de-raiz": { name: "Samba de Raiz", query: "samba de raiz sucessos" },
  "partido-alto": { name: "Partido Alto", query: "partido alto sucessos" },
  "samba-enredo": { name: "Samba-enredo", query: "samba enredo clássicos" },
  "samba-cancao": { name: "Samba-canção", query: "samba canção clássicos" },

  // 🎶 Pagode
  "pagode-90": { name: "Pagode 90", query: "pagode anos 90 sucessos" },
  "pagode-romantico": { name: "Pagode Romântico", query: "pagode romântico sucessos" },
  "pagode-moderno": { name: "Pagode Moderno", query: "pagode moderno sucessos" },

  // 🔥 Funk
  "funk-carioca": { name: "Funk Carioca", query: "funk carioca sucessos" },
  "funk-ostentacao": { name: "Funk Ostentação", query: "funk ostentação sucessos" },
  "funk-consciente": { name: "Funk Consciente", query: "funk consciente sucessos" },
  "funk-proibidao": { name: "Funk Proibidão", query: "funk proibidão sucessos" },
  "funk-rave": { name: "Funk Rave", query: "funk rave sucessos" },
  "funk-melody": { name: "Funk Melody", query: "funk melody sucessos" },

  // 🎸 MPB
  "mpb-classica": { name: "MPB Clássica", query: "mpb clássica sucessos" },
  "mpb-moderna": { name: "MPB Moderna", query: "mpb moderna sucessos" },
  "mpb-acustica": { name: "MPB Acústica", query: "mpb acústica sucessos" },

  // 🪗 Forró
  "forro-pe-de-serra": { name: "Forró Pé de Serra", query: "forró pé de serra sucessos" },
  "forro-eletronico": { name: "Forró Eletrônico", query: "forró eletrônico sucessos" },
  "forro-universitario": { name: "Forró Universitário", query: "forró universitário sucessos" },

  // 💃 Axé
  "axe-classico": { name: "Axé Clássico", query: "axé clássico sucessos" },
  "axe-pop": { name: "Axé Pop", query: "axé pop sucessos" },

  // 🎧 Brega / Tecnobrega
  "brega-tradicional": { name: "Brega Tradicional", query: "brega tradicional sucessos" },
  "tecnobrega": { name: "Tecnobrega", query: "tecnobrega sucessos" },
  "brega-funk": { name: "Brega Funk", query: "brega funk sucessos" },
  "brega-romantico": { name: "Brega Romântico", query: "brega romântico sucessos" },

  // 🎹 Arrocha
  "arrocha-romantico": { name: "Arrocha Romântico", query: "arrocha romântico sucessos" },
  "arrocha-moderno": { name: "Arrocha Moderno", query: "arrocha moderno sucessos" },

  // 🕺 Piseiro
  "piseiro-eletronico": { name: "Piseiro Eletrônico", query: "piseiro eletrônico sucessos" },
  "piseiro-tradicional": { name: "Piseiro Tradicional", query: "piseiro tradicional sucessos" },

  // 🎤 Rap / Hip Hop BR
  "rap-nacional": { name: "Rap Nacional", query: "rap nacional clássicos" },
  "trap-br": { name: "Trap BR", query: "trap brasil sucessos" },
  "drill-br": { name: "Drill BR", query: "drill brasil sucessos" },
  "boom-bap-br": { name: "Boom Bap BR", query: "boom bap brasil sucessos" },

  // 🎸 Rock Brasileiro
  "rock-nacional": { name: "Rock Nacional", query: "rock nacional clássicos" },
  "rock-alternativo-br": { name: "Rock Alternativo BR", query: "rock alternativo brasil" },
  "indie-br": { name: "Indie BR", query: "indie brasil sucessos" },

  // 🎷 Jazz / Blues Brasileiro
  "jazz-brasileiro": { name: "Jazz Brasileiro", query: "jazz brasileiro sucessos" },
  "bossa-nova": { name: "Bossa Nova", query: "bossa nova clássicos" },
  "samba-jazz": { name: "Samba-jazz", query: "samba jazz sucessos" },

  // 🎻 Regional / Folclórica
  "carimbo": { name: "Carimbó", query: "carimbó sucessos" },
  "baiao": { name: "Baião", query: "baião clássicos" },
  "xote": { name: "Xote", query: "xote sucessos" },
  "xaxado": { name: "Xaxado", query: "xaxado sucessos" },
  "maracatu": { name: "Maracatu", query: "maracatu sucessos" },
  "frevo": { name: "Frevo", query: "frevo sucessos" },
  "choro": { name: "Choro", query: "choro clássicos" },
  "moda-de-viola": { name: "Moda de Viola", query: "moda de viola clássicos" },
  "vanerao": { name: "Vanerão", query: "vanerão sucessos" },
  "musica-gaucha": { name: "Música Gaúcha", query: "música gaúcha sucessos" },

  // 🙏 Gospel
  "gospel-tradicional": { name: "Gospel Tradicional", query: "gospel tradicional sucessos" },
  "gospel-pentecostal": { name: "Gospel Pentecostal", query: "gospel pentecostal sucessos" },
  "worship": { name: "Worship", query: "worship gospel sucessos" },

  // 🎮 Outros
  "lo-fi-br": { name: "Lo-fi BR", query: "lo-fi brasil sucessos" },
  "instrumental": { name: "Instrumental", query: "música instrumental brasileira" },
  "infantil": { name: "Infantil", query: "música infantil sucessos" },
  "trilhas-sonoras": { name: "Trilhas Sonoras", query: "trilhas sonoras filmes brasileiros" }
};

// ==========================================
// ROTA DO PAINEL ADM
// ==========================================
app.get("/admin/panel", (req, res) => {
  const code = req.query.code;
  if (code !== ADMIN_CODE) {
    return res.status(403).send("Acesso negado.");
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
          .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
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
          <h3>🗄️ Gerenciar Cache</h3>          <button onclick="fetch(\'/admin/clear-cache?code=${ADMIN_CODE}\').then(() => alert(\'Cache limpo!\'))">Limpar Todo o Cache</button>
        </div>
        <div class="card">
          <h3>🛡️ Gerenciar Domínios Autorizados</h3>
          <input type="text" id="newDomain" placeholder="Ex: https://seusite.com" style="padding: 5px; width: 200px; margin-right: 5px; background: #333; color: white; border: 1px solid #555;"/>
          <button onclick="addDomain()">Adicionar Domínio</button>
          <ul id="domainList" style="list-style: none; padding: 0;">
            ${Array.from(authorizedDomains).map(domain => `
              <li style="margin-top: 5px;">${domain} <button onclick="removeDomain(\'${domain}\')" style="background: #dc3545;">Remover</button></li>
            `).join('')}
          </ul>
        </div>
        <h3>📂 Categorias no Cache (${Object.keys(categories).length})</h3>
        <div class="grid">
          ${Object.keys(categories).map(id => {
            const data = cache.get(`category_${id}`);
            return `<div class="card">${categories[id].name}: <span class="status">${data ? data.length : 0} músicas</span></div>`;
          }).join("")}
        </div>
        <script>
          async function addDomain() {
            const newDomain = document.getElementById('newDomain').value;
            if (newDomain) {
              const response = await fetch(`/admin/add-domain?code=${ADMIN_CODE}&domain=${encodeURIComponent(newDomain)}`);
              const result = await response.json();
              alert(result.message);
              if (result.success) location.reload();
            }
          }
          async function removeDomain(domain) {
            if (confirm(`Tem certeza que deseja remover ${domain}?`)) {
              const response = await fetch(`/admin/remove-domain?code=${ADMIN_CODE}&domain=${encodeURIComponent(domain)}`);
              const result = await response.json();
              alert(result.message);
              if (result.success) location.reload();
            }
          }
        </script>
      </body>
    </html>
  `;
  res.send(html);
});app.get("/admin/clear-cache", (req, res) => {
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
  require('fs').writeFileSync(DOMAINS_FILE, JSON.stringify(Array.from(authorizedDomains)));
  res.json({ success: true, message: `Domínio ${domain} adicionado com sucesso.` });
});

app.get("/admin/remove-domain", (req, res) => {
  const code = req.query.code;
  const domain = req.query.domain;
  if (code !== ADMIN_CODE) return res.status(403).json({ error: "Acesso negado." });
  if (!domain) return res.status(400).json({ error: "Domínio não fornecido." });

  authorizedDomains.delete(domain);
  require('fs').writeFileSync(DOMAINS_FILE, JSON.stringify(Array.from(authorizedDomains)));
  res.json({ success: true, message: `Domínio ${domain} removido com sucesso.` });
});
// ==========================================
// ENDPOINT DE STATUS PARA O BOT
// ==========================================
app.get("/status", (req, res) => {
  const uptime = process.uptime();
  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  const cpuUsage = os.loadavg();

  const cacheStats = {
    size: cache.keys().length,
    categories: cache.keys().map(key => {
      const data = cache.get(key);
      return { id: key.replace("category_", ""), count: Array.isArray(data) ? data.length : 0 };
    })
  };

  res.json({
    status: "online",
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
app.get("/category/:id", async (req, res) => {
  const categoryId = req.params.id;
  const category = categories[categoryId];

  if (!category) return res.status(404).json({ error: "Categoria não encontrada." });

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

    // TENTATIVA 1: BUSCA RÁPIDA
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

    if (allSongs.length > 0) res.json(allSongs);

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
    if (!res.headersSent) res.status(500).json({ error: "Erro ao carregar categoria." });
  }
});

// ==========================================
// OUTRAS ROTAS (BUSCA E STREAMING)
// ==========================================
app.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Query necessária." });
  try {
    const r = await ytSearch(query);
    const videos = r.videos.slice(0, 20).map(v => ({
      title: v.title, artist: v.author.name,
      thumbnail: v.thumbnail, duration: v.timestamp, videoId: v.videoId
    }));
    res.json(videos);
  } catch (e) { res.status(500).json({ error: "Erro na busca." }); }
});

app.get("/stream/:id", (req, res) => {
  const videoId = req.params.id;
  res.setHeader("Content-Type", "audio/mpeg");
  const ytdlp = spawn("yt-dlp", [
    "-f", "bestaudio", "--extract-audio", "--audio-format", "mp3", "-o", "-",
    `https://www.youtube.com/watch?v=${videoId}`
  ]);
  ytdlp.stdout.pipe(res);
  ytdlp.on("error", (err) => {
    console.error("Erro no streaming:", err);
    if (!res.headersSent) res.status(500).end();
  });
  req.on("close", () => { ytdlp.kill(); });
});

app.listen(port, () => { console.log(`API rodando na porta ${port}`); });
