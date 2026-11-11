
async function request(url, options = {}) {
  const token = await fetch("/api/csrf")
    .then(r => r.json());

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": token.csrfToken,
      ...(options.headers || {})
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function addText(parent, tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  parent.appendChild(element);
}

async function loadDashboard() {
  try {
    const me = await fetch("/api/me").then(r => r.json());

    if (!me.user) {
      location.href = "/#membership";
      return;
    }

    document.getElementById("welcome").textContent =
      "Welcome, " + me.user.full_name;

    const [announcements, events] = await Promise.all([
      request("/api/announcements"),
      request("/api/events")
    ]);

    const announcementBox =
      document.getElementById("announcements");

    announcementBox.replaceChildren();

    if (!announcements.announcements.length) {
      announcementBox.textContent =
        "No announcements yet.";
    }

    announcements.announcements.forEach(item => {
      const card = document.createElement("div");
      card.className = "event";

      addText(card, "h3", item.title);
      addText(card, "p", item.body);
      addText(card, "small", item.created_at);

      announcementBox.appendChild(card);
    });

    const eventBox = document.getElementById("events");
    eventBox.replaceChildren();

    if (!events.events.length) {
      eventBox.textContent = "No upcoming events yet.";
    }

    events.events.forEach(item => {
      const card = document.createElement("div");
      card.className = "event";

      addText(card, "h3", item.title);
      addText(card, "p",
        [item.event_date, item.venue]
          .filter(Boolean).join(" • ")
      );
      addText(card, "p", item.description);

      eventBox.appendChild(card);
    });

  } catch (error) {
    document.getElementById("welcome").textContent =
      error.message;
  }
}

document.getElementById("logout")
.addEventListener("click", async () => {
  try {
    await request("/api/logout", {
      method: "POST",
      body: "{}"
    });
  } finally {
    location.href = "/";
  }
});

loadDashboard();
