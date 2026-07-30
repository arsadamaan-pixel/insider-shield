// Insider-Shield — options page script (Phase 4/5).
//
// Local-dev fallback for setting this device's employee identity and
// org access credential. Managed policy (chrome.storage.managed.*)
// always takes precedence over these — see background.js's
// getEmployeeEmail()/getOrgAccessKey().

const form = document.getElementById("identity-form");
const fields = [
  { id: "employeeEmail", key: "employeeEmail" },
  { id: "orgAccessKey", key: "orgAccessKey" },
];
const status = document.getElementById("status");

chrome.storage.local.get(
  fields.map((f) => f.key),
  (data) => {
    for (const field of fields) {
      const input = document.getElementById(field.id);
      if (data[field.key]) input.value = data[field.key];
    }
  }
);

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const toSet = {};
  const toRemove = [];
  for (const field of fields) {
    const value = document.getElementById(field.id).value.trim();
    if (value) toSet[field.key] = value;
    else toRemove.push(field.key);
  }

  const done = () => {
    status.textContent = "Saved.";
  };

  chrome.storage.local.set(toSet, () => {
    if (toRemove.length > 0) {
      // set({key: undefined}) would not reliably clear a key — remove
      // any cleared fields separately.
      chrome.storage.local.remove(toRemove, done);
    } else {
      done();
    }
  });
});
