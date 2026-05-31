import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { backendRouter } from './routes/router.js';

dotenv.config();

const app = express();
const PORT = process.env.BACKEND_PORT || 3000;

// 安全防禦：嚴謹限制進程快取體積，防止巨大圖檔撐爆記憶體
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 掛載經典 MVC 路由
app.use('/api/v1', backendRouter);

/**
 * 資料庫安全連線與服務生命周期控管
 */
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log(`[${new Date().toISOString()}] [BACKEND] MongoDB 數據庫連線成功。`);
        app.listen(PORT, () => {
            console.log(`[${new Date().toISOString()}] [BACKEND] 經典 MVC 核心引擎已啟動於通訊埠 ${PORT}`);
        });
    })
    .catch(err => {
        console.error(`[CRITICAL] 後端核心啟動中斷:`, err.stack);
        process.exit(1);
    });