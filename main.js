
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

const contactForm = document.getElementById("contactForm");
const successMsg = document.getElementById("successMsg");

if (contactForm && successMsg) {
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();
    event.currentTarget.reset();
    successMsg.classList.add("visible");
  });
}
