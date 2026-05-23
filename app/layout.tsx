import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Task Todo",
  description: "Priority-led task planning with AI capture and daily tracking."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
