import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// === ДЕФОЛТНЫЙ СПИСОК ===
// Точные названия моделей, которые мы выяснили
const DEFAULT_MODELS = [
    "gemini-2.0-flash-lite-preview-02-05",
    "gemini-2.5-flash",
    "gemini-2.5-pro"
];

// Функция очистки кода
function cleanCode(text) {
    const luaMatch = text.match(/```lua([\s\S]*?)```/);
    if (luaMatch) return luaMatch[1].trim();
    
    const genericMatch = text.match(/```([\s\S]*?)```/);
    if (genericMatch) return genericMatch[1].trim();
    
    return text; 
}

// Рекурсивная функция генерации
async function tryGenerate(prompt, modelsList, modelIndex = 0) {
    // Если перебрали все модели
    if (modelIndex >= modelsList.length) {
        throw new Error("Все модели перегружены (Rate Limits) или недоступны.");
    }

    const modelName = modelsList[modelIndex];
    console.log(`[Attempt ${modelIndex + 1}/${modelsList.length}] Using model: ${modelName}`);

    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const finalPrompt = `Write ONLY working Garry's Mod Lua code (GLua). No explanations. Request: ${prompt}`;

        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const text = response.text();

        return {
            success: true,
            model: modelName,
            clean_code: cleanCode(text)
        };

    } catch (error) {
        // Проверяем на лимиты (429) или перегрузку (503)
        const isRateLimit = error.message.includes("429") || 
                            error.message.includes("503") || 
                            error.message.includes("RESOURCE_EXHAUSTED");

        if (isRateLimit) {
            console.warn(`Model ${modelName} hit rate limit. Switching...`);
            // Пробуем следующую модель
            return tryGenerate(prompt, modelsList, modelIndex + 1);
        } else {
            // Если ошибка другая — пробрасываем её
            throw error;
        }
    }
}

// ВАЖНО: Используем export default для ESM
export default async function handler(req, res) {
    // Настройка CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Only POST requests allowed' });
    }

    try {
        let body = req.body;

        // Костыль для GMod, если он прислал JSON строкой
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch (e) {}
        }

        const prompt = body.prompt;

        if (!prompt) {
            return res.status(400).json({ error: "No prompt provided" });
        }

        // Берем список моделей из запроса или дефолтный
        const modelsList = (body.models && Array.isArray(body.models) && body.models.length > 0) 
                           ? body.models 
                           : DEFAULT_MODELS;

        const result = await tryGenerate(prompt, modelsList);

        res.status(200).json(result);

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: error.message || "Internal Server Error" });
    }
}
