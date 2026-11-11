
document.addEventListener("DOMContentLoaded", () => {

  // MOBILE NAVIGATION MENU
  const menuToggle = document.getElementById("menuToggle");
  const mainNav = document.getElementById("mainNav");

  if (menuToggle && mainNav) {
    menuToggle.addEventListener("click", () => {
      const isOpen = mainNav.classList.toggle("active");

      menuToggle.textContent = isOpen ? "✕" : "☰";
      menuToggle.setAttribute("aria-expanded", String(isOpen));
      menuToggle.setAttribute(
        "aria-label",
        isOpen ? "Close navigation" : "Open navigation"
      );
    });

    // Close menu after clicking a navigation link
    mainNav.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => {
        mainNav.classList.remove("active");
        menuToggle.textContent = "☰";
        menuToggle.setAttribute("aria-expanded", "false");
      });
    });

    // Close menu when clicking outside it
    document.addEventListener("click", event => {
      if (
        mainNav.classList.contains("active") &&
        !mainNav.contains(event.target) &&
        !menuToggle.contains(event.target)
      ) {
        mainNav.classList.remove("active");
        menuToggle.textContent = "☰";
        menuToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // API REQUEST HELPER
  async function apiRequest(url, options = {}) {
    const csrfResponse = await fetch("/api/csrf");
    const csrfData = await csrfResponse.json();

    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    if (options.method && options.method !== "GET") {
      headers["X-CSRF-Token"] = csrfData.csrfToken;
    }

    return fetch(url, {
      ...options,
      headers,
      credentials: "same-origin"
    });
  }

  // MEMBER LOGIN
  const loginForm = document.getElementById("loginForm");

  if (loginForm) {
    loginForm.addEventListener("submit", async event => {
      event.preventDefault();

      const message = document.getElementById("loginMessage");
      message.textContent = "Signing in...";

      try {
        const response = await apiRequest("/api/login", {
          method: "POST",
          body: JSON.stringify({
            email: document.getElementById("loginEmail").value,
            password: document.getElementById("loginPassword").value
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Login failed.");
        }

        message.textContent = "Login successful!";
        window.location.href = "/member.html";

      } catch (error) {
        message.textContent = error.message;
      }
    });
  }

  // MEMBERSHIP APPLICATION
  const applyForm = document.getElementById("applyForm");

  if (applyForm) {
    applyForm.addEventListener("submit", async event => {
      event.preventDefault();

      const message = document.getElementById("applyMessage");
      message.textContent = "Submitting application...";

      try {
        const response = await apiRequest("/api/apply", {
          method: "POST",
          body: JSON.stringify({
            name: document.getElementById("appName").value,
            email: document.getElementById("appEmail").value,
            phone: document.getElementById("appPhone").value,
            reason: document.getElementById("appReason").value,
            password: document.getElementById("appPassword").value
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Application failed.");
        }

        message.textContent =
          "Your application has been submitted for review.";

        applyForm.reset();

      } catch (error) {
        message.textContent = error.message;
      }
    });
  }

  // CONTACT FORM
  const contactForm = document.getElementById("contactForm");

  if (contactForm) {
    contactForm.addEventListener("submit", async event => {
      event.preventDefault();

      const message = document.getElementById("contactResponse");
      message.textContent = "Sending message...";

      try {
        const response = await apiRequest("/api/contact", {
          method: "POST",
          body: JSON.stringify({
            name: document.getElementById("contactName").value,
            email: document.getElementById("contactEmail").value,
            subject: document.getElementById("contactSubject").value,
            message: document.getElementById("contactMessage").value
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Message could not be sent.");
        }

        message.textContent = "Your message has been sent successfully!";
        contactForm.reset();

      } catch (error) {
        message.textContent = error.message;
      }
    });
  }

  // LOAD UPCOMING EVENTS
  const eventsList = document.getElementById("eventsList");

  if (eventsList) {
    loadEvents();
  }

  async function loadEvents() {
    try {
      const response = await fetch("/api/events");
      const events = await response.json();

      if (!response.ok) {
        throw new Error("Could not load events.");
      }

      if (!events.length) {
        eventsList.innerHTML = "<p>No upcoming events at the moment. Please check back later.</p>";
        return;
      }

      eventsList.innerHTML = events.map(event => `
        <article class="event-card">
          <h3>${escapeHTML(event.title)}</h3>
          <p>${escapeHTML(event.description || "")}</p>
          <p><strong>Date:</strong> ${escapeHTML(event.date || "To be announced")}</p>
          <p><strong>Location:</strong> ${escapeHTML(event.location || "To be announced")}</p>
        </article>
      `).join("");

    } catch (error) {
      eventsList.innerHTML = "<p>Unable to load events. Please try again later.</p>";
    }
  }

  // SAFELY DISPLAY EVENT TEXT
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

});
