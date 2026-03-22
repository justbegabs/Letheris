# GUIA RÁPIDO: Configurar para Deployment

## Antes de tudo

Este projeto usa **SQLite**.

- Em hospedagem gratuita, o backend geralmente roda com disco temporário.
- Isso serve para **teste e demonstração**.
- Para uso real com dados persistentes, prefira **VPS** ou migre o banco para **Postgres**.

## 1. Deploy do Backend

### Opção recomendada para teste: Render

Importante: se você usar SQLite na Render sem disco persistente, contas, posts e respostas podem sumir após restart, novo deploy ou manutenção da plataforma.

### Step 1: Criar conta e conectar repositório
- Vá em https://render.com
- Clique em "New +" > "Web Service"
- Conecte seu GitHub
- Selecione seu repositório

### Step 1.5: Criar um Persistent Disk
- No serviço da Render, abra "Disks"
- Crie um disco persistente
- Monte em um caminho como `/var/data`
- Esse passo é o que faz o SQLite sobreviver a reinícios

### Step 2: Configurar variáveis de ambiente
No painel da Render, vá em "Environment":
```
ADMIN_PASSWORD=sua-senha-forte-aqui
SESSION_SECRET=um-segredo-aleatorio-muito-grande
ALLOWED_ORIGIN=https://justbegabs.github.io
PORT=5174
DATA_DIR=/var/data
```

### Step 3: Deploy automático
- A Render faz deploy automaticamente quando você faz push
- Copie a URL do seu backend, por exemplo: `https://letheris.onrender.com`

### Limitações da opção gratuita
- O serviço pode entrar em sleep quando ficar parado
- Sem Persistent Disk, o SQLite não guarda dados permanentemente

### Opção recomendada para uso real: VPS

Se você quer que o app continue funcionando com banco local sem surpresa:

```bash
git clone https://github.com/seu-usuario/seu-repo.git
cd seu-repo
npm install
npm start
```

Você pode rodar isso em um VPS da DigitalOcean, Lightsail, Oracle Cloud ou similar.

### Opção alternativa: Railway

- O Railway funciona bem
- Mas hoje costuma exigir plano pago/créditos
- Se o seu objetivo é custo zero, não é a melhor opção inicial

---

## 2. Configurar o Frontend (app.js)

Edite `app.js` na linha 2:

### ANTES:
```javascript
const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5174'
   : 'https://letheris.onrender.com';
```

### DEPOIS:
```javascript
const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5174'
   : 'https://letheris.onrender.com';
```

Salve o arquivo e faça commit:
```bash
git add app.js
git commit -m "feat: configurar URL do backend para production"
git push origin main
```

---

## 3. Deploy do Frontend (GitHub Pages)

### Automático (já está configurado):
- Vá em Settings > Pages
- Source: "Deploy from a branch"
- Branch: "main"
- Clique em "Save"

GitHub Pages vai fazer deploy automaticamente quando você fizer push!

**Seu site estará em:**
```
https://seu-usuario.github.io/seu-repo-name
```

---

## 4. Testar tudo

1. **Abra seu frontend:**
   ```
   https://seu-usuario.github.io/seu-repo-name
   ```

2. **Tente fazer login:**
   - Use a senha que configurou em `ADMIN_PASSWORD` no backend
   - Clique em "Entrar"
   - Deve funcionar agora! ✅

3. **Se receber erro:**
   - Abra DevTools (F12 > Console)
   - Procure por erros de CORS
   - Verifique se `ALLOWED_ORIGIN` está correto no host do backend
   - Redeploy o backend

---

## 5. Estrutura Final

```
Frontend:  https://seu-usuario.github.io/seu-repo-name
Backend:   https://letheris.onrender.com
Banco:     SQLite (bom para demo; para produção prefira VPS ou Postgres)
```

✨ Tudo funcionando!
