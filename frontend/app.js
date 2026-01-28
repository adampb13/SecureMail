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
const logoutBtn = document.getElementById("logout-btn");
const messageForm = document.getElementById("message-form");
const messageResult = document.getElementById("message-result");
const sendStatus = document.getElementById("send-status");
const fileName = document.getElementById("file-name");
const messageCard = document.getElementById("message-card");
const inboxList = document.getElementById("inbox-list");
const inboxRefresh = document.getElementById("inbox-refresh");
const detailEmpty = document.getElementById("detail-empty");
const detailView = document.getElementById("detail-view");
const detailMeta = document.getElementById("detail-meta");
const detailSubject = document.getElementById("detail-subject");
const detailBody = document.getElementById("detail-body");
const detailAttachments = document.getElementById("detail-attachments");
const detailVerify = document.getElementById("detail-verify");
const detailMarkUnread = document.getElementById("detail-mark-unread");
const detailDelete = document.getElementById("detail-delete");
const mailboxTabs = document.querySelectorAll("[data-mailbox-tab]");

let authToken = null;
let currentMessage = null;
const STORAGE_KEY = "securemail_token";
const FORCED_DOMAIN = "@smail.com";

function parseDetail(detail) {
  if (!detail) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => item.msg || item.detail || item.error || JSON.stringify(item))
      .join("; ");
  }
  if (typeof detail === "object") {
    return detail.msg || detail.detail || detail.error || JSON.stringify(detail);
  }
  return "";
}

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

function setAuthToken(token) {
  authToken = token;
  if (token) {
    sessionStorage.setItem(STORAGE_KEY, token);
    setSendState("zalogowany");
    updateMessageVisibility(true);
    logoutBtn?.classList.remove("hidden");
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
    setSendState("wymaga zalogowania");
    updateMessageVisibility(false);
    logoutBtn?.classList.add("hidden");
  }
}

function parseRecipients(value) {
  if (!value) return [];
  const parts = value
    .split(/[,\s;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return Array.from(new Set(parts));
}

function updateVerifyIndicator(verified) {
  if (!detailVerify) return;
  if (verified === true) {
    detailVerify.className = "pill good";
    detailVerify.textContent = "Zweryfikowana";
  } else if (verified === false) {
    detailVerify.className = "pill bad";
    detailVerify.textContent = "Niezweryfikowana";
  } else {
    detailVerify.className = "pill muted";
    detailVerify.textContent = "Weryfikacja";
  }
}

function updateDetailActions() {
  if (detailMarkUnread) {
    if (currentMessage && currentMessage.read_at) {
      detailMarkUnread.classList.remove("hidden");
    } else {
      detailMarkUnread.classList.add("hidden");
    }
  }
  if (detailDelete) {
    if (currentMessage) {
      detailDelete.classList.remove("hidden");
    } else {
      detailDelete.classList.add("hidden");
    }
  }
}

function resetDetailView() {
  currentMessage = null;
  if (detailMeta) detailMeta.textContent = "";
  if (detailSubject) detailSubject.textContent = "";
  if (detailBody) detailBody.textContent = "";
  if (detailAttachments) detailAttachments.innerHTML = "";
  updateVerifyIndicator(null);
  updateDetailActions();
}

async function markRead(id) {
  const res = await fetch(`/api/messages/${id}/read`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) {
    throw new Error("Blad oznaczenia jako odczytana");
  }
}

async function markUnread(id) {
  const res = await fetch(`/api/messages/${id}/unread`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) {
    throw new Error("Blad oznaczenia jako nieodczytana");
  }
}

async function deleteMessage(id) {
  const res = await fetch(`/api/messages/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) {
    throw new Error("Blad usuwania wiadomosci");
  }
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
    if (!res.ok) {
      const msg = parseDetail(data.detail) || "Błąd rejestracji";
      throw new Error(msg);
    }
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
    if (!res.ok) {
      const msg = parseDetail(data.detail) || "Blad logowania";
      throw new Error(msg);
    }
    setAuthToken(data.access_token);
    loginResult.textContent = "Zalogowano. Sesja zapisana.";
    await loadInbox();
  } catch (err) {
    loginResult.textContent = err.message || "Blad logowania";
    setAuthToken(null);
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
  const recipients = parseRecipients(formData.get("recipients"));
  if (!recipients.length) {
    messageResult.textContent = "Podaj co najmniej jednego odbiorce.";
    return;
  }
  const attachments = [];
  if (attachmentBase64 && attachmentFile) {
    attachments.push({
      filename: attachmentFile.name,
      content_type: attachmentFile.type || "application/octet-stream",
      data_base64: attachmentBase64,
    });
  }
  const payload = {
    recipients,
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
    messageResult.textContent = "Wyslano.";
    attachmentBase64 = null;
    attachmentFile = null;
    fileName.textContent = "";
    messageForm.reset();
    await loadInbox();
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
    resetDetailView();
  }
}

async function loadInbox() {
  if (!authToken || !inboxList) return;
  inboxList.innerHTML = "<li class='muted small'>Ładowanie...</li>";
  try {
    const res = await fetch("/api/messages", {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (res.status === 401) {
      setAuthToken(null);
      throw new Error("Sesja wygasla. Zaloguj sie ponownie.");
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Błąd pobierania wiadomości");
    renderInbox(data);
  } catch (err) {
    inboxList.innerHTML = `<li class='muted small'>${err.message || "Błąd pobierania"}</li>`;
  }
}

function renderInbox(items) {
  if (!inboxList) return;
  if (!items.length) {
    inboxList.innerHTML = "<li class='muted small'>Brak wiadomości.</li>";
    detailEmpty?.classList.remove("hidden");
    detailView?.classList.add("hidden");
    return;
  }
  inboxList.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    const isUnread = !item.read_at;
    li.className = `inbox__item${isUnread ? " inbox__item--unread" : ""}`;
    const title = document.createElement("p");
    title.className = "inbox__title";
    title.textContent = item.subject || "";
    const meta = document.createElement("p");
    meta.className = "inbox__meta";
    const sender = item.sender_email || "";
    const createdAt = item.created_at ? new Date(item.created_at).toLocaleString() : "";
    meta.textContent = `Od: ${sender} - ${createdAt}`;
    li.append(title, meta);
    li.addEventListener("click", () => selectMessage(item.id));
    inboxList.appendChild(li);
  });
}

async function selectMessage(id) {
  if (!authToken) return;
  detailEmpty?.classList.add("hidden");
  detailView?.classList.add("hidden");
  if (detailMeta) detailMeta.textContent = "Ladowanie...";
  try {
    const res = await fetch(`/api/messages/${id}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Blad pobierania wiadomosci");
    currentMessage = data;
    detailMeta.textContent = `Od: ${data.sender_email} - ${new Date(data.created_at).toLocaleString()}`;
    detailSubject.textContent = data.subject;
    detailBody.textContent = data.body;
    renderAttachments(data.attachments);
    updateVerifyIndicator(data.verified);
    updateDetailActions();
    detailView?.classList.remove("hidden");
    if (!data.read_at) {
      try {
        await markRead(id);
        currentMessage.read_at = new Date().toISOString();
        updateDetailActions();
        await loadInbox();
      } catch (err) {
        detailMeta.textContent = err.message || "Blad oznaczenia jako odczytana";
      }
    }
  } catch (err) {
    if (detailMeta) detailMeta.textContent = err.message || "Blad pobierania";
    currentMessage = null;
    updateVerifyIndicator(null);
    updateDetailActions();
    detailView?.classList.add("hidden");
    detailEmpty?.classList.remove("hidden");
  }
}

function renderAttachments(attachments) {
  if (!detailAttachments) return;
  detailAttachments.innerHTML = "";
  if (!attachments || !attachments.length) {
    detailAttachments.innerHTML = "<p class='muted small'>Brak załączników.</p>";
    return;
  }
  const container = document.createElement("div");
  container.className = "attachments";
  attachments.forEach((att) => {
    const btn = document.createElement("a");
    btn.href = "#";
    btn.textContent = `${att.filename} (${Math.round(att.size / 1024) || att.size} kB)`;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      downloadAttachment(att.id, att.filename, att.content_type);
    });
    container.appendChild(btn);
  });
  detailAttachments.appendChild(container);
}

async function downloadAttachment(id, filename, contentType) {
  if (!authToken) return;
  try {
    const res = await fetch(`/api/attachments/${id}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) throw new Error("Błąd pobierania");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || `attachment-${id}`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    messageResult.textContent = err.message || "Błąd pobierania załącznika";
  }
}

logoutBtn?.addEventListener("click", () => {
  setAuthToken(null);
  if (loginResult) loginResult.textContent = "Wylogowano.";
  if (messageResult) messageResult.textContent = "";
});

detailMarkUnread?.addEventListener("click", async () => {
  if (!authToken || !currentMessage) return;
  try {
    await markUnread(currentMessage.id);
    currentMessage.read_at = null;
    updateDetailActions();
    await loadInbox();
  } catch (err) {
    if (detailMeta) detailMeta.textContent = err.message || "Blad oznaczenia jako nieodczytana";
  }
});

detailDelete?.addEventListener("click", async () => {
  if (!authToken || !currentMessage) return;
  try {
    await deleteMessage(currentMessage.id);
    resetDetailView();
    detailView?.classList.add("hidden");
    detailEmpty?.classList.remove("hidden");
    await loadInbox();
  } catch (err) {
    if (detailMeta) detailMeta.textContent = err.message || "Blad usuwania wiadomosci";
  }
});

inboxRefresh?.addEventListener("click", loadInbox);

const storedToken = sessionStorage.getItem(STORAGE_KEY);
if (storedToken) {
  setAuthToken(storedToken);
  if (loginResult) loginResult.textContent = "Sesja przywrocona.";
  loadInbox();
} else {
  setAuthToken(null);
}
