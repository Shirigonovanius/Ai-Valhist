import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const COMFY_URL = "http://127.0.0.1:8188";
const BUCKET_NAME = 'battles'; 

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ ОШИБКА: Нет ключей в .env");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("========================================");
console.log("🚀 SERVER: STORAGE EDITION (FIXED)");
console.log("   💾 Картинки летят в Supabase Storage");
console.log("========================================");

checkComfy();
setInterval(async () => { await scanBattles(); }, 3000);

async function scanBattles() {
    try {
        const { data: battles } = await supabase
            .from('battles')
            .select('*')
            .in('status', ['waiting_player_2', 'ready_for_generation']);

        if (!battles || battles.length === 0) return;

        for (const battle of battles) {
            const { data: prompts } = await supabase.from('prompts').select('*').eq('battle_id', battle.id);

            // 🔥 Сервер ждет, пока оба игрока пришлют текст
            if (prompts && prompts.length >= 2) {
                console.log(`\n⚔️ БИТВА #${battle.onchain_battle_id}: ${battle.theme}`);
                await supabase.from('battles').update({ status: 'generating' }).eq('id', battle.id);

                const p1 = prompts[0];
                const p2 = prompts[1];

                try {
                    console.log(`   🎨 Рисую P1...`);
                    const url1 = await generateAndUpload(p1.prompt, battle.theme, `battle_${battle.onchain_battle_id}_p1_${Date.now()}.png`);
                    
                    if (url1) {
                        await supabase.from('prompts').update({ image_url: url1 }).eq('id', p1.id);
                        console.log(`   ✅ P1 Загружен: ${url1}`);
                    } else {
                        throw new Error("Не удалось получить ссылку на P1");
                    }

                    console.log(`   🎨 Рисую P2...`);
                    const url2 = await generateAndUpload(p2.prompt, battle.theme, `battle_${battle.onchain_battle_id}_p2_${Date.now()}.png`);
                    
                    if (url2) {
                        await supabase.from('prompts').update({ image_url: url2 }).eq('id', p2.id);
                        console.log(`   ✅ P2 Загружен: ${url2}`);
                    } else {
                        throw new Error("Не удалось получить ссылку на P2");
                    }

                    await supabase.from('battles').update({ status: 'waiting_for_admin' }).eq('id', battle.id);
                    console.log(`   🏁 Битва завершена! Ждем судью...`);

                } catch (err) {
                    console.error("   ❌ ОШИБКА ГЕНЕРАЦИИ:", err.message);
                    await supabase.from('battles').update({ status: 'waiting_player_2' }).eq('id', battle.id);
                }
            }
        }
    } catch (e) { 
        // console.error(e); 
    }
}

async function generateAndUpload(promptText, theme, fileName) {
    // В нейросеть отправляем только сам промпт + улучшалки качества. Тему не передаем!
    const fullPrompt = `(masterpiece, best quality, 8k), ${promptText}, cinematic lighting, photorealistic`;
    const negative = "text, watermark, blur, low quality, ugly, cartoon, drawing";

    let modelName = "juggernautXL_ragnarokBy.safetensors";
    try {
        const mRes = await fetch(`${COMFY_URL}/object_info/CheckpointLoaderSimple`);
        const mData = await mRes.json();
        modelName = mData.CheckpointLoaderSimple.input.required.ckpt_name[0][0];
    } catch (e) {}

    const workflow = {
        "3": { "class_type": "KSampler", "inputs": { "seed": Math.floor(Math.random() * 1000000000), "steps": 20, "cfg": 7, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1, "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
        "4": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": modelName } },
        "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 1024, "height": 1024, "batch_size": 1 } },
        "6": { "class_type": "CLIPTextEncode", "inputs": { "text": fullPrompt, "clip": ["4", 1] } },
        "7": { "class_type": "CLIPTextEncode", "inputs": { "text": negative, "clip": ["4", 1] } },
        "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["4", 2] } },
        "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "battle", "images": ["8", 0] } }
    };

    const response = await fetch(`${COMFY_URL}/prompt`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ prompt: workflow }) 
    });
    
    const promptResponse = await response.json();
    const promptId = promptResponse.prompt_id;

    let buffer = null;
    while (!buffer) {
        await new Promise(r => setTimeout(r, 1000));
        const historyRes = await fetch(`${COMFY_URL}/history/${promptId}`);
        const history = await historyRes.json();

        if (history[promptId] && history[promptId].outputs) {
            const outputs = history[promptId].outputs;
            const nodeOutput = outputs["9"] || Object.values(outputs)[0];
            const imgData = nodeOutput.images[0];
            
            const imageRes = await fetch(`${COMFY_URL}/view?filename=${imgData.filename}&subfolder=${imgData.subfolder}&type=${imgData.type}`);
            const arrayBuffer = await imageRes.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
        }
    }

    console.log(`      📤 Загружаю ${fileName}...`);
    
    const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, buffer, {
            contentType: 'image/png',
            upsert: true
        });

    if (error) {
        console.error("Storage Error:", error);
        throw new Error("Ошибка загрузки файла: " + error.message);
    }

    const { data: publicData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
    return publicData.publicUrl;
}

async function checkComfy() {
    try { await fetch(COMFY_URL); console.log("✅ ComfyUI найден!"); } 
    catch (e) { console.error("❌ ComfyUI НЕ НАЙДЕН"); }
}