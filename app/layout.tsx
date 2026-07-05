import type { Metadata } from "next";
import { MultiOfficeProvider } from "@/components/providers/MultiOfficeProvider";
import { getAuthContext } from "@/lib/auth/context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ddumba Property Operations OS",
  description: "Enterprise commercial property operations platform",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const authContext = await getAuthContext();

  return (
    <html
      lang="en"
      className="h-full antialiased"
      data-scroll-behavior="smooth"
    >
      <body className="min-h-full flex flex-col">
        <MultiOfficeProvider initialContext={authContext}>
          {children}
        </MultiOfficeProvider>
      </body>
    </html>
  );
}
