import { MessageModel } from '../models/messageModel.js';
import { DocumentModel } from '../models/documentModel.js';
import { ImageModel } from '../models/imageModel.js';
// 在 src/backend/controllers/chatController.js 頂端：
import { ConfigManager } from '../utils/configManager.js'; // 只需要一個 ../ 即可精確對齊

export class ChatController {
    /**
     * 處理標準對話與 RAG 檢索推理
     */
    static async handleChat(req, res) {
        const { sessionId, guildId, userPrompt, hasAttachment } = req.body;
        const currentCfg = ConfigManager.get();

        try {
            // 1. 嚴謹空字串補全防禦機制
            let finalUserContent = userPrompt ? userPrompt.trim() : "";
            if (finalUserContent === "" && !hasAttachment) {
                return res.json({ 
                    status: 'success', 
                    data: { reply: "你好！請問有什麼我可以幫您的嗎？", audit: { triggeredRecall: false } } 
                });
            } else if (finalUserContent === "" && hasAttachment) {
                finalUserContent = "請幫我描述這張圖片的內容。";
            }

            // 2. 計算提示詞特徵向量
            const queryEmbedRes = await fetch(process.env.OLLAMA_EMBED_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: process.env.EMBED_MODEL_NAME, prompt: finalUserContent })
            });
            const { embedding } = await queryEmbedRes.json();

            // 3. 跨 Model 提取所有知識碎片並執行餘弦相似度比對
            const docChunks = await DocumentModel.getAllChunks(guildId);
            const imgChunks = await ImageModel.getAllChunks(sessionId);
            const allChunks = [...docChunks, ...imgChunks];
            
            const calculateSimilarity = (v1, v2) => {
                const dotProduct = v1.reduce((sum, val, i) => sum + val * v2[i], 0);
                const mag1 = Math.sqrt(v1.reduce((sum, val) => sum + val * val, 0));
                const mag2 = Math.sqrt(v2.reduce((sum, val) => sum + val * val, 0));
                return mag1 === 0 || mag2 === 0 ? 0 : dotProduct / (mag1 * mag2);
            };

            const matchedResults = allChunks
                .map(c => ({ ...c, similarity: calculateSimilarity(embedding, c.embedding) }))
                .filter(c => c.similarity > currentCfg.similarityThreshold)
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, currentCfg.topK);

            let references = [];
            let referenceTexts = [];
            let imageVotes = new Map();

            matchedResults.forEach(item => {
                references.push({
                    assetType: item.type,
                    assetId: item.assetId,
                    fileName: item.fileName,
                    associatedChunk: item.content,
                    relationStrength: item.similarity
                });
                referenceTexts.push(`[關聯資產: ${item.fileName}] ${item.content}`);
                if (item.type === 'image') {
                    imageVotes.set(item.assetId, (imageVotes.get(item.assetId) || 0) + item.similarity);
                }
            });

            // 4. 記錄本次對話與引用強度
            await MessageModel.save(sessionId, 'user', finalUserContent, references);
            const historyContext = await MessageModel.getRecentContext(sessionId, 6);

            // 5. 權重投票判定是否定點召回（Recall）高質量圖檔實體
            let targetImageBase64 = null;
            let promptExtension = '';
            let auditInfo = { triggeredRecall: false, recalledAsset: null, relationStrength: 0 };

            if (imageVotes.size > 0) {
                const [bestImageId, strength] = [...imageVotes.entries()].sort((a, b) => b[1] - a[1])[0];
                if (strength > currentCfg.imageRecallThreshold) {
                    const imgEntity = await ImageModel.getById(bestImageId);
                    if (imgEntity) {
                        targetImageBase64 = imgEntity.base64Data;
                        promptExtension = `\n(系統檢測到高強度資產關聯，已動態召回影像實體輔助推理。)`;
                        auditInfo = { triggeredRecall: true, recalledAsset: imgEntity.originalName, relationStrength: strength };
                    }
                }
            }

            // 6. 提交至大模型核心進行最終推理
            let chatMessages = referenceTexts.length > 0 ? [
                { role: 'system', content: `你是一個專業助理。請優先結合以下背景知識與影像實體進行嚴謹回答。\n\n【關聯資產文獻】:\n${referenceTexts.join('\n')}` },
                ...historyContext.slice(0, -1),
                { role: 'user', content: finalUserContent + promptExtension, ...(targetImageBase64 && { images: [targetImageBase64] }) }
            ] : historyContext;

            const response = await fetch(process.env.OLLAMA_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: process.env.MODEL_NAME, messages: chatMessages, stream: false })
            });

            const data = await response.json();
            const aiResponse = data.choices ? data.choices[0].message.content : data.message.content;

            await MessageModel.save(sessionId, 'assistant', aiResponse);

            // 輸出純淨的結構化數據結果
            return res.json({ status: 'success', data: { reply: aiResponse, audit: auditInfo } });

        } catch (error) {
            console.error(`[ERROR] [ChatController] 核心運算阻斷:`, error.stack);
            return res.status(500).json({ status: 'error', message: '核心引擎內部推理阻斷' });
        }
    }
}