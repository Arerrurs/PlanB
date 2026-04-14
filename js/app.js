import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const quoteText = document.getElementById('quoteText');
const quoteStatus = document.getElementById('quoteStatus');
const likeCount = document.getElementById('likeCount');
const dislikeCount = document.getElementById('dislikeCount');
const likeBtn = document.getElementById('likeBtn');
const dislikeBtn = document.getElementById('dislikeBtn');
const copyBtn = document.getElementById('copyBtn');
const shareBtn = document.getElementById('shareBtn');
const refreshBtn = document.getElementById('refreshBtn');
const themeBtn = document.getElementById('themeBtn');
const authForm = document.getElementById('authForm');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const authStatus = document.getElementById('authStatus');
const signupBtn = document.getElementById('signupBtn');
const authToggleBtn = document.getElementById('authToggleBtn');
const logoutBtn = document.getElementById('logoutBtn');
const adminLink = document.getElementById('adminLink');
const suggestForm = document.getElementById('suggestForm');
const suggestionInput = document.getElementById('suggestionInput');
const suggestStatus = document.getElementById('suggestStatus');
const authPanel = document.getElementById('authPanel');

let currentQuote = null;
let currentUser = null;
let currentProfile = null;

function setStatus(el, text = '', isError = false) {
  el.textContent = text;
  el.style.color = isError ? 'var(--danger)' : 'var(--muted)';
}

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) return applyTheme(saved);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light');
}

async function loadRandomQuote() {
  setStatus(quoteStatus, 'Подбираем мудрость...');
  const { data, error } = await supabase
    .from('quotes')
    .select('id, text, like_count, dislike_count')
    .eq('status', 'approved');

  if (error) {
    quoteText.textContent = 'Не удалось загрузить цитаты.';
    setStatus(quoteStatus, error.message, true);
    return;
  }

  if (!data?.length) {
    quoteText.textContent = 'Пока нет опубликованных цитат.';
    likeCount.textContent = '0';
    dislikeCount.textContent = '0';
    setStatus(quoteStatus, 'Добавь первую цитату в админке.');
    return;
  }

  const pool = currentQuote ? data.filter(q => q.id !== currentQuote.id) : data;
  const choice = pool[Math.floor(Math.random() * pool.length)] || data[0];
  currentQuote = choice;
  quoteText.textContent = choice.text;
  likeCount.textContent = choice.like_count ?? 0;
  dislikeCount.textContent = choice.dislike_count ?? 0;
  setStatus(quoteStatus, '');
  await updateVoteButtons();
}

async function getProfile(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('id, email, role')
    .eq('id', userId)
    .maybeSingle();
  return data;
}

async function syncAuthUi() {
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user ?? null;
  currentProfile = currentUser ? await getProfile(currentUser.id) : null;

  const isLoggedIn = Boolean(currentUser);
  authPanel.classList.toggle('hidden', isLoggedIn);
  authToggleBtn.classList.toggle('hidden', isLoggedIn);
  logoutBtn.classList.toggle('hidden', !isLoggedIn);
  adminLink.classList.toggle('hidden', currentProfile?.role !== 'admin');

  if (isLoggedIn) {
    authToggleBtn.textContent = currentUser.email;
  } else {
    authToggleBtn.textContent = 'Войти';
  }

  await updateVoteButtons();
}

async function updateVoteButtons() {
  likeBtn.classList.remove('is-active');
  dislikeBtn.classList.remove('is-active');
  likeBtn.disabled = !currentQuote;
  dislikeBtn.disabled = !currentQuote;

  if (!currentQuote || !currentUser) return;

  const { data } = await supabase
    .from('quote_votes')
    .select('vote')
    .eq('quote_id', currentQuote.id)
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (data?.vote === 'like') likeBtn.classList.add('is-active');
  if (data?.vote === 'dislike') dislikeBtn.classList.add('is-active');
}

async function submitVote(voteType) {
  if (!currentUser) {
    setStatus(quoteStatus, 'Сначала войди в аккаунт.', true);
    authPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (!currentQuote) return;

  const { data: existing } = await supabase
    .from('quote_votes')
    .select('id, vote')
    .eq('quote_id', currentQuote.id)
    .eq('user_id', currentUser.id)
    .maybeSingle();

  let error = null;

  if (existing?.vote === voteType) {
    ({ error } = await supabase.from('quote_votes').delete().eq('id', existing.id));
  } else if (existing?.id) {
    ({ error } = await supabase.from('quote_votes').update({ vote: voteType }).eq('id', existing.id));
  } else {
    ({ error } = await supabase.from('quote_votes').insert({
      quote_id: currentQuote.id,
      user_id: currentUser.id,
      vote: voteType,
    }));
  }

  if (error) {
    setStatus(quoteStatus, error.message, true);
    return;
  }

  const { data: refreshed } = await supabase
    .from('quotes')
    .select('id, text, like_count, dislike_count')
    .eq('id', currentQuote.id)
    .single();

  if (refreshed) {
    currentQuote = refreshed;
    likeCount.textContent = refreshed.like_count ?? 0;
    dislikeCount.textContent = refreshed.dislike_count ?? 0;
  }

  await updateVoteButtons();
}

async function handleLogin(event) {
  event.preventDefault();
  setStatus(authStatus, 'Пробуем войти...');

  const { error } = await supabase.auth.signInWithPassword({
    email: emailInput.value.trim(),
    password: passwordInput.value,
  });

  if (error) {
    setStatus(authStatus, error.message, true);
    return;
  }

  emailInput.value = '';
  passwordInput.value = '';
  setStatus(authStatus, 'Успешный вход.');
  await syncAuthUi();
}

async function handleSignup() {
  setStatus(authStatus, 'Создаём аккаунт...');
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    setStatus(authStatus, error.message, true);
    return;
  }

  setStatus(authStatus, 'Аккаунт создан. Если включено подтверждение почты — подтверди email.');
}

async function handleLogout() {
  await supabase.auth.signOut();
  await syncAuthUi();
  setStatus(authStatus, '');
}

async function handleSuggestion(event) {
  event.preventDefault();
  const text = suggestionInput.value.trim();
  if (!text) return;

  setStatus(suggestStatus, 'Отправляем...');

  const payload = {
    text,
    user_id: currentUser?.id ?? null,
  };

  const { error } = await supabase.from('quote_suggestions').insert(payload);

  if (error) {
    setStatus(suggestStatus, error.message, true);
    return;
  }

  suggestionInput.value = '';
  setStatus(suggestStatus, 'Отправлено на модерацию.');
}

async function copyQuote() {
  if (!currentQuote) return;
  try {
    await navigator.clipboard.writeText(currentQuote.text);
    setStatus(quoteStatus, 'Скопировано.');
  } catch {
    setStatus(quoteStatus, 'Не удалось скопировать.', true);
  }
}

async function shareQuote() {
  if (!currentQuote) return;
  const payload = {
    title: 'Мудрость дня',
    text: currentQuote.text,
    url: window.location.href,
  };

  if (navigator.share) {
    try {
      await navigator.share(payload);
      setStatus(quoteStatus, 'Готово.');
    } catch {
      // ignore cancel
    }
  } else {
    await copyQuote();
  }
}

themeBtn.addEventListener('click', () => {
  applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
});
refreshBtn.addEventListener('click', loadRandomQuote);
copyBtn.addEventListener('click', copyQuote);
shareBtn.addEventListener('click', shareQuote);
likeBtn.addEventListener('click', () => submitVote('like'));
dislikeBtn.addEventListener('click', () => submitVote('dislike'));
authForm.addEventListener('submit', handleLogin);
signupBtn.addEventListener('click', handleSignup);
logoutBtn.addEventListener('click', handleLogout);
authToggleBtn.addEventListener('click', () => {
  authPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
suggestForm.addEventListener('submit', handleSuggestion);

supabase.auth.onAuthStateChange(async () => {
  await syncAuthUi();
});

initTheme();
await syncAuthUi();
await loadRandomQuote();
