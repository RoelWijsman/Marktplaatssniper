import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });

export const metadata: Metadata = {
  title: "Marktplaats Sniper",
  description: "Nieuwe advertenties op Marktplaats die passen bij je zoekopdracht, zodra ze verschijnen.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#E9ECEF" },
    { media: "(prefers-color-scheme: dark)", color: "#12161B" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={archivo.variable}>
      <body>{children}</body>
    </html>
  );
}
