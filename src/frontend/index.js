import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import { DiscordView } from './views/discordView.js';

dotenv.config();

// 🎯 初始化輕量化 Discord 客戶端，僅配置必要的事件權限 (Intents)
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ]
});

/**
 * 監聽 Discord 頻道訊息事件核心入口
 */
client.on('messageCreate', async (message) => {
    // 嚴謹防禦：排除所有機器人自身的發言，防止無限迴圈
    if (message.author.bot) return;

    const botMentionPrefix = `<@!${client.user.id}>`;
    const isMentioned = message.content.includes(client.user.id);
    const hasAdminPrefix = message.content.trim().startsWith('$');

    // 判定觸發條件：被提及（Tag）或是輸入了管理員維護指令（$ 開頭）
    if (isMentioned || hasAdminPrefix) {
        
        // 清洗字串，取得純粹的指令或提示詞
        const userPrompt = message.content.replace(botMentionPrefix, '').trim();
        
        // 🎯 【3秒超時防禦】：立刻向 Discord 宣告進程正在努力運算中
        // 這會讓聊天視窗顯示「機器人正在輸入中...」，並重置 Discord 的 3 秒超時計時器
        await message.channel.sendTyping();

        try {
            // =================================================================
            // 🎯 分流一：高階系統維護指令攔截線 ($help, $clear, $listdoc, $listmsg, $setconfig)
            // =================================================================
            if (userPrompt.startsWith('$')) {
                console.log(`[${new Date().toISOString()}] [FRONTEND] 攔截到系統維護指令: "${userPrompt}"，轉發至後端安全端點...`);

                const adminResponse = await fetch(`${process.env.BACKEND_URL}/api/v1/admin/command`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        commandStr: userPrompt,
                        sessionId: message.channel.id,
                        guildId: message.guildId
                    })
                });

                if (!adminResponse.ok) {
                    throw new Error(`後端管理員維護通道響應異常，狀態碼: ${adminResponse.status}`);
                }

                const adminResult = await adminResponse.json();
                
                // 指派給 View 層進行專屬的追蹤/調整報告渲染
                return await DiscordView.renderAdminResult(message, adminResult);
            }

            // =================================================================
            // 🎯 分流二：常規對話與 RAG 檢索推理流程
            // =================================================================
            console.log(`[${new Date().toISOString()}] [FRONTEND] 轉發常規對話要求至後端核心引擎...`);

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
                throw new Error(`後端核心引擎推理響應異常，狀態碼: ${backendResponse.status}`);
            }

            const result = await backendResponse.json();

            // 任務指派：將後端回傳的結構化數據，直接交由展示層進行華麗渲染
            await DiscordView.renderStandardReply(message, result);

        } catch (error) {
            console.error(`[ERROR] [Frontend Gateway] 通訊阻斷:`, error.stack);
            // 發生網路層或核心阻斷異常時，呼召 View 層渲染標準錯誤 Embed
            await DiscordView.renderError(message, `連線失敗，原因: ${error.message}`);
        }
    }
});

/**
 * 前端網關啟動生命週期管控制
 */
client.login(process.env.DISCORD_TOKEN)
    .then(() => {
        console.log(`[${new Date().toISOString()}] [FRONTEND] Discord 展示網關已成功登入並開始監聽事件。`);
    })
    .catch(err => {
        console.error(`[CRITICAL] Discord 網關登入失敗:`, err.stack);
        process.exit(1); // 發生網關致命故障時嚴謹退出進程
    });