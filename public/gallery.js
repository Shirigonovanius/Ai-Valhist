console.log('gallery.js loaded')
document.getElementById('me').textContent = 'JS loaded'

async function apiGet(url) {
  const res = await fetch(url, { credentials: 'include' })
  return res.json()
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body || {}),
  })
  return res.json()
}

function shortAddr(a) {
  if (!a) return ''
  if (a.length <= 12) return a
  return a.slice(0, 6) + '…' + a.slice(-4)
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else if (k === 'text') node.textContent = v
    else node.setAttribute(k, v)
  }
  for (const c of children) node.appendChild(c)
  return node
}

let currentUser = null

async function loadMe() {
  const data = await apiGet('/api/auth/me')
  currentUser = data.user

  const me = document.getElementById('me')
  const loginBtn = document.getElementById('loginBtn')
  const logoutBtn = document.getElementById('logoutBtn')

  if (!currentUser) {
    me.textContent = 'Not logged in'
    loginBtn.style.display = ''
    logoutBtn.style.display = 'none'
    return
  }

  me.textContent = `Logged in as ${currentUser.twitter_handle}`
  loginBtn.style.display = 'none'
  logoutBtn.style.display = ''
}

async function logout() {
  await apiPost('/api/auth/logout')
  await loadMe()
  await loadFeatured()
}

async function vote(featuredId, btn, votesEl) {
  btn.disabled = true
  const res = await apiPost(`/api/featured/${featuredId}/vote`)

  if (!res.ok) {
    alert(res.error || 'Vote failed')
    btn.disabled = false
    return
  }

  votesEl.textContent = `${res.totalVotes} votes`
  btn.textContent = res.alreadyVoted ? 'Voted' : 'Vote'
  btn.disabled = false
}

function renderItem(item) {
  const img = el('img', {
    class: 'thumb',
    src: item.image_url || 'https://dummyimage.com/1024x1024/222/fff.png&text=No+Image',
    alt: 'work',
  })

  const title = el('div', { class: 'title', text: `Battle #${item.battle_id}` })
  const winner = el('div', { class: 'muted', text: `Winner: ${shortAddr(item.player_address)}` })

  const promptText = (item.prompt || '').trim()
  const prompt = el('div', {
    class: 'prompt',
    text: promptText ? promptText : '(prompt not linked to featured work)',
  })

  const votesEl = el('div', { class: 'muted', text: `${item.total_votes || 0} votes` })

  const btn = el('button', { class: 'btn', text: currentUser ? 'Vote' : 'Login to vote' })
  btn.disabled = !currentUser
  btn.addEventListener('click', () => vote(item.id, btn, votesEl))

  const row = el('div', { class: 'row' }, [votesEl, btn])

  return el('div', { class: 'card' }, [
    img,
    el('div', { class: 'cardBody' }, [title, winner, prompt, row]),
  ])
}

async function loadFeatured() {
  const data = await apiGet('/api/featured/top?limit=20')

  const list = document.getElementById('list')
  const empty = document.getElementById('empty')
  list.innerHTML = ''

  if (!data.ok) {
    list.appendChild(el('div', { class: 'muted', text: data.error || 'Failed to load' }))
    empty.style.display = 'none'
    return
  }

  if (!data.items || data.items.length === 0) {
    empty.style.display = ''
    return
  }

  empty.style.display = 'none'
  for (const item of data.items) list.appendChild(renderItem(item))
}

async function loadBattleImages() {
  const params = new URLSearchParams(location.search);
  const battleId = params.get('battleId');
  if (!battleId) return;

  const r = await fetch(`/api/battles/${battleId}/status`, { credentials: 'include' });
  const s = await r.json();

  if (!s.ok) {
    document.getElementById('status').textContent = s.error || 'load failed';
    return;
  }

  if (s.genStatus !== 'done') {
    document.getElementById('status').textContent = `genStatus=${s.genStatus}`;
    return;
  }

  document.getElementById('status').textContent = 'done';

  // предположим, у тебя есть <img id="img1"> и <img id="img2">
  document.getElementById('img1').src = s.p1Image;
  document.getElementById('img2').src = s.p2Image;
}

window.addEventListener('DOMContentLoaded', loadBattleImages);


window.addEventListener('DOMContentLoaded', () => {
  try {
    // Показать, что JS точно стартанул
    const meEl = document.getElementById('me')
    if (meEl) meEl.textContent = 'JS started…'

    const refreshBtn = document.getElementById('refreshBtn')
    if (refreshBtn) refreshBtn.addEventListener('click', loadFeatured)

    const logoutBtn = document.getElementById('logoutBtn')
    if (logoutBtn) logoutBtn.addEventListener('click', logout)

    // Запуск основного потока
    loadMe()
      .then(loadFeatured)
      .catch((err) => {
        console.error('loadMe/loadFeatured failed:', err)
        if (meEl) meEl.textContent = 'API error (open Console)'
      })
  } catch (err) {
    console.error('gallery.js crashed:', err)
    const meEl = document.getElementById('me')
    if (meEl) meEl.textContent = 'JS crashed (open Console)'
  }
})

