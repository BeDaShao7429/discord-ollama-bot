// src/utils/configManager.js
export class ConfigManager {
    static #config = {
        similarityThreshold: 0.45, // 核心檢索關聯門檻
        imageRecallThreshold: 0.50, // 圖檔召回強度門檻
        topK: 4                     // 檢索片段最大拉取數
    };

    static get() { return this.#config; }

    static set(key, value) {
        if (key in this.#config) {
            this.#config[key] = parseFloat(value);
            return true;
        }
        return false;
    }
}