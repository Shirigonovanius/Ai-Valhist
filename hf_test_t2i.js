// Node >= 18
import { InferenceClient } from "@huggingface/inference"
import fs from "fs"

const token = process.env.HF_TOKEN
if (!token) {
  console.error("Нет HF_TOKEN в окружении")
  console.error("Windows CMD:  set HF_TOKEN=xxx")
  console.error("PowerShell:   $env:HF_TOKEN='xxx'")
  process.exit(1)
}

const hf = new InferenceClient(token)

const prompts = [
  "cyberpunk city at night, neon rain, ultra detailed, cinematic",
  "dark fantasy samurai in blizzard, dramatic lighting, sharp focus",
  "ancient temple on a cliff, fog, god rays, high detail",
  "astronaut in a flower field on alien planet, dreamy, high detail",
  "steampunk airship over clouds at sunset, cinematic, ultra detailed",
  "Japanese street in winter, lanterns, snowfall, moody, film look",
  "dragon made of smoke and embers, dark background, ultra detailed",
  "minimalist poster of a futuristic car, clean typography space"
]

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

const prompt = pick(prompts)

const model = "black-forest-labs/FLUX.1-schnell" // быстрый и стабильный вариант
const provider = "fal-ai"

console.log("MODEL:", model)
console.log("PROMPT:", prompt)

const blob = await hf.textToImage({
  provider,
  model,
  inputs: prompt,
})

const out = `out_${Date.now()}.png`
fs.writeFileSync(out, Buffer.from(await blob.arrayBuffer()))
console.log("SAVED:", out)
