// Sends signed-out visitors to the login page. Load right after auth-store.js.
// Cashiers only work from the POS (time tracker -> POS), never the main app.
(function () {
  var session = typeof MynelleAuth !== "undefined" ? MynelleAuth.getSession() : null;
  if (!session) {
    window.location.replace("Login.html");
  } else if (session.account && session.account.role === "cashier") {
    window.location.replace("../../pos/html/timetracker.html");
  }
})();
