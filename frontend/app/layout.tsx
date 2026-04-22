/**
 * Root layout — wraps every page in the AccountProvider and ClassProvider
 * so they share one source of truth for auth state and class data.
 */

import "./globals.css";
import { AccountProvider } from "@/lib/accountStore";
import { ClassProvider } from "@/lib/classStore";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AccountProvider>
          <ClassProvider>
            {children}
          </ClassProvider>
        </AccountProvider>
      </body>
    </html>
  );
}
