const $ = (id) => document.getElementById(id)

const state = {
  cfg: null,
  provider: null,
  signer: null,
  address: null,
  usdcDecimals: 6,
  battleId: null,
  battle: null,
  deposits: [],
  works: [],
}

function setStatus(txt) {
  const el = $('status')
  if (el) el.textContent = txt
}

function setEnabled(el, enabled) {
  if (!el) return
  el.disabled = !enabled
  el.style.opacity = enabled ? '1' : '0.55'
}

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

function qs(name) {
  const u = new URL(window.location.href)
  return u.searchParams.get(name)
}

async function mustBeTwitterAuthed() {
  if (!window.pbAuth) return false
  const data = await window.pbAuth.getMe()
  return Boolean(data && data.ok && data.user)
}

async function loadConfig() {
  const cfg = await apiGet('/api/config')
  if (!cfg.ok) throw new Error('Cannot load /api/config')
  state.cfg = cfg
  return cfg
}

function explorerTxUrl(hash) {
  const base = state.cfg?.arc?.explorer || 'https://testnet.arcscan.app'
  return base.replace(/\/$/, '') + '/tx/' + hash
}

async function refreshAuthUI() {
  const authed = await mustBeTwitterAuthed()

  const loginBtn = $('loginBtn')
  const logoutBtn = $('logoutBtn')

  const returnTo = window.location.pathname + window.location.search
  if (loginBtn) {
    loginBtn.href = '/api/auth/twitter?returnTo=' + encodeURIComponent(returnTo)
    loginBtn.style.display = authed ? 'none' : 'inline-flex'
  }
  if (logoutBtn) logoutBtn.style.display = authed ? 'inline-flex' : 'none'

  return authed
}

async function refreshGating() {
  const authed = await mustBeTwitterAuthed()
  const connected = Boolean(state.address)

  setEnabled($('connectBtn'), authed && !connected)
  setEnabled($('approveBtn'), authed && connected)
  setEnabled($('depositBtn'), authed && connected)
  setEnabled($('submitWorkBtn'), authed && connected)

  const cbtn = $('connectBtn')
  if (cbtn) cbtn.textContent = connected ? 'Wallet connected' : 'Connect wallet'

  if (!authed) {
    $('addr').textContent = 'Wallet: blocked (login with Twitter first)'
    $('net').textContent = 'Network: —'
    $('usdc').textContent = 'USDC: —'
    setStatus('Сначала залогинься через Twitter')
    return false
  }

  if (!connected) setStatus('Twitter ok, теперь подключи кошелёк')
  return true
}

async function getProvider() {
  if (!window.ethereum) throw new Error('No wallet found (install Rabby/MetaMask)')
  return new ethers.BrowserProvider(window.ethereum)
}

async function ensureCorrectNetwork(provider) {
  const wantDec = Number(state.cfg?.arc?.chainId || 0)
  const wantHex = state.cfg?.arc?.chainIdHex
  if (!wantDec || !wantHex) return

  const net = await provider.getNetwork()
  const haveDec = Number(net.chainId)
  $('net').textContent = 'Network: chainId=' + haveDec

  if (haveDec === wantDec) return

  await window.ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: wantHex }],
  })
}

const USDC_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function decimals() view returns (uint8)',
]

const ESCROW_ABI = [
  'function deposit(uint256 battleId, uint256 amount)',
]

async function getUsdc(readOrWrite) {
  const usdcAddr = state.cfg?.contracts?.usdc
  if (!usdcAddr) throw new Error('USDC missing in /api/config')
  return new ethers.Contract(usdcAddr, USDC_ABI, readOrWrite)
}

async function getEscrow(write) {
  const escrowAddr = state.cfg?.contracts?.escrow
  if (!escrowAddr) throw new Error('ESCROW missing in /api/config')
  return new ethers.Contract(escrowAddr, ESCROW_ABI, write)
}

async function refreshUsdcBalance() {
  if (!state.provider || !state.address) return
  const usdc = await getUsdc(state.provider)
  try {
    state.usdcDecimals = Number(await usdc.decimals())
  } catch (e) {
    state.usdcDecimals = 6
  }
  const bal = await usdc.balanceOf(state.address)
  $('usdc').textContent = 'USDC: ' + ethers.formatUnits(bal, state.usdcDecimals)
}

async function connectWallet() {
  const provider = await getProvider()
  await provider.send('eth_requestAccounts', [])
  await ensureCorrectNetwork(provider)

  const signer = await provider.getSigner()
  const address = await signer.getAddress()
  const net = await provider.getNetwork()

  state.provider = provider
  state.signer = signer
  state.address = address

  $('net').textContent = 'Network: chainId=' + net.chainId
  $('addr').textContent = 'Wallet: ' + address

  await refreshUsdcBalance()
  await refreshGating()
}

async function approveMax() {
  if (!state.signer || !state.address) throw new Error('Wallet not connected')
  const stake = Number($('stakeSel').value || '0') || 0
  if (!stake) throw new Error('Choose stake')

  const usdc = await getUsdc(state.signer)
  const escrowAddr = state.cfg?.contracts?.escrow
  const MAX = (2n ** 256n) - 1n

  setStatus('Approve USDC…')
  const tx = await usdc.approve(escrowAddr, MAX)
  setStatus('Approve tx: ' + explorerTxUrl(tx.hash))
  await tx.wait()
  setStatus('Approve confirmed')
  await refreshUsdcBalance()
}

function depositKey(battleId, address) {
  return `pb_depositTx:${battleId}:${address.toLowerCase()}`
}

function loadDepositTx(battleId, address) {
  try { return localStorage.getItem(depositKey(battleId, address)) } catch (e) { return null }
}

function saveDepositTx(battleId, address, txHash) {
  try { localStorage.setItem(depositKey(battleId, address), txHash) } catch (e) {}
}

async function doDeposit() {
  if (!state.signer || !state.address) throw new Error('Wallet not connected')
  if (!state.battleId) throw new Error('battleId missing')

  const stake = Number($('stakeSel').value || '0') || 0
  if (!stake) throw new Error('Choose stake')

  const cached = loadDepositTx(state.battleId, state.address)
  if (cached) {
    setStatus('Deposit уже был отправлен ранее: ' + explorerTxUrl(cached))
    const r = await apiPost(`/api/battles/${state.battleId}/confirm-deposit`, { address: state.address, txHash: cached })
    if (!r.ok) throw new Error(r.error || 'confirm failed')
    setStatus('Deposit подтверждён в БД')
    return
  }

  const escrow = await getEscrow(state.signer)
  const amount = ethers.parseUnits(String(stake), state.usdcDecimals)

  setStatus('Deposit to escrow…')
  const tx = await escrow.deposit(state.battleId, amount)
  setStatus('Deposit tx: ' + explorerTxUrl(tx.hash))
  const receipt = await tx.wait()
  if (receipt.status !== 1) throw new Error('Deposit reverted')

  saveDepositTx(state.battleId, state.address, tx.hash)

  const r = await apiPost(`/api/battles/${state.battleId}/confirm-deposit`, { address: state.address, txHash: tx.hash })
  if (!r.ok) throw new Error(r.error || 'confirm failed')
  setStatus('Deposit подтверждён в БД')
}

async function submitWork() {
  if (!state.address) throw new Error('Wallet not connected')
  const imageUrl = String($('imageUrl').value || '').trim()
  if (!imageUrl) throw new Error('Paste image URL')

  const r = await apiPost(`/api/battles/${state.battleId}/submit-work`, { address: state.address, imageUrl })
  if (!r.ok) throw new Error(r.error || 'submit-work failed')
  setStatus('Work saved')
}

async function refreshBattleState() {
  if (!state.battleId) return
  const r = await apiGet(`/api/battles/${state.battleId}/state`)
  if (!r.ok) return

  state.battle = r.battle
  state.deposits = r.deposits || []
  state.works = r.works || []

  $('battleTitle').textContent = `Battle: #${state.battleId} status=${state.battle.status}`

  const lines = []
  lines.push(`Players: ${state.battle.player1 || '—'} vs ${state.battle.player2 || '—'}`)
  lines.push(`Deposits: ${state.deposits.length}`)
  for (const d of state.deposits) lines.push(`- ${d.player_address}: ${d.amount} base units`)
  lines.push(`Works: ${state.works.length}`)
  for (const w of state.works) lines.push(`- ${w.player_address}: ${w.image_url}`)

  $('stateBox').textContent = lines.join('\n')

  // UI gating based on battle status
  const authed = await mustBeTwitterAuthed()
  const connected = Boolean(state.address)

  setEnabled($('approveBtn'), authed && connected)
  setEnabled($('depositBtn'), authed && connected)
  setEnabled($('submitWorkBtn'), authed && connected && state.deposits.length >= 1)

  await refreshUsdcBalance()
}

window.addEventListener('DOMContentLoaded', async () => {
  state.battleId = Number(qs('battleId') || 0) || null
  if (!state.battleId) {
    $('stateBox').textContent = 'battleId missing in URL'
    setEnabled($('connectBtn'), false)
    return
  }

  await loadConfig()
  await window.pbInitTwitterUI?.()
  await refreshAuthUI()
  await refreshGating()

  $('logoutBtn')?.addEventListener('click', async () => {
    await window.pbAuth.logout()
  })

  $('connectBtn').addEventListener('click', async () => {
    try {
      const ok = await refreshGating()
      if (!ok) return
      await connectWallet()
      setStatus('Wallet connected')
    } catch (e) {
      setStatus('Connect error: ' + (e?.message || String(e)))
    }
  })

  $('approveBtn').addEventListener('click', async () => {
    try {
      const ok = await refreshGating()
      if (!ok) return
      await approveMax()
    } catch (e) {
      setStatus('Approve error: ' + (e?.message || String(e)))
    }
  })

  $('depositBtn').addEventListener('click', async () => {
    try {
      const ok = await refreshGating()
      if (!ok) return
      await doDeposit()
      await refreshBattleState()
    } catch (e) {
      setStatus('Deposit error: ' + (e?.message || String(e)))
    }
  })

  $('submitWorkBtn').addEventListener('click', async () => {
    try {
      const ok = await refreshGating()
      if (!ok) return
      await submitWork()
      await refreshBattleState()
    } catch (e) {
      setStatus('Submit error: ' + (e?.message || String(e)))
    }
  })

  await refreshBattleState()
  setInterval(refreshBattleState, 2500)
})
