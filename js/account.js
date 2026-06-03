import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const $ = (id) => document.getElementById(id);
const els = {
  title: $('accountTitle'),
  subtitle: $('accountSubtitle'),
  message: $('accountMessage'),
  themeBtn: $('accountThemeBtn'),
  signOutBtn: $('accountSignOutBtn'),
  adminLink: $('accountAdminLink'),
  chatBadge: $('accountChatBadge'),
  dashLiked: $('dashLiked'),
  dashDisliked: $('dashDisliked'),
  dashSuggestions: $('dashSuggestions'),
  dashCollections: $('dashCollections'),
  disableTimer: $('accountDisableTimer'),
  clickRefresh: $('accountClickRefresh'),
  privacyMode: $('accountPrivacyMode'),
  username: $('accountUsername'),
  email: $('accountEmail'),
  password: $('accountPassword'),
  lightAccent: $('accountLightAccent'),
  darkAccent: $('accountDarkAccent'),
  saveSettingsBtn: $('saveAccountSettingsBtn'),
  settingsForm: $('accountSettingsForm'),
  collectionForm: $('collectionForm'),
  collectionTitle: $('collectionTitle'),
  collectionDescription: $('collectionDescription'),
  collectionsList: $('collectionsList'),
  suggestionForm: $('accountSuggestionForm'),
  suggestionText: $('accountSuggestionText'),
  suggestionsList: $('accountSuggestionsList'),
  toastContainer: $('toastContainer'),
};

const THEME_KEY = 'mudrost-theme';
const LIGHT_ACCENT_KEY = 'mudrost-light-accent';
const DARK_ACCENT_KEY = 'mudrost-dark-accent';
const DEFAULT_LIGHT_ACCENT = '#a855f7';
const DEFAULT_DARK_ACCENT = '#f472b6';

let user = null;
let profile = null;

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setMessage(text = '', type = 'info') {
  if (!els.message) return;
  els.message.textContent = text;
  const colors = { info: 'var(--muted)', success: 'var(--success)', error: 'var(--danger)' };
  els.message.style.color = colors[type] || colors.info;
}

function toast(text, type = 'info') {
  if (!text || !els.toastContainer) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = text;
  els.toastContainer.appendChild(node);
  window.setTimeout(() => node.remove(), 3200);
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

function normalizeError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  if (msg.includes('duplicate key') || msg.includes('profiles_username')) return 'Такой логин или коллекция уже есть.';
  if (msg.includes('row-level security')) return 'Нет прав для этого действия.';
  if (msg.includes('network') || msg.includes('fetch')) return 'Не удалось подключиться к серверу.';
  return error?.message || 'Что-то пошло не так.';
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
  document.body.style.setProperty('--primary', color);
  document.body.style.setProperty('--primary-soft', `rgba(${r}, ${g}, ${b}, 0.14)`);
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

function statusLabel(status) {
  if (status === 'approved') return 'Принято';
  if (status === 'rejected') return 'Отклонено';
  return 'На модерации';
}

function statusClass(status) {
  if (status === 'approved') return 'status-pill approved';
  if (status === 'rejected') return 'status-pill rejected';
  return 'status-pill pending';
}

async function requireSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  user = data?.session?.user || null;
  if (!user) {
    window.location.href = './index.html';
    return false;
  }
  return true;
}

async function loadProfile() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,username,role,light_accent,dark_accent,disable_timer,click_refresh_enabled,privacy_mode_enabled')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  profile = data || { id: user.id, email: user.email };

  const display = profile.username || user.email || 'Пользователь';
  els.title.textContent = display;
  els.subtitle.textContent = profile.email || user.email || '';
  els.adminLink.hidden = profile.role !== 'admin';
  els.username.value = profile.username || '';
  els.email.value = '';
  els.password.value = '';
  els.lightAccent.value = profile.light_accent || getStoredAccent('light');
  els.darkAccent.value = profile.dark_accent || getStoredAccent('dark');
  els.disableTimer.checked = !!profile.disable_timer;
  els.clickRefresh.checked = !!profile.click_refresh_enabled;
  els.privacyMode.checked = !!profile.privacy_mode_enabled;

  if (profile.light_accent) localStorage.setItem(LIGHT_ACCENT_KEY, profile.light_accent);
  if (profile.dark_accent) localStorage.setItem(DARK_ACCENT_KEY, profile.dark_accent);
  setAccentCssVar(getStoredAccent(document.body.classList.contains('dark') ? 'dark' : 'light'));
}

async function loadDashboard() {
  const [liked, disliked, suggestions, collections, notifications] = await Promise.allSettled([
    supabase.from('quote_votes').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('vote', 'like'),
    supabase.from('quote_votes').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('vote', 'dislike'),
    supabase.from('quote_suggestions').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('quote_collections').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.rpc('chat_notifications_summary'),
  ]);

  els.dashLiked.textContent = String(liked.value?.count || 0);
  els.dashDisliked.textContent = String(disliked.value?.count || 0);
  els.dashSuggestions.textContent = String(suggestions.value?.count || 0);
  els.dashCollections.textContent = String(collections.value?.count || 0);

  const note = notifications.value?.data?.[0] || { unread: 0, requests: 0 };
  const total = Number(note.unread || 0) + Number(note.requests || 0);
  els.chatBadge.hidden = total <= 0;
  els.chatBadge.textContent = total > 99 ? '99+' : String(total);
}

async function loadCollections() {
  const { data, error } = await supabase
    .from('quote_collections')
    .select('id,title,description,created_at,quote_collection_items(count)')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  if (error) throw error;

  if (!data?.length) {
    els.collectionsList.innerHTML = '<div class="empty-panel">Коллекций пока нет. Создайте первую подборку, например “на каждый день”.</div>';
    return;
  }

  els.collectionsList.innerHTML = data.map((item) => {
    const count = item.quote_collection_items?.[0]?.count || 0;
    return `
      <article class="collection-card" data-collection-id="${item.id}">
        <div class="collection-card-icon"><span class="material-symbols-outlined">bookmarks</span></div>
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.description || 'Без описания')}</p>
          <small>${count} цитат</small>
        </div>
        <button class="icon-btn" type="button" data-delete-collection="${item.id}" title="Удалить" aria-label="Удалить коллекцию">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </article>`;
  }).join('');
}

async function loadSuggestions() {
  const { data, error } = await supabase
    .from('quote_suggestions')
    .select('id,text,status,rejection_reason,created_at,reviewed_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;

  if (!data?.length) {
    els.suggestionsList.innerHTML = '<div class="empty-panel">Вы ещё не предлагали цитаты.</div>';
    return;
  }

  els.suggestionsList.innerHTML = data.map((item) => `
    <article class="suggestion-item">
      <div>
        <p>${escapeHtml(item.text)}</p>
        ${item.rejection_reason ? `<small>Причина: ${escapeHtml(item.rejection_reason)}</small>` : ''}
      </div>
      <span class="${statusClass(item.status)}">${statusLabel(item.status)}</span>
    </article>
  `).join('');
}

async function saveQuickPreference(field, value) {
  const { error } = await supabase.from('profiles').update({ [field]: value }).eq('id', user.id);
  if (error) throw error;
  profile[field] = value;
}

async function saveSettings() {
  els.saveSettingsBtn.disabled = true;
  setMessage('Сохраняем...');
  try {
    const username = normalizeUsername(els.username.value);
    const lightAccent = els.lightAccent.value || DEFAULT_LIGHT_ACCENT;
    const darkAccent = els.darkAccent.value || DEFAULT_DARK_ACCENT;
    const profileUpdate = {
      username: username || null,
      light_accent: lightAccent,
      dark_accent: darkAccent,
      disable_timer: els.disableTimer.checked,
      click_refresh_enabled: els.clickRefresh.checked,
      privacy_mode_enabled: els.privacyMode.checked,
    };

    const { error: profileError } = await supabase.from('profiles').update(profileUpdate).eq('id', user.id);
    if (profileError) throw profileError;

    const nextEmail = els.email.value.trim().toLowerCase();
    const nextPassword = els.password.value.trim();
    if (nextEmail && nextEmail !== (user.email || '').toLowerCase()) {
      const { error } = await supabase.auth.updateUser({ email: nextEmail }, { emailRedirectTo: `${window.location.origin}${window.location.pathname}` });
      if (error) throw error;
    }
    if (nextPassword) {
      const { error } = await supabase.auth.updateUser({ password: nextPassword });
      if (error) throw error;
    }

    localStorage.setItem(LIGHT_ACCENT_KEY, lightAccent);
    localStorage.setItem(DARK_ACCENT_KEY, darkAccent);
    setAccentCssVar(getStoredAccent(document.body.classList.contains('dark') ? 'dark' : 'light'));
    await loadProfile();
    setMessage('Настройки сохранены.', 'success');
    toast('Настройки сохранены.', 'success');
  } catch (error) {
    setMessage(normalizeError(error), 'error');
  } finally {
    els.saveSettingsBtn.disabled = false;
  }
}

async function createCollection(event) {
  event.preventDefault();
  const title = els.collectionTitle.value.trim();
  const description = els.collectionDescription.value.trim();
  if (!title) return setMessage('Введите название коллекции.', 'error');

  const { error } = await supabase.from('quote_collections').insert({
    user_id: user.id,
    title,
    description: description || null,
  });
  if (error) return setMessage(normalizeError(error), 'error');

  els.collectionTitle.value = '';
  els.collectionDescription.value = '';
  await Promise.all([loadCollections(), loadDashboard()]);
  toast('Коллекция создана.', 'success');
}

async function deleteCollection(id) {
  if (!id || !confirm('Удалить коллекцию? Цитаты останутся на сайте.')) return;
  const { error } = await supabase.from('quote_collections').delete().eq('id', id).eq('user_id', user.id);
  if (error) return setMessage(normalizeError(error), 'error');
  await Promise.all([loadCollections(), loadDashboard()]);
  toast('Коллекция удалена.', 'success');
}

async function sendSuggestion(event) {
  event.preventDefault();
  const text = els.suggestionText.value.trim();
  if (!text) return setMessage('Напишите цитату.', 'error');

  const { error } = await supabase.from('quote_suggestions').insert({ text, user_id: user.id });
  if (error) return setMessage(normalizeError(error), 'error');

  els.suggestionText.value = '';
  await Promise.all([loadSuggestions(), loadDashboard()]);
  toast('Цитата отправлена на модерацию.', 'success');
}

function bindEvents() {
  els.themeBtn.addEventListener('click', () => applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark'));
  els.signOutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = './index.html?logout=1';
  });
  els.saveSettingsBtn.addEventListener('click', saveSettings);
  els.settingsForm.addEventListener('submit', (event) => { event.preventDefault(); saveSettings(); });
  els.collectionForm.addEventListener('submit', createCollection);
  els.collectionsList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete-collection]');
    if (button) deleteCollection(button.dataset.deleteCollection);
  });
  els.suggestionForm.addEventListener('submit', sendSuggestion);
  [
    [els.disableTimer, 'disable_timer'],
    [els.clickRefresh, 'click_refresh_enabled'],
    [els.privacyMode, 'privacy_mode_enabled'],
  ].forEach(([input, field]) => {
    input.addEventListener('change', async () => {
      try {
        await saveQuickPreference(field, input.checked);
        toast('Настройка обновлена.', 'success');
      } catch (error) {
        input.checked = !input.checked;
        setMessage(normalizeError(error), 'error');
      }
    });
  });
}

async function init() {
  initTheme();
  bindEvents();
  try {
    const ok = await requireSession();
    if (!ok) return;
    await loadProfile();
    await Promise.all([loadDashboard(), loadCollections(), loadSuggestions()]);
    window.setInterval(loadDashboard, 15000);
  } catch (error) {
    setMessage(normalizeError(error), 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
