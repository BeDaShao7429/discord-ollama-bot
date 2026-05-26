import { ChatController } from '../controllers/chatController.js';

export async function handleMessage(message) {
    // 流量過濾：忽略機器人自身的訊息
    if (message.author.bot) return;

    // 路由分流控制
    if (message.content.startsWith('!ask ')) {
        return await ChatController.processGemmaChat(message);
    }
    
    // 未來可在這裡擴充其他指令路由，例如：
    // if (message.content.startsWith('!clear')) {
    //     return await SystemController.clearHistory(message);
    // }
}
