// services/imageGen.js
const fs = require('fs')
const path = require('path')
const OpenAI = require('openai')

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

function pickEnv(name, fallback) {
  const v = String(process.env[name] || '').trim()
  return v || fallback
}

async function generateImageBase64(prompt) {
  const model = pickEnv('OPENAI_MODEL', 'gpt-5')
  const size = pickEnv('OPENAI_IMAGE_SIZE', '1024x1024')
  const quality = pickEnv('OPENAI_IMAGE_QUALITY', 'high')

  // Responses API: tool image_generation возвращает base64 в output.result :contentReference[oaicite:1]{index=1}
  const resp = await openai.responses.create({
    model,
    input: prompt,
    tools: [{
      type: 'image_generation',
      size,
      quality,
    }],
    tool_choice: { type: 'image_generation' }, // форсим генерацию
  })

  const img = (resp.output || [])
    .filter(o => o.type === 'image_generation_call')
    .map(o => o.result)[0]

  if (!img) throw new Error('No image_generation_call result')
  return img
}

async function generateAndSavePng({ prompt, outAbsPath }) {
  const b64 = await generateImageBase64(prompt)
  fs.mkdirSync(path.dirname(outAbsPath), { recursive: true })
  fs.writeFileSync(outAbsPath, Buffer.from(b64, 'base64'))
  return outAbsPath
}

module.exports = { generateAndSavePng }
