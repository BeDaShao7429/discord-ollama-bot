import { MessageModel } from '../models/messageModel.js';
import { DocumentModel } from '../models/documentModel.js';
import { DiscordView } from '../views/discordView.js';
import { DocumentParser } from '../utils/documentParser.js';

export class ChatController {
    static async processGemmaChat(message, botMentionPrefix) {
        const userPrompt = message.content.replace(botMentionPrefix, '').trim();
        const sessionId = message.channel.id;
        const timestamp = new Date().toISOString();

        await message.channel.sendTyping();

        try {
            await MessageModel.saveMessage(sessionId, 'user', userPrompt);
            const historyContext = await MessageModel.getRecentContext(sessionId, 6);

            let chatMessages = [];
            let targetImageBase64 = null;

            // 1. 視覺判定：檢查當前對話訊息是否有直接夾帶圖檔
            const hasDirectImage = message.attachments && message.attachments.size > 0;
            if (hasDirectImage) {
                const attachment = message.attachments.first();
                const parsed = await DocumentParser.parse(attachment);
                if (parsed.type === 'image_base64') {
                    targetImageBase64 = parsed.content;
                    console.log(`[${timestamp}] [INFO] [Vision] 偵測到使用者在對話中直接夾帶圖片進行提問`);
                }
            }

            // 2. 根據是否包含圖片進行分流封裝
            if (targetImageBase64) {
                // 雲端多模態標準的 Content Array 格式
                chatMessages = [
                    ...historyContext.slice(0, -1),
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: userPrompt || '請幫我描述這張圖片的內容。' },
                            { 
                                type: 'image_url', 
                                image_url: { url: `data:image/jpeg;base64,${targetImageBase64}` } 
                            }
                        ]
                    }
                ];
                console.log(`[${timestamp}] [INFO] [Vision] 已成功封裝雲端多模態結構`);
            } else {
                // 純文字對話 RAG 檢索邏輯
                const queryEmbedRes = await fetch(process.env.OLLAMA_EMBED_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: process.env.EMBED_MODEL_NAME, prompt: userPrompt })
                });
                
                if (!queryEmbedRes.ok) throw new Error(`Embedding 服務響應異常: ${queryEmbedRes.statusText}`);
                const { embedding } = await queryEmbedRes.json();
                
                const matchedChunks = await DocumentModel.findSimilarChunks(message.guildId, embedding, 3);
                let isRAGActivated = false;
                
                if (matchedChunks.length > 0) {
                    const highestScore = matchedChunks[0].similarity;
                    if (!isNaN(highestScore) && highestScore > 0.5 && highestScore <= 1.0) {
                        isRAGActivated = true;
                    }
                }

                if (isRAGActivated) {
                    const referenceText = matchedChunks.map(c => `[文件: ${c.fileName}] ${c.content}`).join('\n');
                    chatMessages = [
                        { 
                            role: 'system', 
                            content: `你是一個專業且親切的對話助手。以下提供的【參考文獻】是使用者上傳的相關背景資料。請優先結合文獻內容進行回答。如果文獻完全無關，請直接運用通用常識回答。\n\n【參考文獻】:\n${referenceText}` 
                        },
                        ...historyContext
                    ];
                } else {
                    chatMessages = historyContext;
                }
            }

            // 3. 提交至雲端推理節點
            const response = await fetch(process.env.OLLAMA_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    model: process.env.MODEL_NAME, 
                    messages: chatMessages, 
                    stream: false 
                })
            });

            if (!response.ok) throw new Error(`核心節點異常: ${response.status}`);
            const data = await response.json();

            // 相容雲端標準的 choices 節點與原本的 message 節點讀取回傳文字
            const aiResponse = data.choices ? data.choices[0].message.content : data.message.content;

            await MessageModel.saveMessage(sessionId, 'assistant', aiResponse);
            await DiscordView.renderReply(message, aiResponse);

        } catch (error) {
            console.error(`[${timestamp}] [ERROR] [ChatController] 流程中斷:`, error.stack);
            await DiscordView.renderError(message, '核心運算節點阻斷，請稍後再試。');
        }
    }
}