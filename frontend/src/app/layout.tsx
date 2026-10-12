import type { Metadata } from "next";
import { AuthProvider } from "@/context/auth-context";
import { ToastProvider } from "@/context/toast-context";
import { QueryProvider } from "@/providers/query-provider";
import { Header } from "@/components/layout/Header";
import { OutbidListener } from "@/components/notifications/OutbidListener";
import "./globals.css";

export const metadata: Metadata = {
  title: "STOCKBID",
  description: "STOCKBID",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <AuthProvider>
            <ToastProvider>
              <OutbidListener />
              <Header />
              <main>{children}</main>
            </ToastProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
