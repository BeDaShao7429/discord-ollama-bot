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

            // 🎯 優化升級：強化對極短文檔、單行測試檔的相容性防禦
			let fullText = parsedResult.content;

			// 1. 如果真的完全沒讀到字，提供安全的預設文字，允許其完成特特徵向量建立
			if (!fullText || !fullText.trim()) {
				console.log(`[WARN] [Document] 檔案 ${attachment.name} 內容過短或格式不相容，啟動自動補全防禦。`);
				fullText = `[文件預設錨點] 此檔案為名為 ${attachment.name} 的文檔，內部未包含大段落文字或僅含極短標記。`;
			}

			const chunkSize = 500;
			let chunkTexts = [];
			let embeddings = [];

			// 2. 修正切片邏輯：確保字數極少時，至少會建立一個有效切片節點
			if (fullText.length <= chunkSize) {
				chunkTexts.push(fullText);
			} else {
				for (let i = 0; i < fullText.length; i += chunkSize) {
					chunkTexts.push(fullText.substring(i, i + chunkSize));
				}
			}

			// 3. 批次計算向量並寫入名下
			for (const chunk of chunkTexts) {
				const embedRes = await fetch(process.env.OLLAMA_EMBED_URL, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ model: process.env.EMBED_MODEL_NAME, prompt: chunk })
				});
				const { embedding } = await embedRes.json();
				embeddings.push(embedding);
			}

			// 🎯 結構對齊：將切片陣列直接掛在該文檔下面儲存
			await DocumentModel.save(message.guildId, attachment.name, chunkTexts, embeddings);
			await DiscordView.renderUploadSuccess(message, { fileName: attachment.name, chunkCount: chunkTexts.length });
        } catch (error) {
            console.error(`[ERROR] [DocumentController] 導入失敗:`, error.stack);
            await DiscordView.renderError(message, `檔案 \`${attachment.name}\` 處理失敗: ${error.message}`);
        }
    }
}