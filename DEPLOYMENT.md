# GUIA RÁPIDO: Deploy gratuito com Render + Supabase (Postgres)

Este projeto agora usa Postgres no backend. O caminho recomendado para custo zero é:

- Frontend no GitHub Pages
- Backend no Render
- Banco Postgres no Supabase

## 1. Criar banco no Supabase

1. Acesse https://supabase.com e crie uma conta.
2. Clique em "New project".
3. Após criar, abra "Settings" > "Database".
4. Copie a string de conexão Postgres (URI).
5. Garanta que a URL termine com `?sslmode=require`.

Formato esperado:

```text
postgresql://USUARIO:SENHA@HOST:5432/postgres?sslmode=require
```

## 2. Configurar backend no Render

1. Acesse https://render.com.
2. Abra seu Web Service.
3. Em "Environment", configure:

```env
DATABASE_URL=postgresql://USUARIO:SENHA@HOST:5432/postgres?sslmode=require
SESSION_SECRET=um-segredo-grande-e-aleatorio
ALLOWED_ORIGIN=https://justbegabs.github.io
NODE_ENV=production
PORT=5174
```

4. Salve e execute "Deploy latest commit".

## 3. Deploy do frontend (GitHub Pages)

1. No GitHub, vá em "Settings" > "Pages".
2. Em "Source", selecione "Deploy from a branch".
3. Use a branch `main`.

## 4. Verificação rápida

1. Abra o frontend publicado.
2. Teste login/admin.
3. Crie uma conta pública e publique um post.
4. Reinicie o serviço no Render e confirme que os dados continuam lá.

Se os dados persistirem após reinício, o banco está correto.
