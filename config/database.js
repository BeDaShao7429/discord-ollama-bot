import mongoose from 'mongoose';

export async function connectDatabase() {
  try {
    mongoose.set('strictQuery', true);
    console.log('[DB_INFO] 正在嘗試建立 MongoDB 連線...');
    
    await mongoose.connect(process.env.MONGODB_URI);
    
    console.log('[DB_SUCCESS] MongoDB 連線並資料庫結構初始化完成。');
  } catch (error) {
    console.error('[DB_FATAL] 資料庫連線失敗，阻斷程序啟動:', error.message);
    throw error;
  }
}