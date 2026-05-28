import { MessageModel } from '../models/messageModel.js';
import { DocumentModel } from '../models/documentModel.js';
import { ImageModel } from '../models/imageModel.js';
import { DiscordView } from '../views/discordView.js';

export class ChatController {
    static async processGemmaChat(message, botMentionPrefix) {
        const userPrompt = message.content.replace(botMentionPrefix, '').trim();
		if(!userPrompt) userPrompt = "";
        const sessionId = message.channel.id;
        await message.channel.sendTyping();

        try {
            // 1. 計算當前收到訊息的向量
            const queryEmbedRes = await fetch(process.env.OLLAMA_EMBED_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: process.env.EMBED_MODEL_NAME, prompt: userPrompt })
            });
            if (!queryEmbedRes.ok) throw new Error('Embedding 節點異常');
            const { embedding } = await queryEmbedRes.json();

            // 🎯 2. 收到訊息後，分別從解耦後的兩大 Model 撈出名下的所有片段進行語意比對
            const docChunks = await DocumentModel.getAllChunks(message.guildId);
            const imgChunks = await ImageModel.getAllChunks(sessionId);
            const allChunks = [...docChunks, ...imgChunks];
            
            const calculateSimilarity = (v1, v2) => {
                const dotProduct = v1.reduce((sum, val, i) => sum + val * v2[i], 0);
                const mag1 = Math.sqrt(v1.reduce((sum, val) => sum + val * val, 0));
                const mag2 = Math.sqrt(v2.reduce((sum, val) => sum + val * val, 0));
                return mag1 === 0 || mag2 === 0 ? 0 : dotProduct / (mag1 * mag2);
            };

            // 篩選出相似度大於 0.45 的 Top-4 最相關片段
            const matchedResults = allChunks
                .map(c => ({ ...c, similarity: calculateSimilarity(embedding, c.embedding) }))
                .filter(c => c.similarity > 0.45)
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, 4);

            // 🎯 3. 建構當前 Message 的 References 關係結構，精確記錄訊息跟誰有關、強度是多少
            let references = [];
            let referenceTexts = [];
            let imageVotes = new Map();

            matchedResults.forEach(res => {
                references.push({
                    assetType: res.type,
                    assetId: res.assetId,
                    fileName: res.fileName,
                    associatedChunk: res.content,
                    relationStrength: res.similarity // 記錄量化後的引用強度
                });

                referenceTexts.push(`[關聯資產: ${res.fileName}] ${res.content}`);
                
                if (res.type === 'image') {
                    const currentWeight = imageVotes.get(res.assetId) || 0;
                    imageVotes.set(res.assetId, currentWeight + res.similarity);
                }
            });

            // 🎯 4. 儲存 Message 實體（正式將訊息與資產的關係與強度寫入資料庫）
            await MessageModel.save(sessionId, 'user', userPrompt, references);
            const historyContext = await MessageModel.getRecentContext(sessionId, 6);

            // 🎯 5. 依據訊息與圖檔的關係強度，判定是否需要定點召回（Recall）圖檔實體
            let targetImageBase64 = null;
            let promptExtension = '';

            if (imageVotes.size > 0) {
                const [bestImageId, strength] = [...imageVotes.entries()].sort((a, b) => b[1] - a[1])[0];
                if (strength > 0.5) { // 引用強度閾值
                    // 🎯 從對齊優化後的 ImageModel 獲取高質量實體
                    const imgEntity = await ImageModel.getById(bestImageId);
                    if (imgEntity) {
                        targetImageBase64 = imgEntity.base64Data;
                        promptExtension = `\n(系統檢測到此訊息與歷史圖檔 [${imgEntity.originalName}] 具備強關聯，已自動召回影像實體輔助推理。)`;
                    }
                }
            }

            // 6. 封裝發送 Payload 提交推理
            let chatMessages = [];
            const finalPrompt = userPrompt + promptExtension;

            if (referenceTexts.length > 0) {
                const systemPrompt = `你是一個專業助理。以下是與使用者當前訊息具備高強度關聯的文檔與圖檔描述片段，請優先結合這些背景知識與影像實體進行回答。\n\n【關聯資產文獻】:\n${referenceTexts.join('\n')}`;
                chatMessages = [
                    { role: 'system', content: systemPrompt },
                    ...historyContext.slice(0, -1),
                    { role: 'user', content: finalPrompt, ...(targetImageBase64 && { images: [targetImageBase64] }) }
                ];
            } else {
                chatMessages = historyContext;
            }

            const response = await fetch(process.env.OLLAMA_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: process.env.MODEL_NAME, messages: chatMessages, stream: false })
            });

            if (!response.ok) throw new Error(`核心節點異常: ${response.status}`);
            const data = await response.json();
            const aiResponse = data.choices ? data.choices[0].message.content : data.message.content;

            await MessageModel.save(sessionId, 'assistant', aiResponse);
            await DiscordView.renderReply(message, aiResponse);

        } catch (error) {
            console.error(`[ERROR] [ChatController] 流程中斷:`, error.stack);
            await DiscordView.renderError(message, '核心運算節點阻斷，請稍後再試。');
        }
    }
}