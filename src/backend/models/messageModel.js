import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, index: true },
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    // 🎯 核心更動：由 message 去綁定與上傳或提及之圖檔/文檔的關係強度與關聯
    references: [{
        assetType: { type: String, enum: ['document', 'image'], required: true },
        assetId: { type: String, required: true },
        fileName: { type: String, required: true },
        associatedChunk: { type: String, required: true },
        relationStrength: { type: Number, required: true } // 儲存關聯強度（相似度分值）
    }],
    timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

export class MessageModel {
    /**
     * 儲存訊息，並明確綁定關聯資產的關係
     */
    static async save(sessionId, role, content, references = []) {
        return await Message.create({ sessionId, role, content, references });
    }

    static async getRecentContext(sessionId, limit = 6) {
        const history = await Message.find({ sessionId }).sort({ timestamp: -1 }).limit(limit).lean();
        return history.reverse().map(msg => ({ role: msg.role, content: msg.content }));
    }

    static async clear() {
        return await Message.deleteMany({});
    }
}