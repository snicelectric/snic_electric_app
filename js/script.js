document.addEventListener("DOMContentLoaded", () => {
  const logo = document.querySelector('.logo');
  if (logo) {
    let clickCount = 0;
    logo.addEventListener('click', (e) => {
      clickCount++;
      if (clickCount === 3) {
        window.location.href = 'login.html';
      }
      setTimeout(() => { clickCount = 0; }, 1000);
    });
  }
  const t = document.getElementById("menuToggle"),
    n = document.getElementById("navbar");
  if (t && n) {
    t.onclick = () => n.classList.toggle("active");
    n.querySelectorAll("a").forEach(
      (a) => (a.onclick = () => n.classList.remove("active")),
    );
  }
  document.querySelectorAll(".counter").forEach((c) => {
    const target = +c.dataset.target || 0;
    c.textContent = target.toLocaleString("es-CO");
  });
  const f = document.getElementById("contactForm");
  if (f)
    f.onsubmit = (e) => {
      e.preventDefault();
      const v = f.querySelectorAll("input,select,textarea");
      const text = `Hola, soy ${v[0].value}.%0ACorreo: ${v[1].value}%0ATeléfono: ${v[2].value}%0AServicio: ${v[3].value}%0AProyecto: ${v[4].value}`;
      window.open("https://wa.me/573054044326?text=" + text, "_blank");
      f.reset();
    };
  document
    .querySelectorAll(
      ".service-card,.why-card,.cert-card,.project-card,.testimonial-card,.mv-card",
    )
    .forEach((x) => {
      x.classList.add("reveal");
      new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("show");
            }
          }),
        { threshold: 0.1 },
      ).observe(x);
    });
  window.addEventListener(
    "scroll",
    () =>
      document
        .querySelector(".header")
        ?.classList.toggle("scrolled", scrollY > 30),
    { passive: true },
  );
});
