import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const state = {
  user: null,
  profile: null,
  currentQuote: null,
  currentVote: null,
};

const $ = (id) => document.getElementById(id);

const els = {
  quoteText: $('quoteText'),
  quoteId: $('quoteId'),
  globalMessage: $('globalMessage'),
  themeBtn: $('themeBtn'),
  accountBtn: $('accountBtn'),
  refreshBtn: $('refreshBtn'),
  copyBtn: $('copyBtn'),
  shareBtn: $('shareBtn'),
  likeBtn: $('likeBtn'),
  dislikeBtn: $('dislikeBtn'),
  authModal: $('authModal'),
  accountModal: $('accountModal'),
  suggestionModal: $('suggestionModal'),
  authForm: $('authForm'),
  email: $('email'),
  password: $('password'),
  signInBtn: $('signInBtn'),
  signUpBtn: $('signUpBtn'),
  signOutBtn: $('signOutBtn'),
  authMessage: $('authMessage'),
  userEmail: $('userEmail'),
  openSuggestionBtn: $('openSuggestionBtn'),
  adminLink: $('adminLink'),
  suggestionForm: $('suggestionForm'),
  suggestionText: $('suggestionText'),
  suggestionBtn: $('suggestionBtn'),
  suggestionMessage: $('suggestionMessage'),
};

function setMessage(el, text = '', type = 'info') {
  if (!el) return;
  el.textContent = text;
  const colors = { info: 'var(--muted)', success: 'var(--success)', error: 'var(--danger)' };
  el.style.color = colors[type] || colors.info;
}

function normalizeError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Неверная почта или пароль.';
  if (msg.includes('email not confirmed')) return 'Подтверди почту через письмо.';
  if (msg.includes('user already registered')) return 'Пользователь с такой почтой уже зарегистрирован.';
  if (msg.includes('network') || msg.includes('fetch')) return 'Не удалось подключиться к серверу.';
  return error?.message || 'Что-то пошло не так.';
}

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('mudrost-theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('mudrost-theme');
  if (saved === 'dark' || saved === 'light') return applyTheme(saved);
  applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function openModal(el) {
  if (!el) return;
  el.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal(el) {
  if (!el) return;
  el.hidden = true;
  if ([...document.querySelectorAll('.modal')].every((m) => m.hidden)) {
    document.body.style.overflow = '';
  }
}

function updateAccountButton() {
  const loggedIn = !!state.user;
  els.accountBtn.title = loggedIn ? 'Личный кабинет' : 'Войти';
  els.accountBtn.setAttribute('aria-label', loggedIn ? 'Личный кабинет' : 'Войти');
}

function updateAuthUI() {
  updateAccountButton();
  els.userEmail.textContent = state.user?.email || '—';
  if (state.profile?.role === 'admin') {
    els.adminLink.style.display = 'block';
  } else {
    els.adminLink.style.display = 'none';
  }
}

function updateVoteButtons() {
  els.likeBtn.classList.toggle('active', state.currentVote === 'like');
  els.likeBtn.classList.toggle('like', state.currentVote === 'like');
  els.dislikeBtn.classList.toggle('active', state.currentVote === 'dislike');
  els.dislikeBtn.classList.toggle('dislike', state.currentVote === 'dislike');
}

async function ensureProfileExists() {
  if (!state.user) return;
  const { error } = await supabase.from('profiles').upsert(
    { id: state.user.id, email: state.user.email },
    { onConflict: 'id' }
  );
  if (error) console.error('profile upsert:', error);
}

async function loadProfile() {
  if (!state.user) {
    state.profile = null;
    updateAuthUI();
    return;
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,role')
    .eq('id', state.user.id)
    .maybeSingle();
  if (error) {
    console.error(error);
    state.profile = null;
  } else {
    state.profile = data || null;
  }
  updateAuthUI();
}

async function loadUserVote(quoteId) {
  if (!state.user || !quoteId) {
    state.currentVote = null;
    updateVoteButtons();
    return;
  }
  const { data, error } = await supabase
    .from('quote_votes')
    .select('vote')
    .eq('quote_id', quoteId)
    .eq('user_id', state.user.id)
    .maybeSingle();
  if (error) {
    console.error(error);
    state.currentVote = null;
  } else {
    state.currentVote = data?.vote || null;
  }
  updateVoteButtons();
}

async function loadRandomQuote() {
  setMessage(els.globalMessage, '');
  els.quoteText.textContent = 'Загрузка цитаты...';
  const { data, error } = await supabase
    .from('quotes')
    .select('id,text,status')
    .eq('status', 'approved');

  if (error) {
    console.error(error);
    els.quoteText.textContent = 'Не удалось загрузить цитаты.';
    return;
  }

  if (!data?.length) {
    state.currentQuote = null;
    state.currentVote = null;
    els.quoteText.textContent = 'Пока нет опубликованных цитат.';
    updateVoteButtons();
    return;
  }

  const random = data[Math.floor(Math.random() * data.length)];
  state.currentQuote = random;
  els.quoteId.value = random.id;
  els.quoteText.textContent = random.text;
  await loadUserVote(random.id);
}

async function copyQuote() {
  if (!state.currentQuote?.text) return;
  try {
    await navigator.clipboard.writeText(state.currentQuote.text);
    setMessage(els.globalMessage, 'Скопировано.', 'success');
  } catch {
    setMessage(els.globalMessage, 'Не удалось скопировать.', 'error');
  }
}

async function shareQuote() {
  if (!state.currentQuote?.text) return;
  const payload = {
    title: 'Мудрость дня',
    text: state.currentQuote.text,
    url: window.location.href,
  };
  if (navigator.share) {
    try {
      await navigator.share(payload);
      return;
    } catch {
      return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${state.currentQuote.text}\n\n${window.location.href}`);
    setMessage(els.globalMessage, 'Ссылка и цитата скопированы.', 'success');
  } catch {
    setMessage(els.globalMessage, 'Не удалось поделиться.', 'error');
  }
}

async function signIn() {
  const email = els.email.value.trim();
  const password = els.password.value;
  if (!email || !password) return setMessage(els.authMessage, 'Заполни почту и пароль.', 'error');
  els.signInBtn.disabled = true;
  els.signUpBtn.disabled = true;
  setMessage(els.authMessage, 'Пробуем войти...');
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    state.user = data.user || data.session?.user || null;
    await ensureProfileExists();
    await loadProfile();
    closeModal(els.authModal);
    els.authForm.reset();
    setMessage(els.authMessage, '');
    setMessage(els.globalMessage, 'Вход выполнен.', 'success');
    await loadUserVote(state.currentQuote?.id);
  } catch (error) {
    console.error(error);
    setMessage(els.authMessage, normalizeError(error), 'error');
  } finally {
    els.signInBtn.disabled = false;
    els.signUpBtn.disabled = false;
  }
}

async function signUp() {
  const email = els.email.value.trim();
  const password = els.password.value;
  if (!email || !password) return setMessage(els.authMessage, 'Заполни почту и пароль.', 'error');
  els.signInBtn.disabled = true;
  els.signUpBtn.disabled = true;
  setMessage(els.authMessage, 'Создаём аккаунт...');
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    state.user = data.user || data.session?.user || null;
    if (state.user) {
      await ensureProfileExists();
      await loadProfile();
      closeModal(els.authModal);
      els.authForm.reset();
      setMessage(els.globalMessage, 'Аккаунт создан.', 'success');
      await loadUserVote(state.currentQuote?.id);
    } else {
      setMessage(els.authMessage, 'Аккаунт создан. Подтверди почту через письмо.', 'success');
    }
  } catch (error) {
    console.error(error);
    setMessage(els.authMessage, normalizeError(error), 'error');
  } finally {
    els.signInBtn.disabled = false;
    els.signUpBtn.disabled = false;
  }
}

async function signOutUser() {
  els.signOutBtn.disabled = true;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    state.user = null;
    state.profile = null;
    state.currentVote = null;
    updateAuthUI();
    updateVoteButtons();
    closeModal(els.accountModal);
    setMessage(els.globalMessage, 'Вы вышли из аккаунта.', 'success');
  } catch (error) {
    console.error(error);
    setMessage(els.globalMessage, normalizeError(error), 'error');
  } finally {
    els.signOutBtn.disabled = false;
  }
}

async function vote(voteType) {
  if (!state.user) {
    openModal(els.authModal);
    setMessage(els.authMessage, 'Войди, чтобы голосовать.', 'error');
    return;
  }
  if (!state.currentQuote?.id) return;
  els.likeBtn.disabled = true;
  els.dislikeBtn.disabled = true;
  try {
    if (state.currentVote === voteType) {
      const { error } = await supabase
        .from('quote_votes')
        .delete()
        .eq('quote_id', state.currentQuote.id)
        .eq('user_id', state.user.id);
      if (error) throw error;
      state.currentVote = null;
    } else {
      const { error } = await supabase.from('quote_votes').upsert(
        { quote_id: state.currentQuote.id, user_id: state.user.id, vote: voteType },
        { onConflict: 'quote_id,user_id' }
      );
      if (error) throw error;
      state.currentVote = voteType;
    }
    updateVoteButtons();
  } catch (error) {
    console.error(error);
    setMessage(els.globalMessage, normalizeError(error), 'error');
  } finally {
    els.likeBtn.disabled = false;
    els.dislikeBtn.disabled = false;
  }
}

async function sendSuggestion() {
  const text = els.suggestionText.value.trim();
  if (!text) return setMessage(els.suggestionMessage, 'Напиши цитату.', 'error');
  els.suggestionBtn.disabled = true;
  setMessage(els.suggestionMessage, 'Отправляем...');
  try {
    const { error } = await supabase.from('quote_suggestions').insert({
      text,
      user_id: state.user?.id ?? null,
      status: 'pending',
    });
    if (error) throw error;
    els.suggestionForm.reset();
    setMessage(els.suggestionMessage, 'Отправлено.', 'success');
    setTimeout(() => closeModal(els.suggestionModal), 500);
  } catch (error) {
    console.error(error);
    setMessage(els.suggestionMessage, normalizeError(error), 'error');
  } finally {
    els.suggestionBtn.disabled = false;
  }
}

async function initSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) console.error('getSession:', error);
  state.user = session?.user || null;
  if (state.user) {
    await ensureProfileExists();
    await loadProfile();
  } else {
    updateAuthUI();
  }
}

function bindModalHandlers() {
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal($(btn.dataset.close)));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal(els.authModal);
      closeModal(els.accountModal);
      closeModal(els.suggestionModal);
    }
  });
}

function bindEvents() {
  bindModalHandlers();
  els.authForm?.addEventListener('submit', (e) => e.preventDefault());
  els.suggestionForm?.addEventListener('submit', (e) => e.preventDefault());
  els.themeBtn.addEventListener('click', () => applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark'));
  els.accountBtn.addEventListener('click', () => state.user ? openModal(els.accountModal) : openModal(els.authModal));
  els.refreshBtn.addEventListener('click', loadRandomQuote);
  els.copyBtn.addEventListener('click', copyQuote);
  els.shareBtn.addEventListener('click', shareQuote);
  els.likeBtn.addEventListener('click', () => vote('like'));
  els.dislikeBtn.addEventListener('click', () => vote('dislike'));
  els.signInBtn.addEventListener('click', signIn);
  els.signUpBtn.addEventListener('click', signUp);
  els.signOutBtn.addEventListener('click', signOutUser);
  els.openSuggestionBtn.addEventListener('click', () => {
    closeModal(els.accountModal);
    openModal(els.suggestionModal);
  });
  els.suggestionBtn.addEventListener('click', sendSuggestion);
  els.password.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') signIn();
  });

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.user = session?.user || null;
    if (state.user) {
      await ensureProfileExists();
      await loadProfile();
      await loadUserVote(state.currentQuote?.id);
    } else {
      state.profile = null;
      state.currentVote = null;
      updateAuthUI();
      updateVoteButtons();
    }
  });
}

async function init() {
  initTheme();
  bindEvents();
  await initSession();
  await loadRandomQuote();
}

document.addEventListener('DOMContentLoaded', init);
