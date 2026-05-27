import mongoose from 'mongoose';
import { DiscordView } from '../views/discordView.js';

export class AdminController {
    /**
     * 清空指定或所有的資料表
     */
    static async clearDatabase(message) {
        const timestamp = new Date().toISOString();
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

            console.log(`[${timestamp}] [ADMIN] 管理員執行清空資料庫成功，共刪除 ${totalDeleted} 筆資料。`);
            return await DiscordView.renderReply(message, `[訊息] 資料庫維護完成！已成功清空 \`docchunks\` 與 \`messages\` 資料表（共釋放 ${totalDeleted} 筆紀錄）。`);
        } catch (error) {
            console.error(`[${timestamp}] [ERROR] [AdminController] 清空失敗:`, error.stack);
            return await DiscordView.renderError(message, `資料庫清空失敗，原因: ${error.message}`);
        }
    }

    /**
     * 盤點並列出目前儲存的文件資訊
     */
    static async listDocuments(message) {
        const timestamp = new Date().toISOString();
        await message.channel.sendTyping();

        try {
            const db = mongoose.connection.db;
            const collection = db.collection('docchunks');
            
            // 使用群組化查詢（Aggregation），按檔案名稱歸類並計算切片數
            const docsSummary = await collection.aggregate([
                {
                    $group: {
                        _id: "$fileName",
                        chunkCount: { $sum: 1 },
                        guildId: { $first: "$guildId" }
                    }
                }
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
            console.error(`[${timestamp}] [ERROR] [AdminController] 列出文件失敗:`, error.stack);
            return await DiscordView.renderError(message, `無法讀取文件清單，原因: ${error.message}`);
        }
    }

    /**
     * 列出當前頻道的最近對話資料摘要
     */
    static async listMessages(message) {
        const timestamp = new Date().toISOString();
        const sessionId = message.channel.id;
        await message.channel.sendTyping();

        try {
            const db = mongoose.connection.db;
            const collection = db.collection('messages');

            // 撈取當前 channel 最近 10 條歷史紀錄
            const history = await collection.find({ sessionId })
                .sort({ timestamp: -1 })
                .limit(10)
                .toArray();

            if (history.length === 0) {
                return await DiscordView.renderReply(message, '[訊息] 當前頻道目前沒有任何歷史對話紀錄。');
            }

            // 反轉回正序排列
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
            console.error(`[${timestamp}] [ERROR] [AdminController] 列出對話失敗:`, error.stack);
            return await DiscordView.renderError(message, `無法讀取對話紀錄，原因: ${error.message}`);
        }
    }
}