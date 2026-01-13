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
  try {
    return JSON.parse(txt)
  } catch (e) {
    throw new Error(`API GET ${url} вернул не JSON, HTTP ${res.status}, начало ответа: ` + txt.slice(0, 180))
  }
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body || {}),
  })

  const txt = await res.text()
  try {
    return JSON.parse(txt)
  } catch (e) {
    throw new Error(`API POST ${url} вернул не JSON, HTTP ${res.status}, начало ответа: ` + txt.slice(0, 180))
  }
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

  const usdc = cfg.contracts?.usdc || null
  const escrow = cfg.contracts?.escrow || null

  if (!usdc || !escrow) {
    setStatus('Server config missing: set USDC_ADDRESS and ESCROW_ADDRESS in .env')
  }

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
    $('net').textContent = 'Network: —'
    $('usdc').textContent = 'USDC: —'
    setStatus('Сначала залогинься через Twitter')
    return false
  }

  if (!connected) {
    setStatus('Twitter ok, теперь подключи кошелёк')
  } else {
    setStatus('Wallet connected')
  }

  return true
}

async function getProvider() {
  if (!window.ethereum) throw new Error('No wallet found (install MetaMask)')
  return new ethers.BrowserProvider(window.ethereum)
}

async function ensureCorrectNetwork(provider) {
  if (!state.cfg?.arc?.chainId) return

  const wantDec = Number(state.cfg.arc.chainId)
  const wantHex = state.cfg.arc.chainIdHex
  const net = await provider.getNetwork()
  const haveDec = Number(net.chainId)

  $('net').textContent = 'Network: chainId=' + haveDec

  if (haveDec === wantDec) return

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: wantHex }],
    })
  } catch (e) {
    throw new Error(
      'Неверная сеть. Переключи кошелёк на Arc testnet (chainId=' +
        wantDec +
        ', ' +
        wantHex +
        ')'
    )
  }
}

async function connectWallet() {
  const authed = await mustBeTwitterAuthed()
  if (!authed) {
    setStatus('Сначала Twitter логин')
    return null
  }

  const provider = await getProvider()
  await provider.send('eth_requestAccounts', [])

  await ensureCorrectNetwork(provider)

  const signer = await provider.getSigner()
  const address = await signer.getAddress()

  const net = await provider.getNetwork()
  $('net').textContent = 'Network: chainId=' + net.chainId.toString()
  $('addr').textContent = 'Wallet: ' + address

  state.provider = provider
  state.signer = signer
  state.address = address

  await refreshUsdcBalance()

  return { provider, signer, address }
}

const USDC_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function decimals() view returns (uint8)',
]

const ESCROW_ABI = ['function deposit(uint256 battleId, uint256 amount)']

function explorerTxUrl(hash) {
  const base = state.cfg?.arc?.explorer || 'https://testnet.arcscan.app'
  return base.replace(/\/$/, '') + '/tx/' + hash
}

// ===== deposit cache (fix P1_ALREADY) =====
function depositKey(battleId) {
  return 'PB_DEPOSIT_TX_' + String(battleId) + '_' + String(state.address || '').toLowerCase()
}

function saveDepositTx(battleId, txHash) {
  try {
    localStorage.setItem(depositKey(battleId), txHash)
  } catch (e) {}
}

function loadDepositTx(battleId) {
  try {
    return localStorage.getItem(depositKey(battleId))
  } catch (e) {
    return null
  }
}
// =========================================

async function getUsdcContract(readOrWrite) {
  const usdcAddr = state.cfg?.contracts?.usdc
  if (!usdcAddr) throw new Error('USDC address missing on server (/api/config)')
  return new ethers.Contract(usdcAddr, USDC_ABI, readOrWrite)
}

async function getEscrowContract(write) {
  const escrowAddr = state.cfg?.contracts?.escrow
  if (!escrowAddr) throw new Error('Escrow address missing on server (/api/config)')
  return new ethers.Contract(escrowAddr, ESCROW_ABI, write)
}

async function refreshUsdcBalance() {
  if (!state.provider || !state.address) return
  const usdc = await getUsdcContract(state.provider)

  try {
    state.usdcDecimals = Number(await usdc.decimals())
  } catch (e) {
    state.usdcDecimals = 6
  }

  const bal = await usdc.balanceOf(state.address)
  $('usdc').textContent = 'USDC: ' + ethers.formatUnits(bal, state.usdcDecimals)
}

async function approveUsdc() {
  if (!state.signer || !state.address) throw new Error('Wallet not connected')

  const stake = Number($('stakeSel').value || '0') || 0
  if (!stake) throw new Error('Выбери stake')

  const usdc = await getUsdcContract(state.signer)
  const escrowAddr = state.cfg?.contracts?.escrow
  const amount = ethers.parseUnits(String(stake), state.usdcDecimals)

  const allowance = await usdc.allowance(state.address, escrowAddr)
  if (allowance >= amount) {
    setStatus('Approve не нужен, allowance уже достаточно')
    return
  }

  if (allowance > 0n) {
    setStatus('Reset allowance to 0...')
    const tx0 = await usdc.approve(escrowAddr, 0)
    setStatus('Reset tx: ' + explorerTxUrl(tx0.hash))
    await tx0.wait()
  }

  const MAX = 2n ** 256n - 1n
  setStatus('Approve USDC...')
  const tx = await usdc.approve(escrowAddr, MAX)
  setStatus('Approve tx: ' + explorerTxUrl(tx.hash))
  await tx.wait()
  setStatus('Approve confirmed')
}

async function pollMatch(address, stake) {
  for (;;) {
    const q =
      '/api/match?address=' +
      encodeURIComponent(address) +
      '&stake=' +
      encodeURIComponent(stake)
    const r = await apiGet(q)
    if (r.ok && r.status === 'matched') return r
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
}

async function doDeposit(battleId, stake) {
  if (!state.signer) throw new Error('No signer')
  const escrow = await getEscrowContract(state.signer)

  const amount = ethers.parseUnits(String(stake), state.usdcDecimals)

  setStatus('Deposit to escrow...')
  const tx = await escrow.deposit(battleId, amount)
  setStatus('Deposit tx: ' + explorerTxUrl(tx.hash))

  const receipt = await tx.wait()
  if (receipt.status !== 1) throw new Error('Deposit tx reverted')

  return tx.hash
}

async function confirmDeposit(battleId, address, txHash) {
  setStatus('Confirm deposit on backend...')
  const r = await apiPost('/api/battles/' + battleId + '/confirm-deposit', {
    address,
    txHash,
  })
  if (!r.ok) throw new Error(r.error || 'confirm-deposit failed')
  setStatus('Deposit confirmed in DB')
}

async function waitForGeneration(battleId, timeoutMs = 10 * 60 * 1000) {
  const started = Date.now();

  while (true) {
    const s = await apiGet(`/api/battles/${battleId}/status`);

    if (s.ok) {
      if (s.genStatus === 'done') return s;
      if (s.genStatus === 'error') throw new Error(s.error || 'generation failed');

      setStatus(`Генерация: ${s.genStatus}... (battleId=${battleId})`);
    }

    if (Date.now() - started > timeoutMs) {
      throw new Error('Timeout waiting for generation');
    }

    await new Promise((r) => setTimeout(r, 2000));
  }
}


async function playFlow() {
  const authed = await mustBeTwitterAuthed()
  if (!authed) throw new Error('Сначала Twitter логин')

  if (!state.address || !state.signer) throw new Error('Сначала подключи кошелёк')

  const stake = Number($('stakeSel').value || '0') || 0
  const prompt = String($('prompt').value || '').trim()

  if (!stake) throw new Error('Выбери stake')
  if (!prompt) throw new Error('Напиши prompt')

  setStatus('Matchmaking...')
  const r = await apiPost('/api/play', { address: state.address, stake, prompt })
  if (!r.ok) throw new Error('Ошибка /api/play: ' + (r.error || 'unknown'))

  let battleId = null

  if (r.status === 'waiting') {
    setStatus('В очереди, ждём соперника...')
    const m = await pollMatch(state.address, stake)
    battleId = m.battleId
    setStatus('Соперник найден, battleId=' + battleId)
  } else if (r.status === 'matched') {
    battleId = r.battleId
    setStatus('Сразу matched, battleId=' + battleId)
  } else {
    throw new Error('Неизвестный ответ /api/play')
  }

  // ===== idempotent deposit =====
  let txHash = loadDepositTx(battleId)

  if (txHash) {
    setStatus('Deposit уже был отправлен ранее, подтверждаем в DB: ' + explorerTxUrl(txHash))
  } else {
    txHash = await doDeposit(battleId, stake)
    saveDepositTx(battleId, txHash)
  }

  await confirmDeposit(battleId, state.address, txHash)
  const gen = await waitForGeneration(battleId);
setStatus('Готово. Открываю галерею...');
window.location.href = `/gallery.html?battleId=${battleId}`;

  // ==============================

  setStatus('Готово: battleId=' + battleId + '\nDeposit: ' + explorerTxUrl(txHash))
  await refreshUsdcBalance()
}

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadConfig()
  } catch (e) {
    setStatus('Config error: ' + (e?.message || String(e)))
  }

  await refreshGating()

  document.addEventListener('pb:auth-changed', async () => {
    await refreshGating()
  })

  $('connectBtn').addEventListener('click', async () => {
    try {
      const ok = await refreshGating()
      if (!ok) return
      await connectWallet()
      await refreshGating()
      setStatus('Wallet connected')
    } catch (e) {
      setStatus('Connect error: ' + (e?.message || String(e)))
    }
  })

  $('approveBtn').addEventListener('click', async () => {
    try {
      const ok = await refreshGating()
      if (!ok) return
      await approveUsdc()
      await refreshUsdcBalance()
    } catch (e) {
      setStatus('Approve error: ' + (e?.message || String(e)))
    }
  })

  $('playBtn').addEventListener('click', async () => {
    if (playLocked) return
    playLocked = true

    try {
      const ok = await refreshGating()
      if (!ok) return
      await playFlow()
    } catch (e) {
      setStatus('Play error: ' + (e?.message || String(e)))
    } finally {
      playLocked = false
    }
  })
})
