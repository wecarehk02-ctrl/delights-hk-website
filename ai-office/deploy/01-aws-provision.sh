#!/usr/bin/env bash
# ============================================================
# 01-aws-provision.sh
# 用AWS CLI起返：
#   1) 一個淨係有 bedrock:InvokeModel 權限嘅IAM user（俾app用）
#   2) 一個Lightsail instance（Ubuntu 24.04）
#   3) 一個static IP，attach去個instance
#   4) 開返80/443/22 port
#
# 用法：喺你自己部有裝AWS CLI、已經 `aws configure` 好嘅機器度跑：
#   chmod +x 01-aws-provision.sh
#   ./01-aws-provision.sh
#
# 前置要求（要你自己click，script做唔到）：
#   - AWS Console → Bedrock → Model access → 申請批准你想用嗰個Claude型號
#     （唔批就算IAM/Lightsail起好晒，call Bedrock都會403）
# ============================================================
set -euo pipefail

# ---------- 呢幾行請根據你自己情況修改 ----------
REGION="ap-southeast-1"              # 建議揀離你近嘅region，記得同Bedrock model access嗰個region一致
INSTANCE_NAME="ai-office-server"
BUNDLE_ID="small_3_0"                # 2 vCPU/2GB分級，跑之前用 `aws lightsail get-bundles --region $REGION` 確認呢個ID仲有效
BLUEPRINT_ID="ubuntu_24_04"          # 跑之前用 `aws lightsail get-blueprints --region $REGION` 確認呢個ID仲有效
AVAILABILITY_ZONE="${REGION}a"
IAM_USER_NAME="ai-office-bedrock-user"
KEY_PAIR_NAME="ai-office-key"
# --------------------------------------------------

echo "== 1. 建立IAM policy + user（俾app call Bedrock用） =="

POLICY_DOC=$(cat <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "*"
    }
  ]
}
JSON
)

aws iam create-user --user-name "$IAM_USER_NAME" || echo "（user可能已經存在，跳過）"

POLICY_ARN=$(aws iam create-policy \
  --policy-name "ai-office-bedrock-invoke" \
  --policy-document "$POLICY_DOC" \
  --query 'Policy.Arn' --output text 2>/dev/null || \
  aws iam list-policies --query "Policies[?PolicyName=='ai-office-bedrock-invoke'].Arn" --output text)

aws iam attach-user-policy --user-name "$IAM_USER_NAME" --policy-arn "$POLICY_ARN"

echo "== 2. 產生access key（存好呢兩個值，之後填入.env，成個過程淨係顯示一次） =="
aws iam create-access-key --user-name "$IAM_USER_NAME" \
  --query '{AccessKeyId:AccessKey.AccessKeyId,SecretAccessKey:AccessKey.SecretAccessKey}' \
  --output table

echo "== 3. 起Lightsail instance =="
aws lightsail create-instances \
  --instance-names "$INSTANCE_NAME" \
  --availability-zone "$AVAILABILITY_ZONE" \
  --blueprint-id "$BLUEPRINT_ID" \
  --bundle-id "$BUNDLE_ID" \
  --key-pair-name "$KEY_PAIR_NAME" \
  --region "$REGION" || echo "（如果話key pair唔存在，先用 aws lightsail create-key-pair --key-pair-name $KEY_PAIR_NAME --region $REGION 產生）"

echo "等instance開機..."
for i in $(seq 1 12); do
  STATE=$(aws lightsail get-instance-state --instance-name "$INSTANCE_NAME" --region "$REGION" --query 'state.name' --output text)
  echo "  狀態: $STATE"
  [ "$STATE" == "running" ] && break
  sleep 10
done

echo "== 4. 開Firewall port（22/80/443） =="
aws lightsail open-instance-public-ports --instance-name "$INSTANCE_NAME" --region "$REGION" \
  --port-info fromPort=22,toPort=22,protocol=TCP
aws lightsail open-instance-public-ports --instance-name "$INSTANCE_NAME" --region "$REGION" \
  --port-info fromPort=80,toPort=80,protocol=TCP
aws lightsail open-instance-public-ports --instance-name "$INSTANCE_NAME" --region "$REGION" \
  --port-info fromPort=443,toPort=443,protocol=TCP

echo "== 5. Allocate + attach static IP =="
STATIC_IP_NAME="${INSTANCE_NAME}-ip"
aws lightsail allocate-static-ip --static-ip-name "$STATIC_IP_NAME" --region "$REGION"
aws lightsail attach-static-ip --static-ip-name "$STATIC_IP_NAME" --instance-name "$INSTANCE_NAME" --region "$REGION"

IP=$(aws lightsail get-static-ip --static-ip-name "$STATIC_IP_NAME" --region "$REGION" --query 'staticIp.ipAddress' --output text)

echo ""
echo "=============================================="
echo "完成！記低以下資料："
echo "  Instance public IP (static): $IP"
echo "  IAM access key：見返上面第2步嘅table（唔會再顯示第二次）"
echo ""
echo "下一步："
echo "  1. 去你個domain registrar，加一條A record：office.yourdomain.com -> $IP"
echo "  2. 攞返SSH private key： aws lightsail download-default-key-pair (如果用返default key pair)"
echo "     或者用你自己個 $KEY_PAIR_NAME.pem"
echo "  3. SSH入去： ssh -i <key.pem> ubuntu@$IP"
echo "  4. 將 02-server-setup.sh 上傳去個instance，喺入面執行"
echo "=============================================="
