import mongoose from 'mongoose';

const userSettingSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  systemPrompt: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now }
});

const UserSetting = mongoose.model('UserSetting', userSettingSchema);

export async function getSystemPrompt(userId) {
  try {
    const setting = await UserSetting.findOne({ userId });
    return setting ? setting.systemPrompt : '';
  } catch (error) {
    console.error(`[MODEL_ERROR] getSystemPrompt 失敗 (User: ${userId}):`, error);
    return '';
  }
}

export async function saveSystemPrompt(userId, prompt) {
  try {
    await UserSetting.findOneAndUpdate(
      { userId },
      { systemPrompt: prompt, updatedAt: Date.now() },
      { upsert: true, new: true }
    );
  } catch (error) {
    console.error(`[MODEL_ERROR] saveSystemPrompt 失敗 (User: ${userId}):`, error);
    throw error;
  }
}



