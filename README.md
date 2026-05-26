
#ollama

```
curl -fsSL https://ollama.com/install.sh | sh
```

### 如果要讓外部連接ollama
sudo systemctl edit ollama.service

:: 加入以下

```
[Service]

Environment="OLLAMA_HOST=0.0.0.0"

Environment="OLLAMA_NUM_PARALLEL=4"
```

:: 重啟服務

```
sudo systemctl daemon-reload

sudo systemctl restart ollama
```

### 安裝模型

```
ollama run gemma4:31b:cloud
```

::完成

# 建立 Discord Bot 憑證

前往 Discord Developer Portal。

點擊 New Application 並命名您的機器人。

進入 Bot 分頁：

點擊 Reset Token 取得您的 Bot Token（請妥善保存）。

向下滾動至 Privileged Gateway Intents，必須開啟 Message Content Intent、Server Members Intent。

進入 OAuth2 -> URL Generator 分頁：

Scopes 勾選：bot 與 applications.commands。

Bot Permissions 勾選：Send Messages、Read Message History、View Channels。

複製下方的 URL，在瀏覽器開啟並將機器人邀請至您的 Discord 伺服器。



# mongo DB

:: 安裝 Docker (若尚未安裝)

```
sudo apt update && sudo apt install docker.io -y
```

:: 啟動 MongoDB 容器 (設定帳號：admin，密碼：password123)

```
sudo docker run -d \
  --name mongodb-ollama \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password123 \
  -v mongodb_data:/data/db \
  --restart always \
  mongo:latest
``` 

 
# 建立node.js專案實作

::安裝node.js

```
sudo apt install npm
```

::進入專案資料夾

```
mkdir discord-ollama-bot && cd discord-ollama-bot
```  
  
::啟動專案(載入專案基本檔案)並安裝套件

```
npm init -y

npm install discord.js mongoose node-fetch dotenv
```

::設定環境變數(.env)

```
DISCORD_TOKEN=你的_DISCORD_BOT_TOKEN

MONGO_URI=mongodb://admin:password123@localhost:27017/ollama_bot?authSource=admin

OLLAMA_API_URL=http://localhost:11434/api/chat

MODEL_NAME=gemma4:31b:cloud
```

# 專案

::使用ESM(現代標準的JS)而非CJS(舊制JS)，故要加入type module到package.json

```
{
  "name": "discord-ollama-bot",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "type": "module",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "dependencies": {
    "discord.js": "^14.x.x",
    "dotenv": "^16.x.x",
    "mongoose": "^8.x.x",
    "node-fetch": "^3.x.x"
  }
}
```

# 專案架構


:: 專案目錄設計

```
discord-ollama-bot/
├── .env
├── package.json
├── index.js             # 專案啟動點（負責初始化連線與載入 Router）
├── src/
│   ├── config/
│   │   └── database.js  # MongoDB 連線設定
│   ├── models/
│   │   └── messageModel.js # M（Model）：資料庫 Schema
│   ├── controllers/
│   │   └── chatController.js # C（Controller）：處理 Ollama 與業務邏輯
│   ├── views/
│   │   └── discordView.js    # V（View）：負責格式化 Discord 輸出畫面
│   └── routers/
│     └── messageRouter.js  # Router：指令分流中心
```

# 專案佈署

::完成架構和內容後，有效地進行佈署，使用nodejs的行程管理器pm2

# pm2

:: 安裝pm2

sudo npm install pm2 -g

::建立行程

pm2 start index.js --name "gemma-discord-bot"

::設定之後開機(啟動)後自動執行行程

pm2 startup

::儲存當前行程設定及狀態

pm2 save
