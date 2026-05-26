import ollama from 'ollama';
import { getSystemPrompt } from '../models/UserSetting.js'; // 個人設定
import { getGlobalSystemPrompt } from '../models/GlobalSetting.js'; //全域設定
import { appendConversationHistory, manageMemoryAndGetHistory, queryLongTermMemory, saveToChroma } from '../models/Conversation.js'; 
import { parseDocument } from '../utils/docParser.js';

export async function handleCoreDialogue(message, cleanContent, userId, modelName) {
  try {
    await message.channel.sendTyping();

    let appendedContext = '';
    let imageBase64Array = [];

    // 處理附件 (多模態與文件)
    if (message.attachments.size > 0) {
      for (const [_, attachment] of message.attachments) {
        const ext = attachment.name.split('.').pop().toLowerCase();
        
        if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
          const imgResponse = await fetch(attachment.url);
          const imgBuffer = await imgResponse.arrayBuffer();
          imageBase64Array.push(Buffer.from(imgBuffer).toString('base64'));
        } else if (['pdf', 'docx', 'txt', 'md', 'js', 'json'].includes(ext)) {
          try {
            const docText = await parseDocument(attachment);
            appendedContext += `\n\n【使用者附加的文字檔案內容 (${attachment.name})】:\n${docText}\n`;
          } catch (err) {
            // 局部容錯：單一文件失敗，拋錯提示用戶，但不中斷整體主程序
            await message.reply(`[錯誤]無法讀取檔案 \`${attachment.name}\`，請確認檔案結構。`);
          }
        }
      }
    }

    const finalUserText = cleanContent + appendedContext;
    if (!finalUserText && imageBase64Array.length === 0) {
      return message.reply('[錯誤]請提供文字訊息、圖片或支援的文件檔案。');
    }

    // =======================================================
    // 🚀 軌道一：用戶發言處理 (MongoDB 短期歷史 + ChromaDB 即時向量)
    // =======================================================
    await appendConversationHistory(userId, 'user', finalUserText, imageBase64Array);
    if (cleanContent) {
      // 傳入純文字問題（cleanContent）建立索引，排除文件或多模態雜訊，RAG 檢索品質最好
      await saveToChroma(userId, 'user', cleanContent); 
    }

    // 2. 新增 RAG 檢索：用使用者當前說的話，去超長期向量庫裡撈取歷史細節
    const longTermMemoryContext = await queryLongTermMemory(userId, cleanContent);

    // 3. 建立發送給 Ollama 的 Context 陣列
    const messagesToSend = [];

    // A. 雙層語境融合：第一層 —— 注入「全域管理者設定的核心個性」
    const globalSystemPrompt = await getGlobalSystemPrompt();
    if (globalSystemPrompt) {
      messagesToSend.push({ 
        role: 'system', 
        content: `【核心人格與全域行為準則（不可違反）】:\n${globalSystemPrompt}` 
      });
    }

    // B. 雙層語境融合：第二層 —— 注入「個別用戶自訂個性」
    const userSystemPrompt = await getSystemPrompt(userId);
    if (userSystemPrompt) {
      messagesToSend.push({ role: 'system', content: `【用戶特殊偏好指引】:\n${userSystemPrompt}` });
    }

    // C. 中期記憶：摘要 (此處已回歸純粹的 MongoDB 壓縮，不處理向量)
    const { history, summary } = await manageMemoryAndGetHistory(userId, modelName);
    if (summary) {
      messagesToSend.push({ role: 'system', content: `【長期對話大綱摘要】：\n${summary}` });
    }

    // D. 超長期記憶（RAG 檢索）
    if (longTermMemoryContext) {
      messagesToSend.push({
        role: 'system',
        content: `【從向量資料庫檢索出來的歷史對話碎片（當用戶提及相關人事物時供你參考）：】\n${longTermMemoryContext}`
      });
    }

    // E. 短期對話歷史紀錄
    messagesToSend.push(...history.map(m => ({
      role: m.role,
      content: m.content,
      images: m.images
    })));


	// 4. 呼叫大模型核心 (改為 stream: true)
    console.log(`[AI_REQUEST] 正在向 ${modelName} 發送語境推理請求...`);
    const responseStream = await ollama.chat({
      model: modelName,
      messages: messagesToSend,
      stream: true // ✨ 開啟串流
    });

    let aiReply = '';
    let currentMessage = await message.reply('🧠 正在思考中...'); // 先發送緩衝訊息占位

    let lastUpdateTime = Date.now();
    for await (const chunk of responseStream) {
      aiReply += chunk.message.content;
      
      // 每隔 1 秒鐘更新一次 Discord 畫面，避免頻繁 API 呼叫被限制（Rate Limit）
      if (Date.now() - lastUpdateTime > 1000) {
        await currentMessage.edit(aiReply.substring(0, 2000));
        lastUpdateTime = Date.now();
      }
    }
    // 最終完整更新
    await currentMessage.edit(aiReply.substring(0, 2000));

    // 5. 寫入 AI 回覆 (雙軌落庫)
    await appendConversationHistory(userId, 'assistant', aiReply);
    await saveToChroma(userId, 'assistant', aiReply);
    console.log(`[AI_REQUEST] 正在向 ${modelName} 發送語境推理請求...`);
    const response = await ollama.chat({
      model: modelName,
      messages: messagesToSend,
      stream: false
    });

    // 不需要: const aiReply = response.message.content;

    // =======================================================
    // 🚀 軌道二：機器人回覆處理 (MongoDB 短期歷史 + ChromaDB 即時向量)
    // =======================================================
    await appendConversationHistory(userId, 'assistant', aiReply);
    await saveToChroma(userId, 'assistant', aiReply); // ✨ 立即寫入 ChromaDB

    // 6. View 層渲染輸出 (2000字切片)
    if (aiReply.length <= 2000) {
      await message.reply(aiReply);
    } else {
      console.log(`[VIEW_INFO] AI 回覆長度為 ${aiReply.length} 字，啟動自動切片輸出...`);
      for (let i = 0; i < aiReply.length; i += 2000) {
        await message.channel.send(aiReply.substring(i, i + 2000));
      }
    }

  } catch (error) {
    console.error(`[CORE_CONTROLLER_CRASH] handleCoreDialogue 發生致命中斷:`, error);
    await message.reply('[錯誤]機器人核心通訊或資料庫讀寫發生異常，請聯絡管理員檢查日誌。');
  }
}