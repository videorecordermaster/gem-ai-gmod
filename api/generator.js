import { GoogleGenerativeAI } from "@google/generative-ai";

// Инициализация API ключа из переменных окружения Vercel
// Не забудь добавить GEMINI_API_KEY в Settings -> Environment Variables на Vercel
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
    // Разрешаем CORS, чтобы GMod мог стучаться к серверу
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Обработка preflight запроса (OPTIONS)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Only POST requests allowed' });
    }

    try {
        // GMod http.Post отправляет данные как form-url-encoded или JSON
        // Vercel обычно парсит их автоматически в req.body
        let { prompt } = req.body;

        if (!prompt) {
             // Иногда GMod присылает тело как строку ключей, если заголовки не JSON
             // Если prompt пустой, попробуем распарсить ключи
             if (typeof req.body === 'string') {
                 try {
                     const parsed = JSON.parse(req.body);
                     prompt = parsed.prompt;
                 } catch (e) {
                     // Если не JSON, то просто вернем ошибку
                 }
             }
        }

        if (!prompt) {
            return res.status(400).send("No prompt provided");
        }

        // === ВЫБОР МОДЕЛИ ===
        // gemini-1.5-flash — идеальна для игр: она очень быстрая и дешевая (бесплатная в limits).
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Отправляем чистый текст обратно в GMod
        // Мы не шлем JSON ({ result: text }), потому что твой Lua скрипт
        // ожидает строку, которую он сразу начнет чистить через gsub
        res.status(200).send(text);

    } catch (error) {
        console.error("Gemini Error:", error);
        res.status(500).send("Error generating code: " + error.message);
    }
}
