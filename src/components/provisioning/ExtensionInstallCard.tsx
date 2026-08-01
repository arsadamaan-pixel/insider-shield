"use client";

import { useState } from "react";
import { Puzzle, Copy, Check } from "lucide-react";

interface ExtensionInstallCardProps {
  installUrl: string | null;
}

export function ExtensionInstallCard({ installUrl }: ExtensionInstallCardProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!installUrl) return;
    await navigator.clipboard.writeText(installUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Puzzle className="h-4 w-4 text-emerald-400" />
        <p className="text-sm font-semibold text-slate-200">Endpoint Agent Install Link</p>
      </div>

      {installUrl ? (
        <>
          <button
            type="button"
            onClick={handleCopy}
            title={installUrl}
            className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
          >
            <Puzzle className="h-4 w-4 text-emerald-400" />
            {copied ? "Copied!" : "Copy Extension Link"}
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-slate-500" />
            )}
          </button>
          <p className="mt-2 text-[10px] text-slate-600">
            Send this to an employee to install the extension, then have them paste the token above into its options
            page. Same link works for every device — the extension asks for its own server URL and token, so it
            isn&apos;t tied to any one deployment.
          </p>
        </>
      ) : (
        <p className="text-xs text-slate-500">
          Not configured. Publish the extension (see <code>extension/</code>) to the Chrome Web Store and set{" "}
          <code>EXTENSION_INSTALL_URL</code> in your environment to show a copyable install link here.
        </p>
      )}
    </div>
  );
}
