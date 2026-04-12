#!/bin/bash

# --- Variáveis de Configuração ---
API_DIR="/root/Tm_api"
API_PORT=3000
ADMIN_CODE="@2207" # Mantenha este código seguro!

# --- Funções Auxiliares ---
log_info() { echo -e "\e[32m[INFO]\e[0m $1"; }
log_warn() { echo -e "\e[33m[WARN]\e[0m $1"; }
log_error() { echo -e "\e[31m[ERROR]\e[0m $1"; exit 1; }

# --- 1. Atualizar o Sistema ---
log_info "Atualizando pacotes do sistema..."
sudo apt update && sudo apt upgrade -y || log_error "Falha ao atualizar o sistema."

# --- 2. Instalar Node.js e NPM (v20) ---
log_info "Instalando Node.js (v20) e NPM..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - || log_error "Falha ao adicionar repositório NodeSource."
sudo apt install -y nodejs || log_error "Falha ao instalar Node.js."

# --- 3. Instalar PM2 ---
log_info "Instalando PM2 (gerenciador de processos Node.js)..."
sudo npm install -g pm2 || log_error "Falha ao instalar PM2."

# --- 4. Instalar FFmpeg ---
log_info "Instalando FFmpeg (para streaming de áudio)..."
sudo apt install -y ffmpeg || log_error "Falha ao instalar FFmpeg."

# --- 5. Instalar yt-dlp ---
log_info "Instalando yt-dlp (para extração de mídia do YouTube)..."
sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp || log_error "Falha ao baixar yt-dlp."
sudo chmod a+rx /usr/local/bin/yt-dlp || log_error "Falha ao dar permissão ao yt-dlp."

# --- 6. Configurar Firewall (UFW) ---
log_info "Configurando Firewall (UFW)..."
sudo ufw allow ssh || log_error "Falha ao permitir SSH no UFW."
sudo ufw allow "$API_PORT" || log_error "Falha ao permitir porta da API no UFW."
sudo ufw --force enable || log_error "Falha ao habilitar UFW."
log_info "Firewall configurado. Portas $API_PORT (API) e 22 (SSH) abertas."

# --- 7. Instalar e Configurar Fail2Ban ---
log_info "Instalando e configurando Fail2Ban (proteção contra força bruta)..."
sudo apt install -y fail2ban || log_error "Falha ao instalar Fail2Ban."
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local || log_error "Falha ao copiar jail.conf."
# Habilitar proteção SSH no Fail2Ban
sudo sed -i "/^\s*\[sshd\]/,/^\s*enabled\s*=\s*false/s/enabled\s*=\s*false/enabled = true/" /etc/fail2ban/jail.local || log_warn "Não foi possível habilitar sshd no Fail2Ban (pode já estar habilitado)."
sudo systemctl enable fail2ban || log_error "Falha ao habilitar Fail2Ban no boot."
sudo systemctl restart fail2ban || log_error "Falha ao reiniciar Fail2Ban."
log_info "Fail2Ban configurado e ativo."

# --- 8. Criar Diretório da API e Arquivos ---
log_info "Criando diretório da API e arquivos essenciais..."
sudo mkdir -p "$API_DIR" || log_error "Falha ao criar diretório da API."
sudo chown -R "$USER":"$USER" "$API_DIR" || log_error "Falha ao definir permissões do diretório da API."
cd "$API_DIR" || log_error "Falha ao entrar no diretório da API."

# Criar package.json
cat <<EOF > package.json
{
  "name": "tm-infinity-api",
  "version": "1.0.0",
  "description": "API de Música com 72 Categorias, Cache e Monitoramento para Bot",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js"
  },
  "keywords": [
    "music",
    "api",
    "youtube",
    "streaming",
    "cache"
  ],
  "author": "TM Infinity",
  "license": "ISC",
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "node-cache": "^5.1.2",
    "yt-search": "^2.10.4",
    "dotenv": "^17.4.1",
    "fluent-ffmpeg": "^2.1.3",
    "express-rate-limit": "^8.3.2",
    "helmet": "^8.1.0"
  }
}
EOF

# Criar index.js (conteúdo será adicionado na próxima fase)
cat <<EOF > index.js
// Conteúdo do index.js será preenchido na próxima etapa.
// Este é um placeholder para garantir que o npm install funcione.
console.log("API inicializada. Conteúdo completo será adicionado.");
EOF

# --- 9. Instalar Dependências Node.js ---
log_info "Instalando dependências Node.js..."
npm install || log_error "Falha ao instalar dependências Node.js."

# --- 10. Configurar PM2 para a API ---
log_info "Configurando PM2 para iniciar a API..."
pm2 start index.js --name tm-api || log_error "Falha ao iniciar API com PM2."
pm2 save || log_error "Falha ao salvar configuração do PM2."
pm2 startup || log_error "Falha ao configurar PM2 para iniciar no boot."

log_info "\n🎉 Instalação e configuração básica da VPS concluídas!"
log_info "A API está rodando em http://localhost:$API_PORT (ou IP da sua VPS)."
log_info "O Painel ADM está em http://IP_DA_SUA_VPS:$API_PORT/admin/panel?code=$ADMIN_CODE"
log_info "Lembre-se de substituir o conteúdo do index.js e reiniciar a API!"
