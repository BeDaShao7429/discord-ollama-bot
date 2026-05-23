import { Client, GatewayIntentBits, Partials } from 'discord.js';
import ollama from 'ollama';
import mammoth from 'mammoth';
import jschardet from 'jschardet';
import mongoose from 'mongoose';
import 'dotenv/config';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

// ==========================================
// 1. MONGODB (NOSQL) DATA SCHEMA DESIGN
// ==========================================

// 使用者個別設定（例如 System Prompt）
const userSettingSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  systemPrompt: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
});
const UserSetting = mongoose.model('UserSetting', userSettingSchema);

// 對話歷史紀錄（採用 NoSQL 嵌套陣列設計，完美對齊 Ollama 核心格式）
const conversationSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  messages: [
    {
      role: { type: String, required: true },       // 'user' 或 'assistant'
      content: { type: String, required: true },
      images: [{ type: String }],                    // 支援多模態 Base64 圖片陣列
      timestamp: { type: Date, default: Date.now }
    }
  ],
  updatedAt: { type: Date, default: Date.now }
});
const Conversation = mongoose.model('Conversation', conversationSchema);

// ==========================================
// 2. DISCORD CLIENT INITIALIZATION
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // 必須在外掛後台同步開啟此特權意圖
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel] // 確保支援私訊監聽
});

// 設定大模型名稱
const MODEL_NAME = process.env.MODEL_NAME || 'gemma4:31b-cloud';

// ==========================================
// 3. CORE DATABASE ACCESS METHODS
// ==========================================

async function getSystemPrompt(userId) {
  const setting = await UserSetting.findOne({ userId });
  return setting ? setting.systemPrompt : '';
}

async function saveSystemPrompt(userId, prompt) {
  await UserSetting.findOneAndUpdate(
    { userId },
    { systemPrompt: prompt, updatedAt: Date.now() },
    { upsert: true, new: true }
  );
}

async function getChatHistory(userId) {
  const doc = await Conversation.findOne({ userId });
  if (!doc) return [];
  // 嚴謹限制記憶長度（最近 15 筆），防止脈絡窗口（Context Window）溢出
  return doc.messages.slice(-15).map(m => {
    const msg = { role: m.role, content: m.content };
    if (m.images && m.images.length > 0) msg.images = m.images;
    return msg;
  });
}

async function appendChatHistory(userId, role, content, images = []) {
  const updatePayload = {
    $push: { messages: { role, content, images, timestamp: new Date() } },
    $set: { updatedAt: new Date() }
  };
  await Conversation.findOneAndUpdate({ userId }, updatePayload, { upsert: true });
}

async function clearChatHistory(userId) {
  await Conversation.deleteOne({ userId });
}

// ==========================================
// 4. MULTI-FORMAT DOCUMENT UTILITIES
// ==========================================

async function parseDocument(attachment) {
  const response = await fetch(attachment.url);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const fileName = attachment.name.toLowerCase();

  if (fileName.endsWith('.pdf')) {
    const data = await pdf(buffer);
    return data.text;
  } else if (fileName.endsWith('.docx')) {
    const data = await mammoth.extractRawText({ buffer });
    return data.value;
  } else {
    const detected = jschardet.detect(buffer);
    const encoding = detected.encoding || 'utf-8';
    const decoder = new TextDecoder(encoding);
    return decoder.decode(buffer);
  }
}

// ==========================================
// 5. DISCORD EVENT LISTENERS
// ==========================================

client.once('ready', () => {
  console.log(`【成功】全功能文件兼容版機器人已上線：${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  // 嚴謹偵錯埋點：收到的任何文字都將在 PM2 日誌中現形
  console.log(`【內部訊號】來自 ${message.author.tag} 在頻道 ${message.channel.name || '私訊'}: ${message.content}`);

  if (message.author.bot) return;

  const userId = message.author.id;
  const isMentioned = message.mentions.has(client.user.id);
  const isDM = !message.guild;
  const isCommand = message.content.startsWith('!');

  // 僅響應提及、私訊或是特定指令
  if (!isMentioned && !isDM && !isCommand) return;

  let cleanContent = message.content.replace(`<@!${client.user.id}>`, '').replace(`<@${client.user.id}>`, '').trim();

  try {
    // 處理指令 [!clear]
    if (cleanContent.startsWith('!clear')) {
      await clearChatHistory(userId);
      return message.reply('🧹 記憶已嚴謹清空，對話重置完成。');
    }

    // 處理指令 [!system]
    if (cleanContent.startsWith('!system')) {
      const newPrompt = cleanContent.replace('!system', '').trim();
      if (!newPrompt) {
        const currentPrompt = await getSystemPrompt(userId);
        return message.reply(`目前的 System Prompt 是：\n\`\`\`text\n${currentPrompt || '尚未設定'}\n\`\`\``);
      }
      await saveSystemPrompt(userId, newPrompt);
      return message.reply('🎯 專屬 System Prompt 設定完成，已同步持久化至 MongoDB。');
    }

    // 開始處理對話邏輯
    await message.channel.sendTyping();

    let appendedContext = '';
    let imageBase64Array = [];

    // 處理附件（多模態圖片與文件解析）
    if (message.attachments.size > 0) {
      for (const [_, attachment] of message.attachments) {
        const ext = attachment.name.split('.').pop().toLowerCase();
        
        if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
          const imgResponse = await fetch(attachment.url);
          const imgBuffer = await imgResponse.arrayBuffer();
          const base64 = Buffer.from(imgBuffer).toString('base64');
          imageBase64Array.push(base64);
        } else if (['pdf', 'docx', 'txt', 'md', 'js', 'json'].includes(ext)) {
          try {
            const docText = await parseDocument(attachment);
            appendedContext += `\n\n【使用者附加的文字檔案內容 (${attachment.name})】:\n${docText}\n`;
          } catch (err) {
            console.error(`【警告】文件 ${attachment.name} 解析失敗:`, err);
            await message.reply(`❌ 無法讀取檔案 \`${attachment.name}\`，請確認檔案結構。`);
          }
        }
      }
    }

    const finalUserText = cleanContent + appendedContext;
    if (!finalUserText && imageBase64Array.length === 0) {
      return message.reply('❓ 請提供文字訊息、圖片或支援的文件檔案。');
    }

    // 將使用者當前輸入寫入 MongoDB 歷史
    await appendChatHistory(userId, 'user', finalUserText, imageBase64Array);

    // 建立發送給 Ollama 的完整 Context 陣列
    const messagesToSend = [];
    
    // 注入專屬 System Prompt
    const systemPrompt = await getSystemPrompt(userId);
    if (systemPrompt) {
      messagesToSend.push({ role: 'system', content: systemPrompt });
    }

    // 載入歷史對話
    const history = await getChatHistory(userId);
    messagesToSend.push(...history);

    // 呼叫 Ollama API
    const response = await ollama.chat({
      model: MODEL_NAME,
      messages: messagesToSend,
      stream: false
    });

    const aiReply = response.message.content;

    // 將 AI 的回覆寫入 MongoDB 歷史
    await appendChatHistory(userId, 'assistant', aiReply);

    // 嚴謹處理 Discord 2000 字元長度限制（長文字切片輸出）
    if (aiReply.length <= 2000) {
      await message.reply(aiReply);
    } else {
      for (let i = 0; i < aiReply.length; i += 2000) {
        await message.channel.send(aiReply.substring(i, i + 2000));
      }
    }

  } catch (error) {
    console.error('【系統崩潰性錯誤】異步程序執行失敗:', error);
    await message.reply('❌ 機器人核心通訊或資料庫讀寫發生異常，請聯絡管理員檢查日誌。');
  }
});

// ==========================================
// 6. ASYNC BOOTSTRAP (THE SAFE ROAD)
// ==========================================
async function bootstrap() {
  try {
    // 1. 強制確保 MongoDB 先連線成功
    mongoose.set('strictQuery', true);
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('【系統】MongoDB 連線並資料庫結構初始化完成。');

    // 2. 資料庫就緒後，才啟動 Discord Gateway 進行登入
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    console.error('【系統啟動失敗】致命性連線阻斷:', error);
    process.exit(1);
  }
}

bootstrap();
