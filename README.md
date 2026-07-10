# 帝樂香港有限公司 | Delights Hong Kong Ltd.

Company website (static, multi-page) + internal inventory system.

## Public site (static, GitHub Pages / Vercel)
- `index.html` — homepage (首頁)
- `food-lab.html` — FOOD LAB (自主研發 / 主廚顧問)
- `products.html` — 產品方案 (冰鮮禽肉 / 熟製品 / 自主研發獨家品牌 / OEM)
- `about.html` — 跨境聯動 (about)
- `process.html` — 培育流程 (supply-chain deep-dive)
- `quality.html` — 品質冷鏈 (quality)
- `contact.html` — 聯絡我們 (contact)
- `style.css`, `main.js` — shared styles and interactions
- `assets/` — logos and imagery (`delights-mark-dark-web.png` = header mark, `delights-mark-white-web.png` = footer mark)
- `vercel.json` — clean URLs + `database.delights.hk` → `/inventory/` redirect

## Internal system
- `inventory/` — warehouse / inventory app (see `inventory/README.md`)

## Live deployment (GitHub Pages)
Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)`.

## Brand & positioning
- Company: 帝樂香港有限公司 DELIGHTS HONG KONG LTD. (used in logo, footer, titles)
- Positioning: 自主研發 (Food Lab) front-and-centre; supply-chain / 溫氏 channel framed as stable backup
- Type: Noto Sans TC + Plus Jakarta Sans
- Brand mark: outlined "D" with a leaf (dark mark on light header, white mark on dark footer)
