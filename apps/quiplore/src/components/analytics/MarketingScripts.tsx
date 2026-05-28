import Script from "next/script";

function isEnabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

export default function MarketingScripts() {
  const gaMeasurementId = process.env.QUIPLORE_GA_MEASUREMENT_ID?.trim();
  const adsenseClient = process.env.GOOGLE_ADSENSE_CLIENT?.trim();
  const adsenseEnabled = isEnabled(process.env.QUIPLORE_ADSENSE_AUTO_ADS_ENABLED);

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
          <Script id="quiplore-google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){window.dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', ${JSON.stringify(gaMeasurementId)});
            `}
          </Script>
        </>
      ) : null}

      {adsenseClient && adsenseEnabled ? (
        <Script
          async
          crossOrigin="anonymous"
          id="quiplore-google-adsense"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
            adsenseClient,
          )}`}
          strategy="afterInteractive"
        />
      ) : null}
    </>
  );
}
