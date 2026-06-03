import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const $ = (id) => document.getElementById(id);
const els = {
  themeBtn: $('diaryThemeBtn'),
  message: $('diaryMessage'),
  search: $('diarySearch'),
  list: $('diaryEntryList'),
  newBtn: $('newDiaryEntryBtn'),
  form: $('diaryForm'),
  title: $('diaryEntryTitle'),
  body: $('diaryBody'),
  mood: $('diaryMood'),
  tags: $('diaryTags'),
  revealAt: $('diaryRevealAt'),
  saveBtn: $('saveDiaryEntryBtn'),
  deleteBtn: $('deleteDiaryEntryBtn'),
  toastContainer: $('toastContainer'),
};

const THEME_KEY = 'mudrost-theme';
const LIGHT_ACCENT_KEY = 'mudrost-light-accent';
const DARK_ACCENT_KEY = 'mudrost-dark-accent';
const DEFAULT_LIGHT_ACCENT = '#a855f7';
const DEFAULT_DARK_ACCENT = '#f472b6';

const state = {
  user: null,
  entries: [],
  activeId: null,
  filter: 'all',
};

const moodMap = {
  calm: ['Спокойно', 'self_improvement'],
  happy: ['Радостно', 'sentiment_very_satisfied'],
  tired: ['Усталость', 'bedtime'],
  anxious: ['Тревожно', 'rainy'],
  angry: ['Злюсь', 'local_fire_department'],
  inspired: ['Вдохновение', 'bolt'],
};

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function hexToRgb(hex) {
  const value = String(hex || DEFAULT_LIGHT_ACCENT).replace('#', '').trim();
  const normalized = value.length === 3 ? value.split('').map((x) => x + x).join('') : value;
  const int = Number.parseInt(normalized, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function setAccentCssVar(color) {
  const { r, g, b } = hexToRgb(color);
  document.documentElement.style.setProperty('--primary', color);
  document.documentElement.style.setProperty('--primary-soft', `rgba(${r}, ${g}, ${b}, 0.14)`);
}

function getStoredAccent(theme) {
  return localStorage.getItem(theme === 'dark' ? DARK_ACCENT_KEY : LIGHT_ACCENT_KEY)
    || (theme === 'dark' ? DEFAULT_DARK_ACCENT : DEFAULT_LIGHT_ACCENT);
}

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  localStorage.setItem(THEME_KEY, theme);
  setAccentCssVar(getStoredAccent(theme));
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'dark' || saved === 'light'
    ? saved
    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
}

function setMessage(text = '', type = 'info') {
  els.message.textContent = text;
  const colors = { info: 'var(--muted)', success: 'var(--success)', error: 'var(--danger)' };
  els.message.style.color = colors[type] || colors.info;
}

function toast(text, type = 'info') {
  if (!text) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = text;
  els.toastContainer.appendChild(node);
  window.setTimeout(() => node.remove(), 3200);
}

function normalizeError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  if (msg.includes('does not exist')) return 'Сначала выполните обновлённый SQL для дневника в Supabase.';
  if (msg.includes('row-level security')) return 'Нет прав для этого действия.';
  if (msg.includes('network') || msg.includes('fetch')) return 'Не удалось подключиться к серверу.';
  return error?.message || 'Что-то пошло не так.';
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
}

function toDateInput(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

function parseTags(value) {
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function isLocked(entry) {
  return entry.reveal_at && new Date(entry.reveal_at) > new Date();
}

function entryMood(entry) {
  return moodMap[entry.mood] || moodMap.calm;
}

async function requireSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  state.user = data?.session?.user || null;
  if (!state.user) {
    window.location.href = './index.html';
    return false;
  }
  return true;
}

async function loadProfileAccent() {
  const { data } = await supabase
    .from('profiles')
    .select('light_accent,dark_accent')
    .eq('id', state.user.id)
    .maybeSingle();
  if (data?.light_accent) localStorage.setItem(LIGHT_ACCENT_KEY, data.light_accent);
  if (data?.dark_accent) localStorage.setItem(DARK_ACCENT_KEY, data.dark_accent);
  setAccentCssVar(getStoredAccent(document.body.classList.contains('dark') ? 'dark' : 'light'));
}

async function loadEntries() {
  const { data, error } = await supabase
    .from('diary_entries')
    .select('id,title,body,mood,tags,reveal_at,created_at,updated_at')
    .eq('user_id', state.user.id)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  state.entries = data || [];
  renderList();
  if (!state.activeId && state.entries.length) selectEntry(state.entries[0].id);
  if (!state.entries.length) newEntry();
}

function visibleEntries() {
  const query = els.search.value.trim().toLowerCase();
  return state.entries.filter((entry) => {
    if (state.filter === 'visible' && isLocked(entry)) return false;
    if (state.filter === 'capsules' && !entry.reveal_at) return false;
    const hay = [entry.title, entry.body, ...(entry.tags || [])].join(' ').toLowerCase();
    return !query || hay.includes(query);
  });
}

function renderList() {
  document.querySelectorAll('[data-diary-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.diaryFilter === state.filter);
  });

  const entries = visibleEntries();
  if (!entries.length) {
    els.list.innerHTML = '<div class="empty-panel">Записей не найдено. Создайте новую или смените фильтр.</div>';
    return;
  }

  els.list.innerHTML = entries.map((entry) => {
    const [moodLabel, icon] = entryMood(entry);
    const locked = isLocked(entry);
    return `
      <button class="diary-entry-card ${state.activeId === entry.id ? 'active' : ''}" type="button" data-entry-id="${entry.id}">
        <span class="material-symbols-outlined">${locked ? 'lock' : icon}</span>
        <span>
          <strong>${escapeHtml(entry.title || 'Без заголовка')}</strong>
          <small>${locked ? `Откроется ${formatDate(entry.reveal_at)}` : `${moodLabel} · ${formatDate(entry.updated_at)}`}</small>
        </span>
      </button>`;
  }).join('');
}

function newEntry() {
  state.activeId = null;
  els.title.value = '';
  els.body.value = '';
  els.mood.value = 'calm';
  els.tags.value = '';
  els.revealAt.value = '';
  els.deleteBtn.hidden = true;
  renderList();
  els.title.focus();
}

function selectEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  state.activeId = id;
  els.title.value = entry.title || '';
  els.mood.value = entry.mood || 'calm';
  els.tags.value = (entry.tags || []).join(', ');
  els.revealAt.value = toDateInput(entry.reveal_at);
  els.deleteBtn.hidden = false;
  els.body.value = isLocked(entry)
    ? `Эта капсула времени откроется ${formatDate(entry.reveal_at)}.`
    : (entry.body || '');
  els.body.disabled = isLocked(entry);
  renderList();
}

async function saveEntry(event) {
  event.preventDefault();
  const currentEntry = state.entries.find((item) => item.id === state.activeId);
  const title = els.title.value.trim() || 'Без заголовка';
  const revealAt = els.revealAt.value ? new Date(`${els.revealAt.value}T00:00:00`).toISOString() : null;
  const payload = {
    user_id: state.user.id,
    title,
    body: els.body.disabled ? (currentEntry?.body || '') : els.body.value.trim(),
    mood: els.mood.value,
    tags: parseTags(els.tags.value),
    reveal_at: revealAt,
    updated_at: new Date().toISOString(),
  };

  els.saveBtn.disabled = true;
  setMessage('Сохраняем...');
  try {
    if (state.activeId) {
      const { error } = await supabase.from('diary_entries').update(payload).eq('id', state.activeId).eq('user_id', state.user.id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('diary_entries').insert(payload).select('id').single();
      if (error) throw error;
      state.activeId = data.id;
    }
    await loadEntries();
    selectEntry(state.activeId);
    setMessage('Запись сохранена.', 'success');
    toast('Запись сохранена.', 'success');
  } catch (error) {
    setMessage(normalizeError(error), 'error');
  } finally {
    els.saveBtn.disabled = false;
  }
}

async function deleteEntry() {
  if (!state.activeId || !confirm('Удалить эту запись?')) return;
  const { error } = await supabase.from('diary_entries').delete().eq('id', state.activeId).eq('user_id', state.user.id);
  if (error) return setMessage(normalizeError(error), 'error');
  state.activeId = null;
  await loadEntries();
  toast('Запись удалена.', 'success');
}

function bindEvents() {
  els.themeBtn.addEventListener('click', () => applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark'));
  els.newBtn.addEventListener('click', newEntry);
  els.form.addEventListener('submit', saveEntry);
  els.deleteBtn.addEventListener('click', deleteEntry);
  els.search.addEventListener('input', renderList);
  els.list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-entry-id]');
    if (button) selectEntry(button.dataset.entryId);
  });
  document.querySelectorAll('[data-diary-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.diaryFilter;
      renderList();
    });
  });
  document.querySelectorAll('[data-prompt]').forEach((button) => {
    button.addEventListener('click', () => {
      els.body.disabled = false;
      els.body.value = `${els.body.value ? `${els.body.value}\n\n` : ''}${button.dataset.prompt}\n`;
      els.body.focus();
    });
  });
}

async function init() {
  initTheme();
  bindEvents();
  try {
    const ok = await requireSession();
    if (!ok) return;
    await loadProfileAccent();
    await loadEntries();
  } catch (error) {
    setMessage(normalizeError(error), 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
