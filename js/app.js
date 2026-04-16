
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const state = {
  session: null,
  user: null,
  profile: null,
  currentQuote: null,
  vote: null,
  timerSeconds: 60,
  timerHandle: null,
};

const $ = (id) => document.getElementById(id);
const els = {
  themeBtn: $('themeBtn'),
  quoteText: $('quoteText'),
  likeBtn: $('likeBtn'),
  dislikeBtn: $('dislikeBtn'),
  shareTextBtn: $('shareTextBtn'),
  shareCardBtn: $('shareCardBtn'),
  refreshBtn: $('refreshBtn'),
  timerText: $('timerText'),
  quotePermalinkHint: $('quotePermalinkHint'),
  globalStatus: $('globalStatus'),
  userBtn: $('userBtn'),
  openLoginBtn: $('openLoginBtn'),
  openRegisterBtn: $('openRegisterBtn'),

  loginModal: $('loginModal'),
  registerModal: $('registerModal'),
  cabinetModal: $('cabinetModal'),
  settingsModal: $('settingsModal'),
  statsModal: $('statsModal'),

  loginIdentity: $('loginIdentity'),
  loginPassword: $('loginPassword'),
  loginSubmitBtn: $('loginSubmitBtn'),
  switchToRegisterBtn: $('switchToRegisterBtn'),
  loginStatus: $('loginStatus'),

  registerEmail: $('registerEmail'),
  registerUsername: $('registerUsername'),
  registerPassword: $('registerPassword'),
  registerSubmitBtn: $('registerSubmitBtn'),
  switchToLoginBtn: $('switchToLoginBtn'),
  registerStatus: $('registerStatus'),

  cabinetEmail: $('cabinetEmail'),
  cabinetUsername: $('cabinetUsername'),
  adminLink: $('adminLink'),
  settingsBtn: $('settingsBtn'),
  likedList: $('likedList'),
  dislikedList: $('dislikedList'),
  suggestionText: $('suggestionText'),
  suggestionSubmitBtn: $('suggestionSubmitBtn'),
  suggestionStatus: $('suggestionStatus'),
  cabinetStatus: $('cabinetStatus'),
  logoutBtn: $('logoutBtn'),
  disableTimerCheckbox: $('disableTimerCheckbox'),

  settingsEmail: $('settingsEmail'),
  settingsUsername: $('settingsUsername'),
  settingsPassword: $('settingsPassword'),
  lightAccentInput: $('lightAccentInput'),
  darkAccentInput: $('darkAccentInput'),
  saveSettingsBtn: $('saveSettingsBtn'),
  settingsStatus: $('settingsStatus'),

  statsBtn: $('statsBtn'),
  statsContent: $('statsContent'),
};

function setStatus(el, text = '', type = 'info') {
  if (!el) return;
  el.textContent = text;
  el.style.color = type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--muted)';
}

function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('theme', theme);
  applyAccentVars();
}

function applyAccentVars() {
  const root = document.body;
  const profile = state.profile || {};
  const light = profile.light_accent || '#c45aa5';
  const dark = profile.dark_accent || '#e88fc7';
  root.style.setProperty('--accent', document.body.classList.contains('dark') ? dark : light);
  root.style.setProperty('--accent-soft', hexToRgba(document.body.classList.contains('dark') ? dark : light, 0.18));
}

function hexToRgba(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(196,90,165,${alpha})`;
  const [r,g,b] = [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)];
  return `rgba(${r},${g},${b},${alpha})`;
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || saved === 'light') {
    applyTheme(saved);
  } else {
    applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }
}

function updateAuthUI() {
  const logged = !!state.user;
  els.userBtn.classList.toggle('hidden', !logged);
  els.openLoginBtn.classList.toggle('hidden', logged);
  els.openRegisterBtn.classList.toggle('hidden', logged);
  els.cabinetEmail.textContent = state.user?.email || '—';
  els.cabinetUsername.textContent = state.profile?.username || '—';
  els.adminLink.classList.toggle('hidden', state.profile?.role !== 'admin');
  if (state.profile) {
    els.settingsEmail.value = state.user?.email || '';
    els.settingsUsername.value = state.profile.username || '';
    els.lightAccentInput.value = normalizeColor(state.profile.light_accent || '#c45aa5');
    els.darkAccentInput.value = normalizeColor(state.profile.dark_accent || '#e88fc7');
    els.disableTimerCheckbox.checked = !!state.profile.disable_timer;
    applyAccentVars();
  }
}

function normalizeColor(v) {
  return /^#[0-9A-Fa-f]{6}$/.test(v || '') ? v : '#c45aa5';
}

async function initSession() {
  const { data: { session } } = await supabase.auth.getSession();
  state.session = session;
  state.user = session?.user || null;
  if (state.user) {
    await ensureProfile();
    await loadProfile();
  }
  updateAuthUI();
}

async function ensureProfile() {
  if (!state.user) return;
  await supabase.from('profiles').upsert({
    id: state.user.id,
    email: state.user.email,
    username: state.user.user_metadata?.username || null,
  }, { onConflict: 'id' });
}

async function loadProfile() {
  if (!state.user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
  state.profile = data || null;
  updateAuthUI();
  return data;
}

async function resolveIdentityToEmail(identity) {
  const trimmed = identity.trim();
  if (trimmed.includes('@')) return trimmed;
  const { data, error } = await supabase.from('profiles').select('email').eq('username', trimmed).maybeSingle();
  if (error || !data?.email) throw new Error('Пользователь не найден.');
  return data.email;
}

function validateUsername(username) {
  return /^[a-zA-Z0-9._]{3,24}$/.test(username);
}

async function login() {
  setStatus(els.loginStatus, 'Пробуем войти...');
  const identity = els.loginIdentity.value.trim();
  const password = els.loginPassword.value;
  if (!identity || !password) return setStatus(els.loginStatus, 'Заполните поля.', 'error');

  try {
    const email = await Promise.race([
      resolveIdentityToEmail(identity),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Сервер отвечает слишком долго.')), 10000))
    ]);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    state.session = data.session;
    state.user = data.user;
    await ensureProfile();
    await loadProfile();
    updateAuthUI();
    closeModal('loginModal');
    setStatus(els.globalStatus, 'Вход выполнен.', 'success');
    await loadQuoteFromUrlOrRandom();
  } catch (e) {
    setStatus(els.loginStatus, humanError(e), 'error');
  }
}

async function register() {
  setStatus(els.registerStatus, 'Создаём аккаунт...');
  const email = els.registerEmail.value.trim();
  const username = els.registerUsername.value.trim();
  const password = els.registerPassword.value;
  if (!email || !username || !password) return setStatus(els.registerStatus, 'Заполните поля.', 'error');
  if (!validateUsername(username)) return setStatus(els.registerStatus, 'Логин: латиница, цифры, точка, подчёркивание. 3–24 символа.', 'error');
  const { data: existing } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle();
  if (existing) return setStatus(els.registerStatus, 'Такой логин уже занят.', 'error');

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } }
    });
    if (error) throw error;
    // If confirm email disabled, session exists immediately
    if (data.user) {
      state.user = data.user;
      state.session = data.session || null;
      await supabase.from('profiles').upsert({ id: data.user.id, email, username }, { onConflict: 'id' });
      await loadProfile();
    }
    closeModal('registerModal');
    openModal('loginModal');
    els.loginIdentity.value = username;
    setStatus(els.globalStatus, data.session ? 'Аккаунт создан, вход выполнен.' : 'Аккаунт создан. Теперь войдите.', 'success');
    if (data.session) {
      closeModal('loginModal');
      updateAuthUI();
      await loadQuoteFromUrlOrRandom();
    }
  } catch (e) {
    setStatus(els.registerStatus, humanError(e), 'error');
  }
}

function humanError(e) {
  const msg = String(e?.message || e || '');
  if (msg.toLowerCase().includes('invalid login credentials')) return 'Неверный логин/почта или пароль.';
  if (msg.toLowerCase().includes('email rate limit')) return 'Слишком много попыток, попробуйте позже.';
  if (msg.toLowerCase().includes('user already registered')) return 'Такой пользователь уже зарегистрирован.';
  return msg || 'Что-то пошло не так.';
}

async function localLogout() {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (e) {
    console.error(e);
  } finally {
    for (const key of Object.keys(localStorage)) {
      if (key.includes('supabase')) localStorage.removeItem(key);
    }
    sessionStorage.clear();
    state.session = null;
    state.user = null;
    state.profile = null;
    updateAuthUI();
    closeModal('cabinetModal');
    setStatus(els.globalStatus, 'Вы вышли из аккаунта.', 'success');
    await loadQuoteFromUrlOrRandom();
  }
}

async function loadQuoteFromUrlOrRandom() {
  const fromUrl = new URLSearchParams(location.search).get('quote');
  if (fromUrl) {
    const loaded = await loadQuoteById(fromUrl);
    if (loaded) return;
  }
  await loadRandomQuote();
}

function updateQuoteUrl(id) {
  const url = new URL(window.location.href);
  url.searchParams.set('quote', id);
  history.replaceState({}, '', url);
  els.quotePermalinkHint.textContent = `#${id.slice(0, 8)}`;
}

async function loadQuoteById(id) {
  const { data } = await supabase.from('quotes').select('*').eq('id', id).eq('status', 'approved').maybeSingle();
  if (!data) return false;
  state.currentQuote = data;
  updateQuoteUrl(data.id);
  renderCurrentQuote();
  return true;
}

async function loadRandomQuote() {
  setStatus(els.globalStatus, '');
  const { data, error } = await supabase.from('quotes').select('*').eq('status', 'approved');
  if (error) {
    els.quoteText.textContent = 'Сервер долго думает. Попробуйте ещё раз.';
    return;
  }
  if (!data?.length) {
    els.quoteText.textContent = 'Пока нет опубликованных цитат.';
    return;
  }
  let list = data;
  if (state.user && state.profile) {
    const { data: votes } = await supabase.from('quote_votes').select('quote_id,vote').eq('user_id', state.user.id);
    const map = new Map((votes || []).map(v => [v.quote_id, v.vote]));
    const modeLiked = state.profile.liked_mode || 'all';
    const modeDisliked = state.profile.disliked_mode || 'all';
    list = list.filter(q => {
      const vote = map.get(q.id);
      if (modeLiked === 'only' && vote !== 'like') return false;
      if (modeLiked === 'hide' && vote === 'like') return false;
      if (modeDisliked === 'only' && vote !== 'dislike') return false;
      if (modeDisliked === 'hide' && vote === 'dislike') return false;
      return true;
    });
    if (!list.length) list = data;
  }
  state.currentQuote = list[Math.floor(Math.random() * list.length)];
  updateQuoteUrl(state.currentQuote.id);
  await syncVoteState();
  renderCurrentQuote();
  restartTimer();
}

async function syncVoteState() {
  state.vote = null;
  if (!state.user || !state.currentQuote) return;
  const { data } = await supabase.from('quote_votes').select('vote').eq('user_id', state.user.id).eq('quote_id', state.currentQuote.id).maybeSingle();
  state.vote = data?.vote || null;
}

function renderCurrentQuote() {
  els.quoteText.textContent = state.currentQuote?.text || 'Нет цитаты';
  els.likeBtn.classList.toggle('active-like', state.vote === 'like');
  els.dislikeBtn.classList.toggle('active-dislike', state.vote === 'dislike');
}

function restartTimer() {
  clearInterval(state.timerHandle);
  state.timerSeconds = 60;
  updateTimerText();
  if (state.profile?.disable_timer) {
    els.timerText.textContent = 'Таймер выключен';
    return;
  }
  state.timerHandle = setInterval(async () => {
    state.timerSeconds -= 1;
    updateTimerText();
    if (state.timerSeconds <= 0) {
      clearInterval(state.timerHandle);
      await loadRandomQuote();
    }
  }, 1000);
}

function updateTimerText() {
  const m = String(Math.floor(state.timerSeconds / 60)).padStart(2, '0');
  const s = String(state.timerSeconds % 60).padStart(2, '0');
  els.timerText.textContent = `Обновление через ${m}:${s}`;
}

async function vote(type, fromList = false) {
  if (!state.user) {
    setStatus(els.globalStatus, 'Сначала зарегистрируйтесь или войдите.', 'error');
    openModal('loginModal');
    return;
  }
  const quoteId = fromList ? fromList : state.currentQuote?.id;
  if (!quoteId) return;

  if (type === state.vote && quoteId === state.currentQuote?.id) {
    await supabase.from('quote_votes').delete().eq('user_id', state.user.id).eq('quote_id', quoteId);
    state.vote = null;
  } else {
    await supabase.from('quote_votes').upsert({ user_id: state.user.id, quote_id: quoteId, vote: type }, { onConflict: 'user_id,quote_id' });
    if (quoteId === state.currentQuote?.id) state.vote = type;
  }
  renderCurrentQuote();
  if (openPanelsVisible()) await loadCabinetLists();
}

function openPanelsVisible() {
  return !els.cabinetModal.classList.contains('hidden');
}

async function loadCabinetLists() {
  if (!state.user) return;
  const { data: votes } = await supabase.from('quote_votes').select('quote_id,vote').eq('user_id', state.user.id);
  const votesMap = new Map((votes || []).map(v => [v.quote_id, v.vote]));
  const ids = [...votesMap.keys()];
  if (!ids.length) {
    els.likedList.innerHTML = '<div class="admin-hint">Пока нет данных.</div>';
    els.dislikedList.innerHTML = '<div class="admin-hint">Пока нет данных.</div>';
    return;
  }
  const { data: quotes } = await supabase.from('quotes').select('id,text').in('id', ids);
  const likedMode = state.profile?.liked_mode || 'all';
  const dislikedMode = state.profile?.disliked_mode || 'all';

  const quoteById = new Map((quotes || []).map(q => [q.id, q]));
  const likedRows = [];
  const dislikedRows = [];
  (quotes || []).forEach(q => {
    const vote = votesMap.get(q.id);
    const likedPass = likedMode === 'all' || (likedMode === 'only' && vote === 'like') || (likedMode === 'hide' && vote !== 'like');
    const dislikedPass = dislikedMode === 'all' || (dislikedMode === 'only' && vote === 'dislike') || (dislikedMode === 'hide' && vote !== 'dislike');
    if (likedPass) likedRows.push(renderMiniQuote(q, vote));
    if (dislikedPass) dislikedRows.push(renderMiniQuote(q, vote));
  });
  els.likedList.innerHTML = likedRows.join('') || '<div class="admin-hint">Пока нет данных.</div>';
  els.dislikedList.innerHTML = dislikedRows.join('') || '<div class="admin-hint">Пока нет данных.</div>';
  bindMiniVotes();
}

function renderMiniQuote(q, vote) {
  return `<div class="mini-quote">
    <div class="mini-quote-text">${escapeHtml(q.text)}</div>
    <div class="mini-quote-actions">
      <button class="icon-btn mini-vote ${vote === 'like' ? 'active-like' : ''}" data-quote-id="${q.id}" data-vote="like" type="button">👍</button>
      <button class="icon-btn mini-vote ${vote === 'dislike' ? 'active-dislike' : ''}" data-quote-id="${q.id}" data-vote="dislike" type="button">👎</button>
    </div>
  </div>`;
}

function bindMiniVotes() {
  document.querySelectorAll('.mini-vote').forEach(btn => {
    btn.onclick = () => vote(btn.dataset.vote, btn.dataset.quoteId);
  });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

async function saveSettings() {
  if (!state.user) return;
  setStatus(els.settingsStatus, 'Сохраняем...');
  const username = els.settingsUsername.value.trim() || null;
  const email = els.settingsEmail.value.trim();
  const password = els.settingsPassword.value.trim();
  const lightAccent = els.lightAccentInput.value;
  const darkAccent = els.darkAccentInput.value;

  if (username && !validateUsername(username)) return setStatus(els.settingsStatus, 'Некорректный логин.', 'error');
  if (username) {
    const { data: duplicate } = await supabase.from('profiles').select('id').eq('username', username).neq('id', state.user.id).maybeSingle();
    if (duplicate) return setStatus(els.settingsStatus, 'Такой логин уже занят.', 'error');
  }

  const { error: pError } = await supabase.from('profiles').update({
    username,
    light_accent: lightAccent,
    dark_accent: darkAccent,
    disable_timer: !!els.disableTimerCheckbox.checked
  }).eq('id', state.user.id);
  if (pError) return setStatus(els.settingsStatus, pError.message, 'error');

  if (email && email !== state.user.email) {
    const { error } = await supabase.auth.updateUser({ email });
    if (error) setStatus(els.settingsStatus, 'Почта: ' + error.message, 'error');
    else setStatus(els.settingsStatus, 'На новую почту отправлено подтверждение.', 'success');
  }

  if (password) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setStatus(els.settingsStatus, error.message, 'error');
  }

  await loadProfile();
  restartTimer();
  setStatus(els.settingsStatus, 'Настройки сохранены.', 'success');
}

async function saveMode(kind, mode) {
  if (!state.user) return;
  const patch = kind === 'liked' ? { liked_mode: mode } : { disliked_mode: mode };
  await supabase.from('profiles').update(patch).eq('id', state.user.id);
  await loadProfile();
  await loadCabinetLists();
}

async function sendSuggestion() {
  if (!state.user) return setStatus(els.suggestionStatus, 'Сначала войдите.', 'error');
  const text = els.suggestionText.value.trim();
  if (!text) return setStatus(els.suggestionStatus, 'Введите текст.', 'error');
  const { error } = await supabase.from('quote_suggestions').insert({ text, status: 'pending', user_id: state.user.id });
  if (error) return setStatus(els.suggestionStatus, error.message, 'error');
  els.suggestionText.value = '';
  setStatus(els.suggestionStatus, 'Цитата отправлена.', 'success');
}

async function loadStats() {
  els.statsContent.innerHTML = 'Загрузка...';
  const { data: quotes } = await supabase.from('quotes').select('id,text,status').eq('status', 'approved');
  const { data: votes } = await supabase.from('quote_votes').select('quote_id,vote');
  const grouped = new Map();
  (quotes || []).forEach(q => grouped.set(q.id, { ...q, likes: 0, dislikes: 0 }));
  (votes || []).forEach(v => {
    const row = grouped.get(v.quote_id);
    if (!row) return;
    if (v.vote === 'like') row.likes += 1;
    if (v.vote === 'dislike') row.dislikes += 1;
  });
  const rows = [...grouped.values()];
  const maxLike = rows.sort((a,b)=>b.likes-a.likes)[0];
  const maxDislike = [...rows].sort((a,b)=>b.dislikes-a.dislikes)[0];
  if (!rows.length || ((maxLike?.likes || 0) === 0 && (maxDislike?.dislikes || 0) === 0)) {
    els.statsContent.innerHTML = '<div class="admin-hint">Сейчас мало данных для статистики, зайдите позже.</div>';
    return;
  }
  els.statsContent.innerHTML = `
    <div class="stats-item"><strong>Самая лайкнутая</strong><div>${escapeHtml(maxLike.text)}</div><div class="admin-hint">Лайков: ${maxLike.likes}</div></div>
    <div class="stats-item"><strong>Самая дизлайкнутая</strong><div>${escapeHtml(maxDislike.text)}</div><div class="admin-hint">Дизлайков: ${maxDislike.dislikes}</div></div>
  `;
}

function buildQuoteLink() {
  if (!state.currentQuote?.id) return location.href;
  const url = new URL(location.href);
  url.searchParams.set('quote', state.currentQuote.id);
  return url.toString();
}

async function shareText() {
  if (!state.currentQuote) return;
  const payload = `${state.currentQuote.text}\n\n${buildQuoteLink()}`;
  if (navigator.share) {
    try {
      await navigator.share({ text: payload });
      return;
    } catch {}
  }
  await navigator.clipboard.writeText(payload);
  setStatus(els.globalStatus, 'Текст и ссылка скопированы.', 'success');
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth) {
      if (current) lines.push(current);
      current = word;
    } else current = test;
  }
  if (current) lines.push(current);
  return lines;
}

async function shareCard() {
  if (!state.currentQuote) return;
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext('2d');
  const dark = document.body.classList.contains('dark');
  ctx.fillStyle = dark ? '#1a1622' : '#ffffff';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = dark ? '#3b3149' : '#eadfed';
  ctx.lineWidth = 3;
  ctx.strokeRect(22,22,canvas.width-44,canvas.height-44);
  ctx.fillStyle = dark ? '#f7f2fa' : '#241f2c';
  ctx.font = 'bold 42px Spectral';
  ctx.fillText('Мудрость дня', 80, 100);
  ctx.font = '36px Spectral';
  const lines = wrapText(ctx, state.currentQuote.text, 1040);
  let y = 190;
  lines.slice(0,8).forEach(line => { ctx.fillText(line, 80, y); y += 54; });
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  const file = new File([blob], 'mudrost-card.png', { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch {}
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mudrost-card.png';
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus(els.globalStatus, 'Карточка сохранена.', 'success');
}

function bindModeSelector(containerId, kind) {
  document.querySelectorAll(`#${containerId} .mode-btn`).forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll(`#${containerId} .mode-btn`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      await saveMode(kind, btn.dataset.mode);
    });
  });
}

function syncModeButtons() {
  const lm = state.profile?.liked_mode || 'all';
  const dm = state.profile?.disliked_mode || 'all';
  document.querySelectorAll('#likedModeSelector .mode-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === lm));
  document.querySelectorAll('#dislikedModeSelector .mode-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === dm));
}

function bindEvents() {
  els.themeBtn.onclick = () => applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
  els.openLoginBtn.onclick = () => openModal('loginModal');
  els.openRegisterBtn.onclick = () => openModal('registerModal');
  els.switchToRegisterBtn.onclick = () => { closeModal('loginModal'); openModal('registerModal'); };
  els.switchToLoginBtn.onclick = () => { closeModal('registerModal'); openModal('loginModal'); };
  els.userBtn.onclick = async () => { openModal('cabinetModal'); await loadCabinetLists(); syncModeButtons(); };
  els.settingsBtn.onclick = () => openModal('settingsModal');
  els.logoutBtn.onclick = localLogout;
  els.loginSubmitBtn.onclick = login;
  els.registerSubmitBtn.onclick = register;
  els.saveSettingsBtn.onclick = saveSettings;
  els.suggestionSubmitBtn.onclick = sendSuggestion;
  els.likeBtn.onclick = () => vote('like');
  els.dislikeBtn.onclick = () => vote('dislike');
  els.refreshBtn.onclick = loadRandomQuote;
  els.shareTextBtn.onclick = shareText;
  els.shareCardBtn.onclick = shareCard;
  els.statsBtn.onclick = async () => { openModal('statsModal'); await loadStats(); };
  els.disableTimerCheckbox.onchange = saveSettings;

  document.querySelectorAll('[data-close]').forEach(btn => btn.onclick = () => closeModal(btn.dataset.close));
  document.querySelectorAll('.tab-btn').forEach(btn => btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });

  bindModeSelector('likedModeSelector', 'liked');
  bindModeSelector('dislikedModeSelector', 'disliked');

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    state.user = session?.user || null;
    if (state.user) {
      await ensureProfile();
      await loadProfile();
      await syncVoteState();
    } else {
      state.profile = null;
      state.vote = null;
    }
    updateAuthUI();
    renderCurrentQuote();
  });
}

async function init() {
  initTheme();
  bindEvents();
  await initSession();
  await loadQuoteFromUrlOrRandom();
  updateAuthUI();
}

init();
