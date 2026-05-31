import { DocumentModel } from '../models/documentModel.js';
import { ImageModel } from '../models/imageModel.js';

export class DocumentController {
    /**
     * 處理前端傳送上傳的檔案/圖檔資料流
     */
    static async handleUpload(req, res) {
        const { guildId, sessionId, fileName, fileType, base64Data, parsedText } = req.body;

        try {
            // 🎯 1. 處理視覺圖檔的多模態解耦掛載
            if (fileType.startsWith('image/')) {
                // 呼叫雲端模型建立一般性結構化描述文本
                const visionAnalysisRes = await fetch(process.env.OLLAMA_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: process.env.MODEL_NAME,
                        messages: [{ role: 'user', content: '請詳細描述這張圖片的內容與文字，以便作為日後檢索的背景知識。', images: [base64Data] }],
                        stream: false
                    })
                });

                const visionData = await visionAnalysisRes.json();
                const imageDescription = visionData.choices ? visionData.choices[0].message.content : visionData.message.content;

                // 計算特徵向量
                const embedRes = await fetch(process.env.OLLAMA_EMBED_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: process.env.EMBED_MODEL_NAME, prompt: imageDescription })
                });
                const { embedding } = await embedRes.json();

                // 物理寫入 ImageModel 名下
                await ImageModel.save(sessionId, fileName, base64Data, [`[圖檔語意描述] ${imageDescription}`], [embedding]);
                return res.json({ status: 'success', message: `圖檔 ${fileName} 已成功掛載。` });
            }

            // 🎯 2. 處理常規文檔 (PDF/Docx)
            let fullText = parsedText;

            // 嚴謹容錯判定：若字數過短或僅含控制字元，自動補全防禦錨點防止 RAG 崩潰
            if (!fullText || !fullText.trim()) {
                fullText = `[文件預設錨點] 此檔案為名為 ${fileName} 的文檔，內部未包含大段落文字。`;
            }

            const chunkSize = 500;
            let chunkTexts = [];
            let embeddings = [];

            // 確保極短文檔至少能生成一個有效切片節點
            if (fullText.length <= chunkSize) {
                chunkTexts.push(fullText);
            } else {
                for (let i = 0; i < fullText.length; i += chunkSize) {
                    chunkTexts.push(fullText.substring(i, i + chunkSize));
                }
            }

            // 循環計算切片向量
            for (const chunk of chunkTexts) {
                const embedRes = await fetch(process.env.OLLAMA_EMBED_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: process.env.EMBED_MODEL_NAME, prompt: chunk })
                });
                const { embedding } = await embedRes.json();
                embeddings.push(embedding);
            }

            // 物理寫入 DocumentModel 名下
            await DocumentModel.save(guildId, fileName, chunkTexts, embeddings);
            return res.json({ status: 'success', message: `文檔 ${fileName} 已成功建立 ${chunkTexts.length} 個切片節點。` });

        } catch (error) {
            console.error(`[ERROR] [DocumentController] 資產掛載失敗:`, error.stack);
            return res.status(500).json({ status: 'error', message: '後端資產導入鏈路中斷' });
        }
    }
}