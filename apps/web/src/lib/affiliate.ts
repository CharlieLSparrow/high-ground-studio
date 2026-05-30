/**
 * Advanced Affiliate Routing Engine
 * Automatically wraps book titles, gear, and products with monetized affiliate links.
 */

type AffiliateConfig = {
  amazonTag: string;
  bookshopId: string;
  bhPhotoTag: string;
};

const config: AffiliateConfig = {
  amazonTag: process.env.AMAZON_AFFILIATE_TAG || "highground0b-20",
  bookshopId: process.env.BOOKSHOP_AFFILIATE_ID || "31567", // Example bookshop affiliate ID
  bhPhotoTag: process.env.BH_AFFILIATE_TAG || "12345", 
};

export type ProductType = "book" | "camera_gear" | "general_tech";

/**
 * Generates an affiliate URL based on the product type and search term.
 * 
 * Usage:
 * const url = getAffiliateLink("Thinking, Fast and Slow", "book");
 * // Returns: https://bookshop.org/books?keywords=Thinking%2C+Fast+and+Slow&affiliate=31567
 */
export function getAffiliateLink(searchTerm: string, type: ProductType = "general_tech"): string {
  const encodedTerm = encodeURIComponent(searchTerm);

  switch (type) {
    case "book":
      // Prioritize Bookshop.org for books (supports local bookstores)
      return `https://bookshop.org/books?keywords=${encodedTerm}&affiliate=${config.bookshopId}`;
      
    case "camera_gear":
      // Prioritize B&H for camera gear
      return `https://www.bhphotovideo.com/c/search?Ntt=${encodedTerm}&N=0&InitialSearch=yes&ap=Y&BI=${config.bhPhotoTag}`;

    case "general_tech":
    default:
      // Fallback to Amazon
      return `https://www.amazon.com/s?k=${encodedTerm}&tag=${config.amazonTag}`;
  }
}

/**
 * Helper to process a block of text and inject Markdown affiliate links 
 * for known keywords. This will be expanded later with NLP matching.
 */
export function autoLinkContent(markdownText: string): string {
  // Simple naive regex replacement for known gear.
  // In the future, this can be powered by a dictionary of terms pulled from the database.
  const gearDictionary: Record<string, { term: string, type: ProductType }> = {
    "Insta360 X3": { term: "Insta360 X3 Action Camera", type: "camera_gear" },
    "MacBook Pro": { term: "Apple MacBook Pro M3 Max", type: "general_tech" },
    "Shure SM7B": { term: "Shure SM7B Vocal Microphone", type: "camera_gear" },
  };

  let processedText = markdownText;

  for (const [key, details] of Object.entries(gearDictionary)) {
    // Only replace plain text words that aren't already part of a link
    // This regex looks for the word, ensuring it's not inside [ ] or ( )
    const regex = new RegExp(`(?<!\\[)(?<!\\()\\b${key}\\b(?!\\])(?!\\))`, "g");
    
    if (regex.test(processedText)) {
      const affiliateUrl = getAffiliateLink(details.term, details.type);
      processedText = processedText.replace(regex, `[${key}](${affiliateUrl})`);
    }
  }

  return processedText;
}
