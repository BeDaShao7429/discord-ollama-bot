# Chroma DB @docker
docker run -d -p 8000:8000 --name local-chromadb --restart always chromadb/chroma

docker ps -a

npm install chromadb

# mongoDB @docker

sudo apt-get update

sudo apt-get install -y docker.io

docker run -d --name local-mongodb -p 27017:27017 -v mongodb_data:/data/db --restart always mongo:latest

docker ps

nano .env

sudo docker exec -it local-mongodb mongosh discord_bot --eval "db.conversations.find().pretty()"

# env should contain...


DISCORD_TOKEN

MONGODB_URI

NGODB_URI=mongodb://127.0.0.1:27017/[db name]

# nodejs on ubuntu


sudo apt update

sudo apt install -y curl

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

sudo apt install -y nodejs


# ollama

curl -fsSL https://ollama.com/install.sh | sh

## [Service]
Environment="OLLAMA_HOST=0.0.0.0"

sudo systemctl daemon-reload

sudo systemctl restart ollama

sudo ufw allow from [機器人的IP] to any port 11434 proto tcp

# discord

npm init -y

npm install discord.js @ollama/ollama dotenv

## modern js
node -e "let j=require('./package.json'); j.type='module'; require('fs').writeFileSync('./package.json', JSON.stringify(j, null, 2))"

nano index.js

# pm2

sudo npm install -y pm2 -g

cd [檔案路徑]

>> cd /home/cjke/mybot

pm2 start index.js --name "discord-ollama-bot"

pm2 startup

pm2 save


# 常用維護指令

ollama list

pm2 list

pm2 restart [process name]

>> pm2 restart discord-ollama-bot

pm2 logs [process name]

>> pm2 logs discord-ollama-bot
