
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

function activateTab(button, shouldScroll) {
  tabButtons.forEach((item) => item.setAttribute("aria-selected", "false"));
  panels.forEach((panel) => panel.classList.remove("active"));
  button.setAttribute("aria-selected", "true");
  if (shouldScroll) button.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  const panel = document.getElementById(button.getAttribute("aria-controls"));
  if (panel) panel.classList.add("active");
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => activateTab(button, true));
});

tabButtons.forEach((button, index) => {
  button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    var nextIndex = index;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabButtons.length - 1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % tabButtons.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
    tabButtons[nextIndex].focus();
    tabButtons[nextIndex].click();
  });
});

var hashTabs = {
  "#qingyuan": "tab-poultry",
  "#baiyu": "tab-sauce",
  "#food-lab": "tab-kitchen",
  "#oem": "tab-brand"
};
var requestedTab = document.getElementById(hashTabs[window.location.hash.toLowerCase()]);
if (requestedTab) activateTab(requestedTab, false);

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

/* The public enquiry form prepares an email draft or a WhatsApp message.
 * It does not claim that DELIGHTS has received anything until the visitor
 * sends the message in their chosen app.
 */
var CONTACT_CFG = {
  whatsapp: "85296844836",
  email: "info@delights.hk"
};

(function () {
  var contactForm = document.getElementById("contactForm");
  if (!contactForm) return;
  var successMsg = document.getElementById("successMsg");
  var whatsappBtn = document.getElementById("whatsappBtn");
  var intentSelect = contactForm.elements.intent;
  var companyInput = contactForm.elements.company;
  var companyRequired = document.getElementById("companyRequired");

  function gather() {
    var el = contactForm.elements;
    var v = function (n) { return (el[n] && el[n].value ? el[n].value : "").trim(); };
    var interests = Array.prototype.map.call(
      contactForm.querySelectorAll('input[name="interest"]:checked'),
      function (c) { var l = c.closest("label"); return l ? l.textContent.trim() : c.value; }
    );
    return {
      intent: v("intent"), company: v("company"), name: v("name"), phone: v("phone"),
      email: v("email"), interests: interests, message: v("message"),
      botcheck: v("botcheck")
    };
  }

  function messageText(d) {
    return [
      "帝樂香港有限公司 — 網站查詢",
      "查詢目的：" + (d.intent || "—"),
      "公司名稱：" + (d.company || "—"),
      "聯絡人：" + d.name,
      "電話：" + d.phone,
      "電郵：" + (d.email || "—"),
      "感興趣：" + (d.interests.length ? d.interests.join("、") : "—"),
      "查詢詳情：" + (d.message || "—")
    ].join("\n");
  }

  function show(node) {
    if (successMsg) successMsg.style.display = "none";
    if (node) { node.style.display = "block"; node.classList.add("visible"); }
  }

  function mailtoFallback(d) {
    window.location.href = "mailto:" + CONTACT_CFG.email +
      "?subject=" + encodeURIComponent("網站查詢 — " + (d.company || d.name)) +
      "&body=" + encodeURIComponent(messageText(d));
  }

  function updateCompanyRequirement() {
    if (!intentSelect || !companyInput) return;
    var businessIntents = ["foodservice", "food-lab-oem", "product-info"];
    var isRequired = businessIntents.includes(intentSelect.value);
    companyInput.required = isRequired;
    companyInput.setAttribute("aria-required", String(isRequired));
    if (companyRequired) companyRequired.hidden = !isRequired;
  }

  if (intentSelect) {
    intentSelect.addEventListener("change", updateCompanyRequirement);
    updateCompanyRequirement();
  }

  contactForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var d = gather();
    if (d.botcheck) return;                 // honeypot: silently drop bots
    var btn = contactForm.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = "正在開啟電郵…"; }
    show(successMsg);
    mailtoFallback(d);
    window.setTimeout(function () {
      if (btn) { btn.disabled = false; btn.textContent = "以電郵發送查詢"; }
    }, 900);
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
