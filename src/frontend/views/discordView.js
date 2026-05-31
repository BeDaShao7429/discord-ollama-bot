import { EmbedBuilder } from 'discord.js';

export class DiscordView {
    /**
     * 渲染高階大模型對話回應（動態注入審計標籤）
     */
    static async renderStandardReply(message, apiResponse) {
        const { reply, audit } = apiResponse.data;

        const responseEmbed = new EmbedBuilder()
            .setColor('#2b2d31') // 亞光灰高規配色
            .setDescription(reply)
            .setTimestamp();

        // 🎯 介面強化：如果後端追蹤顯示觸發了歷史圖檔召回，動態將外框變更為高階綠色，並附帶量化指標
        if (audit && audit.triggeredRecall) {
            responseEmbed.setColor('#2ecc71')
                .setFooter({ 
                    text: `🔗 全鏈路自動召回資產: ${audit.recalledAsset} | 關聯強度: ${audit.relationStrength.toFixed(2)}` 
                });
        }

        return await message.reply({ embeds: [responseEmbed] });
    }

    /**
     * 渲染上傳成功後的基礎通知介面
     */
    static async renderUploadSuccess(message, fileData) {
        const successEmbed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setDescription(`[訊息] 檔案 \`${fileData.fileName}\` 已成功上傳並完成 RAG 向量特徵掛載。`)
            .setTimestamp();
        return await message.reply({ embeds: [successEmbed] });
    }

    /**
     * 渲染標準系統通道阻斷與異常錯誤呈現
     */
    static async renderError(message, errorText) {
        const errorEmbed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle('❌ 【系統通道阻斷】')
            .setDescription(errorText)
            .setTimestamp();
        return await message.reply({ embeds: [errorEmbed] });
    }
}