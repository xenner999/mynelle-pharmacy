const form = document.getElementById("loginForm");
const toggleBtn = document.getElementById("togglePass");
const passInput = document.getElementById("password");
const eyeIcon = document.getElementById("eyeIcon");
const errorMsg = document.getElementById("errorMsg");
const loginBtn = document.getElementById("loginBtn");

const eyeOpen =
  '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path><circle cx="12" cy="12" r="3"></circle>';
const eyeClosed =
  '<path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.6 20.6 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 5c7 0 11 7 11 7a20.6 20.6 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';

toggleBtn.addEventListener("click", () => {
  const isPassword = passInput.type === "password";
  passInput.type = isPassword ? "text" : "password";
  toggleBtn.setAttribute("aria-pressed", String(isPassword));
  toggleBtn.setAttribute(
    "aria-label",
    isPassword ? "Hide password" : "Show password",
  );
  eyeIcon.innerHTML = isPassword ? eyeOpen : eyeClosed;
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const identifier = document.getElementById("username").value.trim();
  const password = passInput.value;

  if (!identifier || !password) {
    errorMsg.textContent = "Please enter both username and password.";
    return;
  }

  errorMsg.textContent = "";
  loginBtn.disabled = true;
  loginBtn.textContent = "Logging in...";

  try {
    // MynelleAuth (auth-store.js) tries a real /api/auth/login backend
    // first, and automatically falls back to a local account check when
    // no database is connected yet -- no code changes needed either way.
    const account = await MynelleAuth.login({ identifier, password });
    // Cashiers start at the time tracker (check in, then open the POS); admins and pharmacists get the dashboard.
    window.location.href =
      account && account.role === "cashier"
        ? "../../pos/html/timetracker.html"
        : "dashboard.html";
  } catch (err) {
    errorMsg.textContent = err.message || "Login failed. Please try again.";
    loginBtn.disabled = false;
    loginBtn.textContent = "Login";
  }
});

// Forgot password: its own screen. Only the username is typed; the email is found automatically.
const forgotLink = document.getElementById("forgotLink");
const forgotForm = document.getElementById("forgotForm");
const forgotUser = document.getElementById("forgotUser");
const forgotError = document.getElementById("forgotError");
const forgotInfo = document.getElementById("forgotInfo");
const forgotBtn = document.getElementById("forgotBtn");
const pageTitle = document.querySelector(".auth-title");
const pageSub = document.querySelector(".auth-subtitle");
const loginTitle = pageTitle.textContent;
const loginSub = pageSub.textContent;

function showForgot(show) {
  form.hidden = show;
  forgotForm.hidden = !show;
  pageTitle.textContent = show ? "Reset password" : loginTitle;
  pageSub.textContent = show ? "Enter your username and we will email you a reset link." : loginSub;
  forgotError.textContent = "";
  forgotInfo.textContent = "";
  if (show) {
    forgotUser.value = document.getElementById("username").value.trim();
    forgotUser.focus();
  }
}
forgotLink.addEventListener("click", (e) => { e.preventDefault(); showForgot(true); });
document.getElementById("backToLogin").addEventListener("click", (e) => { e.preventDefault(); showForgot(false); });

forgotForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  forgotError.textContent = "";
  forgotInfo.textContent = "";
  forgotBtn.disabled = true;
  forgotBtn.textContent = "Sending...";
  try {
    const result = await MynelleAuth.requestPasswordReset(forgotUser.value);
    forgotInfo.textContent =
      "A reset link was sent to " + result.email + ". Open it within 30 minutes (check Spam too).";
  } catch (err) {
    forgotError.textContent = err.message || "Could not send the reset link.";
  } finally {
    forgotBtn.disabled = false;
    forgotBtn.textContent = "Reset";
  }
});

// Opened from the email link: Login.html?reset=TOKEN -> show the new-password form.
(async function showResetIfLinked() {
  const token = new URLSearchParams(window.location.search).get("reset");
  if (!token) return;
  const resetForm = document.getElementById("resetForm");
  const resetError = document.getElementById("resetError");
  const resetBtn = document.getElementById("resetBtn");
  const title = pageTitle;
  const subtitle = pageSub;
  form.hidden = true;
  resetForm.hidden = false;
  title.textContent = "Reset password";

  const account = await MynelleAuth.checkResetToken(token);
  if (!account) {
    subtitle.textContent = "";
    resetForm.querySelectorAll("label, .field, #resetBtn").forEach((el) => (el.hidden = true));
    resetError.textContent = "This reset link is invalid or has expired. Go back and request a new one.";
    return;
  }
  const noun = account.role === "cashier" ? "PIN" : "password";
  subtitle.textContent = "Choose a new " + noun + " for " + account.username + ".";
  document.getElementById("newPasswordLabel").textContent = "New " + noun;
  document.getElementById("confirmPasswordLabel").textContent = "Confirm new " + noun;
  document.getElementById("newPassword").placeholder =
    account.role === "cashier" ? "4 to 6 digits" : "At least 8 characters";

  resetForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    resetError.textContent = "";
    resetBtn.disabled = true;
    resetBtn.textContent = "Saving...";
    try {
      await MynelleAuth.resetPasswordWithToken(
        token,
        document.getElementById("newPassword").value,
        document.getElementById("confirmPassword").value
      );
      alert("Your " + noun + " was changed. You can log in now.");
      window.location.href = "Login.html";
    } catch (err) {
      resetError.textContent = err.message || "Could not reset. Try again.";
      resetBtn.disabled = false;
      resetBtn.textContent = "Set new password";
    }
  });
})();
