// On-screen numeric keypad for the POS (touch screens / no keyboard).
// Pure helpers: html() draws it, apply() edits a number string, bind() wires clicks.
var PosKeypad = (function () {
  function html(opts) {
    opts = opts || {};
    var quick = (opts.quick || [100, 200, 500, 1000]).map(function (n) {
      return '<button type="button" class="kp-q" data-key="q:' + n + '">\u20B1' + n.toLocaleString("en-PH") + "</button>";
    }).join("");
    var keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", opts.decimal === false ? "00" : ".", "0", "back"];
    return (
      '<div class="kp">' +
      '<div class="kp-quick"><button type="button" class="kp-q kp-exact" data-key="exact">Exact</button>' + quick +
      '<button type="button" class="kp-q kp-clear" data-key="clear">Clear</button></div>' +
      '<div class="kp-grid">' +
      keys.map(function (k) {
        return '<button type="button" class="kp-k' + (k === "back" ? " kp-back" : "") + '" data-key="' + k + '" aria-label="' + (k === "back" ? "Backspace" : k) + '">' + (k === "back" ? "\u232B" : k) + "</button>";
      }).join("") +
      "</div></div>"
    );
  }

  // value: current string, key: "0".."9" | "." | "back" | "clear". Returns the new string.
  function apply(value, key, opts) {
    value = String(value || "");
    opts = opts || {};
    var maxLen = opts.maxLen || 9;
    if (key === "clear") return "";
    if (key === "back") return value.slice(0, -1);
    if (key === ".") {
      if (opts.decimal === false || value.indexOf(".") !== -1) return value;
      return (value || "0") + ".";
    }
    if (!/^\d+$/.test(key)) return value;
    var dot = value.indexOf(".");
    if (dot !== -1 && value.length - dot > 2) return value; // max 2 decimals
    if (value === "0" || value === "") {
      if (/^0+$/.test(key)) return value === "" ? "" : value; // no leading zeros
      return key.replace(/^0+/, "");
    }
    return (value + key).slice(0, maxLen);
  }

  function bind(root, onKey) {
    root.addEventListener("mousedown", function (e) {
      if (e.target.closest("[data-key]")) e.preventDefault(); // keep focus in the input
    });
    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-key]");
      if (b) onKey(b.getAttribute("data-key"));
    });
  }

  return { html: html, apply: apply, bind: bind };
})();
