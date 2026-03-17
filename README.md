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

### Passos:

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

## Observações & Troubleshooting

- **Setup automático**: Ao rodar `npm install`, o arquivo `.env` é criado automaticamente a partir de `.env.example`.
- **Credenciais personalizadas?** Edite `.env` após a instalação com suas senhas fortes.
- **Primeira execução**: A senha em `.env` é usada **apenas** para criar o banco de dados na primeira vez. Depois disso, pode ser alterada no próprio app (seção "Configurações").
- **Esqueceu a senha?** Em qualquer máquina, use: `npm run reset-password` (solicita a nova senha no terminal).
- **Resetar tudo**: Pare o servidor e delete a pasta `data/` inteira. Na próxima execução, o banco será recriado com as credenciais do `.env`.
- **Banco de dados**: Criado automaticamente em `data/letheris.db` (não está no Git).
- **Aviso**: Não use Live Preview do VS Code na porta 3000. Sempre abra `http://localhost:5174` direto no navegador.
- **Modo de desenvolvimento**: Use `npm run dev` para ver logs em tempo real e auto-reload.
