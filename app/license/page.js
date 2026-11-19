export const metadata = { title: "License · BotHost" };

export default function LicensePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-sm leading-relaxed text-zinc-300">
      <h1 className="mb-4 text-2xl font-semibold text-white">License</h1>
      <p className="mb-4 text-zinc-500">Proprietary — All rights reserved</p>
      <p className="mb-3">
        BotHost Panel source, branding, and configuration are provided for the authorized operator only.
        You may not redistribute, sublicense, or republish the panel, its private APIs, or stored secrets.
      </p>
      <p className="mb-3">
        Third-party libraries (Next.js, Discord.js, and others) remain under their respective open-source licenses.
      </p>
      <p className="mb-3">
        Unauthorized scraping, reverse-engineering for the purpose of stealing credentials, or public disclosure of
        private endpoints is prohibited.
      </p>
      <p className="mt-8">
        <a href="/" className="text-brand hover:underline">Back to panel</a>
      </p>
    </main>
  );
}
