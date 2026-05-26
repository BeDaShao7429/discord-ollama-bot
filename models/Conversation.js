import mongoose from 'mongoose';
import ollama from 'ollama';
import { ChromaClient } from 'chromadb'; // ✨ 1. 嚴謹引入 ChromaDB 官方客戶端

// ✨ 2. 初始化與最新官方 SDK 規範對齊的連線（修復 path 棄用警告）
const chroma = new ChromaClient({ 
  host: "127.0.0.1", 
  port: 8000 
});

const ConversationSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  summary: { type: String, default: "" },
  messages: [{
    role: { type: String, required: true },
    content: { type: String, required: true },
    images: { type: [String], default: undefined },
    timestamp: { type: Date, default: Date.now }
  }],
  updatedAt: { type: Date, default: Date.now }
});

export const Conversation = mongoose.model('Conversation', ConversationSchema);

/**
 * 🚀 新增：單筆對話產生時，即時轉化為向量並落入 ChromaDB
 * 這樣一來，ChromaDB 的資料就會隨著聊天即時遞增，完全不需枯等滿 30 筆的限制
 */
export async function saveToChroma(userId, role, content) {
  try {
    // A. 呼叫 Ollama 生成單筆對話的「向量 (Embedding)」
    const embedResponse = await ollama.embeddings({
      model: 'nomic-embed-text',
      prompt: content
    });
    const vector = embedResponse.embedding;

    if (!vector || !Array.isArray(vector)) {
      throw new Error('Ollama 未能生成有效的向量陣列');
    }

    // B. 獲取該用戶的專屬向量集合
    const collection = await chroma.getOrCreateCollection({ name: `user_memory_${userId}` });

    // C. 對齊新版 SDK 格式進行強固寫入
    const timestampStr = new Date().toISOString();
    const uniqueId = `mem_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const roleText = role === 'user' ? '用戶' : '機器人';

    await collection.add({
      ids: [String(uniqueId)],
      embeddings: [vector],
      metadatas: [{ timestamp: timestampStr, role: role }],
      documents: [String(`${roleText}: ${content}`)]
    });

    console.log(`[RAG_SUCCESS] 成功將單筆 ${roleText} 對話即時建立索引並寫入 ChromaDB 容器。`);
  } catch (error) {
    console.error(`❌ [RAG_WRITE_ERROR] 單筆對話即時寫入 ChromaDB 失敗:`, error.message);
  }
}

/**
 * MongoDB 歷史紀錄追增
 */
export async function appendConversationHistory(userId, role, content, images = []) {
  try {
    const updatePayload = {
      $push: { 
        messages: { 
          role, 
          content, 
          images: images.length > 0 ? images : undefined,
          timestamp: new Date() 
        } 
      },
      $set: { updatedAt: new Date() }
    };
    await Conversation.findOneAndUpdate({ userId }, updatePayload, { upsert: true });
  } catch (error) {
    console.error(`[MODEL_ERROR] appendConversationHistory 失敗 (User: ${userId}, Role: ${role}):`, error);
    throw error;
  }
}

/**
 * 記憶與向量庫同步清空
 */
export async function clearConversationHistory(userId) {
  try {
    // 1. 清除 MongoDB
    await Conversation.deleteOne({ userId });
    
    // 2. 同步摧毀 ChromaDB 裡的向量集合
    try {
      await chroma.deleteCollection({ name: `user_memory_${userId}` });
    } catch (e) {
      // 若本來就沒有向量庫，靜默跳過
    }
    
    console.log(`[DB_INFO] 記憶與 RAG 向量庫已同步清空 (User: ${userId})`);
  } catch (error) {
    console.error(`[MODEL_ERROR] clearConversationHistory 失敗 (User: ${userId}):`, error);
    throw error;
  }
}

/**
 * ⚡ 滑動視窗機制：此處功能已回歸純粹！
 * 當短期記憶滿了 30 筆，純粹負責 MongoDB 的瘦身與中期摘要更新，不再分心處理向量寫入。
 */
export async function manageMemoryAndGetHistory(userId, modelName) {
  try {
    let session = await Conversation.findOne({ userId });
    if (!session) return { history: [], summary: "" };

    if (session.messages.length >= 30) {
      console.log(`[MEMORY_OPTIMIZE] 用戶 ${userId} 短期記憶達 ${session.messages.length} 筆，啟動批次壓縮...`);

      const discardedMessages = session.messages.slice(0, 10);
      const textToSummarize = discardedMessages
        .map(m => `${m.role === 'user' ? '用戶' : '機器人'}: ${m.content}`)
        .join('\n');

      try {
        const response = await ollama.chat({
          model: modelName,
          messages: [{
            role: 'user',
            content: `你是一個嚴謹的記憶管理助手。請將「新對話內容」提煉出核心事實、重要決策或用戶偏好，並融合到「既有摘要」中，整合成一段不超過150字的繁體中文客觀大綱。\n\n[既有摘要]:\n${session.summary || '暫無舊摘要'}\n\n[新對話內容]:\n${textToSummarize}\n\n[融合後的全新總結摘要]:`
          }],
          stream: false
        });

        const newSummary = response.message.content.trim();

        await Conversation.updateOne(
          { userId },
          { 
            $set: { summary: newSummary },
            $pull: { messages: { _id: { $in: discardedMessages.map(m => m._id) } } }
          }
        );

        session.summary = newSummary;
        session.messages = session.messages.slice(10);
        console.log(`[MEMORY_SUCCESS] 用戶 ${userId} 摘要壓縮完成，短期記憶釋放回 ${session.messages.length} 筆。`);
      } catch (err) {
        console.error(`[MEMORY_CORE_CRASH] Ollama 摘要生成或寫入中斷 (User: ${userId}):`, err.message);
      }
    }

    return { history: session.messages, summary: session.summary };
  } catch (error) {
    console.error(`[MODEL_ERROR] manageMemoryAndGetHistory 執行失敗 (User: ${userId}):`, error);
    throw error;
  }
}

/**
 * RAG 語意检索
 */
export async function queryLongTermMemory(userId, currentQuery) {
  try {
    const embedResponse = await ollama.embeddings({
      model: 'nomic-embed-text',
      prompt: currentQuery
    });
    const queryVector = embedResponse.embedding;

    const collection = await chroma.getOrCreateCollection({ name: `user_memory_${userId}` });
    const result = await collection.query({
      queryEmbeddings: [queryVector],
      nResults: 2
    });

    if (result && result.documents && result.documents[0].length > 0) {
      console.log(`[RAG_RETRIEVE] 成功檢索到 ${result.documents[0].length} 條相關的長期歷史記憶。`);
      return result.documents[0].join('\n---\n');
    }
    return "";
  } catch (error) {
    console.warn(`[RAG_WARN] 檢索長期記憶時發生非致命異常 (可能尚未有長期記憶):`, error.message);
    return "";
  }
}

/**
 * 大腦儀表板專用：查詢 ChromaDB 中的長期記憶片段總數
 */
export async function getChromaMemoryCount(userId) {
  try {
    const collection = await chroma.getOrCreateCollection({ name: `user_memory_${userId}` });
    const count = await collection.count();
    console.log(`[RAG_DEBUG] 成功從 ChromaDB 讀取用戶 ${userId} 的向量總數: ${count}`);
    return count;
  } catch (error) {
    console.warn(`[RAG_COUNT_WARN] 讀取 ChromaDB 數量失敗（可能集合尚未建立）:`, error.message);
    return 0;
  }
}

export default Conversation;