#!/bin/bash

# 強制要求以 root/sudo 權限執行
if [ "$EUID" -ne 0 ]; then 
  echo "[錯誤] 請使用 sudo 執行此腳本: sudo bash setup.sh"
  exit 1
fi

echo "[1/6] 更新系統套件庫並安裝基礎工具..."
apt update && apt install -y curl git build-essential text-extraction-tools libtool net-tools

echo "[2/6] 檢查並安裝 Docker 核心環境..."
if ! command -v docker &> /dev/null; then
    apt install -y docker.io docker-compose
    systemctl enable docker
    systemctl start docker
    echo "Docker 安裝完成。"
else
    echo "Docker 已存在，跳過安裝。"
fi

echo "[3/6] 安裝並設定 Ollama 推論引擎..."
if ! command -v ollama &> /dev/null; then
    curl -fsSL https://ollama.com/install.sh | sh
else
    echo "Ollama 已存在，跳過安裝。"
fi

echo "[4/6] 自動建立 Systemd 覆蓋配置檔 (配置 0.0.0.0 與並行量)..."
mkdir -p /etc/systemd/system/ollama.service.d
cat <<EOF > /etc/systemd/system/ollama.service.d/override.conf
[Service]
Environment="OLLAMA_HOST=0.0.0.0"
Environment="OLLAMA_NUM_PARALLEL=4"
Environment="OLLAMA_MAX_LOADED_MODELS=2"
EOF

# 重新載入守護進程並重啟 Ollama
systemctl daemon-reload
systemctl restart ollama

echo "[5/6] 背景下載指定的大型 LLM 模型 (這需要一些時間)..."
# 使用背景執行，防止因網路波動中斷整個腳本
ollama pull gemma4:31b:cloud
ollama pull nomic-embed-text

echo "[6/6] 啟動 MongoDB 容器叢集..."
docker-compose up -d

echo "========================================================"
echo " [系統通知] 基礎建設自動化架設完成！"
echo " 接下來您只需進入專案目錄執行 'npm install' 與 'pm2 start' 即可。"
echo "========================================================"
