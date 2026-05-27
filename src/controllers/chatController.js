import { MessageModel } from '../models/messageModel.js';
import { DocumentModel } from '../models/documentModel.js';
import { DiscordView } from '../views/discordView.js';
import fetch from 'node-fetch';

export class ChatController {
    static async processGemmaChat(message, botMentionPrefix) {
        const userPrompt = message.content.replace(botMentionPrefix, '').trim();
        const sessionId = message.channel.id;
        const timestamp = new Date().toISOString();

        if (!userPrompt) {
            return await DiscordView.renderReply(message, '請問有什麼我可以幫您的嗎？');
        }

        await message.channel.sendTyping();

        try {
            await MessageModel.saveMessage(sessionId, 'user', userPrompt);
            const historyContext = await MessageModel.getRecentContext(sessionId, 6);

            let chatMessages = [];

            // 1. 將用戶提問轉為問題向量
            const queryEmbedRes = await fetch(process.env.OLLAMA_EMBED_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: process.env.EMBED_MODEL_NAME, prompt: userPrompt })
            });
            
            if (!queryEmbedRes.ok) throw new Error(`Embedding 服務響應異常: ${queryEmbedRes.statusText}`);
            const { embedding } = await queryEmbedRes.json();
            
            // 2. 自 MongoDB 撈取相似度前 3 高的文檔片段
            const matchedChunks = await DocumentModel.findSimilarChunks(message.guildId, embedding, 3);
           
		// 🎯 【動態除錯安全防線】
            let isRAGActivated = false;
            if (matchedChunks.length > 0) {
                const highestScore = matchedChunks[0].similarity;
                console.log(`[${timestamp}] [DEBUG] [RAG] 相似度動態觀測. 分數: ${highestScore.toFixed(4)}, 檔案: ${matchedChunks[0].fileName}`);
                
                // 排除數學溢出異常（例如分數大於 1 或等於 NaN、或者太低）
                if (!isNaN(highestScore) && highestScore > 0.5 && highestScore <= 1.0) {
                    isRAGActivated = true;
                }
            }
 
            // 【除錯日誌】：輸出最高匹配分數
            if (matchedChunks.length > 0) {
                console.log(`[${timestamp}] [DEBUG] [RAG] 最高匹配分值: ${matchedChunks[0].similarity.toFixed(4)}, 來自檔案: ${matchedChunks[0].fileName}`);
            }

            
	// 3. 判定是否符合 RAG 知識庫注入條件
            if (isRAGActivated) {
                const referenceText = matchedChunks.map((c, idx) => `[來自文件: ${c.fileName}] ${c.content}`).join('\n');
                
                chatMessages = [
                    { 
                        role: 'system', 
                        content: `你是一個嚴謹的文件分析專家。請僅依據以下【參考文獻】回答使用者的問題。若文件中未提及相關答案，請直接回答「文件中未提及」，切勿捏造假訊息。\n\n【參考文獻】：\n${referenceText}` 
                    },
                    ...historyContext
                ];
                console.log(`[${timestamp}] [INFO] [RAG] 高度相關 (Score > 0.5)，成功注入參考文獻`);
            } else {
                // 🎯 只要分數不夠，或是閒聊，通通完美回退到常規對話
                chatMessages = historyContext;
                console.log(`[${timestamp}] [INFO] [Chat] 未匹配到相關文獻，回歸常規通識對話模式`);
            }

            // 4. 提交至 Gemma 4 進行推理
            const response = await fetch(process.env.OLLAMA_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: process.env.MODEL_NAME, messages: chatMessages, stream: false })
            });

            if (!response.ok) throw new Error(`Ollama Chat 核心節點異常: ${response.status}`);
            const data = await response.json();
            const aiResponse = data.message.content;

            await MessageModel.saveMessage(sessionId, 'assistant', aiResponse);
            await DiscordView.renderReply(message, aiResponse);

        } catch (error) {
            console.error(`[${timestamp}] [ERROR] [ChatController] 流程中斷:`, error.stack);
            await DiscordView.renderError(message, '核心運算節點阻斷，請稍後再試。');
        }
    }
}
