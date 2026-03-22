// Configuração de URL base do servidor
// Em desenvolvimento (localhost): aponta para http://localhost:5174
// Em produção (GitHub Pages): aponta para sua URL de deployment
const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5174'
  : 'https://letheris.onrender.com';

const state = {
  profiles: [],
  posts: [],
  activeProfileId: "",
  filterProfileId: "",
  userAccount: null,
  userPosts: []
};

const authScreen = document.getElementById("auth-screen");
const publicScreen = document.getElementById("public-screen");
const userScreen = document.getElementById("user-screen");
const appShell = document.getElementById("app-shell");
const authTitle = document.getElementById("auth-title");
const loginForm = document.getElementById("login-form");
const loginPasswordInput = document.getElementById("login-password");
const loginError = document.getElementById("login-error");
const networkBanner = document.getElementById("network-banner");
const logoutButton = document.getElementById("logout-btn");
const openPublicViewButton = document.getElementById("open-public-view");
const openUserViewButton = document.getElementById("open-user-view");
const backToLoginButton = document.getElementById("back-to-login");
const refreshPublicButton = document.getElementById("refresh-public");
const publicFeed = document.getElementById("public-feed");
const backFromUserButton = document.getElementById("back-from-user");

const userRegisterWrap = document.getElementById("user-register-wrap");
const userActionsWrap = document.getElementById("user-actions-wrap");
const userRegisterForm = document.getElementById("user-register-form");
const userNameInput = document.getElementById("user-name");
const userHandleInput = document.getElementById("user-handle");
const userRegisterMessage = document.getElementById("user-register-message");
const userAccountName = document.getElementById("user-account-name");
const userAccountHandle = document.getElementById("user-account-handle");
const userLogoutButton = document.getElementById("user-logout");
const userPostForm = document.getElementById("user-post-form");
const userPostContent = document.getElementById("user-post-content");
const userPostCounter = document.getElementById("user-post-counter");
const userPostMessage = document.getElementById("user-post-message");
const userFeed = document.getElementById("user-feed");
const passwordForm = document.getElementById("password-form");
const currentPasswordInput = document.getElementById("current-password");
const newPasswordInput = document.getElementById("new-password");
const confirmPasswordInput = document.getElementById("confirm-password");
const passwordMessage = document.getElementById("password-message");

const profileForm = document.getElementById("profile-form");
const profileNameInput = document.getElementById("profile-name");
const profileHandleInput = document.getElementById("profile-handle");
const profileBioInput = document.getElementById("profile-bio");
const profilesList = document.getElementById("profiles-list");
const clearFilterButton = document.getElementById("clear-filter");

const postForm = document.getElementById("post-form");
const postProfileSelect = document.getElementById("post-profile");
const postContentInput = document.getElementById("post-content");
const postCounter = document.getElementById("post-counter");
const feed = document.getElementById("feed");
const timelineLabel = document.getElementById("timeline-label");

const profileTemplate = document.getElementById("profile-template");
const postTemplate = document.getElementById("post-template");

let editProfileId = "";
let userUnlockClicks = 0;
const USER_UNLOCK_CLICKS = 5;

boot();

async function boot() {
  bindEvents();
  const session = await apiRequest("/api/session", { method: "GET" }, false);

  if (session?.__networkError) {
    showAuth();
    loginError.textContent = session.error;
    return;
  }

  if (session?.loggedIn) {
    await enterApp();
  } else {
    showAuth();
  }
}

function bindEvents() {
  loginForm.addEventListener("submit", onLoginSubmit);
  logoutButton.addEventListener("click", onLogout);
  passwordForm.addEventListener("submit", onPasswordSubmit);
  openPublicViewButton.addEventListener("click", onOpenPublicView);
  openUserViewButton.addEventListener("click", onOpenUserView);
  authTitle.addEventListener("click", onAuthTitleClick);
  backToLoginButton.addEventListener("click", showAuth);
  backFromUserButton.addEventListener("click", showAuth);
  refreshPublicButton.addEventListener("click", onRefreshPublicView);
  userRegisterForm.addEventListener("submit", onUserRegisterSubmit);
  userLogoutButton.addEventListener("click", onUserLogout);
  userPostForm.addEventListener("submit", onUserPostSubmit);
  userPostContent.addEventListener("input", () => {
    userPostCounter.textContent = `${userPostContent.value.length}/280`;
  });

  profileForm.addEventListener("submit", onProfileSubmit);
  postForm.addEventListener("submit", onPostSubmit);

  postContentInput.addEventListener("input", () => {
    postCounter.textContent = `${postContentInput.value.length}/280`;
  });

  clearFilterButton.addEventListener("click", async () => {
    state.filterProfileId = "";
    await loadPosts();
    renderFeed();
    renderTimelineLabel();
  });
}

async function onLoginSubmit(event) {
  event.preventDefault();
  loginError.textContent = "";

  const password = loginPasswordInput.value;
  const response = await apiRequest("/api/login", {
    method: "POST",
    body: { password }
  }, false);

  if (!response?.ok) {
    loginError.textContent = response?.error || "Falha no login.";
    return;
  }

  loginForm.reset();
  await enterApp();
}

async function onLogout() {
  await apiRequest("/api/logout", { method: "POST" }, false);
  state.profiles = [];
  state.posts = [];
  state.activeProfileId = "";
  state.filterProfileId = "";
  editProfileId = "";
  clearPasswordMessage();
  passwordForm.reset();
  showAuth();
}

async function onPasswordSubmit(event) {
  event.preventDefault();
  clearPasswordMessage();

  const currentPassword = currentPasswordInput.value.trim();
  const newPassword = newPasswordInput.value.trim();
  const confirmPassword = confirmPasswordInput.value.trim();

  if (!currentPassword || !newPassword || !confirmPassword) {
    setPasswordMessage("Preencha todos os campos.", true);
    return;
  }

  if (newPassword.length < 6) {
    setPasswordMessage("A nova senha deve ter ao menos 6 caracteres.", true);
    return;
  }

  if (newPassword !== confirmPassword) {
    setPasswordMessage("A confirmação não corresponde à nova senha.", true);
    return;
  }

  const result = await apiRequest("/api/admin/password", {
    method: "POST",
    body: { currentPassword, newPassword }
  }, false);

  if (!result || result.error) {
    setPasswordMessage(result?.error || "Não foi possível alterar a senha.", true);
    return;
  }

  passwordForm.reset();
  setPasswordMessage("Senha alterada com sucesso.");
}

async function enterApp() {
  showApp();
  await loadProfiles();
  await loadPosts();
  ensureActiveProfile();
  renderAll();
}

function showAuth() {
  appShell.classList.add("hidden");
  publicScreen.classList.add("hidden");
  userScreen.classList.add("hidden");
  authScreen.classList.remove("hidden");
  loginPasswordInput.focus();
}

function showApp() {
  publicScreen.classList.add("hidden");
  userScreen.classList.add("hidden");
  authScreen.classList.add("hidden");
  appShell.classList.remove("hidden");
}

function showPublic() {
  appShell.classList.add("hidden");
  userScreen.classList.add("hidden");
  authScreen.classList.add("hidden");
  publicScreen.classList.remove("hidden");
}

function showUser() {
  appShell.classList.add("hidden");
  publicScreen.classList.add("hidden");
  authScreen.classList.add("hidden");
  userScreen.classList.remove("hidden");
}

async function onOpenPublicView() {
  showPublic();
  await renderPublicFeed();
}

async function onRefreshPublicView() {
  await renderPublicFeed();
}

async function onOpenUserView() {
  showUser();
  await loadUserAccount();
  await loadUserPosts();
  renderUserAccountArea();
  renderUserFeed();
}

function onAuthTitleClick() {
  if (!openUserViewButton.classList.contains("hidden")) {
    return;
  }

  userUnlockClicks += 1;
  if (userUnlockClicks >= USER_UNLOCK_CLICKS) {
    openUserViewButton.classList.remove("hidden");
  }
}

async function onProfileSubmit(event) {
  event.preventDefault();

  const name = profileNameInput.value.trim();
  const handle = profileHandleInput.value.trim();
  const bio = profileBioInput.value.trim();
  if (!name || !handle) return;

  const payload = { name, handle, bio };
  let result;

  if (editProfileId) {
    result = await apiRequest(`/api/profiles/${editProfileId}`, {
      method: "PUT",
      body: payload
    }, false);
  } else {
    result = await apiRequest("/api/profiles", {
      method: "POST",
      body: payload
    }, false);
  }

  if (!result || result.error) {
    alert(result?.error || "Não foi possível salvar o perfil.");
    return;
  }

  editProfileId = "";
  profileForm.querySelector("button[type='submit']").textContent = "Salvar perfil";
  profileForm.reset();

  await loadProfiles();
  ensureActiveProfile();
  renderProfiles();
  renderPostProfileOptions();
  renderTimelineLabel();
}

async function onPostSubmit(event) {
  event.preventDefault();

  const profileId = postProfileSelect.value;
  const content = postContentInput.value.trim();
  if (!profileId || !content) return;

  const result = await apiRequest("/api/posts", {
    method: "POST",
    body: { profileId, content }
  }, false);

  if (!result || result.error) {
    alert(result?.error || "Não foi possível criar o post.");
    return;
  }

  postContentInput.value = "";
  postCounter.textContent = "0/280";
  await loadPosts();
  renderFeed();
}

function renderAll() {
  renderProfiles();
  renderPostProfileOptions();
  renderFeed();
  renderTimelineLabel();
}

function renderProfiles() {
  profilesList.innerHTML = "";

  if (!state.profiles.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Nenhum perfil criado ainda.";
    profilesList.appendChild(empty);
    return;
  }

  state.profiles.forEach((profile) => {
    const node = profileTemplate.content.cloneNode(true);
    const article = node.querySelector(".profile-item");

    article.querySelector(".name").textContent = profile.name;
    article.querySelector(".handle").textContent = `@${profile.handle}`;
    article.querySelector(".bio").textContent = profile.bio || "Sem bio";

    node.querySelector("button[data-action='filter']").addEventListener("click", async () => {
      state.filterProfileId = profile.id;
      await loadPosts();
      renderFeed();
      renderTimelineLabel();
    });

    node.querySelector("button[data-action='set-active']").addEventListener("click", () => {
      state.activeProfileId = profile.id;
      renderPostProfileOptions();
    });

    node.querySelector("button[data-action='edit']").addEventListener("click", () => {
      editProfileId = profile.id;
      profileNameInput.value = profile.name;
      profileHandleInput.value = `@${profile.handle}`;
      profileBioInput.value = profile.bio;
      profileForm.querySelector("button[type='submit']").textContent = "Atualizar perfil";
      profileNameInput.focus();
    });

    node.querySelector("button[data-action='delete']").addEventListener("click", async () => {
      const confirmed = confirm(`Excluir perfil @${profile.handle}?`);
      if (!confirmed) return;

      const result = await apiRequest(`/api/profiles/${profile.id}`, {
        method: "DELETE"
      }, false);

      if (!result || result.error) {
        alert(result?.error || "Não foi possível excluir o perfil.");
        return;
      }

      if (state.activeProfileId === profile.id) {
        state.activeProfileId = "";
      }
      if (state.filterProfileId === profile.id) {
        state.filterProfileId = "";
      }

      await loadProfiles();
      await loadPosts();
      ensureActiveProfile();
      renderAll();
    });

    profilesList.appendChild(node);
  });
}

function renderPostProfileOptions() {
  postProfileSelect.innerHTML = "";

  if (!state.profiles.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Crie um perfil primeiro";
    postProfileSelect.appendChild(option);
    postProfileSelect.disabled = true;
    postContentInput.disabled = true;
    postForm.querySelector("button[type='submit']").disabled = true;
    return;
  }

  postProfileSelect.disabled = false;
  postContentInput.disabled = false;
  postForm.querySelector("button[type='submit']").disabled = false;

  state.profiles.forEach((profile) => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = `${profile.name} (@${profile.handle})`;
    postProfileSelect.appendChild(option);
  });

  ensureActiveProfile();
  postProfileSelect.value = state.activeProfileId;
}

function renderFeed() {
  feed.innerHTML = "";

  if (!state.posts.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Ainda não há postagens para mostrar.";
    feed.appendChild(empty);
    return;
  }

  state.posts.forEach((post) => {
    const node = postTemplate.content.cloneNode(true);
    const article = node.querySelector(".post-item");

    article.querySelector(".author").textContent = post.author.name;
    article.querySelector(".handle").textContent = `@${post.author.handle}`;
    article.querySelector(".time").textContent = formatDate(post.createdAt);
    article.querySelector(".content").textContent = post.content;
    article.querySelector(".reply-count").textContent = `${post.replies.length} resposta(s)`;

    const deletePostBtn = node.querySelector("button[data-action='delete-post']");
    deletePostBtn.addEventListener("click", async () => {
      const confirmed = confirm("Excluir esta postagem?");
      if (!confirmed) return;

      const result = await apiRequest(`/api/posts/${post.id}`, { method: "DELETE" }, false);
      if (!result || result.error) {
        alert(result?.error || "Não foi possível excluir o post.");
        return;
      }

      await loadPosts();
      renderFeed();
    });

    const replyForm = node.querySelector("form[data-role='reply-form']");
    const replySelect = node.querySelector("select[data-role='reply-profile']");
    const replyContent = node.querySelector("textarea[data-role='reply-content']");
    const replyCounter = node.querySelector("small[data-role='reply-counter']");

    state.profiles.forEach((profile) => {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = `${profile.name} (@${profile.handle})`;
      replySelect.appendChild(option);
    });

    replySelect.value = state.activeProfileId || state.profiles[0]?.id || "";

    replyContent.addEventListener("input", () => {
      replyCounter.textContent = `${replyContent.value.length}/280`;
    });

    replyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const content = replyContent.value.trim();
      const profileId = replySelect.value;
      if (!content || !profileId) return;

      const result = await apiRequest(`/api/posts/${post.id}/replies`, {
        method: "POST",
        body: { profileId, content }
      }, false);

      if (!result || result.error) {
        alert(result?.error || "Não foi possível responder.");
        return;
      }

      await loadPosts();
      renderFeed();
    });

    const repliesContainer = node.querySelector(".replies");
    post.replies.forEach((reply) => {
      const replyNode = document.createElement("article");
      replyNode.className = "reply-item";
      replyNode.innerHTML = `
        <div class="row between align-start">
          <div>
            <strong>${escapeHtml(reply.author.name)}</strong>
            <span class="muted">@${escapeHtml(reply.author.handle)}</span>
          </div>
          <small class="muted">${formatDate(reply.createdAt)}</small>
        </div>
        <p class="content">${escapeHtml(reply.content)}</p>
      `;

      const footer = document.createElement("div");
      footer.className = "row between";

      const spacer = document.createElement("span");
      const deleteReplyBtn = document.createElement("button");
      deleteReplyBtn.className = "ghost danger";
      deleteReplyBtn.textContent = "Excluir resposta";

      deleteReplyBtn.addEventListener("click", async () => {
        const confirmed = confirm("Excluir esta resposta?");
        if (!confirmed) return;

        const result = await apiRequest(`/api/replies/${reply.id}`, { method: "DELETE" }, false);
        if (!result || result.error) {
          alert(result?.error || "Não foi possível excluir a resposta.");
          return;
        }

        await loadPosts();
        renderFeed();
      });

      footer.append(spacer, deleteReplyBtn);
      replyNode.appendChild(footer);
      repliesContainer.appendChild(replyNode);
    });

    feed.appendChild(node);
  });
}

function renderTimelineLabel() {
  const profile = state.profiles.find((item) => item.id === state.filterProfileId);
  timelineLabel.textContent = profile
    ? `Filtrando por @${profile.handle}`
    : "Exibindo todas as contas";
}

function ensureActiveProfile() {
  const exists = state.profiles.some((profile) => profile.id === state.activeProfileId);
  if (!exists) {
    state.activeProfileId = state.profiles[0]?.id || "";
  }
}

async function loadProfiles() {
  const profiles = await apiRequest("/api/profiles", { method: "GET" }, false);
  if (!Array.isArray(profiles)) {
    state.profiles = [];
    return;
  }
  state.profiles = profiles;
}

async function loadPosts() {
  const query = state.filterProfileId
    ? `?profileId=${encodeURIComponent(state.filterProfileId)}`
    : "";
  const posts = await apiRequest(`/api/posts${query}`, { method: "GET" }, false);
  state.posts = Array.isArray(posts) ? posts : [];
}

async function apiRequest(url, options = {}, redirectOnUnauthorized = true) {
  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

  const headers = {
    ...(options.headers || {})
  };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const fetchOptions = {
    method: options.method || "GET",
    headers,
    credentials: 'include' // Enviar cookies (necessário para sessão)
  };

  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(fullUrl, fetchOptions);
    const data = await response.json().catch(() => ({}));

    hideNetworkBanner();

    if (response.status === 401 && redirectOnUnauthorized) {
      showAuth();
    }

    if (!response.ok) {
      return { error: data?.error || "Erro na requisição." };
    }

    return data;
  } catch {
    const message = "Sem conexão com o backend. Verifique deploy/CORS no Render e tente novamente.";
    showNetworkBanner(message);
    return { error: message, __networkError: true };
  }
}

function showNetworkBanner(message) {
  if (!networkBanner) {
    return;
  }

  networkBanner.textContent = message;
  networkBanner.classList.remove("hidden");
}

function hideNetworkBanner() {
  if (!networkBanner) {
    return;
  }

  networkBanner.textContent = "";
  networkBanner.classList.add("hidden");
}

function formatDate(isoString) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(isoString));
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function renderPublicFeed() {
  publicFeed.innerHTML = "";

  const posts = await apiRequest("/api/public/posts", { method: "GET" }, false);
  if (!Array.isArray(posts) || !posts.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Ainda não há postagens públicas para mostrar.";
    publicFeed.appendChild(empty);
    return;
  }

  posts.forEach((post) => {
    const postNode = document.createElement("article");
    postNode.className = "post-item";

    const repliesHtml = post.replies
      .map((reply) => `
        <article class="reply-item">
          <div class="row between align-start">
            <div>
              <strong>${escapeHtml(reply.author.name)}</strong>
              <span class="muted">@${escapeHtml(reply.author.handle)}</span>
            </div>
            <small class="muted">${formatDate(reply.createdAt)}</small>
          </div>
          <p class="content">${escapeHtml(reply.content)}</p>
        </article>
      `)
      .join("");

    postNode.innerHTML = `
      <header class="row between align-start">
        <div>
          <strong>${escapeHtml(post.author.name)}</strong>
          <span class="muted">@${escapeHtml(post.author.handle)}</span>
        </div>
        <small class="muted">${formatDate(post.createdAt)}</small>
      </header>
      <p class="content">${escapeHtml(post.content)}</p>
      <small class="muted">${post.replies.length} resposta(s)</small>
      <div class="stack">${repliesHtml}</div>
    `;

    publicFeed.appendChild(postNode);
  });
}

async function onUserRegisterSubmit(event) {
  event.preventDefault();
  setUserRegisterMessage("");

  const name = userNameInput.value.trim();
  const handle = userHandleInput.value.trim();
  if (!name || !handle) {
    setUserRegisterMessage("Nome e @usuario são obrigatórios.", true);
    return;
  }

  const result = await apiRequest("/api/public/register", {
    method: "POST",
    body: { name, handle }
  }, false);

  if (!result || result.error) {
    setUserRegisterMessage(result?.error || "Não foi possível criar sua conta.", true);
    return;
  }

  userRegisterForm.reset();
  await loadUserAccount();
  await loadUserPosts();
  renderUserAccountArea();
  renderUserFeed();
}

async function onUserLogout() {
  await apiRequest("/api/public/logout", { method: "POST" }, false);
  state.userAccount = null;
  state.userPosts = [];
  userPostForm.reset();
  userPostCounter.textContent = "0/280";
  setUserPostMessage("");
  renderUserAccountArea();
  renderUserFeed();
}

async function onUserPostSubmit(event) {
  event.preventDefault();
  setUserPostMessage("");

  const content = userPostContent.value.trim();
  if (!content) {
    return;
  }

  const result = await apiRequest("/api/public/posts", {
    method: "POST",
    body: { content }
  }, false);

  if (!result || result.error) {
    setUserPostMessage(result?.error || "Não foi possível publicar.", true);
    return;
  }

  userPostForm.reset();
  userPostCounter.textContent = "0/280";
  await loadUserPosts();
  renderUserFeed();
}

async function loadUserAccount() {
  const result = await apiRequest("/api/public/account", { method: "GET" }, false);
  state.userAccount = result?.account || null;
}

async function loadUserPosts() {
  const posts = await apiRequest("/api/public/posts", { method: "GET" }, false);
  state.userPosts = Array.isArray(posts) ? posts : [];
}

function renderUserAccountArea() {
  const hasAccount = Boolean(state.userAccount?.profile?.id);

  userRegisterWrap.classList.toggle("hidden", hasAccount);
  userActionsWrap.classList.toggle("hidden", !hasAccount);

  if (!hasAccount) {
    userAccountName.textContent = "";
    userAccountHandle.textContent = "";
    return;
  }

  userAccountName.textContent = state.userAccount.profile.name;
  userAccountHandle.textContent = `@${state.userAccount.profile.handle}`;
}

function renderUserFeed() {
  userFeed.innerHTML = "";

  if (!state.userPosts.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Ainda não há postagens para mostrar.";
    userFeed.appendChild(empty);
    return;
  }

  state.userPosts.forEach((post) => {
    const postNode = document.createElement("article");
    postNode.className = "post-item";

    const repliesHtml = post.replies
      .map((reply) => `
        <article class="reply-item">
          <div class="row between align-start">
            <div>
              <strong>${escapeHtml(reply.author.name)}</strong>
              <span class="muted">@${escapeHtml(reply.author.handle)}</span>
            </div>
            <small class="muted">${formatDate(reply.createdAt)}</small>
          </div>
          <p class="content">${escapeHtml(reply.content)}</p>
        </article>
      `)
      .join("");

    postNode.innerHTML = `
      <header class="row between align-start">
        <div>
          <strong>${escapeHtml(post.author.name)}</strong>
          <span class="muted">@${escapeHtml(post.author.handle)}</span>
        </div>
        <small class="muted">${formatDate(post.createdAt)}</small>
      </header>
      <p class="content">${escapeHtml(post.content)}</p>
      <small class="muted">${post.replies.length} resposta(s)</small>
      <div class="stack">${repliesHtml}</div>
    `;

    if (state.userAccount?.profile?.id) {
      const form = document.createElement("form");
      form.className = "stack";
      form.innerHTML = `
        <textarea maxlength="280" placeholder="Responder este post..." required></textarea>
        <div class="row">
          <button type="submit">Responder</button>
        </div>
      `;

      const replyInput = form.querySelector("textarea");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const content = replyInput.value.trim();
        if (!content) {
          return;
        }

        const result = await apiRequest(`/api/public/posts/${post.id}/replies`, {
          method: "POST",
          body: { content }
        }, false);

        if (!result || result.error) {
          alert(result?.error || "Não foi possível responder este post.");
          return;
        }

        await loadUserPosts();
        renderUserFeed();
      });

      postNode.appendChild(form);
    }

    userFeed.appendChild(postNode);
  });
}

function setUserRegisterMessage(message, isError = false) {
  userRegisterMessage.textContent = message;
  userRegisterMessage.classList.toggle("danger-text", isError);
  userRegisterMessage.classList.toggle("success-text", Boolean(message) && !isError);
}

function setUserPostMessage(message, isError = false) {
  userPostMessage.textContent = message;
  userPostMessage.classList.toggle("danger-text", isError);
  userPostMessage.classList.toggle("success-text", Boolean(message) && !isError);
}

function setPasswordMessage(message, isError = false) {
  passwordMessage.textContent = message;
  passwordMessage.classList.toggle("danger-text", isError);
  passwordMessage.classList.toggle("success-text", !isError);
}

function clearPasswordMessage() {
  passwordMessage.textContent = "";
  passwordMessage.classList.remove("danger-text");
  passwordMessage.classList.remove("success-text");
}
