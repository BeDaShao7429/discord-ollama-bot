import { DocumentModel } from '../models/documentModel.js';
import { DiscordView } from '../views/discordView.js';
import { DocumentParser } from '../utils/documentParser.js';
// 修正：已不需在控制器內下載檔案，故移除 import fetch from 'node-fetch'

export class DocumentController {
    static async processUpload(message, attachment) {
        const timestamp = new Date().toISOString();
        await message.channel.sendTyping();

        try {
            console.log(`[${timestamp}] [INFO] [DocumentController] 開始解析文檔 "${attachment.name}"...`);
            
            // 🎯 【調整核心】：直接將 attachment 丟給重構後的解析器，一氣呵成完成下載與文字提取
            const fullText = await DocumentParser.parse(attachment);

            if (!fullText || !fullText.trim()) {
                throw new Error('無法從上傳的檔案中提取出任何有效文本內容');
            }

            // 文本切片處理
            const chunkSize = 500;
            const chunks = [];
            for (let i = 0; i < fullText.length; i += chunkSize) {
                chunks.push(fullText.substring(i, i + chunkSize));
            }

            console.log(`[${timestamp}] [INFO] [DocumentController] 文檔 "${attachment.name}" 解析成功 (共 ${chunks.length} 個切片)，開始進行向量化建庫...`);

            // 調用 Embedding API 並寫入資料庫
            for (const chunk of chunks) {
                const embedRes = await fetch(process.env.OLLAMA_EMBED_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: process.env.EMBED_MODEL_NAME, prompt: chunk })
                });
                
                if (!embedRes.ok) throw new Error(`Ollama Embedding 異常: ${embedRes.statusText}`);
                const { embedding } = await embedRes.json(); // 解構賦值
                
                await DocumentModel.saveChunk(message.guildId, attachment.name, chunk, embedding);
            }

            const resultData = { fileName: attachment.name, chunkCount: chunks.length };
            await DiscordView.renderUploadSuccess(message, resultData);

        } catch (error) {
            console.error(`[${timestamp}] [ERROR] [DocumentController] 文檔導入失敗. 原因:`, error.stack);
            await DiscordView.renderError(message, `文檔 \`${attachment.name}\` 導入失敗。原因: ${error.message}`);
        }
    }
}