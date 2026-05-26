import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { connectDatabase } from './config/database.js';
import { handleCommand } from './controllers/CommandController.js';
import { handleCoreDialogue } from './controllers/DiscordController.js';
import 'dotenv/config';

// 1. 初始化用戶端設定
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

const MODEL_NAME = process.env.MODEL_NAME || 'gemma4:31b-cloud';

// 2. 註冊事件監聽
client.once('clientReady', () => {
  console.log(`[SYS_SUCCESS] discord_ollama_bot 已成功在 Gateway 上線：${client.user.tag}`);
});

// 監聽事件發生
client.on('messageCreate', async (message) => {
  console.log(`[MSG_RCV] 來自 ${message.author.tag} 在 ${message.channel.name || '私訊'}: ${message.content}`);

  if (message.author.bot) return;

  const userId = message.author.id;
  const isMentioned = message.mentions.has(client.user.id);
  const isDM = !message.guild;
  
  const cleanContent = message.content.replace(`<@!${client.user.id}>`, '').replace(`<@${client.user.id}>`, '').trim();
  
  // 用清洗後的 cleanContent 來判定是否為指令
  const isCommand = cleanContent.startsWith('!');
  console.log(`[路由偵測] isCommand 判定結果: ${isCommand}`); // 這時就會精準印出 true
  
  if (!isMentioned && !isDM && !isCommand) return;
  // 根據意圖路由到不同的 Controller
  
  try {
	// 根據意圖進行嚴謹路由，並確保指令處理完後有 return 阻斷
	if (isCommand) {
	  // system controller
	  await handleCommand(message, cleanContent, userId);
	  return; //early return
	} else {
	  // 不是指令的純聊天或文件上傳，放行給 DC Controller
	  await handleCoreDialogue(message, cleanContent, userId, MODEL_NAME);
	}
  } catch (error) {
    console.error('【系統崩潰性錯誤】異步程序執行失敗:', error);
    await message.reply('[錯誤]機器人核心通訊或資料庫讀寫發生異常，請聯絡管理員檢查日誌。');
  }
});


// 3. MVC Bootstrap 啟動器
async function bootstrap() {
  try {
    // 強制完成資料庫握手
    await connectDatabase();
    
    // 登入 Discord
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    console.error('[BOOTSTRAP_FATAL] 系統啟動鏈發生連線阻斷，進程強制終止:', error.message);
    process.exit(1);
  }
}

bootstrap();