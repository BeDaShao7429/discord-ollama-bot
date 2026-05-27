import { DocumentModel } from '../models/documentModel.js';
import { DiscordView } from '../views/discordView.js';
import { DocumentParser } from '../utils/documentParser.js';

export class DocumentController {
    static async processUpload(message, attachment) {
        const timestamp = new Date().toISOString();
        await message.channel.sendTyping();

        try {
            console.log(`[${timestamp}] [INFO] [DocumentController] 開始處理檔案 "${attachment.name}"...`);
            
            // 🎯 確保宣告變數名稱為 parsedResult
            const parsedResult = await DocumentParser.parse(attachment);

            // 1. 如果是圖片，不建立向量庫，直接暫存提示使用者可開始對話
            if (parsedResult.type === 'image_base64') {
                console.log(`[${timestamp}] [INFO] [DocumentController] 圖檔 "${attachment.name}" 已成功轉換為 Base64 緩衝`);
                return await DiscordView.renderReply(message, `[訊息] 偵測到圖檔 \`${attachment.name}\`。請標記我並輸入問題（例如：@機器人 這張圖裡有什麼？），我將為您進行判讀。`);
            }

            // 2. 文件文字向量化建庫邏輯（此時 type 必然為 'text'）
            const fullText = parsedResult.content;
            if (!fullText || !fullText.trim()) {
                throw new Error('無法從上傳的檔案中提取出任何有效文本內容');
            }

            const chunkSize = 500;
            const chunks = [];
            for (let i = 0; i < fullText.length; i += chunkSize) {
                chunks.push(fullText.substring(i, i + chunkSize));
            }

            console.log(`[${timestamp}] [INFO] [DocumentController] 文檔 "${attachment.name}" 解析成功 (共 ${chunks.length} 個切片)，開始進行向量化建庫...`);

            for (const chunk of chunks) {
                const embedRes = await fetch(process.env.OLLAMA_EMBED_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: process.env.EMBED_MODEL_NAME, prompt: chunk })
                });
                
                if (!embedRes.ok) throw new Error(`Ollama Embedding 異常: ${embedRes.statusText}`);
                const { embedding } = await embedRes.json();
                
                await DocumentModel.saveChunk(message.guildId, attachment.name, chunk, embedding);
            }

            const resultData = { fileName: attachment.name, chunkCount: chunks.length };
            await DiscordView.renderUploadSuccess(message, resultData);

        } catch (error) {
            console.error(`[${timestamp}] [ERROR] [DocumentController] 導入失敗. 原因:`, error.stack);
            await DiscordView.renderError(message, `檔案 \`${attachment.name}\` 處理失敗。原因: ${error.message}`);
        }
    }
}