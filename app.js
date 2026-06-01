const API_HOST = 'https://discord.com/api/v10';
const CDN = 'https://cdn.discordapp.com';
const MEDIA = 'https://media.discordapp.net';

let state = {
  token: '',
  guilds: [],
  selectedGuildId: null,
  guild: null,
  emojis: [],
  stickers: [],
  selectedEmojis: new Set(),
  selectedStickers: new Set(),
  includeEmojis: true,
  includeStickers: true,
};

function emojiURL(id, animated) {
  return `${CDN}/emojis/${id}.${animated ? 'gif' : 'png'}?v=1`;
}

function stickerURL(id) {
  return `${MEDIA}/stickers/${id}.png?size=512`;
}

async function apiRequest(endpoint) {
  return fetch(API_HOST + endpoint, {
    headers: { 'Authorization': state.token }
  });
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    b.classList.toggle('active', (tab === 'auto' && i === 0) || (tab === 'manual' && i === 1));
  });
  document.getElementById('panel-auto').classList.toggle('active', tab === 'auto');
  document.getElementById('panel-manual').classList.toggle('active', tab === 'manual');
  hideGlobalError();
}

function showStep(id) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function goBack(stepId) {
  showStep(stepId);
  hideGlobalError();
}

function toggleHowto() {
  const box = document.getElementById('howto-box');
  box.style.display = box.style.display === 'block' ? 'none' : 'block';
}

function showGlobalError(msg) {
  const el = document.getElementById('msg-global-error');
  document.getElementById('msg-global-error-text').textContent = msg;
  el.classList.add('visible');
}

function hideGlobalError() {
  document.getElementById('msg-global-error').classList.remove('visible');
}

async function doLogin() {
  const token = document.getElementById('token-input').value.trim().replace(/^"(.+)"$/, '$1');
  if (!token) { showGlobalError('Please enter your user token.'); return; }

  state.token = token;
  const btn = document.getElementById('btn-continue');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Connecting...';
  hideGlobalError();

  try {
    const res = await apiRequest('/users/@me/guilds');
    if (!res.ok) throw new Error(res.status === 401 ? 'Invalid token.' : 'Could not connect to Discord.');
    state.guilds = (await res.json()).sort((a, b) => a.name.localeCompare(b.name));
    renderGuildGrid();
    showStep('step-server');
  } catch (e) {
    showGlobalError(e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-text">Continue →</span>';
  }
}

function renderGuildGrid() {
  const grid = document.getElementById('guild-grid');
  grid.innerHTML = '';
  state.guilds.forEach(guild => {
    const el = document.createElement('div');
    el.className = 'guild-item';
    el.dataset.id = guild.id;
    const avatar = guild.icon
      ? `<img src="${CDN}/icons/${guild.id}/${guild.icon}.png" onerror="this.style.display='none';this.nextSibling.style.display='flex'" /><div class="guild-avatar-placeholder" style="display:none">${guild.name[0]}</div>`
      : `<div class="guild-avatar-placeholder">${guild.name[0]}</div>`;
    el.innerHTML = `${avatar}<span class="guild-name">${guild.name}</span>`;
    el.onclick = () => selectGuild(guild.id);
    grid.appendChild(el);
  });
}

function selectGuild(id) {
  state.selectedGuildId = id;
  document.querySelectorAll('.guild-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === id);
  });
  document.getElementById('btn-load-emojis').disabled = false;
}

async function loadEmojis() {
  if (!state.selectedGuildId) return;
  const btn = document.getElementById('btn-load-emojis');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Loading...';
  hideGlobalError();

  try {
    const res = await apiRequest(`/guilds/${state.selectedGuildId}`);
    if (!res.ok) throw new Error('Could not fetch guild data.');
    loadGuildData(await res.json());
    showStep('step-select');
  } catch (e) {
    showGlobalError(e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-text">Load Emojis & Stickers →</span>';
  }
}

function doManual() {
  const raw = document.getElementById('manual-json').value.trim();
  const errEl = document.getElementById('msg-manual-error');
  const errText = document.getElementById('msg-manual-error-text');
  errEl.classList.remove('visible');

  try {
    const guild = JSON.parse(raw);
    if (!guild.id) throw new Error('Missing guild id.');
    loadGuildData(guild);
    switchTab('auto');
    showStep('step-select');
  } catch (e) {
    errText.textContent = 'Invalid JSON: ' + e.message;
    errEl.classList.add('visible');
  }
}

function loadGuildData(guild) {
  state.guild = guild;
  state.emojis = disambiguate(guild.emojis || []);
  state.stickers = guild.stickers || [];
  state.selectedEmojis = new Set(state.emojis.map(e => e.id));
  state.selectedStickers = new Set(state.stickers.map(s => s.id));
  state.includeEmojis = true;
  state.includeStickers = true;

  document.getElementById('toggle-emojis-count').textContent = `${state.emojis.length} emojis`;
  document.getElementById('toggle-stickers-count').textContent = `${state.stickers.length} stickers`;

  const stickerToggle = document.getElementById('toggle-stickers');
  if (!state.stickers.length) {
    state.includeStickers = false;
    stickerToggle.classList.remove('active');
  }
  stickerToggle.style.opacity = state.stickers.length ? '1' : '0.4';
  stickerToggle.style.pointerEvents = state.stickers.length ? 'auto' : 'none';

  renderEmojiGrid();
  renderStickerGrid();
  updateSummary();
  updateSections();

  document.getElementById('msg-success').classList.remove('visible');
  document.getElementById('msg-error-select').classList.remove('visible');
  document.getElementById('progress-wrap').style.display = 'none';
}

function toggleType(type) {
  if (type === 'emojis') {
    state.includeEmojis = !state.includeEmojis;
    document.getElementById('toggle-emojis').classList.toggle('active', state.includeEmojis);
  } else {
    if (!state.stickers.length) return;
    state.includeStickers = !state.includeStickers;
    document.getElementById('toggle-stickers').classList.toggle('active', state.includeStickers);
  }
  updateSections();
  updateSummary();
}

function updateSections() {
  document.getElementById('section-emojis').style.display = state.includeEmojis ? 'block' : 'none';
  document.getElementById('section-stickers').style.display = state.includeStickers ? 'block' : 'none';
}

function renderEmojiGrid(filter = '') {
  const grid = document.getElementById('emoji-grid');
  grid.innerHTML = '';
  const filtered = state.emojis.filter(e => e.name.toLowerCase().includes(filter.toLowerCase()));

  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div>No emojis found.</div>';
    return;
  }

  filtered.forEach(emoji => {
    const el = document.createElement('div');
    el.className = 'emoji-item' + (state.selectedEmojis.has(emoji.id) ? ' selected' : '');
    el.dataset.id = emoji.id;
    el.innerHTML = `
      <div class="check-mark"><svg viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <img src="${emojiURL(emoji.id, emoji.animated)}" alt="${emoji.name}" loading="lazy" />
      <div class="emoji-name">${emoji.name}</div>
    `;
    el.onclick = () => toggleEmoji(emoji.id, el);
    grid.appendChild(el);
  });
}

function toggleEmoji(id, el) {
  if (state.selectedEmojis.has(id)) { state.selectedEmojis.delete(id); el.classList.remove('selected'); }
  else { state.selectedEmojis.add(id); el.classList.add('selected'); }
  updateSummary();
}

function filterEmojis() { renderEmojiGrid(document.getElementById('emoji-search').value); }

function selectAllEmojis() {
  state.selectedEmojis = new Set(state.emojis.map(e => e.id));
  renderEmojiGrid(document.getElementById('emoji-search').value);
  updateSummary();
}

function deselectAllEmojis() {
  state.selectedEmojis = new Set();
  renderEmojiGrid(document.getElementById('emoji-search').value);
  updateSummary();
}

function renderStickerGrid(filter = '') {
  const grid = document.getElementById('sticker-grid');
  grid.innerHTML = '';
  const filtered = state.stickers.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));

  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div>No stickers found.</div>';
    return;
  }

  filtered.forEach(sticker => {
    const el = document.createElement('div');
    el.className = 'sticker-item' + (state.selectedStickers.has(sticker.id) ? ' selected' : '');
    el.dataset.id = sticker.id;
    el.innerHTML = `
      <div class="check-mark"><svg viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <img src="${stickerURL(sticker.id)}" alt="${sticker.name}" loading="lazy" />
      <div class="sticker-name">${sticker.name}</div>
    `;
    el.onclick = () => toggleSticker(sticker.id, el);
    grid.appendChild(el);
  });
}

function toggleSticker(id, el) {
  if (state.selectedStickers.has(id)) { state.selectedStickers.delete(id); el.classList.remove('selected'); }
  else { state.selectedStickers.add(id); el.classList.add('selected'); }
  updateSummary();
}

function filterStickers() { renderStickerGrid(document.getElementById('sticker-search').value); }

function selectAllStickers() {
  state.selectedStickers = new Set(state.stickers.map(s => s.id));
  renderStickerGrid(document.getElementById('sticker-search').value);
  updateSummary();
}

function deselectAllStickers() {
  state.selectedStickers = new Set();
  renderStickerGrid(document.getElementById('sticker-search').value);
  updateSummary();
}

function updateSummary() {
  const ec = state.includeEmojis ? state.selectedEmojis.size : 0;
  const sc = state.includeStickers ? state.selectedStickers.size : 0;
  document.getElementById('sel-emoji-count').textContent = ec;
  document.getElementById('sel-sticker-count').textContent = sc;
  document.getElementById('sel-total-size').textContent = `Total: ${ec + sc}`;
}

async function startDownload() {
  const selectedEmojis = state.includeEmojis ? state.emojis.filter(e => state.selectedEmojis.has(e.id)) : [];
  const selectedStickers = state.includeStickers ? state.stickers.filter(s => state.selectedStickers.has(s.id)) : [];
  const total = selectedEmojis.length + selectedStickers.length;

  if (!total) {
    document.getElementById('msg-error-text').textContent = 'Select at least one emoji or sticker.';
    document.getElementById('msg-error-select').classList.add('visible');
    return;
  }

  document.getElementById('msg-success').classList.remove('visible');
  document.getElementById('msg-error-select').classList.remove('visible');

  const btn = document.getElementById('btn-download');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Downloading...';

  const progressWrap = document.getElementById('progress-wrap');
  const progressBar = document.getElementById('progress-bar');
  const progressNums = document.getElementById('progress-nums');
  const progressLabel = document.getElementById('progress-label-text');
  progressWrap.style.display = 'block';

  let done = 0;

  const updateProgress = (label) => {
    done++;
    const pct = Math.round((done / total) * 100);
    progressBar.style.width = pct + '%';
    progressNums.textContent = `${done} / ${total}`;
    progressLabel.textContent = label;
  };

  try {
    const zip = new JSZip();
    const emojiFolder = zip.folder('Emojis');
    const stickerFolder = zip.folder('Stickers');

    for (const emoji of selectedEmojis) {
      const url = emojiURL(emoji.id, emoji.animated);
      let blob;
      try { blob = await fetch(url).then(r => r.blob()); }
      catch { blob = await fetch(`https://corsproxy.io/?${url}`).then(r => r.blob()); }
      emojiFolder.file(`${emoji.name}.${emoji.animated ? 'gif' : 'png'}`, blob);
      updateProgress(`Emoji: ${emoji.name}`);
    }

    for (const sticker of selectedStickers) {
      const url = stickerURL(sticker.id);
      let blob;
      try { blob = await fetch(url).then(r => r.blob()); }
      catch { blob = await fetch(`https://corsproxy.io/?${url}`).then(r => r.blob()); }
      stickerFolder.file(`${sticker.name}.png`, blob);
      updateProgress(`Sticker: ${sticker.name}`);
    }

    const cleanName = (state.guild?.name || 'Server').replace(/\s/g, '_').replace(/\W/g, '');
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `Ymshrf_emj_${cleanName}.zip`);

    document.getElementById('msg-success-text').textContent =
      `Done! Downloaded ${selectedEmojis.length} emojis and ${selectedStickers.length} stickers.`;
    document.getElementById('msg-success').classList.add('visible');
  } catch (e) {
    document.getElementById('msg-error-text').textContent = 'Download failed: ' + e.message;
    document.getElementById('msg-error-select').classList.add('visible');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-text">Download ZIP</span>';
  }
}

function disambiguate(emojis) {
  const counts = {};
  return emojis.map(emoji => {
    const n = emoji.name;
    counts[n] = (counts[n] || 0) + 1;
    if (counts[n] > 1) return { ...emoji, name: `${n}~${counts[n] - 1}` };
    return emoji;
  });
}
