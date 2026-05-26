import mongoose from 'mongoose';

export async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('[資料庫] MongoDB 連線成功');
    } catch (error) {
        console.error('[資料庫] 連線失敗:', error);
        process.exit(1);
    }
}
