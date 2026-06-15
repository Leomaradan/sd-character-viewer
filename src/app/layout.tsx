import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Roboto } from "next/font/google";
import { AppProviders } from "@/components/AppProviders";
import {
  COLOR_SCHEME_STORAGE_KEY,
  MODE_STORAGE_KEY,
  parseColorMode,
  parseColorScheme,
} from "@/lib/color-scheme-storage";

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

const RootLayout = async ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  const cookieStore = await cookies();
  const colorMode =
    parseColorMode(cookieStore.get(MODE_STORAGE_KEY)?.value ?? undefined) ?? "system";
  const colorScheme =
    parseColorScheme(cookieStore.get(COLOR_SCHEME_STORAGE_KEY)?.value ?? undefined) ?? "light";
  const rootClassName = `${roboto.variable} h-full antialiased${
    colorScheme === "dark" ? " dark" : ""
  }`;

  return (
    <html lang="en" className={rootClassName}>
      <body className="min-h-full flex flex-col">
        <AppProviders defaultMode={colorMode}>{children}</AppProviders>
      </body>
    </html>
  );
};

export default RootLayout;
