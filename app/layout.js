import "./globals.css";

export const metadata = {
  title: "BotHost Panel",
  description: "Discord bot hosting panel",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
