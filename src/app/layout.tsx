import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OPPESM Document Tracking",
  description:
    "Office of the Provincial Public Employment Service Manager — Document Tracking System",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
