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

## Configuração

1. Instale dependências:

	```bash
	npm install
	```

2. Crie um arquivo `.env` na raiz (pode copiar de `.env.example`) com:

	```env
	ADMIN_PASSWORD=sua-senha-forte
	SESSION_SECRET=um-segredo-grande-e-aleatorio
	PORT=5174
	```

3. Rode o servidor:

	```bash
	npm start
	```

4. Abra no navegador:

	```
	http://localhost:5174
	```

5. Para usuários externos, na tela inicial use **Ver timeline pública**.
6. Para interação como usuário comum, use **Entrar como usuário**.

## Observações

- A senha definida em `.env` é usada como senha inicial apenas na primeira execução do banco.
- Depois, a troca de senha é feita no próprio app (seção "Configurações").
- Se esquecer a senha, rode: `npm run reset-password -- nova-senha`.
- Não abra pelo Live Preview do VS Code na porta 3000; use a URL do backend (`http://localhost:5174`).
- Banco é criado automaticamente na pasta `data/`.
- Para resetar tudo, pare o servidor e exclua `data/letheris.db`.
