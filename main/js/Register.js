const form = document.getElementById("registerForm");
const toggleBtn = document.getElementById("toggleRegPass");
const passInput = document.getElementById("regPassword");
const eyeIcon = document.getElementById("eyeIconReg");
const errorMsg = document.getElementById("regErrorMsg");
const successMsg = document.getElementById("regSuccessMsg");
const registerBtn = document.getElementById("registerBtn");

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

  const fullName = document.getElementById("fullName").value.trim();
  const email = document.getElementById("email").value.trim();
  const username = document.getElementById("regUsername").value.trim();
  const password = passInput.value;
  const confirmPassword = document.getElementById("confirmPassword").value;
  const accessCode = document.getElementById("accessCode").value;

  errorMsg.textContent = "";
  successMsg.textContent = "";

  if (!fullName || !email || !username || !password || !confirmPassword || !accessCode) {
    errorMsg.textContent = "Please fill in every field.";
    return;
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    errorMsg.textContent = "Please enter a valid email address.";
    return;
  }

  if (password.length < 8) {
    errorMsg.textContent = "Password must be at least 8 characters.";
    return;
  }

  if (password !== confirmPassword) {
    errorMsg.textContent = "Passwords do not match.";
    return;
  }

  registerBtn.disabled = true;
  registerBtn.textContent = "Creating account...";

  try {
    // MynelleAuth (auth-store.js) tries a real /api/auth/register backend
    // first, and automatically falls back to a local, localStorage-backed
    // account so the page keeps working before a database is connected.
    await MynelleAuth.registerAdmin({
      fullName,
      email,
      username,
      password,
      accessCode,
    });

    successMsg.textContent = "Admin account created! Redirecting to your dashboard...";
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 900);
  } catch (err) {
    errorMsg.textContent = err.message || "Could not create the account. Please try again.";
    registerBtn.disabled = false;
    registerBtn.textContent = "Create admin account";
  }
});
