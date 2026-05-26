import mongoose from 'mongoose';

const GlobalSettingSchema = new mongoose.Schema({
  globalKey: { type: String, default: 'default', unique: true },
  globalSystemPrompt: { type: String, default: '你是一個嚴謹的 Discord 機器人助手。請一律使用繁體中文（台灣用語）進行專業的回覆。' },
  updatedAt: { type: Date, default: Date.now }
});

export const GlobalSetting = mongoose.model('GlobalSetting', GlobalSettingSchema);

/**
 * 讀取全域系統提示詞
 */
export async function getGlobalSystemPrompt() {
  try {
    const setting = await GlobalSetting.findOne({ globalKey: 'default' });
    return setting ? setting.globalSystemPrompt : '你是一個嚴謹的 Discord 機器人助手。請一律使用繁體中文（台灣用語）進行專業的回覆。';
  } catch (error) {
    console.error('[MODEL_ERROR] getGlobalSystemPrompt 失敗:', error);
    return '你是一個嚴謹的 Discord 機器人助手。請一律使用繁體中文（台灣用語）進行專業的回覆。';
  }
}

/**
 * 更新全域系統提示詞
 */
export async function saveGlobalSystemPrompt(prompt) {
  try {
    await GlobalSetting.findOneAndUpdate(
      { globalKey: 'default' },
      { globalSystemPrompt: prompt, updatedAt: Date.now() },
      { upsert: true, new: true }
    );
    console.log('[DB_INFO] 全域系統個性已更新並同步至 MongoDB。');
  } catch (error) {
    console.error('[MODEL_ERROR] saveGlobalSystemPrompt 失敗:', error);
    throw error;
  }
}

export default GlobalSetting;