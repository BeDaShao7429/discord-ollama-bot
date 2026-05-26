import { MessageModel } from '../models/messageModel.js';
import { DiscordView } from '../views/discordView.js';
import fetch from 'node-fetch';

export class ChatController {
    static async processGemmaChat(message) {
        const userPrompt = message.content.replace('!ask ', '').trim();
        const sessionId = message.channel.id;

        // 1. 調用 View 展現即時回應狀態（打字中）
        await message.channel.sendTyping();

        try {
            // 2. 透過 Model 持久化用戶輸入
            await MessageModel.saveMessage(sessionId, 'user', userPrompt);

            // 3. 透過 Model 提取歷史上下文
            const context = await MessageModel.getRecentContext(sessionId, 10);

            // 4. 呼叫 Ollama 運算
            const response = await fetch(process.env.OLLAMA_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: process.env.MODEL_NAME,
                    messages: context,
                    stream: false
                })
            });

            if (!response.ok) throw new Error('Ollama 回傳異常');
            const data = await response.json();
            const aiResponse = data.message.content;

            // 5. 透過 Model 持久化 AI 回覆
            await MessageModel.saveMessage(sessionId, 'assistant', aiResponse);

            // 6. 將資料交付給 View，進行 UI 渲染與輸出
            await DiscordView.renderReply(message, aiResponse);

        } catch (error) {
            console.error('[Controller 錯誤]', error);
            await DiscordView.renderError(message, '系統核心處理失敗，請稍後再試。');
        }
    }
}
