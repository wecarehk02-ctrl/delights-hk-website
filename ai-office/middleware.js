// 全站 basic auth（單一共用密碼）。跑喺 Vercel Edge。
// APP_PASSWORD 留空 = 唔擋（方便首次部署測試）；填咗 = 要輸入密碼先入到。

export const config = {
  // 除咗 favicon 同 Vercel 內部路徑，其餘全部（包括 /api）都要過驗證
  matcher: ["/((?!favicon.ico|_vercel/).*)"],
};

export default function middleware(request) {
  const password = process.env.APP_PASSWORD;
  if (!password) return; // 未設定密碼 → 放行

  const header = request.headers.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    let decoded = "";
    try {
      decoded = atob(encoded);
    } catch {
      decoded = "";
    }
    const supplied = decoded.slice(decoded.indexOf(":") + 1);
    if (supplied === password) return; // 密碼啱 → 放行
  }

  return new Response("需要密碼", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="AI Office", charset="UTF-8"',
    },
  });
}
