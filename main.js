
const menuButton = document.querySelector(".menu-button");
const mobileNav = document.getElementById("mobileNav");

if (menuButton && mobileNav) {
  menuButton.addEventListener("click", () => {
    const isOpen = mobileNav.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });

  mobileNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      mobileNav.classList.remove("open");
      menuButton.setAttribute("aria-expanded", "false");
    });
  });
}

const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
const panels = Array.from(document.querySelectorAll(".tab-panel"));

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    tabButtons.forEach((item) => item.setAttribute("aria-selected", "false"));
    panels.forEach((panel) => panel.classList.remove("active"));

    button.setAttribute("aria-selected", "true");
    button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    const panel = document.getElementById(button.getAttribute("aria-controls"));
    if (panel) panel.classList.add("active");
  });
});

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });

  document.querySelectorAll(".reveal").forEach((node) => revealObserver.observe(node));
} else {
  document.querySelectorAll(".reveal").forEach((node) => node.classList.add("visible"));
}

/* ── Contact form ─────────────────────────────────────────────────────────
 * Submits an enquiry through up to 3 channels:
 *   1. Web3Forms  → emails info@delights.hk        (set web3formsKey)
 *   3. Supabase   → inserts into public.contact_leads (set supabaseUrl + anonKey)
 *   + WhatsApp button → opens a pre-filled chat to the company number
 * Fill in the CONTACT_CFG values below to activate email + database delivery.
 * Anon key is safe to expose publicly IF Supabase RLS only allows anon INSERT
 * on contact_leads (see supabase/contact-leads.sql). Inventory stays auth-only.
 * If neither email nor database is configured yet, submit falls back to mailto.
 */
var CONTACT_CFG = {
  web3formsKey: "",       // Web3Forms access key → email to info@delights.hk
  supabaseUrl: "",        // e.g. https://xxxx.supabase.co
  supabaseAnonKey: "",    // Supabase anon (public) key
  whatsapp: "85296844836",
  email: "info@delights.hk"
};

(function () {
  var contactForm = document.getElementById("contactForm");
  if (!contactForm) return;
  var successMsg = document.getElementById("successMsg");
  var errorMsg = document.getElementById("errorMsg");
  var whatsappBtn = document.getElementById("whatsappBtn");

  function gather() {
    var el = contactForm.elements;
    var v = function (n) { return (el[n] && el[n].value ? el[n].value : "").trim(); };
    var interests = Array.prototype.map.call(
      contactForm.querySelectorAll('input[name="interest"]:checked'),
      function (c) { var l = c.closest("label"); return l ? l.textContent.trim() : c.value; }
    );
    return {
      company: v("company"), name: v("name"), phone: v("phone"),
      email: v("email"), interests: interests, message: v("message"),
      botcheck: v("botcheck")
    };
  }

  function messageText(d) {
    return [
      "帝樂香港有限公司 — 網站查詢",
      "公司名稱：" + d.company,
      "聯絡人：" + d.name,
      "電話：" + d.phone,
      "電郵：" + (d.email || "—"),
      "感興趣：" + (d.interests.length ? d.interests.join("、") : "—"),
      "查詢詳情：" + (d.message || "—")
    ].join("\n");
  }

  function show(node) {
    if (successMsg) successMsg.style.display = "none";
    if (errorMsg) errorMsg.style.display = "none";
    if (node) { node.style.display = "block"; node.classList.add("visible"); }
  }

  function sendSupabase(d) {
    if (!CONTACT_CFG.supabaseUrl || !CONTACT_CFG.supabaseAnonKey) return null;
    return fetch(CONTACT_CFG.supabaseUrl.replace(/\/$/, "") + "/rest/v1/contact_leads", {
      method: "POST",
      headers: {
        "apikey": CONTACT_CFG.supabaseAnonKey,
        "Authorization": "Bearer " + CONTACT_CFG.supabaseAnonKey,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        company: d.company, contact_name: d.name, phone: d.phone,
        email: d.email || null, interests: d.interests, message: d.message || null,
        source: "website"
      })
    }).then(function (r) { if (!r.ok) throw new Error("supabase " + r.status); });
  }

  function sendWeb3Forms(d) {
    if (!CONTACT_CFG.web3formsKey) return null;
    return fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        access_key: CONTACT_CFG.web3formsKey,
        subject: "網站查詢 — " + (d.company || d.name),
        from_name: d.name, company: d.company, phone: d.phone,
        email: d.email || "(未提供)", interests: d.interests.join("、") || "(未選)",
        message: d.message || "(無)", botcheck: d.botcheck
      })
    }).then(function (r) { if (!r.ok) throw new Error("web3forms " + r.status); });
  }

  function mailtoFallback(d) {
    window.location.href = "mailto:" + CONTACT_CFG.email +
      "?subject=" + encodeURIComponent("網站查詢 — " + (d.company || d.name)) +
      "&body=" + encodeURIComponent(messageText(d));
  }

  contactForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var d = gather();
    if (d.botcheck) return;                 // honeypot: silently drop bots
    var jobs = [sendSupabase(d), sendWeb3Forms(d)].filter(Boolean);
    var btn = contactForm.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = "提交中…"; }
    var done = function () { if (btn) { btn.disabled = false; btn.textContent = "提交查詢"; } };

    if (!jobs.length) { mailtoFallback(d); show(successMsg); contactForm.reset(); done(); return; }

    Promise.all(jobs).then(function () {
      show(successMsg); contactForm.reset(); done();
    }).catch(function () {
      show(errorMsg); done();
    });
  });

  if (whatsappBtn) {
    whatsappBtn.addEventListener("click", function () {
      var d = gather();
      var url = "https://wa.me/" + CONTACT_CFG.whatsapp + "?text=" + encodeURIComponent(messageText(d));
      var w = window.open(url, "_blank", "noopener");
      if (!w) window.location.href = url;
    });
  }
})();
