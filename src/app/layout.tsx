import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Myra AI — Expert Bank Loan Advisor",
  description: "Ask about loans, banking, finance, eligibility, EMIs, documents, and rates.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
