// public/player.js

const $ = (id) => document.getElementById(id)

const state = {
  cfg: null,
  provider: null,
  signer: null,
  address: null,
  usdcDecimals: 6,
}

let playLocked = false

// --- HELPERS ---

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
  const txt = await res.text()
  try { return JSON.parse(txt) } 
  catch (e) { throw new Error(`API Error: ${txt.slice(0, 100)}`) }
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body || {}),
  })
  const txt = await res.text()
  try { return JSON.parse(txt) } 
  catch (e) { throw new Error(`API Error: ${txt.slice(0, 100)}`) }
}

// --- AUTH & CONFIG ---

async function mustBeTwitterAuthed() {
  if (!window.pbAuth) return false
  const data = await window.pbAuth.getMe()
  return Boolean(data && data.ok && data.user)
}

async function loadConfig() {
  const cfg = await apiGet('/api/config')
  if (!cfg.ok) throw new Error('Cannot load config')
  state.cfg = cfg
  return cfg
}

async function refreshGating() {
  const authed = await mustBeTwitterAuthed()
  const connected = Boolean(state.address)

  setEnabled($('connectBtn'), authed && !connected)
  setEnabled($('approveBtn'), authed && connected)
  setEnabled($('playBtn'), authed && connected)

  const cbtn = $('connectBtn')
  if (cbtn) cbtn.textContent = connected ? 'Wallet connected' : 'Connect wallet'

  if (!authed) {
    $('addr').textContent = 'Wallet: blocked (login with Twitter first)'
    setStatus('Login with Twitter first')
    return false
  }
  
  $('addr').textContent = connected ? `Wallet: ${state.address}` : 'Wallet: not connected'
  return true
}

// --- WALLET CONNECT ---

async function connectWallet() {
  if (!window.ethereum) return alert('Install MetaMask')
  const provider = new ethers.BrowserProvider(window.ethereum)
  await provider.send('eth_requestAccounts', [])
  
  // Проверка сети
  if (state.cfg?.arc?.chainIdHex) {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: state.cfg.arc.chainIdHex }],
      })
    } catch(e) { console.error("Wrong network", e) }
  }

  const signer = await provider.getSigner()
  const address = await signer.getAddress()
  
  state.provider = provider
  state.signer = signer
  state.address = address
  
  await refreshUsdcBalance()
  return address
}

// --- USDC & APPROVE ---

const USDC_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function decimals() view returns (uint8)',
]

async function getUsdcContract(signerOrProvider) {
  return new ethers.Contract(state.cfg.contracts.usdc, USDC_ABI, signerOrProvider)
}

async function refreshUsdcBalance() {
  if (!state.provider || !state.address) return
  const usdc = await getUsdcContract(state.provider)
  try { state.usdcDecimals = Number(await usdc.decimals()) } catch {}
  const bal = await usdc.balanceOf(state.address)
  $('usdc').textContent = 'USDC: ' + ethers.formatUnits(bal, state.usdcDecimals)
}

async function approveUsdc() {
  if (!state.signer) throw new Error('Wallet not connected')
  const stake = Number($('stakeSel').value || '0')
  if (!stake) throw new Error('Select stake')

  const usdc = await getUsdcContract(state.signer)
  const escrowAddr = state.cfg.contracts.escrow
  const amount = ethers.parseUnits(String(stake), state.usdcDecimals)

  const allowance = await usdc.allowance(state.address, escrowAddr)
  if (allowance >= amount) {
    setStatus('Already approved!')
    return
  }

  setStatus('Approving USDC...')
  const tx = await usdc.approve(escrowAddr, ethers.MaxUint256)
  setStatus('Approve tx sent. Waiting...')
  await tx.wait()
  setStatus('Approved!')
}

// --- GAME LOGIC ---

async function pollMatch(address, stake) {
  // Опрашиваем сервер, пока не найдем соперника
  for (;;) {
    const q = `/api/match?address=${encodeURIComponent(address)}&stake=${encodeURIComponent(stake)}`
    const r = await apiGet(q)
    if (r.ok && r.status === 'matched') return r
    await new Promise((r) => setTimeout(r, 2000))
  }
}

async function playFlow() {
  const authed = await mustBeTwitterAuthed()
  if (!authed) throw new Error('Login with Twitter first')
  if (!state.address) throw new Error('Connect wallet first')

  const stake = Number($('stakeSel').value)
  if (!stake) throw new Error('Select stake')

  setStatus('Searching for opponent...')
  
  // 1. Отправляем заявку (без промпта)
  const r = await apiPost('/api/play', { address: state.address, stake }) 
  if (!r.ok) throw new Error('Error: ' + r.error)

  let battleId = null

  if (r.status === 'waiting') {
    setStatus('Waiting in queue...')
    const m = await pollMatch(state.address, stake)
    battleId = m.battleId
  } else if (r.status === 'matched') {
    battleId = r.battleId
  }

  // 2. Переходим на Арену
  window.location.href = `/battle.html?battleId=${battleId}`;
}

// --- INIT ---

window.addEventListener('DOMContentLoaded', async () => {
  try { await loadConfig() } catch (e) { setStatus('Config error') }
  await refreshGating()

  document.addEventListener('pb:auth-changed', refreshGating)

  $('connectBtn').addEventListener('click', async () => {
    try { await connectWallet(); await refreshGating(); } 
    catch (e) { setStatus('Connect error: ' + e.message) }
  })

  $('approveBtn').addEventListener('click', async () => {
    try { await approveUsdc() } 
    catch (e) { setStatus('Approve error: ' + e.message) }
  })

  $('playBtn').addEventListener('click', async () => { // Переименовали ID кнопки в player.html? Если нет, оставь playBtn
    if (playLocked) return
    playLocked = true
    try { await playFlow() } 
    catch (e) { setStatus('Error: ' + e.message) } 
    finally { playLocked = false }
  })
})
