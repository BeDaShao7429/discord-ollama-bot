import mongoose from 'mongoose';
import { DiscordView } from '../views/discordView.js';

export class AdminController {
    /**
     * 管理員指令核心入口
     */
    static async handleCommand(message, commandStr) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [ADMIN] 接收到系統指令: "${commandStr}"，由用戶: ${message.author.tag} 觸發`);

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
                return await DiscordView.renderError(message, `未知指令: \`${commandStr}\`。請輸入 \`$help\` 查看可用指令清單。`);
        }
    }

    /**
     * 展示系統指令說明清單
     */
    static async showHelp(message) {
        let helpText = `**【🤖 Discord Ollama Bot 系統管理指令清單】**\n`;
        helpText += `所有維護指令皆以 \`$\` 開頭，不需標記（@）機器人：\n\n`;
        helpText += `> \`$help\` : 顯示此系統管理指令清單與維護說明。\n`;
        helpText += `> \`$listdoc\` : 盤點資料庫中目前已收錄的知識庫文件與切片數量。\n`;
        helpText += `> \`$listmsg\` : 查看當前頻道最近 10 條在資料庫中的對話紀錄摘要。\n`;
        helpText += `> \`$clear\` : ⚠️ **重置測試環境**。強制清空 \`docchunks\` 與 \`messages\` 資料表。\n\n`;
        helpText += `*提示：進行全新功能測試前，建議執行 \`$clear\` 以避免舊資料與上下文污染。*`;

        return await DiscordView.renderReply(message, helpText);
    }

    /**
     * 清空資料表
     */
    static async clearDatabase(message) {
        await message.channel.sendTyping();
        try {
            const db = mongoose.connection.db;
            const targetCollections = ['docchunks', 'messages'];
            let totalDeleted = 0;

            for (const colName of targetCollections) {
                const collection = db.collection(colName);
                const result = await collection.deleteMany({});
                totalDeleted += result.deletedCount;
            }

            return await DiscordView.renderReply(message, `[訊息] 資料庫維護完成！已成功清空 \`docchunks\` 與 \`messages\` 資料表（共釋放 ${totalDeleted} 筆紀錄）。`);
        } catch (error) {
            return await DiscordView.renderError(message, `資料庫清空失敗，原因: ${error.message}`);
        }
    }

    /**
     * 盤點並列出目前儲存的文件資訊
     */
    static async listDocuments(message) {
        await message.channel.sendTyping();
        try {
            const db = mongoose.connection.db;
            const collection = db.collection('docchunks');
            
            const docsSummary = await collection.aggregate([
                { $group: { _id: "$fileName", chunkCount: { $sum: 1 }, guildId: { $first: "$guildId" } } }
            ]).toArray();

            if (docsSummary.length === 0) {
                return await DiscordView.renderReply(message, '[訊息] 目前知識庫內沒有任何儲存的文件。');
            }

            let replyText = `**【目前知識庫文件清單】** (共 ${docsSummary.length} 份文件)\n\`\`\``;
            docsSummary.forEach((doc, i) => {
                replyText += `${i + 1}. 檔案: ${doc._id} | 切片數: ${doc.chunkCount} | 伺服器: ${doc.guildId}\n`;
            });
            replyText += `\`\`\``;

            return await DiscordView.renderReply(message, replyText);
        } catch (error) {
            return await DiscordView.renderError(message, `無法讀取文件清單，原因: ${error.message}`);
        }
    }

    /**
     * 列出當前頻道的最近對話資料摘要
     */
    static async listMessages(message) {
        const sessionId = message.channel.id;
        await message.channel.sendTyping();
        try {
            const db = mongoose.connection.db;
            const collection = db.collection('messages');

            const history = await collection.find({ sessionId }).sort({ timestamp: -1 }).limit(10).toArray();

            if (history.length === 0) {
                return await DiscordView.renderReply(message, '[訊息] 當前頻道目前沒有任何歷史對話紀錄。');
            }

            const normalOrder = history.reverse();
            let replyText = `**【當前頻道最近 10 條對話紀錄摘要】**\n\`\`\``;
            normalOrder.forEach((msg, i) => {
                const snippet = msg.content.replace(/\n/g, ' ').substring(0, 30);
                const timeStr = new Date(msg.timestamp).toLocaleTimeString();
                replyText += `[${timeStr}] ${msg.role.toUpperCase()}: ${snippet}${msg.content.length > 30 ? '...' : ''}\n`;
            });
            replyText += `\`\`\``;

            return await DiscordView.renderReply(message, replyText);
        } catch (error) {
            return await DiscordView.renderError(message, `無法讀取對話紀錄，原因: ${error.message}`);
        }
    }
}