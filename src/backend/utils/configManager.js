/**
 * 🎯 記憶體單例配置管理器 (ConfigManager)
 * 負責全鏈路動態閾值、Top-K 參數的集中管控與動態調整
 */
class Configuration {
    constructor() {
        // 系統動態核心閾值預設參數
        this.settings = {
            topK: 3,                      // RAG 檢索文獻片段的最大召回數量
            similarityThreshold: 0.45,   // 餘弦相似度過濾閾值 (低於此分不引入上下文)
            imageRecallThreshold: 0.60    // 歷史圖檔實體定點召回的權重投票閾值
        };
    }

    /**
     * 讀取當前全局配置
     */
    get() {
        return this.settings;
    }

    /**
     * 動態調整參數 (供 AdminController 使用，如 $setconfig)
     * @param {string} key 
     * @param {string|number} value 
     */
    set(key, value) {
        if (this.settings[key] !== undefined) {
            // 嚴謹轉型：如果是數字欄位，自動解析為 Float
            const parsedValue = isNaN(value) ? value : parseFloat(value);
            this.settings[key] = parsedValue;
            console.log(`[${new Date().toISOString()}] [CONFIG] 參數 ${key} 已動態變更為: ${parsedValue}`);
            return true;
        }
        return false;
    }
}

// 🎯 導出唯一的單例實體，確保前後端或不同控制器讀取到的都是同一個記憶體配置
export const ConfigManager = new Configuration();