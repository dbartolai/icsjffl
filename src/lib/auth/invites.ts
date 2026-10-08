const TOKEN_BYTES = 32;

export function createInviteToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function safeNextPath(value: string | undefined): string {
  if (!value || !value.startsWith("/")) return "/";

  const baseUrl = "https://icsjffl.local";
  const resolved = new URL(value, baseUrl);
  return resolved.origin === baseUrl ? `${resolved.pathname}${resolved.search}` : "/";
}
