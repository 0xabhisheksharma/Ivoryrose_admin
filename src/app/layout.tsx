import type { Metadata } from "next";
import { ToastProvider } from "@/presentation/components/ui/ToastContext";
import "@/presentation/styles/globals.css";

export const metadata: Metadata = {
  title: "Ivory Admin",
  description: "Ivory admin operations panel",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
