import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Champion Toffees Competition Bot — Buy, Snap, Win!",
  description: "Chat with our AI bot to enter the Champion Toffees competition! Buy Champion Toffees, snap your till slip, and win amazing prizes.",
  openGraph: {
    title: "Champion Toffees Competition Bot — Buy, Snap, Win!",
    description: "Chat with our AI bot to enter the Champion Toffees competition!",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
