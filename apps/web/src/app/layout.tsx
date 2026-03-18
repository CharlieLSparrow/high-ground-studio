import "./globals.css";
import SiteHeader from "@/components/site/SiteHeader";

export const metadata = {
  title: "High Ground Odyssey",
  description: "Leadership, legacy, family, and the stories that shape us.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}