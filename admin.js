
async function api(url, options = {}) {
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

function element(tag, text) {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}

// Load admin dashboard
async function loadAdmin() {
  try {
    const me = await fetch("/api/me").then(r => r.json());

    if (!me.user || me.user.role !== "admin") {
      location.href = "/#membership";
      return;
    }

    // Pending applications
    const data = await api("/api/admin/pending");
    const box = document.getElementById("pending");

    box.replaceChildren();

    if (!data.applicants.length) {
      box.textContent = "No pending applications.";
    }

    data.applicants.forEach(applicant => {
      const card = document.createElement("div");
      card.className = "event";

      card.append(
        element("h3", applicant.full_name),
        element("p", applicant.email)
      );

      const approve = element("button", "APPROVE");
      approve.className = "btn";

      approve.addEventListener("click", async () => {
        try {
          await api(
            `/api/admin/members/${applicant.id}/approve`,
            { method: "POST", body: "{}" }
          );

          loadAdmin();
        } catch (error) {
          alert(error.message);
        }
      });

      const reject = element("button", "DECLINE");
      reject.className = "btn outline";

      reject.addEventListener("click", async () => {
        try {
          await api(
            `/api/admin/members/${applicant.id}/reject`,
            { method: "POST", body: "{}" }
          );

          loadAdmin();
        } catch (error) {
          alert(error.message);
        }
      });

      card.append(approve, reject);
      box.appendChild(card);
    });

    // Contact messages
    const messageData = await api("/api/admin/messages");
    const messageBox = document.getElementById("messages");

    messageBox.replaceChildren();

    if (!messageData.messages.length) {
      messageBox.textContent = "No messages received.";
    }

    messageData.messages.forEach(message => {
      const card = document.createElement("div");
      card.className = "event";

      card.append(
        element("h3", message.subject),
        element("p", message.name + " — " + message.email),
        element("p", message.message),
        element("small", message.created_at)
      );

      messageBox.appendChild(card);
    });

  } catch (error) {
    document.getElementById("pending").textContent =
      error.message;
  }
}

// Publish announcement
document.getElementById("announcementForm")
.addEventListener("submit", async event => {
  event.preventDefault();

  const form = new FormData(event.currentTarget);

  try {
    const result = await api(
      "/api/admin/announcements",
      {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          body: form.get("body")
        })
      }
    );

    document.getElementById("announcementStatus")
      .textContent = result.message;

    event.currentTarget.reset();

  } catch (error) {
    document.getElementById("announcementStatus")
      .textContent = error.message;
  }
});

// Add upcoming event
document.getElementById("eventForm")
.addEventListener("submit", async event => {
  event.preventDefault();

  const form = new FormData(event.currentTarget);

  try {
    const result = await api(
      "/api/admin/events",
      {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          eventDate: form.get("eventDate"),
          venue: form.get("venue"),
          description: form.get("description")
        })
      }
    );

    document.getElementById("eventStatus")
      .textContent = result.message;

    event.currentTarget.reset();

  } catch (error) {
    document.getElementById("eventStatus")
      .textContent = error.message;
  }
});

// Logout
document.getElementById("logout")
.addEventListener("click", async () => {
  try {
    await api("/api/logout", {
      method: "POST",
      body: "{}"
    });
  } finally {
    location.href = "/";
  }
});

loadAdmin();
