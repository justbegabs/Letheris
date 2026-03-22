# GUIA DE DEPLOY: Render (backend + banco Postgres)

Este projeto usa Postgres no backend. O fluxo abaixo usa o banco de dados gerenciado do próprio Render.

- Frontend: GitHub Pages
- Backend: Render Web Service
- Banco: Render PostgreSQL (gerenciado)

## 1. Criar o banco de dados no Render

1. Acesse https://render.com e entre na sua conta.
2. Clique em **"New +"** > **"PostgreSQL"**.
3. Configure:
   - **Name**: letheris-db (ou qualquer nome)
   - **Region**: a mesma que você usará no Web Service
   - **Plan**: escolha o plano desejado
4. Clique em **"Create Database"**.
5. Aguarde a criação. Após concluir, abra o banco criado.
6. Copie o valor **"External Database URL"** (ou "Internal Database URL" se o Web Service estiver na mesma região).

Formato esperado:

```text
postgresql://USUARIO:SENHA@HOST:5432/DBNAME
```

## 2. Configurar o Web Service no Render

1. Abra seu Web Service no Render.
2. Vá em **"Environment"**.
3. Adicione as variáveis:

```env
DATABASE_URL=postgresql://USUARIO:SENHA@HOST:5432/DBNAME
SESSION_SECRET=um-segredo-grande-e-aleatorio
ALLOWED_ORIGIN=https://justbegabs.github.io
NODE_ENV=production
PORT=5174
```

4. Clique em **"Save Changes"**.
5. Vá em **"Deploys"** > **"Deploy latest commit"**.

> Se o banco e o Web Service estiverem na mesma região, prefira a "Internal Database URL" — a conexão será mais rápida e sem custo de tráfego.

## 3. Deploy do frontend (GitHub Pages)

1. No GitHub, vá em **"Settings"** > **"Pages"**.
2. Em "Source", selecione "Deploy from a branch".
3. Use a branch `main`.

## 4. Verificação rápida

1. Abra o frontend publicado.
2. Faça login como admin (senha padrão: `admin123`).
3. Crie uma conta pública e publique um post.
4. Reinicie o serviço no Render e confirme que os dados continuam lá.

Se os dados persistirem após reinício, o banco está correto.
