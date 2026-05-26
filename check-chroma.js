import { ChromaClient } from 'chromadb';

// 初始化連線 (對齊新版 SDK 規範)
const chroma = new ChromaClient({ 
  host: "127.0.0.1", 
  port: 8000 
});

async function inspectChromaVectors() {
  try {
    console.log('🔍 [CHROMA_INSPECT] 正在向本地 ChromaDB 容器建立連線...');
    
    const collections = await chroma.listCollections();
    console.log(`📋 [CHROMA_RESULT] 目前資料庫內總共有 ${collections.length} 個集合。`);

    if (collections.length === 0) {
      console.log('❌ 警告：ChromaDB 內目前沒有任何集合！請先去 Discord 與機器人對話產生新記憶。');
      return;
    }

    for (const col of collections) {
      console.log(`\n--------------------------------------------------`);
      console.log(`👤 發現用戶集合名稱: [ ${col.name} ]`);
      
      const collectionInstance = await chroma.getCollection({ name: col.name });
      const count = await collectionInstance.count();
      console.log(`• 🔢 向量總數為: ${count} 筆`);

      // 🎯 核心關鍵：明確指定 include 參數，強制 ChromaDB 吐出大腦的向量值
      const rawData = await collectionInstance.get({
        include: ["embeddings", "documents", "metadatas"]
      });

      console.log(`• 📑 內部真實資料結構（含完整向量值）：`);
      console.log(JSON.stringify(rawData, null, 2));
    }

  } catch (error) {
    console.error('💥 [CHROMA_FATAL_ERROR] 無法讀取 ChromaDB 數據:', error.message);
  }
}

inspectChromaVectors();
