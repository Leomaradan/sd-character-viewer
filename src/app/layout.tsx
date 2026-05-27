import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import { AppProviders } from "@/components/AppProviders";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";

import "./globals.css";

const roboto = Roboto({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-roboto",
});

// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = {
  title: "Stable Diffusion Character Viewer",
  description: "Browse Stable Diffusion character images by character, style, and pose.",
};

const RootLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <html lang="en" className={`${roboto.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <InitColorSchemeScript attribute="class" defaultMode="system" />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
};

export default RootLayout;
