import { MessageModel } from '../models/messageModel.js';
import { DocumentModel } from '../models/documentModel.js';
import { ImageModel } from '../models/imageModel.js'; 
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
     * 清空資料庫重置環境
     */
    static async clearDatabase(message) {
        await message.channel.sendTyping();
        try {
            const resDoc = await DocumentModel.clear();
            const resImg = await ImageModel.clear();
            const resMsg = await MessageModel.clear();

            const totalDeleted = (resDoc.deletedCount || 0) + (resImg.deletedCount || 0) + (resMsg.deletedCount || 0);

            return await DiscordView.renderReply(message, `[訊息] 資料庫維護完成！三大對齊模型（Image, Document, Message）已完全洗淨重置（共釋放 ${totalDeleted} 筆主體紀錄）。`);
        } catch (error) {
            return await DiscordView.renderError(message, `環境重置失敗，原因: ${error.message}`);
        }
    }

    /**
     * 盤點知識庫文檔清單
     */
    static async listDocuments(message) {
        await message.channel.sendTyping();
        try {
            const db = mongoose.connection.db;
            const collection = db.collection('documents'); 
            
            const docsSummary = await collection.aggregate([
                { $project: { fileName: 1, guildId: 1, chunkCount: { $size: "$chunks" } } }
            ]).toArray();

            if (docsSummary.length === 0) {
                return await DiscordView.renderReply(message, '[訊息] 目前知識庫內沒有任何儲存的文檔資產。');
            }

            let replyText = `**【目前知識庫文檔資產清單】** (共 ${docsSummary.length} 份文檔)\n\`\`\``;
            docsSummary.forEach((doc, i) => {
                replyText += `${i + 1}. 檔案: ${doc.fileName} | 內部切片數: ${doc.chunkCount} | 伺服器: ${doc.guildId}\n`;
            });
            replyText += `\`\`\``;

            return await DiscordView.renderReply(message, replyText);
        } catch (error) {
            return await DiscordView.renderError(message, `無法讀取文檔清單，原因: ${error.message}`);
        }
    }

    /**
     * 列出對話摘要與資產關聯審計
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
            let replyText = `**【頻道最近對話紀錄與資產強度審計】**\n`;
            
            normalOrder.forEach((msg, i) => {
                const snippet = msg.content.replace(/\n/g, ' ').substring(0, 25);
                const timeStr = new Date(msg.timestamp).toLocaleTimeString();
                
                replyText += `\`[${timeStr}] ${msg.role.toUpperCase()}\`: ${snippet}${msg.content.length > 25 ? '...' : ''}\n`;
                
                if (msg.references && msg.references.length > 0) {
                    msg.references.forEach(ref => {
                        replyText += ` └── 🔗 關聯 [${ref.assetType.toUpperCase()}] \`${ref.fileName}\` | 強度: ${ref.relationStrength.toFixed(2)}\n`;
                    });
                }
            });

            return await DiscordView.renderReply(message, replyText);
        } catch (error) {
            return await DiscordView.renderError(message, `無法讀取對話紀錄，原因: ${error.message}`);
        }
    }
}