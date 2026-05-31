import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import { DiscordView } from './views/discordView.js';

dotenv.config();

// 初始化最輕量化的 Discord 客戶端，僅配置必要的事件權限 (Intents)
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ]
});

/**
 * 監聽 Discord 頻道訊息事件
 */
client.on('messageCreate', async (message) => {
    // 嚴謹防禦：排除所有機器人自身的發言，防止無限迴圈
    if (message.author.bot) return;

    const botMentionPrefix = `<@!${client.user.id}>`;
    const isMentioned = message.content.includes(client.user.id);

    // 判定是否提及（Tag）本機器人
    if (isMentioned) {
        // 清洗字串，取得純粹的使用者提示詞
        const userPrompt = message.content.replace(botMentionPrefix, '').trim();
        
        // 🎯 【3秒超時防禦】：立刻向 Discord 宣告進程正在努力運算中
        // 這會讓聊天視窗顯示「機器人正在輸入中...」，並重置 Discord 的 3 秒超時計時器
        await message.channel.sendTyping();

        try {
            console.log(`[${new Date().toISOString()}] [FRONTEND] 轉發要求至後端核心引擎...`);

            // 🎯 跨網絡通訊：與資料庫完全解耦，封裝純粹的 JSON 數據送往後端
            const backendResponse = await fetch(`${process.env.BACKEND_URL}/api/v1/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: message.channel.id,
                    guildId: message.guildId,
                    userPrompt: userPrompt,
                    hasAttachment: message.attachments.size > 0
                })
            });

            if (!backendResponse.ok) {
                throw new Error(`後端核心引擎響應異常，狀態碼: ${backendResponse.status}`);
            }

            const result = await backendResponse.json();

            // 🎯 任務指派：將後端回傳的結構化數據，直接交由獨立的展示層進行華麗渲染
            await DiscordView.renderStandardReply(message, result);

        } catch (error) {
            console.error(`[ERROR] [Frontend Gateway] 通訊阻斷:`, error.stack);
            // 發生異常時，呼叫 View 層渲染標準的錯誤 Embed
            await DiscordView.renderError(message, `連線失敗，原因: ${error.message}`);
        }
    }
});

/**
 * 前端網關啟動生命週期
 */
client.login(process.env.DISCORD_TOKEN)
    .then(() => {
        console.log(`[${new Date().toISOString()}] [FRONTEND] Discord 展示網關已成功登入並開始監聽事件。`);
    })
    .catch(err => {
        console.error(`[CRITICAL] Discord 網關登入失敗:`, err.stack);
        process.exit(1);
    });