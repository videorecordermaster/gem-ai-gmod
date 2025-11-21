import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// === СПИСОК МОДЕЛЕЙ ===
// Точные названия моделей, которые ты указал
const DEFAULT_MODELS = [
    "gemini-2.0-flash-lite-preview-02-05",
    "gemini-2.5-flash",
    "gemini-2.5-pro"
];

// Функция очистки кода (убирает markdown обертку)
function cleanCode(text) {
    // Ищем блоки кода ```lua ... ```
    const luaMatch = text.match(/```lua([\s\S]*?)```/);
    if (luaMatch) return luaMatch[1].trim();
    
    // Ищем любые блоки кода ``` ... ```
    const genericMatch = text.match(/```([\s\S]*?)```/);
    if (genericMatch) return genericMatch[1].trim();
    
    // Если блоков нет, возвращаем как есть
    return text; 
}

// Рекурсивная функция генерации (ротация моделей при ошибках)
async function tryGenerate(prompt, modelsList, modelIndex = 0) {
    // Если перебрали все модели
    if (modelIndex >= modelsList.length) {
        throw new Error("-- [AI ERROR] All models overloaded or unavailable.");
    }

    const modelName = modelsList[modelIndex];
    console.log(`[Attempt ${modelIndex + 1}/${modelsList.length}] Using model: ${modelName}`);

    try {
        const model = genAI.getGenerativeModel({ model: modelName });
        
        // Отправляем запрос в Gemini
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Возвращаем чистый код
        return cleanCode(text);

    } catch (error) {
        console.warn(`Model ${modelName} failed: ${error.message}`);

        // Проверяем на лимиты (429, 503, RESOURCE_EXHAUSTED)
        const isRateLimit = error.message.includes("429") || 
                            error.message.includes("503") || 
                            error.message.includes("RESOURCE_EXHAUSTED");

        if (isRateLimit) {
            // Пробуем следующую модель
            return tryGenerate(prompt, modelsList, modelIndex + 1);
        } else {
            // Если ошибка не связана с лимитами (например, неверное имя модели), выбрасываем её
            throw error;
        }
    }
}

export default async function handler(req, res) {
    // Настройка заголовков CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).send("-- [AI ERROR] Only POST requests allowed");
    }

    try {
        // GMod http.Post отправляет "application/x-www-form-urlencoded"
        // Vercel обычно сам парсит это в req.body
        let userPrompt = req.body.prompt;

        // На случай, если вдруг пришел JSON
        if (!userPrompt && req.body && typeof req.body === 'object') {
             userPrompt = req.body.prompt;
        }

        if (!userPrompt) {
            return res.status(400).send("-- [AI ERROR] No prompt provided");
        }

        // Запускаем генерацию
        const generatedCode = await tryGenerate(userPrompt, DEFAULT_MODELS);

        // ВАЖНО: Возвращаем Plain Text для Lua (CompileString)
        res.status(200).send(generatedCode);

    } catch (error) {
        console.error("Server Error:", error);
        // Возвращаем ошибку в виде Lua-комментария
        res.status(500).send(`-- [AI SERVER ERROR] ${error.message}`);
    }
}
