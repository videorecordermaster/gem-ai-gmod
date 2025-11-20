import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ПРИОРИТЕТ МОДЕЛЕЙ
// Мы идем сверху вниз. Если первая выдает ошибку лимитов (429) или перегрузку (503), пробуем следующую.
const MODEL_PRIORITY = [
    "gemini-2.5-flash",       // 1. Баланс (10 RPM)
    "gemini-2.5-pro",         // 2. Умная, но медленная (2 RPM) - на подстраховку
    "gemini-2.0-flash-lite-preview-02-05" // 3. "Глупая", но быстрая (30 RPM) - последняя надежда
];

// Функция очистки кода от Markdown (```lua ... ```) прямо на бэкенде
function cleanCode(text) {
    const luaMatch = text.match(/```lua([\s\S]*?)```/);
    if (luaMatch) return luaMatch[1].trim();
    
    const genericMatch = text.match(/```([\s\S]*?)```/);
    if (genericMatch) return genericMatch[1].trim();
    
    return text; // Возвращаем как есть, если блоков кода нет
}

// Рекурсивная функция попытки генерации
async function tryGenerate(prompt, modelIndex = 0) {
    if (modelIndex >= MODEL_PRIORITY.length) {
        throw new Error("Все модели перегружены (All models exhausted).");
    }

    const modelName = MODEL_PRIORITY[modelIndex];
    console.log(`Attempting generation with model: ${modelName}`);

    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        
        // Добавляем жесткое требование писать только код
        const finalPrompt = `Write ONLY working Garry's Mod Lua code (GLua). No explanations. No markdown outside code blocks. Request: ${prompt}`;

        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const text = response.text();

        return {
            success: true,
            model: modelName,
            raw_text: text,
            clean_code: cleanCode(text)
        };

    } catch (error) {
        // Проверяем, является ли ошибка лимитом (429) или перегрузкой (503)
        // Google API часто возвращает ошибку в message или status
        const isRateLimit = error.message.includes("429") || error.message.includes("503") || error.message.includes("RESOURCE_EXHAUSTED");

        if (isRateLimit) {
            console.warn(`Model ${modelName} failed (Rate Limit). Switching to next...`);
            return tryGenerate(prompt, modelIndex + 1); // Пробуем следующую модель
        } else {
            // Если ошибка другая (например, неверный API ключ или Bad Request), пробрасываем её
            throw error;
        }
    }
}

export default async function handler(req, res) {
    // CORS заголовки
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Only POST requests allowed' });
    }

    try {
        let { prompt } = req.body;

        // Парсинг тела запроса, если GMod прислал строку
        if (!prompt && typeof req.body === 'string') {
            try {
                const parsed = JSON.parse(req.body);
                prompt = parsed.prompt;
            } catch (e) {}
        }

        if (!prompt) {
            return res.status(400).json({ error: "No prompt provided" });
        }

        // Запускаем умную генерацию с перебором моделей
        const result = await tryGenerate(prompt);

        // Возвращаем JSON с кодом и именем модели
        res.status(200).json(result);

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: error.message || "Internal Server Error" });
    }
}

