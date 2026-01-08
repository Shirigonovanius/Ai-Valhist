// index.js
require('dotenv').config()

const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const session = require('express-session')
const passport = require('passport')
const TwitterStrategy = require('passport-twitter').Strategy
const { Pool } = require('pg')
const path = require('path')
const { ethers } = require('ethers')

// === Arc testnet config (manual) ===

// ВАЖНО: сюда вставь реальный адрес USDC в Arc testnet
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000'

// ВАЖНО: сюда вставь адрес твоего задеплоенного PromptBattleEscrow
const ESCROW_ADDRESS = '0x1d4578929a2779Bb364fA7d56be3b053A6c6140b'


// ======================================================
// 0) ENV checks
// ======================================================

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing in .env')
if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is missing in .env')

// Twitter optional
const TWITTER_CONSUMER_KEY = (process.env.TWITTER_CONSUMER_KEY || '').trim()
const TWITTER_CONSUMER_SECRET = (process.env.TWITTER_CONSUMER_SECRET || '').trim()
const TWITTER_CALLBACK_URL = (process.env.TWITTER_CALLBACK_URL || '').trim()

const twitterEnabled = Boolean(TWITTER_CONSUMER_KEY && TWITTER_CONSUMER_SECRET && TWITTER_CALLBACK_URL)

const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || '').trim() || null
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || '').trim() || null

const isProd = process.env.NODE_ENV === 'production'

// ======================================================
// 1) App + middlewares
// ======================================================

const app = express()
app.disable('x-powered-by')

const rateLimit = require('express-rate-limit')
const crypto = require('crypto')

app.use('/generated', express.static(path.join(__dirname, 'public', 'generated')))

app.use((req, res, next) => {
  req.id = crypto.randomUUID()
  res.setHeader('x-request-id', req.id)
  next()
})

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
})

app.use('/api/', apiLimiter)


if (isProd) app.set('trust proxy', 1)

if (FRONTEND_ORIGIN) {
  app.use(
    cors({
      origin: FRONTEND_ORIGIN,
      credentials: true,
    })
  )
}

app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
    },
  })
)

app.use(passport.initialize())
app.use(passport.session())

app.use(express.static(path.join(__dirname, 'public')))

// ВСТАВЛЯЕШЬ ТУТ
// ======================================================
// PUBLIC CONFIG (frontend reads it)
// ======================================================

const ARC_CHAIN_ID = Number(process.env.ARC_CHAIN_ID || 5042002)
const ARC_EXPLORER = (process.env.ARC_EXPLORER || 'https://testnet.arcscan.app').trim()

const USDC_ADDRESS_ENV = (process.env.USDC_ADDRESS || '').trim()
const ESCROW_ADDRESS_ENV = (process.env.ESCROW_ADDRESS || '').trim()

const ARC_RPC_URL_PUBLIC = (process.env.ARC_RPC_URL_PUBLIC || process.env.ARC_RPC_URL || '').trim()

app.get('/api/config', (req, res) => {
  res.json({
    ok: true,
    arc: {
      chainId: ARC_CHAIN_ID,
      chainIdHex: '0x' + Number(ARC_CHAIN_ID).toString(16),
      explorer: ARC_EXPLORER,
      rpcUrl: ARC_RPC_URL_PUBLIC || null,
    },
    contracts: {
      usdc: USDC_ADDRESS_ENV || null,
      escrow: ESCROW_ADDRESS_ENV || null,
    },
  })
})



// ======================================================
// 2) DB
// ======================================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

// ==============================
// Generation runner (autostart)
// ==============================
const genLocks = new Set();

async function maybeStartGeneration(pool, battleId) {
  if (genLocks.has(battleId)) return;

  // проверяем состояние в БД
  const { rows } = await pool.query(
    `SELECT id, p1_prompt, p2_prompt, p1_deposit_tx, p2_deposit_tx, gen_status
     FROM battles
     WHERE id=$1`,
    [battleId]
  );

  const b = rows[0];
  if (!b) return;

  const bothDeposited = Boolean(b.p1_deposit_tx) && Boolean(b.p2_deposit_tx);
  if (!bothDeposited) return;

  const status = (b.gen_status || 'idle').toLowerCase();
  if (status !== 'idle') return;

  // атомарно переводим в running (защита от двойного старта)
  const upd = await pool.query(
    `UPDATE battles
       SET gen_status='running', gen_started_at=NOW(), gen_error=NULL
     WHERE id=$1 AND (gen_status IS NULL OR gen_status='idle')
     RETURNING id`,
    [battleId]
  );
  if (!upd.rowCount) return;

  genLocks.add(battleId);

  setImmediate(async () => {
    try {
      // перечитываем prompts (на случай обновлений)
      const { rows: rows2 } = await pool.query(
        `SELECT id, p1_prompt, p2_prompt
         FROM battles
         WHERE id=$1`,
        [battleId]
      );
      const bb = rows2[0];
      if (!bb) throw new Error('battle not found after start');

      if (!bb.p1_prompt || !bb.p2_prompt) {
        throw new Error('Missing p1_prompt/p2_prompt in battles row');
      }

      const outDir = path.join(__dirname, 'public', 'generated');
      const p1File = `battle-${battleId}-p1.png`;
      const p2File = `battle-${battleId}-p2.png`;
      const p1Path = path.join(outDir, p1File);
      const p2Path = path.join(outDir, p2File);

      await generateAndSavePng({ prompt: bb.p1_prompt, outPath: p1Path });
      await generateAndSavePng({ prompt: bb.p2_prompt, outPath: p2Path });

      await pool.query(
        `UPDATE battles
            SET gen_status='done',
                p1_image_url=$2,
                p2_image_url=$3,
                gen_finished_at=NOW(),
                gen_error=NULL
          WHERE id=$1`,
        [battleId, `/generated/${p1File}`, `/generated/${p2File}`]
      );
    } catch (e) {
      await pool.query(
        `UPDATE battles
            SET gen_status='error',
                gen_error=$2
          WHERE id=$1`,
        [battleId, String(e?.message || e)]
      );
    } finally {
      genLocks.delete(battleId);
      genLocks.delete(battleId);
    }
  });
}


// ======================================================
// 3) Passport Twitter
// ======================================================

if (!twitterEnabled) {
  console.warn('Twitter auth DISABLED: missing TWITTER_* env vars')
} else {
  passport.use(
    new TwitterStrategy(
      {
        consumerKey: TWITTER_CONSUMER_KEY,
        consumerSecret: TWITTER_CONSUMER_SECRET,
        callbackURL: TWITTER_CALLBACK_URL,
        includeEmail: false,
      },
      async (token, tokenSecret, profile, done) => {
        try {
          const twitterId = profile.id
          const username = profile.username || profile.displayName || 'user'
          const twitterHandle = '@' + username

          const userRes = await pool.query(
            'SELECT id, twitter_id, twitter_handle FROM web_users WHERE twitter_id = $1',
            [twitterId]
          )

          let user
          if (userRes.rows.length === 0) {
            const ins = await pool.query(
              `INSERT INTO web_users (twitter_id, twitter_handle)
               VALUES ($1, $2)
               RETURNING id, twitter_id, twitter_handle`,
              [twitterId, twitterHandle]
            )
            user = ins.rows[0]
          } else {
            user = userRes.rows[0]
            if (user.twitter_handle !== twitterHandle) {
              const upd = await pool.query(
                `UPDATE web_users
                 SET twitter_handle = $1
                 WHERE id = $2
                 RETURNING id, twitter_id, twitter_handle`,
                [twitterHandle, user.id]
              )
              user = upd.rows[0]
            }
          }

          return done(null, user)
        } catch (err) {
          console.error('TwitterStrategy error', err)
          return done(err)
        }
      }
    )
  )
}

passport.serializeUser((user, done) => done(null, user.id))

passport.deserializeUser(async (id, done) => {
  try {
    const res = await pool.query(
      'SELECT id, twitter_id, twitter_handle FROM web_users WHERE id = $1',
      [id]
    )
    if (!res.rows.length) return done(null, false)
    return done(null, res.rows[0])
  } catch (err) {
    return done(err)
  }
})

// ======================================================
// 4) Helpers
// ======================================================

function sanitizeReturnTo(v) {
  if (!v) return null
  const s = String(v).trim()
  if (!s.startsWith('/')) return null
  if (s.startsWith('//')) return null
  if (s.includes('://')) return null
  return s
}

function requireAdmin(req, res) {
  if (!ADMIN_TOKEN) {
    res.status(503).json({ ok: false, error: 'admin disabled (ADMIN_TOKEN not set)' })
    return false
  }
  const token = (req.get('x-admin-token') || '').trim()
  if (!token || token !== ADMIN_TOKEN) {
    res.status(401).json({ ok: false, error: 'not authorized (admin token required)' })
    return false
  }
  return true
}

function requireTwitterUser(req, res) {
  if (!req.user) {
    res.status(401).json({ ok: false, error: 'not authenticated with Twitter' })
    return null
  }
  return req.user
}

function toInt(value, fallback) {
  const n = parseInt(String(value), 10)
  return Number.isFinite(n) ? n : fallback
}

// ======================================================
// 5) Service
// ======================================================

app.get('/api/health', (req, res) => res.json({ ok: true }))

app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as now')
    res.json({ ok: true, now: result.rows[0].now })
  } catch (err) {
    console.error('DB error', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ======================================================
// 6) Matchmaking
// ======================================================

// debug join-queue
let waitingPlayer = null

// main per-stake queue
const waitingByStake = {}

// POST /api/join-queue (debug)
app.post('/api/join-queue', async (req, res) => {
  const { address } = req.body
  if (!address) return res.status(400).json({ ok: false, error: 'address is required' })

  try {
    await pool.query(
      `INSERT INTO users (address) VALUES ($1)
       ON CONFLICT (address) DO NOTHING`,
      [address]
    )

    if (!waitingPlayer || waitingPlayer === address) {
      waitingPlayer = address
      return res.json({ ok: true, status: 'waiting' })
    }

    const player1 = waitingPlayer
    const player2 = address
    waitingPlayer = null

    const stake = 1.0
    const onchainBattleId = 0

    const result = await pool.query(
      `INSERT INTO battles (onchain_battle_id, player1, player2, stake, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [onchainBattleId, player1, player2, stake, 'waiting_prompts']
    )

    return res.json({
      ok: true,
      status: 'matched',
      battleId: result.rows[0].id,
      player1,
      player2,
    })
  } catch (err) {
    console.error('join-queue error', err)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

// POST /api/play
// body: { address, stake, prompt }
// returns: waiting + queuedAt OR matched + battleId
app.post('/api/play', async (req, res) => {
  const tw = requireTwitterUser(req, res)
  if (!tw) return

  const { address, stake, prompt } = req.body
  if (!address || !prompt) {
    return res.status(400).json({ ok: false, error: 'address and prompt are required' })
  }

  const stakeValue = Number(stake) || 1
  const stakeKey = String(stakeValue)

  try {
    await pool.query(
      `INSERT INTO users (address) VALUES ($1)
       ON CONFLICT (address) DO NOTHING`,
      [address]
    )

    const waiting = waitingByStake[stakeKey]

    if (!waiting || waiting.address === address) {
      const queuedAt = new Date().toISOString()
      waitingByStake[stakeKey] = { address, prompt, queuedAt }
      return res.json({ ok: true, status: 'waiting', stake: stakeValue, queuedAt })
    }

    const player1 = waiting.address
    const prompt1 = waiting.prompt
    const player2 = address
    const prompt2 = prompt
    delete waitingByStake[stakeKey]

    const onchainBattleId = 0

    const battleRes = await pool.query(
      `INSERT INTO battles (onchain_battle_id, player1, player2, stake, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [onchainBattleId, player1, player2, stakeValue, 'waiting_judgement']
    )
    const battleId = battleRes.rows[0].id

    await pool.query(
      `INSERT INTO prompts (battle_id, player_address, prompt)
       VALUES ($1, $2, $3), ($1, $4, $5)`,
      [battleId, player1, prompt1, player2, prompt2]
    )

    return res.json({
      ok: true,
      status: 'matched',
      battleId,
      stake: stakeValue,
      player1,
      player2,
    })
  } catch (err) {
    console.error('play error', err)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

// GET /api/match?address=0x...&stake=5
app.get('/api/match', async (req, res) => {
  const tw = requireTwitterUser(req, res)
  if (!tw) return

  const address = String(req.query.address || '').trim()
  const stakeValue = Number(req.query.stake) || 0

  if (!address || !stakeValue) {
    return res.status(400).json({ ok: false, error: 'address and stake are required' })
  }

  try {
    const r = await pool.query(
      `
      SELECT id, player1, player2, stake, status
      FROM battles
      WHERE stake = $1
        AND status = 'waiting_judgement'
        AND winner IS NULL
        AND (player1 = $2 OR player2 = $2)
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [stakeValue, address]
    )

    if (!r.rows.length) {
      return res.json({ ok: true, status: 'waiting' })
    }

    const b = r.rows[0]
    const opponent = b.player1 === address ? b.player2 : b.player1

    return res.json({
      ok: true,
      status: 'matched',
      battleId: b.id,
      opponent,
      stake: b.stake,
    })
  } catch (err) {
    console.error('match error', err)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

// ======================================================
// 7) Deposits (Arc onchain confirm)
// ======================================================

// POST /api/battles/:id/confirm-deposit
// body: { address, txHash }
app.post('/api/battles/:id/confirm-deposit', async (req, res) => {
  const user = requireTwitterUser(req, res)
  if (!user) return

  const battleId = toInt(req.params.id, 0)
  const address = String(req.body.address || '').trim()
  const txHash = String(req.body.txHash || '').trim()

  if (!battleId || !address || !txHash) {
    return res.status(400).json({ ok:false, error:'battleId, address, txHash are required' })
  }

  const rpc = (process.env.ARC_RPC_URL || '').trim()
  const escrowAddr = (process.env.ESCROW_ADDRESS || '').trim()
  const usdcAddr = (process.env.USDC_ADDRESS || '').trim()

  if (!rpc || !escrowAddr || !usdcAddr) {
    return res.status(500).json({ ok:false, error:'ARC_RPC_URL / ESCROW_ADDRESS / USDC_ADDRESS missing' })
  }

  try {
    const bRes = await pool.query(`SELECT * FROM battles WHERE id=$1`, [battleId])
    if (!bRes.rows.length) return res.status(404).json({ ok:false, error:'battle not found' })
    const b = bRes.rows[0]

    const a = address.toLowerCase()
    if (a !== (b.player1||'').toLowerCase() && a !== (b.player2||'').toLowerCase()) {
      return res.status(403).json({ ok:false, error:'address is not a player of this battle' })
    }

    // Идемпотентность
    const already = await pool.query(
      `SELECT * FROM deposits WHERE battle_id=$1 AND player_address=$2 LIMIT 1`,
      [battleId, address]
    )
    if (already.rows.length) {
      return res.json({ ok:true, already:true, deposit: already.rows[0] })
    }

    const provider = new ethers.JsonRpcProvider(rpc)
    const tx = await provider.getTransaction(txHash)
    if (!tx) return res.status(404).json({ ok:false, error:'tx not found' })

    const receipt = await provider.getTransactionReceipt(txHash)
    if (!receipt) return res.status(404).json({ ok:false, error:'receipt not found' })
    if (receipt.status !== 1) return res.status(400).json({ ok:false, error:'tx reverted' })

    if ((tx.from||'').toLowerCase() !== address.toLowerCase()) {
      return res.status(400).json({ ok:false, error:'tx.from != address' })
    }
    if ((tx.to||'').toLowerCase() !== escrowAddr.toLowerCase()) {
      return res.status(400).json({ ok:false, error:'tx.to is not escrow' })
    }

    // decode call data: deposit(uint256,uint256)
    const iface = new ethers.Interface(['function deposit(uint256 battleId, uint256 amount)'])
    let decoded
    try {
      decoded = iface.parseTransaction({ data: tx.data })
    } catch (e) {
      return res.status(400).json({ ok:false, error:'tx is not deposit(battleId,amount)' })
    }

    const callBattleId = Number(decoded.args.battleId)
    const callAmount = decoded.args.amount

    if (callBattleId !== battleId) {
      return res.status(400).json({ ok:false, error:'deposit battleId mismatch' })
    }

    // decimals берём из БД/конфига проще: предполагаем 6 и отдельно валидируем whitelist
    const usdcDecimals = 6
    if (!allowedStakeBaseUnits(callAmount.toString(), usdcDecimals)) {
      return res.status(400).json({ ok:false, error:'BAD_STAKE base units, allowed 1/5/10 USDC' })
    }

    // Теперь главное: в receipt.logs должен быть Transfer USDC (from -> escrow) на callAmount
    const erc20Iface = new ethers.Interface([
      'event Transfer(address indexed from, address indexed to, uint256 value)'
    ])

    let found = false
    for (const lg of receipt.logs) {
      if ((lg.address||'').toLowerCase() !== usdcAddr.toLowerCase()) continue
      try {
        const parsed = erc20Iface.parseLog({ topics: lg.topics, data: lg.data })
        const from = String(parsed.args.from).toLowerCase()
        const to = String(parsed.args.to).toLowerCase()
        const value = parsed.args.value

        if (from === address.toLowerCase() && to === escrowAddr.toLowerCase() && value === callAmount) {
          found = true
          break
        }
      } catch (e) {}
    }

    if (!found) {
      return res.status(400).json({ ok:false, error:'ERC20 Transfer not found in receipt logs' })
    }

    const net = await provider.getNetwork()
    const chainId = Number(net.chainId)

    await pool.query(
      `INSERT INTO deposits (battle_id, player_address, amount, tx_hash, chain_id, status, token_address, escrow_address)
       VALUES ($1,$2,$3,$4,$5,'confirmed',$6,$7)
       ON CONFLICT (battle_id, player_address) DO NOTHING`,
      [battleId, address, callAmount.toString(), txHash, chainId, usdcAddr, escrowAddr]
    )

    // обновим статус битвы
    const depCountRes = await pool.query(`SELECT COUNT(*) FROM deposits WHERE battle_id=$1`, [battleId])
    const depCount = Number(depCountRes.rows[0].count || 0)

    let newStatus = b.status
    if (depCount >= 2) newStatus = 'both_deposited'
    else newStatus = 'p1_deposited'

    await pool.query(
      `UPDATE battles SET status=$1, updated_at=NOW() WHERE id=$2`,
      [newStatus, battleId]
    )

    await audit('confirm_deposit', battleId, address, { txHash, amount: callAmount.toString(), chainId })

    res.json({ ok:true, battleId, address, amount: callAmount.toString(), txHash, chainId, status: newStatus })
  } catch (err) {
    console.error('confirm-deposit error', err)
    res.status(500).json({ ok:false, error: err.message })
  }
})

app.get('/api/battles/:id/status', async (req, res) => {
  try {
    const battleId = Number(req.params.id);
    const { rows } = await pool.query(
      `SELECT gen_status, gen_error, p1_image_url, p2_image_url
         FROM battles
        WHERE id=$1`,
      [battleId]
    );
    const b = rows[0];
    if (!b) return res.json({ ok: false, error: 'battle not found' });

    return res.json({
      ok: true,
      genStatus: b.gen_status || 'idle',
      error: b.gen_error || null,
      p1Image: b.p1_image_url || null,
      p2Image: b.p2_image_url || null,
    });
  } catch (e) {
    return res.json({ ok: false, error: e?.message || String(e) });
  }
});



// GET /api/battles/:id/deposits (admin)
app.get('/api/battles/:id/deposits', async (req, res) => {
  if (!requireAdmin(req, res)) return

  const battleId = toInt(req.params.id, 0)
  if (!battleId) return res.status(400).json({ ok: false, error: 'battleId is required' })

  try {
    const r = await pool.query(
      `
      SELECT player_address, amount, tx_hash, chain_id, status, created_at
      FROM deposits
      WHERE battle_id = $1
      ORDER BY created_at ASC
      `,
      [battleId]
    )
    return res.json({ ok: true, items: r.rows })
  } catch (err) {
    console.error('deposits error', err)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

// ======================================================
// 8) Twitter auth routes
// ======================================================

// ===== TWITTER AUTH ROUTES (returnTo + фикс редиректа) =====

function sanitizeReturnTo(v) {
  if (!v) return null
  const s = String(v).trim()
  if (!s.startsWith('/')) return null
  if (s.startsWith('//')) return null
  if (s.includes('://')) return null
  return s
}

app.get('/api/auth/twitter', (req, res, next) => {
  if (!twitterEnabled) {
    return res.status(503).json({ ok: false, error: 'twitter auth disabled' })
  }

  // 1) returnTo берём из query: /api/auth/twitter?returnTo=/player.html
  const returnTo = sanitizeReturnTo(req.query.returnTo)
  if (returnTo) req.session.returnTo = returnTo

  // 2) гарантируем сохранение сессии ДО редиректа в Twitter
  req.session.save(() => {
    passport.authenticate('twitter')(req, res, next)
  })
})

function allowedStakeBaseUnits(amountStr, usdcDecimals) {
  const a = BigInt(amountStr)
  const ONE = 10n ** BigInt(usdcDecimals)
  return (a === ONE || a === 5n * ONE || a === 10n * ONE)
}

async function audit(tag, battleId, address, payload) {
  try {
    await pool.query(
      `INSERT INTO audit_log(tag, battle_id, address, payload) VALUES ($1,$2,$3,$4)`,
      [tag, battleId || null, address || null, payload ? JSON.stringify(payload) : null]
    )
  } catch (e) {}
}

app.get('/api/battles/:id/state', async (req, res) => {
  const battleId = toInt(req.params.id, 0)
  if (!battleId) return res.status(400).json({ ok:false, error:'battleId is required' })

  try {
    const bRes = await pool.query(`SELECT * FROM battles WHERE id=$1`, [battleId])
    if (!bRes.rows.length) return res.status(404).json({ ok:false, error:'battle not found' })
    const battle = bRes.rows[0]

    const depRes = await pool.query(
      `SELECT player_address, amount, tx_hash, status, created_at
       FROM deposits WHERE battle_id=$1 ORDER BY created_at ASC`,
      [battleId]
    )

    const workRes = await pool.query(
      `SELECT player_address, image_url, created_at
       FROM works WHERE battle_id=$1 ORDER BY created_at ASC`,
      [battleId]
    )

    const promptRes = await pool.query(
      `SELECT player_address, prompt, created_at
       FROM prompts WHERE battle_id=$1 ORDER BY created_at ASC`,
      [battleId]
    )

    const depositsByAddr = {}
    for (const d of depRes.rows) depositsByAddr[d.player_address.toLowerCase()] = d

    const worksByAddr = {}
    for (const w of workRes.rows) worksByAddr[w.player_address.toLowerCase()] = w

    res.json({
      ok: true,
      battle,
      prompts: promptRes.rows,
      deposits: depRes.rows,
      works: workRes.rows,
      computed: {
        p1Deposited: Boolean(depositsByAddr[(battle.player1||'').toLowerCase()]),
        p2Deposited: Boolean(depositsByAddr[(battle.player2||'').toLowerCase()]),
        bothDeposited: depRes.rows.length >= 2,
        worksCount: workRes.rows.length,
      }
    })
  } catch (err) {
    console.error('state error', err)
    res.status(500).json({ ok:false, error: err.message })
  }
})

app.post('/api/battles/:id/submit-work', async (req, res) => {
  const user = requireTwitterUser(req, res)
  if (!user) return

  const battleId = toInt(req.params.id, 0)
  const address = String(req.body.address || '').trim()
  const imageUrl = String(req.body.imageUrl || '').trim()

  if (!battleId || !address || !imageUrl) {
    return res.status(400).json({ ok:false, error:'battleId, address, imageUrl are required' })
  }

  try {
    const bRes = await pool.query(`SELECT * FROM battles WHERE id=$1`, [battleId])
    if (!bRes.rows.length) return res.status(404).json({ ok:false, error:'battle not found' })
    const b = bRes.rows[0]

    const a = address.toLowerCase()
    if (a !== (b.player1||'').toLowerCase() && a !== (b.player2||'').toLowerCase()) {
      return res.status(403).json({ ok:false, error:'not a player of this battle' })
    }

    await pool.query(
      `INSERT INTO works(battle_id, player_address, image_url)
       VALUES ($1,$2,$3)
       ON CONFLICT (battle_id, player_address) DO UPDATE SET image_url=EXCLUDED.image_url`,
      [battleId, address, imageUrl]
    )

    await audit('submit_work', battleId, address, { imageUrl })

    res.json({ ok:true })
  } catch (err) {
    console.error('submit-work error', err)
    res.status(500).json({ ok:false, error: err.message })
  }
})



app.get('/api/auth/twitter/callback', (req, res, next) => {
  if (!twitterEnabled) return res.status(503).redirect('/gallery.html?auth=disabled')

  passport.authenticate('twitter', { failureRedirect: '/gallery.html?auth=fail' })(
    req,
    res,
    () => {
      // если returnTo не задан — по умолчанию возвращаем на player
      const returnTo = sanitizeReturnTo(req.session.returnTo) || '/player.html'
      delete req.session.returnTo
      return res.redirect(returnTo)
    }
  )
})

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.json({ ok: true, user: null })
  res.json({ ok: true, user: req.user })
})

app.post('/api/auth/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err)
    req.session.destroy(() => {
      res.clearCookie('connect.sid')
      res.json({ ok: true })
    })
  })
})


app.get('/api/auth/twitter', (req, res, next) => {
  if (!twitterEnabled) return res.status(503).json({ ok: false, error: 'twitter auth disabled' })

  const returnTo = sanitizeReturnTo(req.query.returnTo)
  if (returnTo) req.session.returnTo = returnTo

  return passport.authenticate('twitter')(req, res, next)
})

app.get('/api/auth/twitter/callback', (req, res, next) => {
  if (!twitterEnabled) return res.status(503).redirect('/gallery.html?auth=disabled')

  passport.authenticate('twitter', { failureRedirect: '/gallery.html?auth=fail' })(req, res, () => {
    const returnTo = sanitizeReturnTo(req.session.returnTo) || '/gallery.html'
    delete req.session.returnTo
    res.redirect(returnTo)
  })
})

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.json({ ok: true, user: null })
  res.json({ ok: true, user: req.user })
})

app.post('/api/auth/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err)
    req.session.destroy(() => {
      res.clearCookie('connect.sid')
      res.json({ ok: true })
    })
  })
})

// ======================================================
// 9) Battles / prompts / featured / votes
// ======================================================

app.get('/api/battles', async (req, res) => {
  const limit = toInt(req.query.limit || '50', 50)
  const status = req.query.status || null

  try {
    let sql = 'SELECT * FROM battles'
    const params = []

    if (status) {
      params.push(status)
      sql += ` WHERE status = $${params.length}`
    }

    params.push(limit)
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`

    const battlesRes = await pool.query(sql, params)
    res.json({ ok: true, items: battlesRes.rows })
  } catch (err) {
    console.error('battles-list error', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.get('/api/battles/:id/details', async (req, res) => {
  const battleId = toInt(req.params.id, 0)
  if (!battleId) return res.status(400).json({ ok: false, error: 'battleId is required' })

  try {
    const battleRes = await pool.query('SELECT * FROM battles WHERE id = $1', [battleId])
    if (!battleRes.rows.length) return res.status(404).json({ ok: false, error: 'battle not found' })

    const promptsRes = await pool.query(
      `SELECT id, player_address, prompt, created_at
       FROM prompts
       WHERE battle_id = $1
       ORDER BY created_at ASC`,
      [battleId]
    )

    res.json({ ok: true, battle: battleRes.rows[0], prompts: promptsRes.rows })
  } catch (err) {
    console.error('battle-details error', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.get('/api/battles/:id/full', async (req, res) => {
  const battleId = toInt(req.params.id, 0)
  if (!battleId) return res.status(400).json({ ok: false, error: 'battleId is required' })

  try {
    const battleRes = await pool.query('SELECT * FROM battles WHERE id = $1', [battleId])
    if (!battleRes.rows.length) return res.status(404).json({ ok: false, error: 'battle not found' })

    const promptsRes = await pool.query(
      `SELECT id, player_address, prompt, created_at
       FROM prompts
       WHERE battle_id = $1
       ORDER BY created_at ASC`,
      [battleId]
    )

    const nftsRes = await pool.query(
      `SELECT id, player_address, token_id, token_uri, image_url, created_at
       FROM nfts
       WHERE battle_id = $1
       ORDER BY created_at ASC`,
      [battleId]
    )

    res.json({ ok: true, battle: battleRes.rows[0], prompts: promptsRes.rows, nfts: nftsRes.rows })
  } catch (err) {
    console.error('battle-full error', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Optional helper lookup
app.get('/api/battles/lookup', async (req, res) => {
  const address = String(req.query.address || '').trim()
  const stake = Number(req.query.stake || 1) || 1
  const after = String(req.query.after || '').trim()

  if (!address || !after) return res.status(400).json({ ok: false, error: 'address and after are required' })

  try {
    const q = await pool.query(
      `SELECT *
       FROM battles
       WHERE stake = $1
         AND created_at >= $2::timestamptz
         AND (player1 = $3 OR player2 = $3)
       ORDER BY created_at DESC
       LIMIT 1`,
      [stake, after, address]
    )

    if (!q.rows.length) return res.json({ ok: true, found: false })

    return res.json({ ok: true, found: true, battle: q.rows[0], battleId: q.rows[0].id })
  } catch (err) {
    console.error('lookup error', err)
    return res.status(500).json({ ok: false, error: err.message })
  }
})

// ======================================================
// 10) Featured / votes
// ======================================================

app.get('/api/featured/top', async (req, res) => {
  const limit = toInt(req.query.limit || '20', 20)

  try {
    const listRes = await pool.query(
      `SELECT
         fw.*,
         b.player1,
         b.player2,
         p.prompt,
         n.image_url
       FROM featured_works fw
       LEFT JOIN battles b ON b.id = fw.battle_id
       LEFT JOIN prompts p ON p.id = fw.prompt_id
       LEFT JOIN nfts n ON n.id = fw.nft_id
       ORDER BY fw.total_votes DESC, fw.created_at DESC
       LIMIT $1`,
      [limit]
    )

    res.json({ ok: true, items: listRes.rows })
  } catch (err) {
    console.error('featured-top error', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.post('/api/featured/:id/vote', async (req, res) => {
  const featuredId = toInt(req.params.id, 0)
  if (!featuredId) return res.status(400).json({ ok: false, error: 'featuredId is required' })

  const user = requireTwitterUser(req, res)
  if (!user) return

  try {
    const fwRes = await pool.query('SELECT * FROM featured_works WHERE id = $1', [featuredId])
    if (!fwRes.rows.length) return res.status(404).json({ ok: false, error: 'featured work not found' })

    let alreadyVoted = false
    try {
      await pool.query(
        `INSERT INTO votes (featured_work_id, voter_user_id)
         VALUES ($1, $2)`,
        [featuredId, user.id]
      )
    } catch (err) {
      if (err.code === '23505') alreadyVoted = true
      else throw err
    }

    const countRes = await pool.query('SELECT COUNT(*) FROM votes WHERE featured_work_id = $1', [featuredId])
    const totalVotes = Number(countRes.rows[0].count)

    await pool.query('UPDATE featured_works SET total_votes = $1 WHERE id = $2', [totalVotes, featuredId])

    res.json({ ok: true, featuredId, totalVotes, alreadyVoted })
  } catch (err) {
    console.error('vote error', err)
    res.status(500).json({ ok: false, error: 'internal error' })
  }
})

// ======================================================
// 11) Admin routes (winner / promote / generate)
// ======================================================

async function generateImageStub(prompt, playerAddress) {
  const label = encodeURIComponent('AI Art')
  return `https://dummyimage.com/1024x1024/222/fff.png&text=${label}`
}

app.post('/api/battles/:id/set-winner', async (req, res) => {
  if (!requireAdmin(req, res)) return

  const battleId = toInt(req.params.id, 0)
  const { winner } = req.body

  if (!battleId || !winner) return res.status(400).json({ ok: false, error: 'battleId and winner are required' })

  try {
    const battleRes = await pool.query('SELECT * FROM battles WHERE id = $1', [battleId])
    if (!battleRes.rows.length) return res.status(404).json({ ok: false, error: 'battle not found' })

    const battle = battleRes.rows[0]
    if (battle.player1 !== winner && battle.player2 !== winner) {
      return res.status(403).json({ ok: false, error: 'winner must be one of the players' })
    }

    const updated = await pool.query(
      `UPDATE battles
       SET winner = $1,
           status = 'finished',
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [winner, battleId]
    )

    res.json({ ok: true, battle: updated.rows[0] })
  } catch (err) {
    console.error('set-winner error', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.post('/api/battles/:id/promote-winner', async (req, res) => {
  if (!requireAdmin(req, res)) return

  const battleId = toInt(req.params.id, 0)
  if (!battleId) return res.status(400).json({ ok: false, error: 'battleId is required' })

  try {
    const battleRes = await pool.query('SELECT * FROM battles WHERE id = $1', [battleId])
    if (!battleRes.rows.length) return res.status(404).json({ ok: false, error: 'battle not found' })

    const battle = battleRes.rows[0]
    if (!battle.winner) return res.status(400).json({ ok: false, error: 'battle has no winner yet' })

    const existingRes = await pool.query(
      'SELECT * FROM featured_works WHERE battle_id = $1 AND player_address = $2',
      [battleId, battle.winner]
    )
    if (existingRes.rows.length > 0) return res.json({ ok: true, featured: existingRes.rows[0], alreadyExists: true })

    const promptRes = await pool.query(
      `SELECT id
       FROM prompts
       WHERE battle_id = $1 AND player_address = $2
       ORDER BY created_at ASC
       LIMIT 1`,
      [battleId, battle.winner]
    )
    const promptId = promptRes.rows.length ? promptRes.rows[0].id : null

    const insertRes = await pool.query(
      `INSERT INTO featured_works (battle_id, player_address, prompt_id, nft_id, total_votes)
       VALUES ($1, $2, $3, NULL, 0)
       RETURNING *`,
      [battleId, battle.winner, promptId]
    )

    res.json({ ok: true, featured: insertRes.rows[0], alreadyExists: false })
  } catch (err) {
    console.error('promote-winner error', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.get('/api/battles/:id/generate-debug', async (req, res) => {
  if (!requireAdmin(req, res)) return

  const battleId = toInt(req.params.id, 0)
  if (!battleId) return res.status(400).json({ ok: false, error: 'battleId is required' })

  try {
    const battleRes = await pool.query('SELECT * FROM battles WHERE id = $1', [battleId])
    if (!battleRes.rows.length) return res.status(404).json({ ok: false, error: 'battle not found' })

    const playersRes = await pool.query(
      `SELECT DISTINCT player_address
       FROM prompts
       WHERE battle_id = $1`,
      [battleId]
    )

    if (!playersRes.rows.length) return res.status(400).json({ ok: false, error: 'no prompts for this battle yet' })

    const createdNfts = []

    for (const row of playersRes.rows) {
      const addr = row.player_address

      const existingRes = await pool.query(
        `SELECT id
         FROM nfts
         WHERE battle_id = $1 AND player_address = $2
         LIMIT 1`,
        [battleId, addr]
      )
      if (existingRes.rows.length > 0) continue

      const promptRes = await pool.query(
        `SELECT prompt
         FROM prompts
         WHERE battle_id = $1 AND player_address = $2
         ORDER BY created_at ASC
         LIMIT 1`,
        [battleId, addr]
      )
      if (!promptRes.rows.length) continue

      const prompt = promptRes.rows[0].prompt
      const imageUrl = await generateImageStub(prompt, addr)

      const insertRes = await pool.query(
        `INSERT INTO nfts (battle_id, player_address, token_id, token_uri, image_url)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [battleId, addr, null, null, imageUrl]
      )

      const nft = insertRes.rows[0]
      createdNfts.push(nft)

      await pool.query(
        `UPDATE featured_works
         SET nft_id = $1
         WHERE battle_id = $2 AND player_address = $3`,
        [nft.id, battleId, addr]
      )
    }

    res.json({ ok: true, count: createdNfts.length, nfts: createdNfts })
  } catch (err) {
    console.error('generate-debug error', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Convenience: close battle = set winner + promote + generate + attach winner nft
app.post('/api/battles/:id/close', async (req, res) => {
  if (!requireAdmin(req, res)) return

  const battleId = toInt(req.params.id, 0)
  const { winner } = req.body

  if (!battleId || !winner) return res.status(400).json({ ok: false, error: 'battleId and winner are required' })

  try {
    const battleRes = await pool.query('SELECT * FROM battles WHERE id = $1', [battleId])
    if (!battleRes.rows.length) return res.status(404).json({ ok: false, error: 'battle not found' })
    const battle = battleRes.rows[0]

    if (battle.player1 !== winner && battle.player2 !== winner) {
      return res.status(403).json({ ok: false, error: 'winner must be one of the players' })
    }

    const updatedBattleRes = await pool.query(
      `UPDATE battles
       SET winner = $1,
           status = 'finished',
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [winner, battleId]
    )
    const updatedBattle = updatedBattleRes.rows[0]

    let featured = null
    const existingFeaturedRes = await pool.query(
      'SELECT * FROM featured_works WHERE battle_id = $1 AND player_address = $2',
      [battleId, winner]
    )

    if (existingFeaturedRes.rows.length > 0) {
      featured = existingFeaturedRes.rows[0]
    } else {
      const promptRes = await pool.query(
        `SELECT id
         FROM prompts
         WHERE battle_id = $1 AND player_address = $2
         ORDER BY created_at ASC
         LIMIT 1`,
        [battleId, winner]
      )
      const promptId = promptRes.rows.length ? promptRes.rows[0].id : null

      const ins = await pool.query(
        `INSERT INTO featured_works (battle_id, player_address, prompt_id, nft_id, total_votes)
         VALUES ($1, $2, $3, NULL, 0)
         RETURNING *`,
        [battleId, winner, promptId]
      )
      featured = ins.rows[0]
    }

    const playersRes = await pool.query(
      `SELECT DISTINCT player_address
       FROM prompts
       WHERE battle_id = $1`,
      [battleId]
    )

    let createdCount = 0
    let winnerNftId = null

    for (const row of playersRes.rows) {
      const addr = row.player_address

      const existingNftRes = await pool.query(
        `SELECT id
         FROM nfts
         WHERE battle_id = $1 AND player_address = $2
         LIMIT 1`,
        [battleId, addr]
      )

      if (existingNftRes.rows.length > 0) {
        if (addr === winner) winnerNftId = existingNftRes.rows[0].id
        continue
      }

      const promptTextRes = await pool.query(
        `SELECT prompt
         FROM prompts
         WHERE battle_id = $1 AND player_address = $2
         ORDER BY created_at ASC
         LIMIT 1`,
        [battleId, addr]
      )
      if (!promptTextRes.rows.length) continue

      const imageUrl = await generateImageStub(promptTextRes.rows[0].prompt, addr)
      const insertNftRes = await pool.query(
        `INSERT INTO nfts (battle_id, player_address, token_id, token_uri, image_url)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [battleId, addr, null, null, imageUrl]
      )

      createdCount += 1
      if (addr === winner) winnerNftId = insertNftRes.rows[0].id
    }

    if (winnerNftId && featured && !featured.nft_id) {
      const updFeaturedRes = await pool.query(
        `UPDATE featured_works SET nft_id = $1 WHERE id = $2 RETURNING *`,
        [winnerNftId, featured.id]
      )
      featured = updFeaturedRes.rows[0]
    }

    res.json({ ok: true, battle: updatedBattle, featured, createdNfts: createdCount })
  } catch (err) {
    console.error('close battle error', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ======================================================
// 12) Error handler + start
// ======================================================

app.use((err, req, res, next) => {
  console.error('UNHANDLED ERROR:', err)
  res.status(500).json({
    ok: false,
    error: 'internal_error',
    details: err?.oauthError?.data || err.message,
  })
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`)
  console.log(`Twitter enabled: ${twitterEnabled ? 'YES' : 'NO'}`)
  console.log(`Admin enabled: ${ADMIN_TOKEN ? 'YES' : 'NO'}`)
})
