import { ChatController } from '../controllers/chatController.js';

export async function handleMessage(message) {

	const timestamp = new Date().toISOString();
    	const botMentionPrefix = `<@${message.client.user.id}>`;

    	//	記錄所有進入系統的有效訊息（審計追蹤）
    	console.log(`[${timestamp}] [DEBUG] [Router] 收到來自用戶 ${message.author.id} 在頻道 ${message.channel.id} 的訊息: "${message.content}"`);

    	// 流量過濾：忽略機器人自身的訊息
	if (message.author.bot) return;

    	// 路由分流控制
    	if (message.content.startsWith(botMentionPrefix)) {
		console.log(`[${timestamp}] [INFO] [Router] 成功分流至 ChatController.processGemmaChat`);
		return await ChatController.processGemmaChat(message);
    	}


	// 如果有訊息但沒匹配到路由，也要記錄原因，方便排查空白字元或全形符號問題
    	console.log(`[${timestamp}] [WARN] [Router] 訊息未匹配任何已知路由，忽略處理。`);
    	// 未來可在這裡擴充其他指令路由，例如：
    	// if (message.content.startsWith('!clear')) {
    	//     return await SystemController.clearHistory(message);
   	 // }
}
