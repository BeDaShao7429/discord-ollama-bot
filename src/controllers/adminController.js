import { MessageModel } from '../models/messageModel.js';
import { DocumentModel } from '../models/documentModel.js';
import { ImageModel } from '../models/imageModel.js'; 
import { ConfigManager } from '../utils/configManager.js'; // 🎯 引入動態配置
import { DiscordView } from '../views/discordView.js';
import mongoose from 'mongoose';

export class AdminController {
    static async handleCommand(message, commandStr) {
        const [cmd, param1, param2] = commandStr.trim().split(/\s+/);
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [ADMIN] 執行安全維護鏈路: "${commandStr}"`);

        // 支援帶參數的指令解析 (例如: $setconfig topK 5)
        switch (cmd) {
            case '$help':      return await this.showHelp(message);
            case '$clear':     return await this.clearDatabase(message);
            case '$listdoc':   return await this.listDocuments(message);
            case '$listmsg':   return await this.listMessages(message);
            case '$setconfig': return await this.adjustConfig(message, param1, param2);
            default:           return await DiscordView.renderError(message, `未知指令: \`${cmd}\`。`);
        }
    }

    static async showHelp(message) {
        let helpText = `**【🤖 系統高階追蹤與調整指令清單】**\n`;
        helpText += `系統已升級資產全鏈路追蹤與動態參數微調能力：\n\n`;
        helpText += `> \`$listdoc\` : 追蹤資產。深層盤點文件與圖檔實體、切片長度與關聯 ID。\n`;
        helpText += `> \`$listmsg\` : 追蹤訊息。審計最近 10 條訊息與資產的綁定關係、量化引用強度。\n`;
        helpText += `> \`$setconfig [參數] [數值]\` : 調整功能。即時修正檢索核心參數。\n`;
        helpText += `   *可用參數：\`similarityThreshold\` (0~1), \`imageRecallThreshold\` (0~2), \`topK\` (1~10)*\n`;
        helpText += `> \`$clear\` : ⚠️ 物理清理。強制清空所有圖檔、文檔與歷史訊息。`;
        return await DiscordView.renderReply(message, helpText);
    }

    /**
     * 🎯 調整功能：即時動態參數微調
     */
    static async adjustConfig(message, key, value) {
        if (!key || !value) return await DiscordView.renderError(message, '指令格式錯誤。範例: `$setconfig topK 5`');
        
        const success = ConfigManager.set(key, value);
        if (success) {
            const current = ConfigManager.get();
            return await DiscordView.renderReply(message, `[訊息] 系統參數調整成功！\n\`\`\`json\n${JSON.stringify(current, null, 2)}\n\`\`\``);
        } else {
            return await DiscordView.renderError(message, `參數 \`${key}\` 不存在或非法。`);
        }
    }

    /**
     * 🎯 追蹤功能：深層文檔與圖檔資產全鏈路追蹤
     */
    static async listDocuments(message) {
        const sessionId = message.channel.id;
        await message.channel.sendTyping();
        try {
            const db = mongoose.connection.db;
            const docCollection = db.collection('documents');
            const imgCollection = db.collection('images');

            // 1. 追蹤常規文檔
            const docsSummary = await docCollection.aggregate([
                { $project: { fileName: 1, chunkCount: { $size: "$chunks" }, charLength: { $sum: { $map: { input: "$chunks", as: "c", in: { $strLenCP: "$$c.content" } } } } } }
            ]).toArray();

            // 2. 追蹤多模態圖檔與描述
            const imgsSummary = await imgCollection.aggregate([
                { $project: { originalName: 1, chunkCount: { $size: "$chunks" }, base64Size: { $strLenCP: "$base64Data" } } }
            ]).toArray();

            if (docsSummary.length === 0 && imgsSummary.length === 0) {
                return await DiscordView.renderReply(message, '[訊息] 系統核心內目前無任何存檔之文檔或圖檔資產。');
            }

            let replyText = `**【📊 系統核心資產深層追蹤報告】**\n`;
            
            if (docsSummary.length > 0) {
                replyText += `\n**📄 已掛載文字文檔 (${docsSummary.length} 份):**\n\`\`\``;
                docsSummary.forEach((doc, i) => {
                    replyText += `${i + 1}. [文檔] ${doc.fileName} -> 獨立切片: ${doc.chunkCount} 節點 | 總特徵字數: ${doc.charLength} 字\n`;
                });
                replyText += `\`\`\``;
            }

            if (imgsSummary.length > 0) {
                replyText += `\n**🖼️ 已掛載視覺圖檔 (${imgsSummary.length} 份):**\n\`\`\``;
                imgsSummary.forEach((img, i) => {
                    const mbSize = (img.base64Size / (1024 * 1024)).toFixed(2);
                    replyText += `${i + 1}. [圖檔] ${img.originalName} -> 描述片段: ${img.chunkCount} 節點 | 實體體積: ${mbSize} MB\n`;
                });
                replyText += `\`\`\``;
            }

            return await DiscordView.renderReply(message, replyText);
        } catch (error) {
            return await DiscordView.renderError(message, `資產追蹤失敗: ${error.message}`);
        }
    }

    /**
     * 🎯 追蹤功能：追蹤訊息與資產的關聯與強度審計
     */
    static async listMessages(message) {
        const sessionId = message.channel.id;
        await message.channel.sendTyping();
        try {
            const db = mongoose.connection.db;
            const collection = db.collection('messages');
            const currentCfg = ConfigManager.get();

            const history = await collection.find({ sessionId }).sort({ timestamp: -1 }).limit(10).toArray();
            if (history.length === 0) return await DiscordView.renderReply(message, '[訊息] 頻道內無歷史紀錄。');

            const normalOrder = history.reverse();
            let replyText = `**【🔗 歷史訊息與資產關聯強度追蹤】**\n`;
            replyText += `*目前判定門檻：檢索相似度 >= ${currentCfg.similarityThreshold} | 圖檔召回權重 >= ${currentCfg.imageRecallThreshold}*\n\n`;
            
            normalOrder.forEach((msg) => {
                const snippet = msg.content.replace(/\n/g, ' ').substring(0, 30);
                const timeStr = new Date(msg.timestamp).toLocaleTimeString();
                
                replyText += `\`[${timeStr}] ${msg.role.toUpperCase()}\`: ${snippet}${msg.content.length > 30 ? '...' : ''}\n`;
                
                if (msg.references && msg.references.length > 0) {
                    msg.references.forEach(ref => {
                        const status = ref.relationStrength >= currentCfg.imageRecallThreshold ? '🔥 [觸發召回]' : '❄️ [低於閾值]';
                        replyText += ` └── 🔗 關聯 [${ref.assetType.toUpperCase()}] \`${ref.fileName}\` | 關聯強度: ${ref.relationStrength.toFixed(2)} | 狀態: ${status}\n`;
                    });
                }
            });

            return await DiscordView.renderReply(message, replyText);
        } catch (error) {
            return await DiscordView.renderError(message, `訊息鏈路追蹤失敗: ${error.message}`);
        }
    }

    static async clearDatabase(message) {
        await message.channel.sendTyping();
        try {
            const resDoc = await DocumentModel.clear();
            const resImg = await ImageModel.clear();
            const resMsg = await MessageModel.clear();
            const totalDeleted = (resDoc.deletedCount || 0) + (resImg.deletedCount || 0) + (resMsg.deletedCount || 0);
            return await DiscordView.renderReply(message, `[訊息] 數據物理清空完成，共釋放 ${totalDeleted} 筆紀錄。`);
        } catch (error) {
            return await DiscordView.renderError(message, `清空失敗: ${error.message}`);
        }
    }
}