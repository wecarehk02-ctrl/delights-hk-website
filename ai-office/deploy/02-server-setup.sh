#!/usr/bin/env bash
# ============================================================
# 02-server-setup.sh
# 喺Lightsail instance入面跑（SSH入去之後）。
# 用法：
#   scp -i <key.pem> -r ai-office ubuntu@<IP>:~/
#   scp -i <key.pem> deploy/02-server-setup.sh ubuntu@<IP>:~/
#   ssh -i <key.pem> ubuntu@<IP>
#   chmod +x 02-server-setup.sh
#   ./02-server-setup.sh
#
# 執行之前請先編輯下面「請修改」嗰幾行。
# ============================================================
set -euo pipefail

# ---------- 請修改 ----------
DOMAIN="office.yourdomain.com"      # 你個subdomain
APP_DIR="$HOME/ai-office"           # 你已經scp咗成個ai-office project上嚟嘅路徑
AWS_ACCESS_KEY_ID_VALUE=""          # 由01-aws-provision.sh第2步攞返嚟嘅值
AWS_SECRET_ACCESS_KEY_VALUE=""      # 同上
AWS_REGION_VALUE="ap-southeast-1"
BEDROCK_MODEL_ID_VALUE="anthropic.claude-sonnet-4-6"
COLLEAGUE_USERS=("colleague1" "colleague2")   # basic auth用戶名，自己加/減
# -----------------------------

echo "== 1. 更新系統 + 裝firewall/fail2ban =="
sudo apt update && sudo apt upgrade -y
sudo apt install -y ufw fail2ban curl git
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

echo "== 2. 裝Node.js LTS =="
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

echo "== 3. 裝pm2 =="
sudo npm install -g pm2

echo "== 4. 裝app dependencies =="
cd "$APP_DIR"
npm install

echo "== 5. 寫 .env =="
cat > "$APP_DIR/.env" <<EOF
PORT=3000
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID_VALUE
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY_VALUE
AWS_REGION=$AWS_REGION_VALUE
BEDROCK_MODEL_ID=$BEDROCK_MODEL_ID_VALUE
EOF
echo "已寫好 $APP_DIR/.env（如果想改用IAM role代替access key，將上面兩個key欄位留空就得）"

echo "== 6. 用pm2起app =="
cd "$APP_DIR"
pm2 start npm --name "ai-office" -- start
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -n 1 | sudo bash || true
pm2 save

echo "== 7. 裝Caddy =="
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy

echo "== 8. 產生basic auth密碼 + 寫Caddyfile =="
echo "會逐個問你哋每位同事嘅密碼（唔會顯示喺螢幕）："

AUTH_LINES=""
for user in "${COLLEAGUE_USERS[@]}"; do
  read -rsp "設定 $user 嘅密碼: " pw
  echo ""
  hash=$(caddy hash-password --plaintext "$pw")
  AUTH_LINES="${AUTH_LINES}        ${user} ${hash}\n"
done

sudo tee /etc/caddy/Caddyfile > /dev/null <<EOF
$DOMAIN {
    basicauth {
$(echo -e "$AUTH_LINES")
    }
    reverse_proxy localhost:3000
}
EOF

sudo systemctl reload caddy || sudo systemctl restart caddy

echo ""
echo "=============================================="
echo "完成！去 https://$DOMAIN 應該見到basic auth login框。"
echo "（前提：DNS A record已經指到呢部機、亦已經生效）"
echo ""
echo "常用檢查指令："
echo "  pm2 status                # 睇app行緊未"
echo "  pm2 logs ai-office         # 睇app log"
echo "  sudo systemctl status caddy"
echo "=============================================="
