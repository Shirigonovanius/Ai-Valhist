// public/auth-ui.js
// Универсальный UI для Twitter auth на любой странице
// Требования к HTML:
// - #me (куда писать "Twitter: @handle" или "Not logged in")
// - #loginBtn (ссылка Login with Twitter)
// - #logoutBtn (кнопка Logout)

(function () {
  async function apiGet(url) {
      const API_BASE = 'http://localhost:4000'
  const apiUrl = (p) => API_BASE.replace(/\/$/, '') + p

    const res = await fetch(apiUrl(url), { credentials: 'include' })
    return res.json()
  }

  async function apiPost(url, body) {
    const res = await fetch(apiUrl(url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body || {}),
    })
    return res.json()
  }

  function $(id) {
    return document.getElementById(id)
  }

  function setLoginHref() {
    const loginBtn = $('loginBtn')
    if (!loginBtn) return

    const returnTo = window.location.pathname + window.location.search
    loginBtn.setAttribute('href', '/api/auth/twitter?returnTo=' + encodeURIComponent(returnTo))
  }

  function renderMe(user) {
    const me = $('me')
    const loginBtn = $('loginBtn')
    const logoutBtn = $('logoutBtn')

    setLoginHref()

    if (!me) return

    if (!user) {
      me.textContent = 'Twitter: not logged in'
      if (loginBtn) loginBtn.style.display = ''
      if (logoutBtn) logoutBtn.style.display = 'none'
      return
    }

    me.textContent = 'Twitter: ' + (user.twitter_handle || '@user')
    if (loginBtn) loginBtn.style.display = 'none'
    if (logoutBtn) logoutBtn.style.display = ''
  }

  async function refresh() {
    setLoginHref()
    const data = await apiGet('/api/auth/me')
    renderMe(data && data.ok ? data.user : null)
    document.dispatchEvent(new CustomEvent('pb:auth-changed'))
    return data
  }

  async function logout() {
    await apiPost('/api/auth/logout', {})
    await refresh()
  }

  window.pbAuth = {
    getMe: () => apiGet('/api/auth/me'),
    refresh,
    logout,
  }

  window.pbInitTwitterUI = function pbInitTwitterUI() {
    const logoutBtn = $('logoutBtn')
    setLoginHref()

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try {
          await logout()
        } catch (e) {
          console.error('Logout failed', e)
        }
      })
    }

    refresh().catch((e) => console.error('Auth refresh error', e))
  }
})()
