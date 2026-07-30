// Insider-Shield — options page script (Phase 4).
//
// Local-dev fallback for setting this device's employee identity.
// Managed policy (chrome.storage.managed.employeeEmail) always takes
// precedence over this — see background.js's getEmployeeEmail().

const form = document.getElementById("identity-form");
const input = document.getElementById("employeeEmail");
const status = document.getElementById("status");

chrome.storage.local.get(["employeeEmail"], (data) => {
  if (data.employeeEmail) input.value = data.employeeEmail;
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = input.value.trim();

  const done = () => {
    status.textContent = value ? `Saved: ${value}` : "Cleared.";
  };

  if (value) {
    chrome.storage.local.set({ employeeEmail: value }, done);
  } else {
    // set({employeeEmail: undefined}) would not reliably clear the key.
    chrome.storage.local.remove("employeeEmail", done);
  }
});
