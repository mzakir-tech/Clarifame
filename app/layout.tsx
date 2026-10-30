import type { Metadata } from "next";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "@fontsource/instrument-serif/latin.css";
import "@fontsource/instrument-serif/latin-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClariFrame — A little more life in every frame",
  description: "ClariFrame AI is designed to enhance supported videos up to 60 seconds when its genuine AI engine is configured and operational.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
