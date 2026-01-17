const refreshBtn = document.getElementById("refresh");
const statusPill = document.getElementById("status-pill");
const statusText = document.getElementById("status-text");
const statusDetail = document.getElementById("status-detail");
const statusBlock = document.getElementById("status-block");
const statusDot = statusBlock?.querySelector(".status-block__icon");
const registerForm = document.getElementById("register-form");
const registerResult = document.getElementById("register-result");
const registerTotp = document.getElementById("register-totp");
const loginForm = document.getElementById("login-form");
const loginResult = document.getElementById("login-result");
const messageForm = document.getElementById("message-form");
const messageResult = document.getElementById("message-result");
const sendStatus = document.getElementById("send-status");
const fileName = document.getElementById("file-name");
const messageCard = document.getElementById("message-card");

let authToken = null;

function setStatus(state, message) {
  const states = {
    checking: {
      pillClass: "pill muted",
      pillText: "Sprawdzam...",
      detail: message ?? "Oczekiwanie na odpowiedź...",
      blockColor: "#e5e7eb",
    },
    up: {
      pillClass: "pill good",
      pillText: "Backend działa",
      detail: message ?? "OK",
      blockColor: "#16a34a",
    },
    down: {
      pillClass: "pill bad",
      pillText: "Niedostępny",
      detail: message ?? "Brak połączenia",
      blockColor: "#dc2626",
    },
  };
  const cfg = states[state];
  if (!cfg) return;

  if (statusPill) {
    statusPill.className = cfg.pillClass;
    statusPill.textContent = cfg.pillText;
  }
  if (statusText) {
    statusText.className = cfg.pillClass;
    statusText.textContent = cfg.pillText;
  }
  if (statusDetail) {
    statusDetail.textContent = cfg.detail;
  }
  if (statusDot) {
    statusDot.style.background = cfg.blockColor;
    statusDot.style.boxShadow = `0 0 0 6px ${cfg.blockColor}20`;
  }
}

async function loadStatus() {
  setStatus("checking");
  try {
    const response = await fetch("/api/health");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.status === "ok") {
      setStatus("up", "Usługa odpowiada");
    } else {
      setStatus("down", "Nieoczekiwana odpowiedź");
    }
  } catch (error) {
    setStatus("down", "Błąd połączenia");
  }
}

refreshBtn?.addEventListener("click", loadStatus);
loadStatus();

function setSendState(text) {
  if (sendStatus) sendStatus.textContent = text;
}

registerForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  registerResult.textContent = "Rejestruję...";
  registerTotp.textContent = "";
  const formData = new FormData(registerForm);
  const payload = {
    email: formData.get("email"),
    password: formData.get("password"),
  };
  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Błąd rejestracji");
    registerResult.textContent = "Użytkownik utworzony.";
    registerTotp.textContent = `TOTP URI: ${data.totp_uri}`;
  } catch (err) {
    registerResult.textContent = err.message || "Błąd rejestracji";
  }
});

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginResult.textContent = "Logowanie...";
  const formData = new FormData(loginForm);
  const payload = {
    email: formData.get("email"),
    password: formData.get("password"),
    totp_code: formData.get("totp"),
  };
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Błąd logowania");
    authToken = data.access_token;
    loginResult.textContent = "Zalogowano. Token zapisany w sesji.";
    setSendState("zalogowany");
    updateMessageVisibility(true);
  } catch (err) {
    loginResult.textContent = err.message || "Błąd logowania";
    authToken = null;
    setSendState("wymaga zalogowania");
    updateMessageVisibility(false);
  }
});

let attachmentBase64 = null;
let attachmentFile = null;

messageForm?.file?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  attachmentBase64 = null;
  attachmentFile = file || null;
  if (!file) {
    fileName.textContent = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(",")[1];
    attachmentBase64 = base64;
    fileName.textContent = `${file.name} (${Math.round(file.size / 1024)} kB)`;
  };
  reader.readAsDataURL(file);
});

messageForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!authToken) {
    messageResult.textContent = "Zaloguj się, aby wysłać wiadomość.";
    return;
  }
  messageResult.textContent = "Wysyłam...";
  const formData = new FormData(messageForm);
  const attachments = [];
  if (attachmentBase64 && attachmentFile) {
    attachments.push({
      filename: attachmentFile.name,
      content_type: attachmentFile.type || "application/octet-stream",
      data_base64: attachmentBase64,
    });
  }
  const payload = {
    recipients: [formData.get("recipient")],
    subject: formData.get("subject"),
    body: formData.get("body"),
    attachments,
  };
  try {
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Błąd wysyłki");
    messageResult.textContent = `Wysłano. ID: ${data.id}`;
  } catch (err) {
    messageResult.textContent = err.message || "Błąd wysyłki";
  }
});

function updateMessageVisibility(isLoggedIn) {
  if (!messageCard) return;
  if (isLoggedIn) {
    messageCard.classList.remove("hidden");
  } else {
    messageCard.classList.add("hidden");
  }
}

updateMessageVisibility(false);
