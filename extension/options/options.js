// Insider-Shield — options page script (Phase 4/5/8).
//
// Local-dev fallback for setting this device's employee identity, org
// access credential, and WS server URL. Managed policy
// (chrome.storage.managed.*) always takes precedence over these — see
// background.js's getEmployeeEmail()/getOrgAccessKey()/getEffectivePolicy().
//
// employeeEmail/orgAccessKey are flat chrome.storage.local keys.
// wsEndpoint is different: it lives inside the nested `policy` object
// background.js's getEffectivePolicy() already reads/merges (the same
// place `dlpEnabled`/`transmitEvents`/etc. live, e.g. from an OTA
// policy_update push) — so saving it here reads the existing `policy`
// object first and only overwrites the one field, instead of clobbering
// whatever else is already set there.

const form = document.getElementById("identity-form");
const flatFields = [
  { id: "employeeEmail", key: "employeeEmail" },
  { id: "orgAccessKey", key: "orgAccessKey" },
];
const status = document.getElementById("status");
const wsEndpointInput = document.getElementById("wsEndpoint");

chrome.storage.local.get([...flatFields.map((f) => f.key), "policy"], (data) => {
  for (const field of flatFields) {
    const input = document.getElementById(field.id);
    if (data[field.key]) input.value = data[field.key];
  }
  if (data.policy && data.policy.wsEndpoint) {
    wsEndpointInput.value = data.policy.wsEndpoint;
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const toSet = {};
  const toRemove = [];
  for (const field of flatFields) {
    const value = document.getElementById(field.id).value.trim();
    if (value) toSet[field.key] = value;
    else toRemove.push(field.key);
  }

  const done = () => {
    status.textContent = "Saved.";
  };

  chrome.storage.local.get(["policy"], (data) => {
    const currentPolicy = data.policy && typeof data.policy === "object" ? data.policy : {};
    const wsEndpointValue = wsEndpointInput.value.trim();
    const nextPolicy = { ...currentPolicy };
    if (wsEndpointValue) {
      nextPolicy.wsEndpoint = wsEndpointValue;
    } else {
      delete nextPolicy.wsEndpoint;
    }
    toSet.policy = nextPolicy;

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
});
