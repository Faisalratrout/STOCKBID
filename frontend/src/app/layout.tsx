import type { Metadata } from "next";
import { AuthProvider } from "@/context/auth-context";
import { QueryProvider } from "@/providers/query-provider";
import { Header } from "@/components/layout/Header";
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
            <Header />
            <main>{children}</main>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
