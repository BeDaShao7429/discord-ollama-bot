import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    fileName: { type: String, required: true },
    // 🎯 文檔名下的文字切片片段，直接掛在自己下面
    chunks: [{
        content: { type: String, required: true },
        embedding: { type: [Number], required: true }
    }],
    uploadedAt: { type: Date, default: Date.now }
});

const Document = mongoose.model('Document', documentSchema);

export class DocumentModel {
    /**
     * 儲存文檔與其下轄的文字切片片段
     */
    static async save(guildId, fileName, chunkTexts, embeddings) {
        const chunks = chunkTexts.map((text, i) => ({ content: text, embedding: embeddings[i] }));
        return await Document.create({ guildId, fileName, chunks });
    }

    /**
     * 獲取目前伺服器內所有的文檔切片片段，用於向量檢索
     */
    static async getAllChunks(guildId) {
        const docs = await Document.find({ guildId }).lean();
        let chunksForSearch = [];

        docs.forEach(doc => {
            doc.chunks.forEach(chunk => {
                chunksForSearch.push({
                    type: 'document',
                    assetId: doc._id.toString(),
                    fileName: doc.fileName,
                    content: chunk.content,
                    embedding: chunk.embedding
                });
            });
        });

        return chunksForSearch;
    }

    /**
     * 清空文檔資料表
     */
    static async clear() {
        return await Document.deleteMany({});
    }
}