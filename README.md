# 帝樂食研所 | Delights Food Lab

Company website (static, multi-page) + internal inventory system.

## Public site (static, GitHub Pages / Vercel)
- `index.html` — homepage (首頁)
- `about.html` — 雙城根基 (about)
- `process.html` — 培育流程 (process)
- `products.html` — 產品方案 (products)
- `quality.html` — 品質冷鏈 (quality)
- `contact.html` — 聯絡我們 (contact)
- `style.css`, `main.js` — shared styles and interactions
- `assets/` — logos and imagery (`delights-mark-dark-web.png` = header mark, `delights-mark-white-web.png` = footer mark)
- `vercel.json` — clean URLs + `database.delights.hk` → `/inventory/` redirect

## Internal system
- `inventory/` — warehouse / inventory app (see `inventory/README.md`)

## Live deployment (GitHub Pages)
Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)`.

## Design
- Type: Noto Sans TC + Plus Jakarta Sans
- Brand mark: outlined "D" with a leaf (dark mark on light header, white mark on dark footer)
