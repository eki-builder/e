/* =========================
FILE OVERVIEW
========================= */
// Authentication flows: signup, login, email verification, password reset.
// Requires config.js and alert.js to be loaded first.

const VERIFY_COOLDOWN = 60;
let verifyTimer = null;

/* =========================
UTILITY / HELPER FUNCTIONS
========================= */
function togglePassword(inputId, el) {
  const input = document.getElementById(inputId);
  const img = el.querySelector('img');

  if (input.type === "password") {
    input.type = "text";
    img.src = "assets/eye-off.svg";
  } else {
    input.type = "password";
    img.src = "assets/eye.svg";
  }
}

/* =========================
CORE BUSINESS LOGIC
========================= */
async function login() {
  const email = loginEmail.value.trim();
  const password = loginPassword.value.trim();

  if (!email || !password) {
    showToast("Please enter your email and password", "warning");
    return;
  }

  const btn = document.getElementById("loginBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Logging in…"; }

  try {
    try { await account.deleteSessions(); } catch (e) {}

    await account.createEmailPasswordSession(email, password);
    window.location.href = "dashboard.html";

  } catch (err) {
    showToast(err.message || "Login failed", "error");
    if (btn) { btn.disabled = false; btn.textContent = "Log in"; }
  }
}

async function signup() {
  const name = signupName ? signupName.value.trim() : "";
  const email = signupEmail.value.trim();
  const password = signupPassword.value.trim();

  if (!email || !password) {
    showToast("All fields are required", "warning");
    return;
  }

  if (password.length < 8) {
    showToast("Password must be at least 8 characters", "warning");
    return;
  }

  const username = name || getUsernameFromEmail(email);
  const btn = document.getElementById("signupBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Creating account…"; }

  try {
    try { await account.deleteSessions(); } catch (e) {}

    const user = await account.create(ID.unique(), email, password, username);

    await account.createEmailPasswordSession(email, password);

    // Create a profile document for this user
    try {
      await databases.createDocument(DB_ID, COL_PROFILES, user.$id, {
        userId: user.$id,
        displayName: username,
        email,
        theme: "light"
      });
    } catch (e) {
      console.warn("Profile creation skipped:", e.message);
    }

    await account.createVerification(`${location.origin}${location.pathname.replace(/signup\.html$/, "")}verify.html`);

    window.location.href = "verify-info.html";

  } catch (err) {
    showToast(err.message || "Signup failed", "error");
    if (btn) { btn.disabled = false; btn.textContent = "Create account"; }
  }
}

async function sendReset() {
  const email = document.getElementById("resetEmail").value.trim();

  if (!email) {
    showToast("Please enter your email", "warning");
    return;
  }

  try {
    await account.createRecovery(email, `${location.origin}${location.pathname.replace(/login\.html$/, "")}reset-password.html`);
    showToast("Password reset link sent to your email", "success");
    closeResetModal();
  } catch (err) {
    showToast(err.message || "Failed to send email", "error");
  }
}

async function resetPassword() {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get("userId");
  const secret = params.get("secret");

  const password = document.getElementById("newPassword").value.trim();
  const confirm = document.getElementById("confirmPassword").value.trim();

  if (!userId || !secret) {
    showToast("This reset link is invalid or expired", "error");
    return;
  }
  if (!password || !confirm) {
    showToast("All fields are required", "warning");
    return;
  }
  if (password.length < 8) {
    showToast("Password must be at least 8 characters", "warning");
    return;
  }
  if (password !== confirm) {
    showToast("Passwords do not match", "warning");
    return;
  }

  try {
    await account.updateRecovery(userId, secret, password);
    showToast("Password reset. Please log in.", "success");
    setTimeout(() => window.location.href = "login.html", 1200);
  } catch (err) {
    showToast(err.message || "Reset failed", "error");
  }
}

async function completeVerification() {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get("userId");
  const secret = params.get("secret");
  const statusEl = document.getElementById("verifyStatus");

  if (!userId || !secret) {
    if (statusEl) statusEl.textContent = "This verification link is invalid or expired.";
    return;
  }

  try {
    await account.updateVerification(userId, secret);
    if (statusEl) statusEl.textContent = "Your email is verified. Redirecting…";
    setTimeout(() => window.location.href = "dashboard.html", 1500);
  } catch (err) {
    if (statusEl) statusEl.textContent = err.message || "Verification failed.";
  }
}

async function resendVerification() {
  const btn = document.getElementById("resendVerifyBtn");
  const countdownEl = document.getElementById("resendCountdown");

  try {
    btn.disabled = true;
    btn.classList.add("hidden");

    await account.createVerification(`${location.origin}${location.pathname.replace(/verify-info\.html$/, "")}verify.html`);
    showToast("Verification email sent", "success");
    startVerifyCountdown(btn, countdownEl);
  } catch (err) {
    btn.disabled = false;
    btn.classList.remove("hidden");
    showToast(err.message || "Failed to resend email", "error");
  }
}

function startVerifyCountdown(btn, countdownEl) {
  btn.classList.add("hidden");
  btn.disabled = true;

  let remaining = VERIFY_COOLDOWN;
  countdownEl.classList.remove("hidden");
  countdownEl.textContent = `Resend available in ${remaining}s`;

  if (verifyTimer) clearInterval(verifyTimer);

  verifyTimer = setInterval(() => {
    remaining--;
    countdownEl.textContent = `Resend available in ${remaining}s`;

    if (remaining <= 0) {
      clearInterval(verifyTimer);
      verifyTimer = null;
      countdownEl.classList.add("hidden");
      btn.classList.remove("hidden");
      btn.disabled = false;
    }
  }, 1000);
}

/* =========================
UI INTERACTION LOGIC
========================= */
function openResetModal() { document.getElementById("resetModal").classList.remove("hidden"); }
function closeResetModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById("resetModal").classList.add("hidden");
}

/* =========================
INITIALIZATION / BOOTSTRAP
========================= */
document.addEventListener("DOMContentLoaded", () => {
  const resendBtn = document.getElementById("resendVerifyBtn");
  const countdownEl = document.getElementById("resendCountdown");

  if (resendBtn && countdownEl) {
    resendBtn.disabled = true;
    resendBtn.classList.add("hidden");
    startVerifyCountdown(resendBtn, countdownEl);
  }

  if (document.getElementById("verifyStatus")) {
    completeVerification();
  }
});
