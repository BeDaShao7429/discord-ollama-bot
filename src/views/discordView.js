export class DiscordView {
    // 渲染標準 AI 回覆
    static async renderReply(message, text) {
        // Discord 單則訊息上限為 2000 字元
        if (text.length > 2000) {
            return await message.reply({
                content: '[訊息] 內容超出長度限制，已將完整回覆轉為文字檔提供：',
                files: [{ attachment: Buffer.from(text), name: 'gemma_response.txt' }]
            });
        }
        
        return await message.reply(text);
    }

    // 渲染錯誤提示 UI
    static async renderError(message, errorMessage) {
        return await message.reply(`❌ **【系統通知】** ${errorMessage}`);
    }
}
