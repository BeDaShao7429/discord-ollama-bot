import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, index: true },
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

export class MessageModel {
    // 儲存單條訊息
    static async saveMessage(sessionId, role, content) {
        return await Message.create({ sessionId, role, content });
    }

    // 取得最近 10 條歷史訊息（滑動視窗）
    static async getRecentContext(sessionId, limit = 10) {
        const history = await Message.find({ sessionId })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();
        
        // 反轉陣列使其符合時間正序
        return history.reverse().map(msg => ({
            role: msg.role,
            content: msg.content
        }));
    }
}
