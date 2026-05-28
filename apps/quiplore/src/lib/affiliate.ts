/**
 * QuipLore Affiliate Link Dynamic Decorator
 * 
 * Automatically appends affiliate parameters (e.g. Amazon Associate tags,
 * Bookshop.org referrer IDs) to book and tool recommendation URLs.
 */

export function decorateAffiliateLink(url: string): string {
  if (!url || typeof url !== "string") {
    return url;
  }

  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    // 1. Amazon Associate tag injection
    if (hostname.includes("amazon.com") || hostname.includes("amzn.to")) {
      const amazonTag = process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG || "quiplore-20";
      parsedUrl.searchParams.set("tag", amazonTag);
      return parsedUrl.toString();
    }

    // 2. Bookshop.org referrer tag injection
    if (hostname.includes("bookshop.org")) {
      const bookshopReferrer = process.env.NEXT_PUBLIC_BOOKSHOP_REFERRER_ID || "quiplore";
      parsedUrl.searchParams.set("partner", bookshopReferrer);
      return parsedUrl.toString();
    }

    return url;
  } catch (err) {
    // If the URL is relative or failed to parse, attempt clean string appending
    if (url.includes("amazon.com")) {
      const separator = url.includes("?") ? "&" : "?";
      return `${url}${separator}tag=${process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG || "quiplore-20"}`;
    }
    
    if (url.includes("bookshop.org")) {
      const separator = url.includes("?") ? "&" : "?";
      return `${url}${separator}partner=${process.env.NEXT_PUBLIC_BOOKSHOP_REFERRER_ID || "quiplore"}`;
    }

    return url;
  }
}
