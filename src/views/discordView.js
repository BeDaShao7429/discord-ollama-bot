export class DiscordView {
    /**
     * 專職渲染文檔上傳成功的畫面
     * @param {Object} message - Discord 原始訊息物件
     * @param {Object} data - Controller 交付的純數據物件 ({ fileName, chunkCount })
     */
    static async renderUploadSuccess(message, data) {
        // 🎯 確保這裡有正確使用 \`${data.fileName}\` 與 \`${data.chunkCount}\` 進行動態變數注入
        const uiText = `✅ **【知識庫更新成功】**\n` +
                       `已成功研讀並索引文件：\`${data.fileName}\`\n` +
                       `本案共計成功切碎並建立 \`${data.chunkCount}\` 個知識節點（Chunks）。\n\n` +
                       `現在您可以直接標記我，並針對此文件的內容進行精確提問！`;
        
        return await message.reply(uiText);
    }

    /**
     * 渲染標準 AI 對話回覆
     */
    static async renderReply(message, text) {
        if (text.length > 2000) {
            return await message.reply({
                content: '⚠️ **【訊息通知】** 內容超出長度限制，已轉為文字檔提供：',
                files: [{ attachment: Buffer.from(text), name: 'gemma_response.txt' }]
            });
        }
        return await message.reply(text);
    }

    /**
     * 渲染錯誤提示 UI
     */
    static async renderError(message, errorMessage) {
        return await message.reply(`❌ **【系統異常】** ${errorMessage}`);
    }
}
