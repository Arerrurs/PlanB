
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (id) => document.getElementById(id);
const els = {
  themeBtn: $('themeBtn'),
  adminStatus: $('adminStatus'),
  searchQuotes: $('searchQuotes'),
  sortSelect: $('sortSelect'),
  newQuoteText: $('newQuoteText'),
  addQuoteBtn: $('addQuoteBtn'),
  addQuoteStatus: $('addQuoteStatus'),
  quotesList: $('quotesList'),
  suggestionsList: $('suggestionsList'),
  usersList: $('usersList'),
  voteModal: $('voteModal'),
  voteModalContent: $('voteModalContent')
};

let profile = null;
let quotesCache = [];
let votesCache = [];
let profilesCache = [];

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('theme', theme);
}
function initTheme() {
  applyTheme(localStorage.getItem('theme') || 'light');
}
function setStatus(el, text = '', type = 'info') {
  el.textContent = text;
  el.style.color = type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--muted)';
}
function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

async function checkAdmin() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    setStatus(els.adminStatus, 'Сначала войдите на главной странице.', 'error');
    return false;
  }
  const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  profile = data;
  if (profile?.role !== 'admin') {
    setStatus(els.adminStatus, 'Доступ только для администратора.', 'error');
    return false;
  }
  return true;
}

async function loadAll() {
  const [quotesRes, votesRes, usersRes, suggestionsRes] = await Promise.all([
    supabase.from('quotes').select('*'),
    supabase.from('quote_votes').select('*'),
    supabase.from('profiles').select('id,email,username,role'),
    supabase.from('quote_suggestions').select('id,text,status,created_at,user_id')
  ]);
  quotesCache = quotesRes.data || [];
  votesCache = votesRes.data || [];
  profilesCache = usersRes.data || [];
  renderQuotes();
  renderUsers();
  renderSuggestions(suggestionsRes.data || []);
}

function aggregate(q) {
  const likes = votesCache.filter(v => v.quote_id === q.id && v.vote === 'like').length;
  const dislikes = votesCache.filter(v => v.quote_id === q.id && v.vote === 'dislike').length;
  return { likes, dislikes };
}

function renderQuotes() {
  const term = els.searchQuotes.value.trim().toLowerCase();
  const sort = els.sortSelect.value;
  let rows = quotesCache.filter(q => q.text.toLowerCase().includes(term));
  rows = rows.map(q => ({ ...q, ...aggregate(q) }));
  rows.sort((a,b) => {
    if (sort === 'likes') return b.likes - a.likes;
    if (sort === 'dislikes') return b.dislikes - a.dislikes;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  els.quotesList.innerHTML = rows.map(q => `
    <div class="mini-quote">
      <div class="mini-quote-text">${escapeHtml(q.text)}</div>
      <div class="admin-hint">${q.status} · #${q.id.slice(0,8)}</div>
      <div class="mini-quote-actions">
        <button class="pill-btn secondary edit-quote" data-id="${q.id}" type="button">Редактировать</button>
        <button class="pill-btn secondary like-details" data-id="${q.id}" data-vote="like" type="button">Лайки: ${q.likes}</button>
        <button class="pill-btn secondary like-details" data-id="${q.id}" data-vote="dislike" type="button">Дизлайки: ${q.dislikes}</button>
      </div>
    </div>
  `).join('') || '<div class="admin-hint">Ничего не найдено.</div>';

  document.querySelectorAll('.edit-quote').forEach(btn => btn.onclick = async () => {
    const q = quotesCache.find(x => x.id === btn.dataset.id);
    const text = prompt('Новый текст цитаты', q.text);
    if (!text) return;
    const { error } = await supabase.from('quotes').update({ text }).eq('id', q.id);
    if (!error) await loadAll();
  });

  document.querySelectorAll('.like-details').forEach(btn => btn.onclick = () => showVotes(btn.dataset.id, btn.dataset.vote));
}

function renderUsers() {
  els.usersList.innerHTML = profilesCache.map(u => `
    <div class="mini-quote">
      <div><strong>${escapeHtml(u.username || '—')}</strong></div>
      <div>${escapeHtml(u.email || '—')}</div>
      <div class="admin-hint">${escapeHtml(u.role || 'user')}</div>
    </div>
  `).join('') || '<div class="admin-hint">Пользователей пока нет.</div>';
}

function renderSuggestions(rows) {
  els.suggestionsList.innerHTML = rows.map(r => {
    const author = profilesCache.find(p => p.id === r.user_id);
    return `
      <div class="mini-quote">
        <div class="mini-quote-text">${escapeHtml(r.text)}</div>
        <div class="admin-hint">Предложил: ${escapeHtml(author?.username || author?.email || 'неизвестно')}</div>
      </div>
    `;
  }).join('') || '<div class="admin-hint">Пока нет предложений.</div>';
}

function showVotes(quoteId, voteType) {
  const ids = votesCache.filter(v => v.quote_id === quoteId && v.vote === voteType).map(v => v.user_id);
  const users = profilesCache.filter(p => ids.includes(p.id));
  els.voteModalContent.innerHTML = users.length ? users.map(u => `
    <div class="mini-quote">
      <div><strong>${escapeHtml(u.username || '—')}</strong></div>
      <div>${escapeHtml(u.email || '—')}</div>
    </div>
  `).join('') : '<div class="admin-hint">Никто не голосовал.</div>';
  openModal('voteModal');
}

async function addQuote() {
  const text = els.newQuoteText.value.trim();
  if (!text) return setStatus(els.addQuoteStatus, 'Введите текст.', 'error');
  const { error } = await supabase.from('quotes').insert({ text, status: 'approved', created_by: profile.id });
  if (error) return setStatus(els.addQuoteStatus, error.message, 'error');
  els.newQuoteText.value = '';
  setStatus(els.addQuoteStatus, 'Цитата добавлена.', 'success');
  await loadAll();
}

function bind() {
  els.themeBtn.onclick = () => applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
  els.searchQuotes.oninput = renderQuotes;
  els.sortSelect.onchange = renderQuotes;
  els.addQuoteBtn.onclick = addQuote;
  document.querySelectorAll('[data-close]').forEach(btn => btn.onclick = () => closeModal(btn.dataset.close));
}

async function init() {
  initTheme();
  bind();
  if (await checkAdmin()) {
    setStatus(els.adminStatus, 'Админка загружена.', 'success');
    await loadAll();
  }
}
init();
