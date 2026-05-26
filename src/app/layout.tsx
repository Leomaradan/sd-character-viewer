import type { Metadata } from "next";
import { Lexend } from "next/font/google";
import { AppProviders } from "@/components/AppProviders";
import "./globals.css";

const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stable Diffusion Character Viewer",
  description: "Browse Stable Diffusion character images by character, style, and pose.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${lexend.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
