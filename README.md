# Letheris

Rede social estilo Twitter para **operador único**: você cria perfis/personas e controla todos os posts e respostas, com backend próprio e login de administrador.

## Stack

- Frontend: HTML/CSS/JS puro.
- Backend: Node.js + Express.
- Banco: SQLite (`node:sqlite`, nativo do Node).
- Sessão: `express-session` (cookie HTTP-only).

## Recursos

- Login único de administrador.
- Troca de senha pelo painel "Configurações".
- Modo visitante com timeline pública (somente leitura).
- Modo usuário com criação de conta única (nome + @) para interagir.
- Limite no modo usuário: 1 post original a cada 30 minutos.
- Limite no modo usuário: 1 resposta por post a cada 30 minutos.
- Criar, editar e excluir perfis.
- Publicar como qualquer perfil.
- Responder como qualquer perfil.
- Excluir posts e respostas.
- Filtrar timeline por perfil.
- Persistência real em banco local (`data/letheris.db`).

## Configuração Rápida

### Uso Local (seu próprio computador)

1. Clone o repositório:

	```bash
	git clone https://github.com/seu-usuario/seu-repo.git
	cd seu-repo
	```

2. Instale dependências:

	```bash
	npm install
	```

	> ✅ Automaticamente cria `.env` baseado em `.env.example`

3. (Opcional) Edite `.env` com suas credenciais seguras:

	```bash
	# Abra o arquivo .env e altere:
	ADMIN_PASSWORD=sua-senha-super-forte
	SESSION_SECRET=um-segredo-grande-e-aleatorio
	```

4. Rode o servidor:

	```bash
	npm start
	```

   Ou em modo desenvolvimento (com auto-reload):
   ```bash
	npm run dev
	```

5. Abra no navegador:

	```
	http://localhost:5174
	```

6. Para usuários externos, clique em **Ver timeline pública**.
7. Para interagir, clique em **Entrar como usuário**.

### Deploy (para compartilhar com outras pessoas)

O **frontend (HTML/CSS/JS)** e **backend (Node.js)** precisam ser hospedados **em lugares diferentes**:

**Importante:** este projeto usa **SQLite**. Em hospedagem gratuita, o disco costuma ser temporário. Isso significa que o app pode funcionar, mas o banco pode ser perdido após restart, deploy ou tempo de inatividade.

#### Step 1: Deploy do Backend

Escolha uma das opções abaixo:

**Opção A: Render** (bom para teste/demo)
```bash
# 1. Crie conta em https://render.com
# 2. Conecte seu repositório GitHub
# 3. Configure variáveis de ambiente:
ADMIN_PASSWORD=sua-senha-forte
SESSION_SECRET=seu-segredo-grande
ALLOWED_ORIGIN=https://seu-dominio.github.io
PORT=5174
# 4. Deploy automático quando fizer push!
```

Limitação: no plano gratuito, o backend pode hibernar e o armazenamento local do SQLite não é adequado para dados importantes.

**Opção B: VPS próprio** (melhor para uso real)
- DigitalOcean, Hostinger VPS, Oracle Cloud, AWS Lightsail ou similar
- Clone o repositório
- Rode `npm install && npm start`
- Mantém melhor controle sobre SQLite e arquivos locais

**Opção C: Railway**
- Funciona bem, mas normalmente exige plano pago/créditos
- Vale se você quiser deploy simples sem administrar servidor

**Opção D: Migrar banco para Postgres e manter backend grátis**
- Se quiser hospedagem gratuita com mais confiabilidade, o ideal é trocar SQLite por Postgres
- Aí você pode usar Render, Koyeb, Fly.io ou outro host sem depender de disco local

#### Step 2: Deploy do Frontend

**Opção A: GitHub Pages** (gratuito)
```bash
# 1. Seu repositório já está no GitHub
# 2. Vá em Settings > Pages
# 3. Escolha "Deploy from a branch"
# 4. Selecione branch "main"
# 5. O site será hospedado em https://seu-usuario.github.io/seu-repo
```

**Opção B: Netlify** (gratuito)
- Conecte GitHub em https://netlify.com
- Deploy automático

#### Step 3: Configurar URLs

1. **No `app.js`**, atualize `API_BASE_URL`:
   ```javascript
   const API_BASE_URL = window.location.hostname === 'localhost' 
     ? 'http://localhost:5174'
		 : 'https://letheris.onrender.com'; // URL do backend deployado
   ```

2. **No `.env` do backend**, adicione:
   ```env
   ALLOWED_ORIGIN=https://seu-usuario.github.io
   ```

3. **Faça push** para GitHub - o deploy será automático!

#### Resultado Final:
- Frontend: `https://seu-usuario.github.io/seu-repo`
- Backend: `https://letheris.onrender.com`
- Tudo funcionando! ✅

## Observações & Troubleshooting

- **Setup automático**: Ao rodar `npm install`, o arquivo `.env` é criado automaticamente a partir de `.env.example`.
- **Credenciais personalizadas?** Edite `.env` após a instalação com suas senhas fortes.
- **Primeira execução**: A senha em `.env` é usada **apenas** para criar o banco de dados na primeira vez. Depois disso, pode ser alterada no próprio app (seção "Configurações").
- **"Erro na requisição" ao fazer login?**
  - Certifique-se de que o servidor está rodando: `npm start`
  - Abra `http://localhost:5174` direto (não através do GitHub Pages)
  - Se o frontend estiver em GitHub Pages, configure corretamente em `app.js` (veja seção "Deploy" acima)
- **"CORS error" ao tentar fazer login do GitHub Pages?**
  - Edite `app.js` e configure `API_BASE_URL` (linha 2) com sua URL de backend
  - Adicione essa URL em `.env`: `ALLOWED_ORIGIN=https://seu-frontend.github.io`
  - Redeploy o backend
- **Vai usar hospedagem grátis?** Para demonstração funciona. Para uso real com SQLite, prefira VPS ou migre o banco para Postgres.
- **Esqueceu a senha?** Em qualquer máquina, use: `npm run reset-password` (solicita a nova senha no terminal).
- **Resetar tudo**: Pare o servidor e delete a pasta `data/` inteira. Na próxima execução, o banco será recriado com as credenciais do `.env`.
- **Banco de dados**: Criado automaticamente em `data/letheris.db` (não está no Git).
- **Aviso**: Não use Live Preview do VS Code na porta 3000. Sempre acesse via `http://localhost:5174` direto.
- **Modo de desenvolvimento**: Use `npm run dev` para ver logs em tempo real e auto-reload.
