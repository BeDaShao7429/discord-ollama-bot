import mongoose from 'mongoose';

const imageSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, index: true },
    originalName: { type: String, required: true },
    base64Data: { type: String, required: true },
    // 🎯 圖檔名下的語意描述片段，直接掛在自己下面
    chunks: [{
        content: { type: String, required: true },
        embedding: { type: [Number], required: true }
    }],
    uploadedAt: { type: Date, default: Date.now }
});

const Image = mongoose.model('Image', imageSchema);

export class ImageModel {
    /**
     * 儲存圖檔與其下轄的描述片段
     */
    static async save(sessionId, originalName, base64Data, chunkTexts, embeddings) {
        const chunks = chunkTexts.map((text, i) => ({ content: text, embedding: embeddings[i] }));
        return await Image.create({ sessionId, originalName, base64Data, chunks });
    }

    /**
     * 依據 ID 獲取單個圖檔實體
     */
    static async getById(imageId) {
        return await Image.findById(imageId).lean();
    }

    /**
     * 獲取目前頻道內所有的圖檔描述片段，用於向量檢索
     */
    static async getAllChunks(sessionId) {
        const imgs = await Image.find({ sessionId }).lean();
        let chunksForSearch = [];

        imgs.forEach(img => {
            img.chunks.forEach(chunk => {
                chunksForSearch.push({
                    type: 'image',
                    assetId: img._id.toString(),
                    fileName: img.originalName,
                    content: chunk.content,
                    embedding: chunk.embedding
                });
            });
        });

        return chunksForSearch;
    }

    /**
     * 清空圖檔資料表
     */
    static async clear() {
        return await Image.deleteMany({});
    }
}