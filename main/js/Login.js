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

document.getElementById("forgotLink").addEventListener("click", (e) => {
  e.preventDefault();
  alert("Ask an administrator to reset your password from Manage accounts.");
});
