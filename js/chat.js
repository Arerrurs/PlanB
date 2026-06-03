import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const $ = (id) => document.getElementById(id);
const els = {
  summary: $('chatSummary'),
  search: $('chatUserSearch'),
  list: $('chatUserList'),
  requestsBadge: $('chatRequestsBadge'),
  empty: $('chatEmptyState'),
  requestPanel: $('chatRequestPanel'),
  thread: $('chatThread'),
  backBtn: $('chatBackBtn'),
  avatar: $('chatHeaderAvatar'),
  title: $('chatConversationTitle'),
  meta: $('chatThreadMeta'),
  messages: $('chatMessages'),
  form: $('chatForm'),
  input: $('chatMessageInput'),
  sendBtn: $('chatSendBtn'),
  status: $('chatMessageStatus'),
  aliasModal: $('aliasModal'),
  aliasInput: $('chatAliasInput'),
  aliasMessage: $('aliasMessage'),
  openAliasBtn: $('openAliasModalBtn'),
  saveAliasBtn: $('saveChatAliasBtn'),
  clearBtn: $('clearChatBtn'),
  removeBtn: $('removeContactBtn'),
  toastContainer: $('toastContainer'),
};

const THEME_KEY = 'mudrost-theme';
const LIGHT_ACCENT_KEY = 'mudrost-light-accent';
const DARK_ACCENT_KEY = 'mudrost-dark-accent';
const CHAT_ALIAS_CACHE_KEY = 'mudrost-chat-alias-cache';
const DEFAULT_LIGHT_ACCENT = '#a855f7';
const DEFAULT_DARK_ACCENT = '#f472b6';

const state = {
  user: null,
  profile: null,
  users: [],
  contacts: [],
  activeTab: 'contacts',
  activePeer: null,
  activeConversationId: null,
  sending: false,
  pollTimer: null,
};

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setMessage(el, text = '', type = 'info') {
  if (!el) return;
  el.textContent = text;
  const colors = { info: 'var(--muted)', success: 'var(--success)', error: 'var(--danger)' };
  el.style.color = colors[type] || colors.info;
}

function toast(text, type = 'info') {
  if (!text || !els.toastContainer) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = text;
  els.toastContainer.appendChild(node);
  window.setTimeout(() => node.remove(), 3200);
}

function normalizeError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  if (msg.includes('not contacts')) return 'Сначала добавьте пользователя в контакты.';
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
}

function getStoredAccent(theme) {
  return localStorage.getItem(theme === 'dark' ? DARK_ACCENT_KEY : LIGHT_ACCENT_KEY)
    || (theme === 'dark' ? DEFAULT_DARK_ACCENT : DEFAULT_LIGHT_ACCENT);
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const theme = saved === 'dark' || saved === 'light'
    ? saved
    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.body.classList.toggle('dark', theme === 'dark');
  setAccentCssVar(getStoredAccent(theme));
}

function getAliasMap() {
  try { return JSON.parse(localStorage.getItem(CHAT_ALIAS_CACHE_KEY) || '{}'); } catch { return {}; }
}

function setAliasMap(map) {
  try { localStorage.setItem(CHAT_ALIAS_CACHE_KEY, JSON.stringify(map || {})); } catch {}
}

function getLocalAlias(userId) {
  return getAliasMap()[userId] || '';
}

function setLocalAlias(userId, alias) {
  const map = getAliasMap();
  if (alias) map[userId] = alias;
  else delete map[userId];
  setAliasMap(map);
}

function getDisplayName(item) {
  return item?.alias || getLocalAlias(item?.id) || item?.username || item?.email || 'Пользователь';
}

function initials(name) {
  return (name || '?').trim().slice(0, 1).toUpperCase();
}

function isMobile() {
  return window.matchMedia('(max-width: 760px)').matches;
}

function setMobileView(view) {
  document.body.classList.toggle('messenger-show-thread', view === 'thread');
}

function formatDateTime(value) {
  try {
    return new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function scrollMessagesToBottom() {
  window.requestAnimationFrame(() => {
    els.messages.scrollTop = els.messages.scrollHeight;
    window.setTimeout(() => {
      els.messages.scrollTop = els.messages.scrollHeight;
    }, 80);
  });
}

function closeActionMenu() {
  document.querySelector('.chat-menu')?.removeAttribute('open');
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

async function loadProfile() {
  const { data } = await supabase
    .from('profiles')
    .select('id,email,username,light_accent,dark_accent')
    .eq('id', state.user.id)
    .maybeSingle();
  state.profile = data || null;
  if (state.profile?.light_accent) localStorage.setItem(LIGHT_ACCENT_KEY, state.profile.light_accent);
  if (state.profile?.dark_accent) localStorage.setItem(DARK_ACCENT_KEY, state.profile.dark_accent);
}

async function loadNotifications() {
  const { data, error } = await supabase.rpc('chat_notifications_summary');
  if (error) return;
  const note = data?.[0] || { unread: 0, requests: 0 };
  const requests = Number(note.requests || 0);
  els.requestsBadge.hidden = requests <= 0;
  els.requestsBadge.textContent = requests > 99 ? '99+' : String(requests);
  els.summary.textContent = `${Number(note.unread || 0)} новых сообщений, ${requests} запросов`;
}

async function loadUsers() {
  const { data, error } = await supabase.rpc('list_chat_directory');
  if (error) throw error;
  state.users = (data || []).map((item) => ({ ...item, display_name: getDisplayName(item) }));
  state.contacts = state.users.filter((item) => item.is_contact);
}

function matchesQuery(item, query) {
  const hay = [item.email, item.username, item.alias, getLocalAlias(item.id), item.display_name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return !query || hay.includes(query);
}

function getVisibleItems() {
  const query = (els.search.value || '').trim().toLowerCase();
  if (state.activeTab === 'requests') {
    return state.users.filter((item) => item.relation_status === 'pending' && item.pending_direction === 'incoming').filter((item) => matchesQuery(item, query));
  }
  if (state.activeTab === 'users') {
    return state.users
      .filter((item) => !item.is_contact && !(item.relation_status === 'pending' && item.pending_direction === 'incoming'))
      .filter((item) => matchesQuery(item, query));
  }
  return state.contacts.filter((item) => matchesQuery(item, query));
}

function emptyText() {
  if (state.activeTab === 'requests') return 'Новых запросов нет.';
  if (state.activeTab === 'users') return 'Введите логин или почту, чтобы найти пользователя.';
  return 'Контактов пока нет. Перейдите во вкладку “Поиск” и добавьте первого собеседника.';
}

function renderList() {
  document.querySelectorAll('[data-chat-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.chatTab === state.activeTab);
  });

  const items = getVisibleItems();
  if (!items.length) {
    els.list.innerHTML = `<div class="messenger-list-empty">${emptyText()}</div>`;
    return;
  }

  els.list.innerHTML = items.map((item) => {
    const unread = Number(item.unread_count || 0);
    const subtitle = item.is_contact
      ? (unread ? `${unread} новых сообщений` : item.email || 'Контакт')
      : item.relation_status === 'pending'
        ? (item.pending_direction === 'incoming' ? 'Хочет добавить вас' : 'Запрос отправлен')
        : 'Можно добавить в контакты';
    return `
      <button class="messenger-user ${state.activePeer?.id === item.id ? 'active' : ''}" type="button" data-user-id="${item.id}">
        <span class="messenger-avatar">${escapeHtml(initials(getDisplayName(item)))}</span>
        <span class="messenger-user-main">
          <strong>${escapeHtml(getDisplayName(item))}</strong>
          <small>${escapeHtml(subtitle)}</small>
        </span>
        ${unread ? `<span class="chat-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
      </button>`;
  }).join('');
}

function resetThread(message = 'Выберите диалог') {
  state.activePeer = null;
  state.activeConversationId = null;
  els.thread.hidden = true;
  els.requestPanel.hidden = true;
  els.empty.hidden = false;
  els.empty.querySelector('h2').textContent = message;
  els.empty.querySelector('p').textContent = 'Контакты и новые запросы будут отображаться слева.';
  setMobileView('list');
}

function renderRequestPanel(entry) {
  els.empty.hidden = true;
  els.thread.hidden = true;
  els.requestPanel.hidden = false;
  let html = '';
  if (entry.relation_status === 'pending' && entry.pending_direction === 'incoming') {
    html = `
      <span class="material-symbols-outlined">person_add</span>
      <h2>${escapeHtml(getDisplayName(entry))}</h2>
      <p>Хочет добавить вас в контакты.</p>
      <div class="row-actions">
        <button class="text-btn primary" type="button" data-request-action="accept" data-request-id="${entry.request_id}" data-user-id="${entry.id}">Принять</button>
        <button class="text-btn" type="button" data-request-action="reject" data-request-id="${entry.request_id}" data-user-id="${entry.id}">Отклонить</button>
      </div>`;
  } else if (entry.relation_status === 'pending') {
    html = `
      <span class="material-symbols-outlined">outgoing_mail</span>
      <h2>${escapeHtml(getDisplayName(entry))}</h2>
      <p>Запрос уже отправлен. Ждите подтверждения.</p>`;
  } else {
    html = `
      <span class="material-symbols-outlined">person_add</span>
      <h2>${escapeHtml(getDisplayName(entry))}</h2>
      <p>Сначала добавьте пользователя в контакты.</p>
      <button class="text-btn primary" type="button" data-request-action="send" data-user-id="${entry.id}">Добавить в контакты</button>`;
  }
  els.requestPanel.innerHTML = html;
}

async function selectUser(userId) {
  const entry = state.users.find((item) => item.id === userId);
  if (!entry) return;
  state.activePeer = entry;
  renderList();
  setMobileView('thread');
  setMessage(els.status, '');
  els.title.textContent = getDisplayName(entry);
  els.avatar.textContent = initials(getDisplayName(entry));
  els.meta.textContent = entry.is_contact ? 'Контакт' : (entry.email || '');
  els.aliasInput.value = entry.alias || getLocalAlias(entry.id) || '';
  els.clearBtn.hidden = !entry.is_contact;
  els.removeBtn.hidden = !entry.is_contact;

  if (!entry.is_contact) {
    renderRequestPanel(entry);
    return;
  }

  els.empty.hidden = true;
  els.requestPanel.hidden = true;
  els.thread.hidden = false;

  const { data, error } = await supabase.rpc('get_or_create_direct_conversation', { p_other_user: userId });
  if (error) return setMessage(els.status, normalizeError(error), 'error');
  state.activeConversationId = data;
  await loadMessages();
}

async function loadMessages() {
  if (!state.activeConversationId) return;
  const { data, error } = await supabase.rpc('list_conversation_messages', { p_conversation_id: state.activeConversationId });
  if (error) return setMessage(els.status, normalizeError(error), 'error');

  const messages = data || [];
  if (!messages.length) {
    els.messages.innerHTML = `
      <div class="messenger-message-empty">
        <span class="material-symbols-outlined">edit_square</span>
        <strong>Начните переписку</strong>
        <p>Напишите первое сообщение. Оно появится здесь.</p>
      </div>`;
  } else {
    let lastDate = '';
    els.messages.innerHTML = messages.map((item) => {
      const date = item.created_at ? new Date(item.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '';
      const dateChip = date && date !== lastDate ? `<div class="chat-date-chip">${escapeHtml(date)}</div>` : '';
      if (date) lastDate = date;
      return `${dateChip}
        <article class="chat-bubble ${item.sender_id === state.user.id ? 'mine' : ''}">
          <div class="chat-bubble__text">${escapeHtml(item.text)}</div>
          <div class="chat-bubble__meta">${formatDateTime(item.created_at)}</div>
        </article>`;
    }).join('');
  }

  scrollMessagesToBottom();
  await Promise.allSettled([
    supabase.rpc('mark_conversation_read', { p_conversation_id: state.activeConversationId }),
    loadUsers(),
    loadNotifications(),
  ]);
  renderList();
}

async function sendMessage() {
  if (state.sending) return;
  const text = els.input.value.trim();
  if (!text || !state.activeConversationId) return;
  state.sending = true;
  els.sendBtn.disabled = true;
  try {
    const { error } = await supabase.rpc('send_chat_message', { p_conversation_id: state.activeConversationId, p_text: text });
    if (error) throw error;
    els.input.value = '';
    await loadMessages();
  } catch (error) {
    setMessage(els.status, normalizeError(error), 'error');
  } finally {
    state.sending = false;
    els.sendBtn.disabled = false;
  }
}

async function sendContactRequest(userId) {
  const { error } = await supabase.rpc('send_contact_request', { p_target_user: userId });
  if (error) return setMessage(els.status, normalizeError(error), 'error');
  await refreshDirectory();
  const entry = state.users.find((item) => item.id === userId);
  if (entry) {
    state.activePeer = entry;
    renderRequestPanel(entry);
  }
  toast('Запрос отправлен.', 'success');
}

async function respondContactRequest(requestId, accept, userId) {
  const { error } = await supabase.rpc('respond_contact_request', { p_request_id: requestId, p_accept: accept });
  if (error) return setMessage(els.status, normalizeError(error), 'error');
  await refreshDirectory();
  if (accept && userId) await selectUser(userId);
  else resetThread(accept ? 'Контакт добавлен' : 'Запрос отклонён');
  toast(accept ? 'Контакт добавлен.' : 'Запрос отклонён.', 'success');
}

async function saveAlias() {
  if (!state.activePeer?.id) return;
  const alias = els.aliasInput.value.trim();
  const { error } = await supabase.rpc('set_contact_alias', { p_contact_user: state.activePeer.id, p_alias: alias || null });
  if (error) return setMessage(els.aliasMessage, normalizeError(error), 'error');
  setLocalAlias(state.activePeer.id, alias);
  await refreshDirectory();
  const entry = state.users.find((item) => item.id === state.activePeer.id);
  if (entry) {
    state.activePeer = entry;
    els.title.textContent = getDisplayName(entry);
    els.avatar.textContent = initials(getDisplayName(entry));
  }
  closeModal(els.aliasModal);
  toast('Имя сохранено.', 'success');
}

async function removeContact() {
  if (!state.activePeer?.id || !confirm(`Удалить ${getDisplayName(state.activePeer)} из контактов?`)) return;
  const { error } = await supabase.rpc('remove_chat_contact', { p_other_user: state.activePeer.id });
  if (error) return setMessage(els.status, normalizeError(error), 'error');
  await refreshDirectory();
  resetThread('Контакт удалён');
}

async function clearChat() {
  if (!state.activePeer?.id || !confirm('Очистить переписку с этим контактом?')) return;
  const { error } = await supabase.rpc('clear_direct_conversation', { p_other_user: state.activePeer.id });
  if (error) return setMessage(els.status, normalizeError(error), 'error');
  await loadMessages();
  toast('Чат очищен.', 'success');
}

function openModal(el) {
  if (!el) return;
  el.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal(el) {
  if (!el) return;
  el.hidden = true;
  document.body.style.overflow = '';
}

async function refreshDirectory() {
  await Promise.all([loadUsers(), loadNotifications()]);
  renderList();
}

function bindEvents() {
  document.querySelectorAll('[data-chat-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeTab = btn.dataset.chatTab;
      renderList();
      if (isMobile()) setMobileView('list');
    });
  });
  els.search.addEventListener('input', renderList);
  els.list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-user-id]');
    if (button) selectUser(button.dataset.userId);
  });
  els.requestPanel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-request-action]');
    if (!button) return;
    if (button.dataset.requestAction === 'send') sendContactRequest(button.dataset.userId);
    if (button.dataset.requestAction === 'accept') respondContactRequest(button.dataset.requestId, true, button.dataset.userId);
    if (button.dataset.requestAction === 'reject') respondContactRequest(button.dataset.requestId, false, button.dataset.userId);
  });
  els.form.addEventListener('submit', (event) => { event.preventDefault(); sendMessage(); });
  els.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  els.backBtn.addEventListener('click', () => setMobileView('list'));
  els.openAliasBtn.addEventListener('click', () => {
    closeActionMenu();
    openModal(els.aliasModal);
  });
  els.saveAliasBtn.addEventListener('click', saveAlias);
  els.removeBtn.addEventListener('click', () => {
    closeActionMenu();
    removeContact();
  });
  els.clearBtn.addEventListener('click', () => {
    closeActionMenu();
    clearChat();
  });
  document.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => closeModal(document.getElementById(el.dataset.close)));
  });
}

async function init() {
  initTheme();
  bindEvents();
  try {
    const ok = await requireSession();
    if (!ok) return;
    await loadProfile();
    await refreshDirectory();
    resetThread();
    state.pollTimer = window.setInterval(async () => {
      await refreshDirectory();
      if (state.activeConversationId) await loadMessages();
    }, 8000);
  } catch (error) {
    setMessage(els.status, normalizeError(error), 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
