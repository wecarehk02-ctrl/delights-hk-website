# 部署指南（由頭到尾，唔使Claude Code都跟得到）

呢個資料夾有兩個script，將部署過程盡量自動化。全程只有**3件事一定要你自己手動做**
（AWS CLI/script做唔到）：

1. 喺AWS Console批准Bedrock model access（涉及接受條款，冇CLI捷徑）
2. 喺你個domain registrar度加DNS record（唔同provider，AWS摸唔到）
3. 幫Lightsail instance生成/落載SSH key（AWS CLI都做到，但通常喺console度撳更方便）

其他嘢（IAM、Lightsail instance、firewall、Node.js、Caddy、部署app）已經寫晒落script。

---

## Step 0：本機準備

喺你自己部電腦（唔係Lightsail度）：

```bash
# 裝AWS CLI（如果未裝）
# macOS: brew install awscli   /   其他OS見 https://aws.amazon.com/cli/

aws configure
# 入返你AWS account嘅Access Key ID / Secret / 預設region / output format(json)
```

## Step 1：批准Bedrock model access（手動，AWS Console）

1. 開 AWS Console → 搵 **Bedrock** → 左邊揀 **Model access**
2. 揀你想用嘅Anthropic Claude型號（例如 Claude Sonnet），撳 request access
3. 一般幾分鐘內自動批准

⚠ 呢步一定要做，唔做嘅話之後app call Bedrock會攞到403。

## Step 2：跑 `01-aws-provision.sh`（自動起IAM + Lightsail）

```bash
cd deploy
nano 01-aws-provision.sh   # 改頭幾行：REGION、INSTANCE_NAME等（睇file入面註解）
./01-aws-provision.sh
```

跑完會print低：
- 一組IAM access key（**淨係顯示一次，即刻copy落嚟**）
- Lightsail instance嘅static IP

## Step 3：加DNS record（手動，去你個domain provider）

喺你個domain registrar（Cloudflare/GoDaddy/Namecheap等）度：

```
類型: A
主機名: office   （即係 office.yourdomain.com）
數值: <Step 2攞到嘅static IP>
```

等10分鐘到1小時生效（可以用 `dig office.yourdomain.com` 確認）。

## Step 4：攞SSH key

如果 `01-aws-provision.sh` 用嘅係default key pair：
```bash
aws lightsail download-default-key-pair \
  --query 'privateKeyBase64' --output text | base64 -d > ~/.ssh/ai-office-key.pem
chmod 400 ~/.ssh/ai-office-key.pem
```
如果你揀咗自訂key pair名，去Lightsail console個「Account」→「SSH keys」度download。

## Step 5：將project上傳去伺服器

```bash
# 喺project根目錄（ai-office/）執行
scp -i ~/.ssh/ai-office-key.pem -r ../ai-office ubuntu@<static-ip>:~/
scp -i ~/.ssh/ai-office-key.pem 02-server-setup.sh ubuntu@<static-ip>:~/
```

（記得先跟返主README，攞真正agency-agents嘅persona檔案放落 `personas/`，先再scp上去）

## Step 6：SSH入去跑 `02-server-setup.sh`（自動裝晒環境+部署）

```bash
ssh -i ~/.ssh/ai-office-key.pem ubuntu@<static-ip>
nano 02-server-setup.sh   # 填返DOMAIN、AWS access key（Step 2攞到嗰組）、同事登入名
chmod +x 02-server-setup.sh
./02-server-setup.sh
```

script會自動：更新系統、裝firewall/fail2ban、裝Node.js、裝pm2、`npm install`、寫`.env`、
用pm2起app、裝Caddy、幫每位同事set密碼、寫好Caddyfile並自動攞HTTPS證書。

## Step 7：驗收

- [ ] 瀏覽器開 `https://office.yourdomain.com`，見到basic auth login框
- [ ] 用同事帳號登入，見到dashboard
- [ ] 揀個persona起個task，睇下Bedrock有冇正常回覆（唔係mock模式）
- [ ] `pm2 status` 顯示app行緊，`sudo systemctl status caddy` 顯示active

搞掂晒。之後想加新同事帳號，就編輯 `/etc/caddy/Caddyfile` 加一行、
`sudo systemctl reload caddy` 就得，唔使重新跑成個script。
