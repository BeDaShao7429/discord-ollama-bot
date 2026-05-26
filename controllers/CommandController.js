import { getSystemPrompt, saveSystemPrompt } from '../models/UserSetting.js'; 
import { clearConversationHistory } from '../models/Conversation.js'; 



export async function handleCommand(message, cleanContent, userId) {
  try {
    // 處理指令 [!clear]
    if (cleanContent.startsWith('!clear')) {
      await clearConversationHistory(userId);
      return message.reply('記憶已嚴謹清空，對話重置完成。');
    }

    // 處理指令 [!system]
    if (cleanContent.startsWith('!system')) {
      const newPrompt = cleanContent.replace('!system', '').trim();
      if (!newPrompt) {
        const currentPrompt = await getSystemPrompt(userId);
        return message.reply(`目前的 System Prompt 是：\n\`\`\`text\n${currentPrompt || '尚未設定'}\n\`\`\``);
      }
      await saveSystemPrompt(userId, newPrompt);
      return message.reply('[成功]System Prompt 設定完成，已同步至 MongoDB。');
    }
	
	// 處理指令 [!count]
    if (cleanContent.startsWith('!count')) {
      const { getChromaMemoryCount } = await import('../models/Conversation.js');
	  const Conversation = (await import('../models/Conversation.js')).default; // 🟢 這下子完全拿得到了！
      
      // 1. 撈出 MongoDB 資料
      const session = await Conversation.findOne({ userId });
      
      // 基礎數據宣告
      const mongoCount = session ? session.messages.length : 0;
      const summaryText = session && session.summary ? session.summary : '暫無長期摘要（對話尚未滿 30 筆）';
      
      // 2. 撈出 ChromaDB 長期記憶總數
      const chromaCount = await getChromaMemoryCount(userId);

      // 3. 計算記憶使用狀態 (狀態判定演算法)
      let usageStatus = '🟢 運作良好 (純淨無負擔)';
      if (mongoCount >= 25) {
        usageStatus = '🟡 接近臨界點 (下次對話即將觸發 30 筆批次記憶壓縮)';
      } else if (chromaCount > 5) {
        usageStatus = '🔵 深度思考模式 (已成功啟動超長期 RAG 記憶軌道)';
      } else if (mongoCount > 0) {
        usageStatus = '🟢 正常滾動中 (短期上下文記憶體極度健康)';
      }

      // 4. View 層格式化輸出 (精心編排的儀表板)
      const dashboard = [
        `🧠 **【AI 大腦核心記憶狀態儀表板】**`,
        `==================================`,
        `📊 **一、各類記憶筆數統計**`,
        `• ⚡ 短期記憶 (MongoDB) ： \`${mongoCount}\` 筆 / 30 筆上限`,
        `• 💾 超長期記憶 (ChromaDB)： \`${chromaCount}\` 個向量記憶區塊 (RAG)`,
        ``,
        `📝 **二、中期記憶簡單總結 (人生跑馬燈)**`,
        `\`\`\`text`,
        `${summaryText}`,
        `\`\`\``,
        `⚙️ **三、目前記憶使用狀態**`,
        `• 系統狀態： ${usageStatus}`,
        `• 記憶機制： \`滑動視窗 (Sliding Window) + 向量檢索 (RAG) 雙軌制\``,
        `==================================`
      ].join('\n');

      return message.reply(dashboard);
    }
  } catch (error) {
    console.error(`[CONTROLLER_ERROR] CommandController 執行失敗 (Command: ${cleanContent}):`, error);
    await message.reply('❌ 執行內部系統指令時發生資料庫讀寫異常。');
  }
  
  
}

