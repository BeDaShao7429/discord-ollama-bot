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
        
        // 🎯 【最高優先權】：只要發現有檔案夾帶，無論有沒有打文字，一律強行分流至導入端
        if (hasFiles) {
            const attachment = message.attachments.first();
            const timestamp = new Date().toISOString();
            
            console.log(`[${timestamp}] [ROUTE] 偵測到使用者上傳檔案 "${attachment.name}"，強行引導至 DocumentController`);
            return await DocumentController.processUpload(message, attachment);
        }

        // 3. 如果完全沒有夾帶檔案，且確定被標記，才判定為對話問答
        if (isMentioned) {
            return await ChatController.processGemmaChat(message, botMentionPrefix);
        }
    }
}
