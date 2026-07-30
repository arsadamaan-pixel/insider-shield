// Insider-Shield — content script (Phase 2)
//
// DLP listeners for clipboard/paste activity. Detected "sensitive"
// content never leaves this file as raw text — only a redacted excerpt
// and a rule name are sent to the background worker, which itself only
// transmits further if policy explicitly allows it (default: off).
//
// Clipboard scope note (confirmed choice): this includes active
// clipboard polling via navigator.clipboard.readText(), not just
// passive paste-event inspection. Chrome does not allow silent
// background clipboard reads from an arbitrary content script —
// navigator.clipboard.readText() requires the document to have focus
// and normally a user gesture/transient activation, even with the
// clipboardRead permission granted. Reliable silent reads on managed
// devices require the org's Chrome Enterprise policy (e.g.
// DefaultClipboardSetting / ClipboardAllowedForUrls) to pre-authorize
// it — this extension's permission alone does not bypass that. Reads
// here are therefore best-effort: attempted only while the tab has
// focus, wrapped in try/catch, and backed off after a failure instead
// of retried in a tight loop.

const DEFAULT_PATTERNS = [
  { name: "credit_card_like", regex: /\b(?:\d[ -]*?){13,16}\b/ },
  { name: "ssn_like", regex: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: "api_key_like", regex: /\b(sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16})\b/ },
];

const PASTE_SIZE_THRESHOLD = 500;
const DEBOUNCE_MS = 2000;
const CLIPBOARD_POLL_MS = 15000;

let sensitivePatterns = DEFAULT_PATTERNS;
let lastSentAt = new Map(); // ruleName -> timestamp, for debounce
let clipboardPollFailed = false;

chrome.storage.local.get(["policy"], (data) => {
  const configured = data.policy && Array.isArray(data.policy.sensitivePatterns) ? data.policy.sensitivePatterns : null;
  if (configured && configured.length > 0) {
    sensitivePatterns = configured
      .map((p) => {
        try {
          return { name: p.name, regex: new RegExp(p.pattern) };
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
});

function redactExcerpt(text) {
  if (text.length <= 4) return "*".repeat(text.length);
  return `${text.slice(0, 2)}${"*".repeat(Math.min(text.length - 4, 20))}${text.slice(-2)}`;
}

function shouldSend(ruleName) {
  const now = Date.now();
  const last = lastSentAt.get(ruleName) || 0;
  if (now - last < DEBOUNCE_MS) return false;
  lastSentAt.set(ruleName, now);
  return true;
}

function reportMatch(ruleName, text) {
  if (!shouldSend(ruleName)) return;
  chrome.runtime.sendMessage({
    type: "dlp_event",
    hostname: location.hostname,
    ts: Date.now(),
    ruleName,
    excerptRedacted: redactExcerpt(text),
  });
}

function inspectText(text, { sizeRuleName } = {}) {
  if (!text) return;

  for (const { name, regex } of sensitivePatterns) {
    if (regex.test(text)) {
      reportMatch(name, text);
    }
  }

  if (sizeRuleName && text.length > PASTE_SIZE_THRESHOLD) {
    reportMatch(sizeRuleName, text);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("[Insider-Shield] content script loaded on", location.href);
});

document.addEventListener("copy", () => {
  const selection = document.getSelection()?.toString() || "";
  if (selection.length > PASTE_SIZE_THRESHOLD) {
    reportMatch("large_copy_selection", selection);
  }
});

document.addEventListener("cut", () => {
  const selection = document.getSelection()?.toString() || "";
  if (selection.length > PASTE_SIZE_THRESHOLD) {
    reportMatch("large_cut_selection", selection);
  }
});

document.addEventListener("paste", (event) => {
  const text = event.clipboardData?.getData("text/plain") || "";
  inspectText(text, { sizeRuleName: "large_paste" });
});

// Best-effort active clipboard polling — see module header note on
// real browser constraints. Only runs while the document has focus.
setInterval(async () => {
  if (!document.hasFocus() || clipboardPollFailed) return;
  try {
    const text = await navigator.clipboard.readText();
    inspectText(text);
  } catch (err) {
    clipboardPollFailed = true;
    console.warn(
      "[Insider-Shield] active clipboard read unavailable (needs focus/gesture or enterprise clipboard policy):",
      err?.message || err
    );
  }
}, CLIPBOARD_POLL_MS);
