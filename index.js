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
const fs = require('fs/promises')
const OpenAIImport = require('openai')
const OpenAI = OpenAIImport.default || OpenAIImport

const THEMES = [
  "Cyberpunk Samurai", "Sad Robot in the Rain", "Future City on Mars",
  "Magical Forest Creature", "Steampunk Coffee Machine", "Underwater Castle",
  "Space Cat", "Ancient Greek God in Modern Clothes", "Apocalyptic Wasteland",
  "Neon Noir Detective", "Dragon made of Crystal", "Flying Island",
  "A lonely astronaut", "Pikachu as a warrior", "Cybernetic Angel"
];

// === ENV CHECKS ===
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing')

const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || '').trim() || null
const isProd = process.env.NODE_ENV === 'production'

// API Config
const ARC_CHAIN_ID = Number(process.env.ARC_CHAIN_ID || 5042002)
const ARC_EXPLORER = (process.env.ARC_EXPLORER || 'https://testnet.arcscan.app').trim()
const USDC_ADDRESS = process.env.USDC_ADDRESS
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS

const app = express()
app.use('/generated', express.static(path.join(__dirname, 'public', 'generated')))
if (FRONTEND_ORIGIN) app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, secure: isProd }
}))
if(process.env.TWITTER_CONSUMER_KEY) {
    passport.use(new TwitterStrategy({
        consumerKey: process.env.TWITTER_CONSUMER_KEY, 
        consumerSecret: process.env.TWITTER_CONSUMER_SECRET, 
        callbackURL: process.env.TWITTER_CALLBACK_URL
      },
      async (token, secret, profile, done) => done(null, profile)
    ))
    app.use(passport.initialize())
    app.use(passport.session())
}
passport.serializeUser((u, d) => d(null, u))
passport.deserializeUser((u, d) => d(null, u))

app.use(express.static(path.join(__dirname, 'public')))

// DB
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000,
})
pool.on('error', (err) => console.error('Unexpected DB error', err))

const genLocks = new Set()

// === GENERATION ===
async function generateAndSavePng({ prompt, outPath }) {
  console.log(`[Gen] 🎨 Рисую: "${prompt.slice(0,20)}..."`)
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  
  try {
    const resp = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1024x1024', response_format: 'b64_json' })
    })
    if (!resp.ok) {
        const errText = await resp.text();
        console.error(`[Gen] ❌ Ошибка OpenAI: ${errText}`);
        throw new Error(errText);
    }
    const json = await resp.json()
    await fs.writeFile(outPath, Buffer.from(json.data[0].b64_json, 'base64'))
    console.log(`[Gen] ✅ Готово: ${outPath}`)
  } catch (e) {
    console.error(`[Gen] ❌ Ошибка:`, e.message);
    throw e;
  }
}

async function maybeStartGeneration(pool, battleId) {
  if (genLocks.has(battleId)) return
  
  const bRes = await pool.query(`SELECT * FROM battles WHERE id=$1`, [battleId])
  const b = bRes.rows[0]
  if (!b || b.gen_status === 'running' || b.gen_status === 'done') return

  const dRes = await pool.query(`SELECT COUNT(*) FROM deposits WHERE battle_id=$1 AND status='confirmed'`, [battleId])
  const pRes = await pool.query(`SELECT COUNT(*) FROM prompts WHERE battle_id=$1`, [battleId])
  
  console.log(`[Check #${battleId}] Депозитов: ${dRes.rows[0].count}/2, Промптов: ${pRes.rows[0].count}/2`)

  if (Number(dRes.rows[0].count) < 2 || Number(pRes.rows[0].count) < 2) return 

  console.log(`[Start #${battleId}] ВСЕ ГОТОВО! НАЧИНАЮ ГЕНЕРАЦИЮ!`)
  await pool.query(`UPDATE battles SET gen_status='running' WHERE id=$1`, [battleId])
  genLocks.add(battleId)

  setImmediate(async () => {
    try {
      const pr = await pool.query(`SELECT player_address, prompt FROM prompts WHERE battle_id=$1`, [battleId])
      const p1 = String(b.player1).toLowerCase();
      const p2 = String(b.player2).toLowerCase();
      const pMap = {}; pr.rows.forEach(r => pMap[String(r.player_address).toLowerCase()] = r.prompt);
      
      const outDir = path.join(__dirname, 'public', 'generated')
      const f1 = `battle-${battleId}-p1.png`, f2 = `battle-${battleId}-p2.png`

      await Promise.all([
        generateAndSavePng({ prompt: pMap[p1], outPath: path.join(outDir, f1) }),
        generateAndSavePng({ prompt: pMap[p2], outPath: path.join(outDir, f2) })
      ])
      await pool.query(`UPDATE battles SET gen_status='done', p1_image_url=$2, p2_image_url=$3 WHERE id=$1`, [battleId, `/generated/${f1}`, `/generated/${f2}`])
    } catch (e) {
      await pool.query(`UPDATE battles SET gen_status='error', gen_error=$2 WHERE id=$1`, [battleId, e.message])
    } finally { genLocks.delete(battleId) }
  })
}

// === ROUTES ===
app.get('/api/config', (req, res) => res.json({ ok: true, contracts: { usdc: USDC_ADDRESS, escrow: ESCROW_ADDRESS } }))
app.get('/api/auth/twitter', passport.authenticate('twitter'))
app.get('/api/auth/twitter/callback', passport.authenticate('twitter', { failureRedirect: '/' }), (req, res) => res.redirect('/player.html'))
app.get('/api/auth/me', (req, res) => res.json({ ok: true, user: req.user }))

// MATCHMAKING
const waitingByStake = {} 
app.post('/api/play', async (req, res) => {
  const { address, stake } = req.body
  console.log(`[MATCH] ➡️ Запрос на игру от: ${address} (Ставка: ${stake})`)
  
  const stakeVal = Number(stake) || 1
  const key = String(stakeVal)

  const waiter = waitingByStake[key];
  if (waiter && waiter.address !== address) {
    console.log(`[MATCH] 🔥 ПАРА НАЙДЕНА! ${waiter.address} VS ${address}`)
    delete waitingByStake[key]
    const theme = THEMES[Math.floor(Math.random() * THEMES.length)]
    
    const r = await pool.query(
      `INSERT INTO battles (onchain_battle_id, player1, player2, stake, status, theme, gen_status) 
       VALUES (0, $1, $2, $3, 'waiting_deposits', $4, 'idle') RETURNING id`,
      [waiter.address, address, stakeVal, theme]
    )
    console.log(`[MATCH] ✅ Битва создана! ID: ${r.rows[0].id}`)
    return res.json({ ok: true, status: 'matched', battleId: r.rows[0].id })
  } else {
    waitingByStake[key] = { address, time: Date.now() }
    console.log(`[MATCH] ⏳ Игрок ${address} добавлен в очередь.`)
    return res.json({ ok: true, status: 'waiting' })
  }
})

app.get('/api/match', async (req, res) => {
  const { address, stake } = req.query
  const r = await pool.query(
    `SELECT id FROM battles WHERE (player1=$1 OR player2=$1) AND stake=$2 AND status='waiting_deposits' ORDER BY created_at DESC LIMIT 1`,
    [address, stake]
  )
  if (r.rows.length) return res.json({ ok: true, status: 'matched', battleId: r.rows[0].id })
  return res.json({ ok: true, status: 'waiting' })
})

app.get('/api/battles/:id/status', async (req, res) => {
  const id = req.params.id
  try { await maybeStartGeneration(pool, id) } catch {}
  
  const bRes = await pool.query(`SELECT * FROM battles WHERE id=$1`, [id])
  const b = bRes.rows[0]
  if (!b) return res.json({ok:false})
  
  const dep = await pool.query(`SELECT player_address FROM deposits WHERE battle_id=$1 AND status='confirmed'`, [id])
  const prm = await pool.query(`SELECT player_address FROM prompts WHERE battle_id=$1`, [id])

  res.json({
    ok: true,
    status: b.status, winner: b.winner, theme: b.theme, stake: b.stake,
    genStatus: b.gen_status || 'idle',
    p1Image: b.p1_image_url, p2Image: b.p2_image_url,
    player1: b.player1, player2: b.player2,
    deposits: dep.rows.map(r => r.player_address.toLowerCase()),
    prompts: prm.rows.map(r => r.player_address.toLowerCase())
  })
})

app.post('/api/battles/:id/confirm-deposit', async (req, res) => {
  console.log(`[Deposit] Подтверждение для битвы ${req.params.id} от ${req.body.address}`)
  try {
    await pool.query(
      `INSERT INTO deposits (battle_id, player_address, amount, tx_hash, status, chain_id, token_address, escrow_address) 
       VALUES ($1, $2, 0, $3, 'confirmed', $4, $5, $6) ON CONFLICT DO NOTHING`,
      [req.params.id, req.body.address, req.body.txHash, ARC_CHAIN_ID, USDC_ADDRESS, ESCROW_ADDRESS]
    )
    res.json({ok:true})
  } catch(e) { console.error(e); res.status(500).json({ok:false, error:e.message}) }
})

app.post('/api/battles/:id/submit-prompt', async (req, res) => {
  console.log(`[Prompt] Промпт для битвы ${req.params.id} от ${req.body.address}`)
  try {
    await pool.query(
      `INSERT INTO prompts (battle_id, player_address, prompt) VALUES ($1, $2, $3)
       ON CONFLICT (battle_id, player_address) DO UPDATE SET prompt=EXCLUDED.prompt`,
      [req.params.id, req.body.address, req.body.prompt]
    )
    res.json({ok:true})
  } catch(e) { console.error(e); res.status(500).json({ok:false, error:e.message}) }
})

app.post('/api/battles/:id/close', async (req, res) => {
  await pool.query(`UPDATE battles SET status='finished', winner=$1 WHERE id=$2`, [req.body.winner, req.params.id])
  res.json({ok:true})
})

// === ИСПРАВЛЕННАЯ АДМИНКА ===
// Теперь показывает ВСЕ незавершенные битвы, даже если картинки не готовы
app.get('/api/admin/battles', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM battles WHERE status != 'finished' ORDER BY created_at DESC`
    )
    console.log(`[ADMIN] Запрошен список битв. Найдено: ${r.rows.length}`)
    res.json({ ok: true, items: r.rows })
  } catch (e) {
    console.error(`[ADMIN ERROR]`, e)
    res.status(500).json({ ok: false, error: e.message })
  }
})

// === ГАЛЕРЕЯ И ГОЛОСОВАНИЕ ===
app.get('/api/battles', async (req, res) => {
  const r = await pool.query('SELECT * FROM battles WHERE status=\'finished\' ORDER BY score DESC, created_at DESC LIMIT 50')
  res.json({ok:true, items:r.rows})
})

app.post('/api/battles/:id/vote', async (req, res) => {
    const { address, val } = req.body
    const battleId = Number(req.params.id)
    console.log(`[Vote] Голос за битву ${battleId} от ${address}: ${val}`)
    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        await client.query(`INSERT INTO battle_votes (battle_id, voter_address, val) VALUES ($1, $2, $3) ON CONFLICT (battle_id, voter_address) DO UPDATE SET val=$3`, [battleId, address, val])
        await client.query(`UPDATE battles SET score = score + $1 WHERE id=$2`, [val, battleId])
        await client.query('COMMIT')
        res.json({ ok: true, newScore: 0 }) 
    } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ok:false}) } finally { client.release() }
})

app.listen(process.env.PORT || 4000, () => console.log('✅ Server started (ADMIN FULL ACCESS)'))