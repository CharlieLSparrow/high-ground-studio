/** RFC 2606 testing/documentation domains must never reach the mail provider.
 * This is a delivery boundary, not an account or sign-in restriction.
 */
export function isSyntheticEmailRecipient(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@").at(-1)?.replace(/\.$/, "") ?? "";
  return ["test", "invalid", "localhost", "example", "example.com", "example.net", "example.org"]
    .some(reserved => domain === reserved || domain.endsWith(`.${reserved}`));
}
