import { MessageModel } from '../models/messageModel.js';
import { DocumentModel } from '../models/documentModel.js';
import { ImageModel } from '../models/imageModel.js'; // 🎯 引入全新對齊解耦的圖檔模型
import { DiscordView } from '../views/discordView.js';
import mongoose from 'mongoose';

export class AdminController {
    /**
     * 管理員指令核心入口
     */
    static async handleCommand(message, commandStr) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [ADMIN] 接收到系統維護指令: "${commandStr}"`);

        switch (commandStr) {
            case '$help':
                return await this.showHelp(message);
            case '$clear':
                return await this.clearDatabase(message);
            case '$listdoc':
                return await this.listDocuments(message);
            case '$listmsg':
                return await this.listMessages(message);
            default:
                return await DiscordView.renderError(message, `未知指令: \`${commandStr}\`。請輸入 \`$help\` 查看可用指令。`);
        }
    }

    /**
     * 展示系統指令說明清單
     */
    static async showHelp(message) {
        let helpText = `**【🤖 Discord Ollama Bot 系統管理指令清單】**\n`;
        helpText += `所有維護指令皆以 \`$\` 開頭，不需標記（@）機器人：\n\n`;
        helpText += `> \`$help\` : 顯示此系統管理指令清單與維護說明。\n`;
        helpText += `> \`$listdoc\` : 盤點資料庫中目前已收錄的知識庫文件與其切片總數。\n`;
        helpText += `> \`$listmsg\` : 查看當前頻道最近 10 條在資料庫中的對話紀錄與資產關聯摘要。\n`;
        helpText += `> \`$clear\` : ⚠️ **重置測試環境**。強制清空 \`images\`、\`documents\` 與 \`messages\` 三大資料表。\n\n`;
        helpText += `*提示：進行全新功能測試前，建議執行 \`$clear\` 以避免舊資料與上下文污染。*`;

        return await DiscordView.renderReply(message, helpText);
    }

    /**
     * 🎯 修改點一：清空資料庫重置環境
     * 呼叫三大解耦模型各自的標準 .clear() 方法，不再越權操作原生 db.collection
     */
    static async clearDatabase(message) {
        await message.channel.sendTyping();
        try {
            const resDoc = await DocumentModel.clear();
            const resImg = await ImageModel.clear();
            const resMsg = await MessageModel.clear();

            // 統計總共釋放的實體主文件數量
            const totalDeleted = (resDoc.deletedCount || 0) + (resImg.deletedCount || 0) + (resMsg.deletedCount || 0);

            return await DiscordView.renderReply(message, `[訊息] 資料庫維護完成！三大對齊模型（Image, Document, Message）已完全洗淨重置（共釋放 ${totalDeleted} 筆主體紀錄）。`);
        } catch (error) {
            return await DiscordView.renderError(message, `環境重置失敗，原因: ${error.message}`);
        }
    }

    /**
     * 🎯 修改點二：盤點知識庫文檔清單
     * 配合解耦後的 documentSchema 結構（切片片段已掛在 document 實體下面）進行聚合盤點
     */
    static async listDocuments(message) {
        await message.channel.sendTyping();
        try {
            const db = mongoose.connection.db;
            const collection = db.collection('documents'); // 對齊 documents 資料表