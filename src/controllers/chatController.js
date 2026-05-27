import { MessageModel } from '../models/messageModel.js';
import { DiscordView } from '../views/discordView.js';
import fetch from 'node-fetch';

export class ChatController {
    static async processGemmaChat(message) {
        const userPrompt = message.content.replace('!ask ', '').trim();
        const sessionId = message.channel.id;
        const timestamp = new Date().toISOString();

        console.log(`[${timestamp}] [INFO] [Controller] 開始處理 AI 請求. SessionID: ${sessionId}`);
        await message.channel.sendTyping();

        try {
            await MessageModel.saveMessage(sessionId, 'user', userPrompt);

            // 紀錄歷史訊息讀取狀態
            const context = await MessageModel.getRecentContext(sessionId, 10);
            console.log(`[${timestamp}] [DEBUG] [Controller] 成功載入歷史上下文，共 ${context.length} 條紀錄`);

            // 效能監控：記錄 Ollama 請求發起時間
            const startTime = Date.now();
            
            const response = await fetch(process.env.OLLAMA_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: process.env.MODEL_NAME, messages: context, stream: false })
            });

            if (!response.ok) throw new Error(`Ollama 伺服器回應異常, 狀態碼: ${response.status}`);
            const data = await response.json();
            const aiResponse = data.message.content;

            // 效能監控：計算 LLM 推論總耗時
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`[${timestamp}] [INFO] [Controller] Ollama 推論完成. 耗時: ${duration} 秒. 回覆字數: ${aiResponse.length} 字`);

            await MessageModel.saveMessage(sessionId, 'assistant', aiResponse);
            await DiscordView.renderReply(message, aiResponse);

        } catch (error) {
            // 嚴謹的錯誤日誌必須包含完整堆疊軌跡 (error.stack)
            console.error(`[${timestamp}] [ERROR] [Controller] 處理 Chat 流程崩潰. 錯誤原因:`, error.stack);
            await DiscordView.renderError(message, '系統核心處理失敗，請稍後再試。');
        }
    }
}
