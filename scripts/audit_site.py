from __future__ import annotations

from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_PAGES = sorted(ROOT.glob("*.html"))
FORBIDDEN_TEXT = (
    "VERIFY",
    "COMING SOON",
    "AI 生成",
    "AI 視覺參考",
    "正式相片待補",
    "圖片待補",
    "待補",
    "測試版",
    "未上線",
    "尚未上架",
    "示意",
)
FORBIDDEN_WORDS = ("VERIFY", "trial", "placeholder", "sample", "demo")
PROTECTED_CLAIM = "具米芝蓮餐廳經驗的廚師顧問支援口味方向"
CLEAN_ROUTES = (
    "business/food-lab",
    "business/products",
    "business/oem",
    "business/supply",
    "business/traceability",
    "products/qingyuan",
    "products/baiyu",
    "support/where-to-buy",
    "quality",
)


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.h1_count = 0
        self.canonical_count = 0
        self.og_title_count = 0
        self.og_description_count = 0
        self.og_image_count = 0
        self.desktop_nav_depth = 0
        self.desktop_nav_links = 0
        self.footer_depth = 0
        self.footer_privacy_links = 0
        self.images: list[str] = []
        self.images_without_alt: list[str] = []
        self.local_refs: list[str] = []
        self.visible_text: list[str] = []
        self.hidden_depth = 0
        self.main_depth = 0
        self.main_headings: list[int] = []

    def handle_starttag(self, tag: str, attrs_list: list[tuple[str, str | None]]) -> None:
        attrs = dict(attrs_list)
        classes = set((attrs.get("class") or "").split())
        if tag == "h1":
            self.h1_count += 1
        if tag == "main":
            self.main_depth += 1
        if self.main_depth and tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self.main_headings.append(int(tag[1]))
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonical_count += 1
        if tag == "meta" and attrs.get("property") == "og:title":
            self.og_title_count += 1
        if tag == "meta" and attrs.get("property") == "og:description":
            self.og_description_count += 1
        if tag == "meta" and attrs.get("property") == "og:image":
            self.og_image_count += 1
        if tag == "nav" and "desktop-nav" in classes:
            self.desktop_nav_depth += 1
        if tag == "footer":
            self.footer_depth += 1
        if tag == "a":
            href = attrs.get("href") or ""
            if self.desktop_nav_depth:
                self.desktop_nav_links += 1
            if self.footer_depth and urlsplit(href).path.endswith("privacy.html"):
                self.footer_privacy_links += 1
            self.local_refs.append(href)
        if tag in {"img", "script"}:
            src = attrs.get("src") or ""
            self.local_refs.append(src)
            if tag == "img" and src:
                self.images.append(src)
                if "alt" not in attrs:
                    self.images_without_alt.append(src)
        if tag in {"script", "style"}:
            self.hidden_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag == "main" and self.main_depth:
            self.main_depth -= 1
        if tag == "nav" and self.desktop_nav_depth:
            self.desktop_nav_depth -= 1
        if tag == "footer" and self.footer_depth:
            self.footer_depth -= 1
        if tag in {"script", "style"} and self.hidden_depth:
            self.hidden_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self.hidden_depth:
            self.visible_text.append(data)


def resolve_local_ref(page: Path, ref: str) -> bool:
    if not ref or ref.startswith(("#", "mailto:", "tel:", "data:", "javascript:")):
        return True
    parsed = urlsplit(ref)
    if parsed.scheme or parsed.netloc:
        return True
    relative = unquote(parsed.path)
    if not relative:
        return True
    target = (page.parent / relative).resolve()
    if target.is_file():
        return True
    if target.is_dir() and (target / "index.html").is_file():
        return True
    if not target.suffix and target.with_suffix(".html").is_file():
        return True
    return False


def main() -> int:
    errors: list[str] = []
    for page in PUBLIC_PAGES:
        parser = PageParser()
        source = page.read_text(encoding="utf-8")
        parser.feed(source)
        label = page.name

        if parser.h1_count != 1:
            errors.append(f"{label}: expected one h1, found {parser.h1_count}")
        for previous, current in zip(parser.main_headings, parser.main_headings[1:]):
            if current > previous + 1:
                errors.append(f"{label}: main heading hierarchy jumps from h{previous} to h{current}")
                break
        for name, count in (
            ("canonical", parser.canonical_count),
            ("og:title", parser.og_title_count),
            ("og:description", parser.og_description_count),
            ("og:image", parser.og_image_count),
        ):
            if count != 1:
                errors.append(f"{label}: expected one {name}, found {count}")
        if parser.desktop_nav_links != 5:
            errors.append(f"{label}: expected five source nav links, found {parser.desktop_nav_links}")
        if parser.footer_privacy_links != 1:
            errors.append(f"{label}: expected one footer privacy link, found {parser.footer_privacy_links}")

        duplicate_images = [src for src, count in Counter(parser.images).items() if count > 1]
        if duplicate_images:
            errors.append(f"{label}: repeated images: {', '.join(duplicate_images)}")
        if parser.images_without_alt:
            errors.append(f"{label}: images missing alt attributes: {', '.join(parser.images_without_alt)}")

        text = " ".join(part.strip() for part in parser.visible_text if part.strip())
        for term in FORBIDDEN_TEXT:
            if term.casefold() in text.casefold():
                errors.append(f"{label}: public text still contains {term!r}")
        for word in FORBIDDEN_WORDS:
            if re.search(rf"(?<![A-Za-z]){re.escape(word)}(?![A-Za-z])", text, re.IGNORECASE):
                errors.append(f"{label}: public text still contains {word!r}")

        for ref in parser.local_refs:
            if not resolve_local_ref(page, ref):
                errors.append(f"{label}: broken local reference {ref!r}")

    about = (ROOT / "about.html").read_text(encoding="utf-8")
    if PROTECTED_CLAIM not in about:
        errors.append("about.html: protected Michelin-experience wording changed or removed")

    contact = (ROOT / "contact.html").read_text(encoding="utf-8")
    if 'name="company" autocomplete="organization" required' in contact:
        errors.append("contact.html: company is still unconditionally required")
    if "我們已收到你的資料" in contact or "我們已收到你的資料" in (ROOT / "main.js").read_text(encoding="utf-8"):
        errors.append("contact flow: still claims the website received the enquiry")
    if "以電郵發送查詢" not in contact:
        errors.append("contact.html: truthful email action label missing")

    for route in CLEAN_ROUTES:
        if not (ROOT / route / "index.html").is_file():
            errors.append(f"clean route missing physical fallback: /{route}/")

    if errors:
        print("AUDIT FAILED")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"AUDIT PASSED: {len(PUBLIC_PAGES)} public pages checked")
    print("- one h1, canonical and social metadata per page")
    print("- no skipped heading levels inside main content")
    print("- five source navigation links per page")
    print("- one footer privacy link per page")
    print("- no repeated image on the same page")
    print("- every meaningful image has an alt attribute")
    print("- no forbidden public placeholder wording")
    print("- local links and assets resolve")
    print("- physical clean-route fallbacks exist for Vercel and GitHub Pages")
    print("- protected Michelin-experience wording retained")
    print("- contact action is truthful and company is not always required")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
