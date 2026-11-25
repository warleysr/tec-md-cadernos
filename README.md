# TEC MD Cadernos

Sistema web responsivo para importar cadernos de questões em Markdown (`.md`, incluindo saídas do Docling/TEC Concursos) e resolver questões com interface e atalhos inspirados no TEC Concursos.

## Funcionalidades

- Importação de **múltiplos arquivos `.md`** (drag-and-drop, seletor de arquivos ou colando o texto Markdown diretamente).
- Suporte a questões de **Múltipla Escolha** (`A`–`E`) e **Certo / Errado** (`C` / `E`).
- Interface responsiva para **desktop e dispositivos móveis**.
- Renderização de tabelas Markdown, blocos de código e imagens base64.
- Persistência local em `data/db.json` (resoluções, acertos, erros, histórico, anotações pessoais, alternativas riscadas e questões removidas).
- Estatísticas globais filtráveis **Por Dia**, **Por Semana** e **Total**, com detalhamento por matéria e banca.

## Atalhos de Teclado

| Tecla | Ação |
| --- | --- |
| `L` | Questão aleatória não resolvida |
| `N` | Próxima questão não resolvida |
| `→` / `←` | Questão seguinte / anterior |
| `P` | Ir para questão específica |
| `A`–`E` ou `1`–`5` | Selecionar alternativa (2x risca/elimina) |
| `C` / `E` | Selecionar Certo / Errado (2x risca/elimina) |
| `Enter` | Responder / Confirmar |
| `I` | Aba Informações |
| `O` | Aba Minhas Anotações |
| `R` | Remover / Restaurar questão do caderno |
| `?` | Ajuda de atalhos |

## Como executar localmente

```bash
npm install
npm start
```

Acesse `http://localhost:3456`.

## Como hospedar em uma VPS (Ubuntu / Debian)

### Opção 1: Node.js + PM2 + Nginx + HTTPS (Recomendado)

1. **Instale Node.js (v20+), Git e Nginx na VPS:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt install -y nodejs git nginx
   sudo npm install -g pm2
   ```

2. **Clone o repositório e instale as dependências:**
   ```bash
   git clone https://github.com/warleysr/tec-md-cadernos.git
   cd tec-md-cadernos
   npm install --omit=dev
   ```

3. **Inicie com PM2 (mantém rodando em segundo plano e reinicia após reboot):**
   ```bash
   pm2 start server.js --name tec-md
   pm2 save
   pm2 startup
   ```

4. **Configure o Nginx como proxy reverso (`/etc/nginx/sites-available/tec-md`):**
   ```nginx
   server {
       listen 80;
       server_name seu-dominio.com; # ou IP da VPS

       client_max_body_size 100M;

       location / {
           proxy_pass http://127.0.0.1:3456;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
   Ative o site e recarregue o Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/tec-md /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```

5. **(Opcional, se usar domínio) Ative HTTPS gratuito com Certbot:**
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d seu-dominio.com
   ```

### Opção 2: Docker

```bash
docker build -t tec-md-cadernos .
docker run -d --name tec-md --restart unless-stopped \
  -p 3456:3456 \
  -v $(pwd)/data:/app/data \
  tec-md-cadernos
```
