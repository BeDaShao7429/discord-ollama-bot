import { DocumentModel } from '../models/documentModel.js';
import { ImageModel } from '../models/imageModel.js';
import { DiscordView } from '../views/discordView.js';
import { DocumentParser } from '../utils/documentParser.js';

export class DocumentController {
    static async processUpload(message, attachment) {
        const timestamp = new Date().toISOString();
        await message.channel.sendTyping();

        try {
            const parsedResult = await DocumentParser.parse(attachment);
			
			// 🎯 優化後的防禦機制：如果讀不到文字，但檔案其實有體積，不要直接拋錯，嘗試轉換思維
			const fullText = parsedResult.content;

			if (!fullText || !fullText.trim()) {
				// 💡 降級備援思維：通知用戶這份文件可能不是純文字
				return await DiscordView.renderReply(message, `[提示] 檔案 \`${attachment.name}\` 內不包含可提取的純文字。如果這是掃描檔或富媒體文檔，建議您將關鍵頁面截圖，並以「圖片」形式發送給我，我將啟動視覺多模態為您進行片段解析與關聯掛載。`);
			}
			
            // 🎯 1. 處理圖檔上傳與其下轄描述片段掛載
            if (parsedResult.type === 'image_base64') {
                console.log(`[${timestamp}] [INFO] 啟動圖檔多模態語意建立流程...`);
                
                // 呼叫雲端模型，產生該圖的一般性結構化描述文本
                const visionAnalysisRes = await fetch(process.env.OLLAMA_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: process.env.MODEL_NAME,
                        messages: [{ role: 'user', content: '請詳細描述這張圖片的內容、場景與文字數據，以便作為日後檢索的背景知識。', images: [parsedResult.content] }],
                        stream: false
                    })
                });

                if (!visionAnalysisRes.ok) throw new Error('視覺語意提取失敗');
                const visionData = await visionAnalysisRes.json();
                const imageDescription = visionData.choices ? visionData.choices[0].message.content : visionData.message.content;

                // 計算該描述文本的向量
                const embedRes = await fetch(process.env.OLLAMA_EMBED_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: process.env.EMBED_MODEL_NAME, prompt: imageDescription })
                });
                const { embedding } = await embedRes.json();

                // 🎯 結構對齊：直接呼叫對齊後的 ImageModel，將描述片段掛在該圖檔名下
                await ImageModel.save(message.channel.id, attachment.name, parsedResult.content, [`[圖檔語意描述] ${imageDescription}`], [embedding]);
                return await DiscordView.renderReply(message, `[訊息] 圖檔 \`${attachment.name}\` 獨立主體與名下的描述片段已成功掛載儲存。`);
            }

            // 🎯 2. 處理常規文檔上傳 (PDF/Docx) 與其下轄文字切片掛載
            const fullText = parsedResult.content;
            if (!fullText || !fullText.trim()) throw new Error('無效的文檔內容');

            const chunkSize = 500;
            let chunkTexts = [];
            let embeddings = [];

            for (let i = 0; i < fullText.length; i += chunkSize) {
                const chunk = fullText.substring(i, i + chunkSize);
                const embedRes = await fetch(process.env.OLLAMA_EMBED_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: process.env.EMBED_MODEL_NAME, prompt: chunk })
                });
                const { embedding } = await embedRes.json();
                
                chunkTexts.push(chunk);
                embeddings.push(embedding);
            }

            // 🎯 結構對齊：直接呼叫對齊後的 DocumentModel，將切片陣列掛在該文檔名下
            await DocumentModel.save(message.guildId, attachment.name, chunkTexts, embeddings);
            await DiscordView.renderUploadSuccess(message, { fileName: attachment.name, chunkCount: chunkTexts.length });

        } catch (error) {
            console.error(`[ERROR] [DocumentController] 導入失敗:`, error.stack);
            await DiscordView.renderError(message, `檔案 \`${attachment.name}\` 處理失敗: ${error.message}`);
        }
    }
}