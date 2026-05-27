import { ChatController } from '../controllers/chatController.js';
import { DocumentController } from '../controllers/documentController.js';
import { AdminController } from '../controllers/adminController.js'; // 1. 引入新控制器

export async function handleMessage(message) {
    // 安全防守：排除機器人自身的訊息，防止無限迴圈
    if (message.author.bot) return;

    const content = message.content.trim();

	// 只要是 $ 開頭，路由不處理細節，直接拋給 AdminController 完成職責分離
    if (content.startsWith('$')) {
        return await AdminController.handleCommand(message, content);
    }

    const botMentionPrefix = `<@${message.client.user.id}>`;
    const isMentioned = content.includes(botMentionPrefix);
    const hasFiles = message.attachments && message.attachments.size > 0;

    if (isMentioned || hasFiles) {
        const timestamp = new Date().toISOString();
        
        // 流程一：上傳與寫入知識庫（非阻塞式）
        if (hasFiles) {
            const attachment = message.attachments.first();
            console.log(`[${timestamp}] [ROUTE] 偵測到使用者夾帶檔案 "${attachment.name}"，優先啟動 DocumentController 進行知識庫導入`);
            try {
                await DocumentController.processUpload(message, attachment);
            } catch (uploadError) {
                console.error(`[${timestamp}] [ERROR] 檔案自動導入失敗:`, uploadError.message);
            }
        }

        // 流程二：常規對話與 RAG 問答判定
        if (isMentioned) {
            console.log(`[${timestamp}] [ROUTE] 訊息符合對話條件，引導至 ChatController 進行推理`);
            return await ChatController.processGemmaChat(message, botMentionPrefix);
        }
    }
}