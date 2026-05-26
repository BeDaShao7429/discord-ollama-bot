import { Client, GatewayIntentBits } from 'discord.js';
import { connectDB } from './src/config/database.js';
import { handleMessage } from './src/routers/messageRouter.js';
import 'dotenv/config';

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// 初始化資料庫連線
await connectDB();

// 所有接收到的訊息，統一交由 Router 處理
client.on('messageCreate', async (message) => {
    await handleMessage(message);
});

client.login(process.env.DISCORD_TOKEN);
console.log('[系統] Discord 機器人已成功啟動並監聽事件');
