export const metadata = { title: "Terms of Service · BotHost" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-sm leading-relaxed text-zinc-300">
      <h1 className="mb-4 text-2xl font-semibold text-white">Terms of Service</h1>
      <p className="mb-4 text-zinc-500">Last updated: November 19, 2026</p>
      <p className="mb-3">
        By using BotHost Panel you agree to use the service only for bots and infrastructure you are authorized
        to operate, and in compliance with Discord&apos;s Terms of Service and applicable law.
      </p>
      <h2 className="mb-2 mt-6 text-base font-medium text-white">Acceptable use</h2>
      <ul className="mb-3 list-disc space-y-1 pl-5">
        <li>Do not share login sessions, auth tokens, or panel access with unauthorized people.</li>
        <li>Do not use the panel to distribute malware, spam, or content that violates Discord rules.</li>
        <li>You are responsible for secrets you store (bot tokens, API keys) and for securing your Discord app.</li>
      </ul>
      <h2 className="mb-2 mt-6 text-base font-medium text-white">Availability</h2>
      <p className="mb-3">
        The service is provided as-is. Hosting (Vercel, Railway, Termux, tunnels) may interrupt without notice.
        We are not liable for downtime, data loss, or Discord account actions.
      </p>
      <h2 className="mb-2 mt-6 text-base font-medium text-white">Access</h2>
      <p className="mb-3">
        Access may be revoked at any time for security or abuse. Admin features are limited to designated Discord
        user ids.
      </p>
      <p className="mt-8">
        <a href="/" className="text-brand hover:underline">Back to panel</a>
      </p>
    </main>
  );
}
