import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { VaultProvider } from "../lib/vault/vault-provider";
import "./globals.css";

// React-PDF text/annotation layer styles
import 'react-pdf/dist/esm/Page/TextLayer.css';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ENCODEX",
  description: "End-to-end encrypted file storage and sharing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/encodex-logo-lock.svg" type="image/svg+xml" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <VaultProvider>
          {children}
        </VaultProvider>
      </body>
    </html>
  );
}
