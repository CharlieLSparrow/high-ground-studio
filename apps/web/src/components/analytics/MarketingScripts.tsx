import Script from "next/script";
import { auth } from "@/auth";

function isEnabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

export default async function MarketingScripts() {
  const gaMeasurementId = process.env.HGO_GA_MEASUREMENT_ID?.trim();
  const adsenseClient = process.env.GOOGLE_ADSENSE_CLIENT?.trim();
  const adsenseEnabled = isEnabled(process.env.HGO_ADSENSE_AUTO_ADS_ENABLED);

  const session = await auth();
  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : [];
  const hasNetworkPass = roles.includes("NETWORK_PASS");

  return (
    <>
      {gaMeasurementId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
              gaMeasurementId,
            )}`}
            strategy="afterInteractive"
          />
          <Script id="hgo-google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){window.dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', ${JSON.stringify(gaMeasurementId)});
            `}
          </Script>
        </>
      ) : null}

      {adsenseClient && adsenseEnabled && !hasNetworkPass ? (
        <Script
          async
          crossOrigin="anonymous"
          id="hgo-google-adsense"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
            adsenseClient,
          )}`}
          strategy="afterInteractive"
        />
      ) : null}
    </>
  );
}
