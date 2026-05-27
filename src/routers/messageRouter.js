import { ChatController } from '../controllers/chatController.js';
import { DocumentController } from '../controllers/documentController.js';

export async function handleMessage(message) {
    // 1. 安全防守：排除機器人自身的訊息，防止無限迴圈
    if (message.author.bot) return;

    const botMentionPrefix = `<@${message.client.user.id}>`;
    
    // 2. 核心判定：只要訊息內容包含標記 (@機器人)，或者有夾帶檔案，就進入處理流程
    const isMentioned = message.content.includes(botMentionPrefix);
    const hasFiles = message.attachments && message.attachments.size > 0;

    if (isMentioned || hasFiles) {
        const timestamp = new Date().toISOString();
        
        // 🎯 流程一：上傳與寫入知識庫（非阻塞式）
        if (hasFiles) {
            const attachment = message.attachments.first();
            console.log(`[${timestamp}] [ROUTE] 偵測到使用者夾帶檔案 "${attachment.name}"，優先啟動 DocumentController 進行知識庫導入`);
            
            try {
                // 執行文件解析與儲存。此處必須使用 await 確保寫入完成，後續的 RAG 才能撈得到資料
                await DocumentController.processUpload(message, attachment);
            } catch (uploadError) {
                console.error(`[${timestamp}] [ERROR] 檔案自動導入失敗:`, uploadError.message);
                // 即使檔案導入失敗，也不中斷後續的常規對話嘗試
            }
        }

        // 🎯 流程二：常規對話與 RAG 問答判定
        // 修正：只要有被標記（無論是一起上傳檔案，還是純文字對話），一律進入對話控制器處理
        if (isMentioned) {
            console.log(`[${timestamp}] [ROUTE] 訊息符合對話條件，引導至 ChatController 進行推理`);
            return await ChatController.processGemmaChat(message, botMentionPrefix);
        }
    }
}