import { ShieldAlert } from "lucide-react";

// Public page (see src/proxy.ts's PUBLIC_PATHS) — required by the
// Chrome Web Store listing for the extension/ agent. Served from this
// same Next.js deployment rather than a separate static host, since a
// stable public URL for this app already exists.
export const metadata = {
  title: "Insider-Shield — Privacy Policy",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center gap-2">
        <ShieldAlert className="h-6 w-6 text-emerald-400" />
        <span className="text-sm font-semibold tracking-wide text-slate-100">INSIDER-SHIELD</span>
      </div>

      <h1 className="text-2xl font-semibold text-slate-100">Insider-Shield Endpoint Agent — Privacy Policy</h1>
      <p className="mt-1 text-sm text-slate-500">Last updated: 1 August 2026</p>

      <div className="prose-invert mt-8 flex flex-col gap-6 text-sm leading-relaxed text-slate-300">
        <p>
          Insider-Shield is an open-source insider-threat detection and Data Loss Prevention (DLP) platform. The
          Chrome extension this policy covers (the &quot;endpoint agent&quot;) is <strong>self-hosted software</strong>:
          each organization that deploys Insider-Shield runs its own copy of the dashboard and database, and that
          organization — not the authors of the open-source project — controls the data described below. This
          listing is published for a specific Insider-Shield deployment; if you were given this extension by your
          employer or IT department, your organization&apos;s own administrators are the ones who can access,
          correct, or delete your data.
        </p>

        <section>
          <h2 className="mb-2 border-b border-slate-800 pb-1 text-base font-semibold text-slate-100">
            What this extension does
          </h2>
          <p>The extension only activates once your organization&apos;s administrator configures it with a private access token. Once connected, it can:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Send periodic &quot;heartbeat&quot; pings so your organization&apos;s security team can see that a managed device is online.</li>
            <li>Apply security policy pushed remotely from your organization&apos;s own dashboard (for example, turning detection features on or off).</li>
            <li>When — and only when — an administrator has explicitly enabled it, scan copy/paste activity for patterns that resemble sensitive data (credit card numbers, national ID/SSN numbers, API keys) and report a match.</li>
          </ul>
          <div className="mt-3 rounded-md border border-emerald-900/60 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
            Detection and content reporting are <strong>off by default</strong>. An administrator must explicitly
            enable them for your organization&apos;s deployment before any copy/paste activity is inspected at all.
          </div>
        </section>

        <section>
          <h2 className="mb-2 border-b border-slate-800 pb-1 text-base font-semibold text-slate-100">
            What data is collected
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Device liveness data</strong> — a timestamp, basic platform info (operating system and CPU architecture), and the device&apos;s IP address, sent with each heartbeat.</li>
            <li><strong>Employee identity</strong> — the email address configured for the device (either by your organization&apos;s managed policy or entered on the extension&apos;s options page), used to attribute activity to a person in your organization&apos;s dashboard.</li>
            <li><strong>DLP match metadata</strong> — only when detection is enabled by your administrator: the hostname where a match occurred, which detection rule matched (e.g. &quot;credit_card_like&quot;), and a <em>redacted</em> excerpt. The actual clipboard or pasted content is never stored or transmitted in full — only a masked excerpt and a rule name.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 border-b border-slate-800 pb-1 text-base font-semibold text-slate-100">
            Where this data goes
          </h2>
          <p>
            All data is sent directly to your own organization&apos;s Insider-Shield dashboard and stored in that
            organization&apos;s own database. The authors of the open-source Insider-Shield project do not operate a
            shared or central service, do not receive this data, and have no access to any organization&apos;s
            deployment.
          </p>
        </section>

        <section>
          <h2 className="mb-2 border-b border-slate-800 pb-1 text-base font-semibold text-slate-100">
            Data we do not collect
          </h2>
          <p>
            This extension does not collect health information, financial or payment details, personal
            communications (emails, chats), passwords or authentication credentials belonging to you, or a general
            history of websites you visit. Detection only inspects copy/paste activity, and only for the specific
            patterns listed above, and only while enabled.
          </p>
        </section>

        <section>
          <h2 className="mb-2 border-b border-slate-800 pb-1 text-base font-semibold text-slate-100">
            Sharing and selling of data
          </h2>
          <p>
            We do not sell user data. We do not share or transfer user data to third parties, except as necessary to
            operate the specific organization&apos;s own deployment (i.e., within that organization&apos;s own
            infrastructure). Data is never used to determine creditworthiness or for lending purposes.
          </p>
        </section>

        <section>
          <h2 className="mb-2 border-b border-slate-800 pb-1 text-base font-semibold text-slate-100">
            Data retention and deletion
          </h2>
          <p>
            Your organization&apos;s administrators control retention. The dashboard software provides
            administrators tools to permanently delete an employee&apos;s device/heartbeat history on request.
            Security-relevant records (DLP alerts, audit logs) may be retained separately for compliance purposes
            even after a device is removed — check with your organization&apos;s own IT or security team for their
            specific retention policy.
          </p>
        </section>

        <section>
          <h2 className="mb-2 border-b border-slate-800 pb-1 text-base font-semibold text-slate-100">Remote code</h2>
          <p>
            This extension does not execute remotely-fetched code. Policy updates received from the dashboard are
            applied only as plain configuration values (e.g. turning a feature on/off) — never as executable code.
          </p>
        </section>

        <section>
          <h2 className="mb-2 border-b border-slate-800 pb-1 text-base font-semibold text-slate-100">Contact</h2>
          <p>
            For questions about a specific organization&apos;s use of Insider-Shield, contact that organization&apos;s
            IT or security team. For questions about this specific deployment/listing, contact{" "}
            <a className="text-emerald-400 hover:underline" href="mailto:yesarsad7@gmail.com">
              yesarsad7@gmail.com
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-2 border-b border-slate-800 pb-1 text-base font-semibold text-slate-100">Source code</h2>
          <p>
            Insider-Shield is open source. The full source of this extension is available at{" "}
            <a
              className="text-emerald-400 hover:underline"
              href="https://github.com/arsadamaan-pixel/insider-shield"
            >
              github.com/arsadamaan-pixel/insider-shield
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
