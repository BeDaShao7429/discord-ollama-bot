import mongoose from 'mongoose';

const docChunkSchema = new mongoose.Schema({
    guildId: { type: String, required: true, index: true },
    fileName: { type: String, required: true },
    content: { type: String, required: true },
    embedding: { type: [Number], required: true }, // 🎯 儲存 768 維度向量
    createdAt: { type: Date, default: Date.now }
});

const DocChunk = mongoose.model('DocChunk', docChunkSchema);

export class DocumentModel {
    /**
     * 持久化儲存文檔切片與向量值
     */
    static async saveChunk(guildId, fileName, content, embedding) {
        return await DocChunk.create({ guildId, fileName, content, embedding });
    }

    /**
     * 核心 RAG 檢索：計算餘弦相似度分值，跨文檔撈出關聯度最高的前 N 個片段
     */
    static async findSimilarChunks(guildId, queryEmbedding, limit = 3) {
        const chunks = await DocChunk.find({ guildId }).lean();
        if (chunks.length === 0) return [];
        
        // 餘弦相似度數學公式實作
        const calculateSimilarity = (v1, v2) => {
            if (!v1 || !v2 || v1.length !== v2.length) return 0;
            const dotProduct = v1.reduce((sum, val, i) => sum + val * v2[i], 0);
            const mag1 = Math.sqrt(v1.reduce((sum, val) => sum + val * val, 0));
            const mag2 = Math.sqrt(v2.reduce((sum, val) => sum + val * val, 0));
            if (mag1 === 0 || mag2 === 0) return 0;
            return dotProduct / (mag1 * mag2);
        };

        // 計算分值並降序排序，截取前 limit 筆
        return chunks
            .map(chunk => ({
                ...chunk,
                similarity: calculateSimilarity(queryEmbedding, chunk.embedding)
            }))
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, limit);
    }
}
