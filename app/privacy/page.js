export const metadata = { title: "Privacy Policy · BotHost" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-sm leading-relaxed text-zinc-300">
      <h1 className="mb-4 text-2xl font-semibold text-white">Privacy Policy</h1>
      <p className="mb-4 text-zinc-500">Last updated: November 19, 2026</p>
      <p className="mb-3">
        BotHost Panel is a private control surface for Discord bot hosting. We collect only what is needed to
        authenticate administrators and operate the service.
      </p>
      <h2 className="mb-2 mt-6 text-base font-medium text-white">What we store</h2>
      <ul className="mb-3 list-disc space-y-1 pl-5">
        <li>Discord account id and display name after OAuth login (session cookie).</li>
        <li>Configuration secrets (tokens, keys) only on the server / secured database — not in public pages.</li>
        <li>Operational logs needed to run the bot process.</li>
      </ul>
      <h2 className="mb-2 mt-6 text-base font-medium text-white">What we do not do</h2>
      <ul className="mb-3 list-disc space-y-1 pl-5">
        <li>We do not sell personal data.</li>
        <li>We do not publish bot tokens, tunnel URLs, or API keys on public HTML.</li>
        <li>Anonymous visitors only see the login screen and these policy pages.</li>
      </ul>
      <h2 className="mb-2 mt-6 text-base font-medium text-white">Access control</h2>
      <p className="mb-3">
        Panel features are limited to Discord accounts on the allow-list. Admin tools and secret fields are
        restricted to the owner account.
      </p>
      <p className="mt-8">
        <a href="/" className="text-brand hover:underline">Back to panel</a>
      </p>
    </main>
  );
}
