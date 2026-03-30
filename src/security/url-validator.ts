/**
 * Security — URL Validator (FC-001 + FC-002)
 *
 * Zentraler SSRF-Schutz fuer alle ausgehenden URL-Fetches.
 * isPrivateHost() erkennt IPv4, IPv6, Cloud-Metadata, Dezimal/Oktal-Notation,
 * URL-Encoded Hostnames, .local/.internal TLDs, und Redirect-SSRF (FC-001a).
 *
 * validateFetchUrl() ist die oeffentliche API — ruft isPrivateHost() nach Decode auf.
 */

import pino from "pino";

const logger = pino({
  name: "security:url-validator",
  level: process.env["LOG_LEVEL"] ?? "silent",
});

// ============================================================================
// Validation Result
// ============================================================================

export interface UrlValidationResult {
  valid: boolean;
  reason?: string;
}

// ============================================================================
// Blocked TLDs — interne/lokale Zonen
// ============================================================================

const BLOCKED_TLDS = new Set([
  ".local",
  ".internal",
  ".localhost",
  ".intranet",
  ".corp",
  ".home",
  ".lan",
]);

// ============================================================================
// Cloud Metadata Hostnames — AWS, GCP, Azure, Alibaba, DigitalOcean
// ============================================================================

const CLOUD_METADATA_HOSTS = new Set([
  "metadata.google.internal",
  "metadata.google",
  "169.254.169.254",
  "100.100.100.200",          // Alibaba Cloud
  "fd00:ec2::254",            // AWS IPv6 IMDS
]);

// ============================================================================
// Dezimal/Oktal IP-Parsing
// ============================================================================

/**
 * Parst einen Hostname der eine IP in Dezimal-, Oktal- oder Hex-Notation sein
 * koennte. Gibt die normalisierte IPv4-Adresse als [a, b, c, d] zurueck
 * oder undefined wenn es keine IP ist.
 *
 * Erkennt:
 *  - Standard:   127.0.0.1
 *  - Dezimal:    2130706433  (= 127.0.0.1 als 32-bit Integer)
 *  - Oktal:      0177.0.0.1 (fuehrende Null = Oktal)
 *  - Hex:        0x7f.0.0.1
 *  - Mixed:      0x7f.0.0.01  (Hex + Oktal)
 */
function parseIpNotation(hostname: string): [number, number, number, number] | undefined {
  // Entferne eventuelle Klammern (IPv6-Style, aber hier fuer IPv4-in-URL)
  const cleaned = hostname.replace(/^\[|\]$/g, "").trim();

  // Pruefe ob es eine reine Dezimal-Integer-IP ist (z.B. 2130706433)
  if (/^\d{1,10}$/.test(cleaned)) {
    const n = parseInt(cleaned, 10);
    if (n >= 0 && n <= 0xffffffff) {
      return [
        (n >>> 24) & 0xff,
        (n >>> 16) & 0xff,
        (n >>> 8) & 0xff,
        n & 0xff,
      ];
    }
  }

  // Dotted notation: 4 Octets, jeweils dezimal, oktal (0-prefix) oder hex (0x-prefix)
  const parts = cleaned.split(".");
  if (parts.length !== 4) return undefined;

  const octets: number[] = [];
  for (const part of parts) {
    if (part === "") return undefined;

    let val: number;
    if (/^0x[0-9a-fA-F]+$/.test(part)) {
      // Hex
      val = parseInt(part, 16);
    } else if (/^0[0-7]+$/.test(part) && part.length > 1) {
      // Oktal (fuehrende Null, nicht "0" allein)
      val = parseInt(part, 8);
    } else if (/^\d+$/.test(part)) {
      // Dezimal
      val = parseInt(part, 10);
    } else {
      return undefined;
    }

    if (val < 0 || val > 255 || !Number.isFinite(val)) return undefined;
    octets.push(val);
  }

  if (octets.length !== 4) return undefined;
  return octets as [number, number, number, number];
}

// ============================================================================
// IPv6-Parsing
// ============================================================================

/**
 * Parst eine IPv6-Adresse (mit oder ohne Klammern) und gibt die 8 16-bit
 * Gruppen zurueck. Unterstuetzt :: (Zero-Compression) und IPv4-Mapped (::ffff:1.2.3.4).
 */
function parseIpv6(hostname: string): number[] | undefined {
  let addr = hostname.replace(/^\[|\]$/g, "").trim();

  // IPv4-mapped IPv6: ::ffff:127.0.0.1
  const v4MappedMatch = /^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(addr);
  if (v4MappedMatch) {
    const [, prefix, v4Part] = v4MappedMatch;
    if (!prefix || !v4Part) return undefined;
    const v4Octets = v4Part.split(".").map(Number);
    if (v4Octets.length !== 4 || v4Octets.some((o) => o < 0 || o > 255 || !Number.isFinite(o))) {
      return undefined;
    }
    // Ersetze v4 durch zwei 16-bit Gruppen
    const hi = ((v4Octets[0]! << 8) | v4Octets[1]!) & 0xffff;
    const lo = ((v4Octets[2]! << 8) | v4Octets[3]!) & 0xffff;
    addr = prefix + hi.toString(16) + ":" + lo.toString(16);
  }

  // Zero-Compression expandieren
  if (addr.includes("::")) {
    const [left, right] = addr.split("::");
    if (left === undefined || right === undefined) return undefined;
    const leftGroups = left === "" ? [] : left.split(":");
    const rightGroups = right === "" ? [] : right.split(":");
    const missing = 8 - leftGroups.length - rightGroups.length;
    if (missing < 0) return undefined;
    const groups = [...leftGroups, ...Array(missing).fill("0") as string[], ...rightGroups];
    addr = groups.join(":");
  }

  const groups = addr.split(":");
  if (groups.length !== 8) return undefined;

  const result: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return undefined;
    result.push(parseInt(g, 16));
  }
  return result;
}

/**
 * Prueft ob eine geparste IPv6-Adresse eine private/interne Adresse ist.
 */
function isPrivateIpv6(groups: number[]): boolean {
  if (groups.length !== 8) return false;

  // ::1 (Loopback)
  if (groups.every((g, i) => i < 7 ? g === 0 : g === 1)) return true;

  // :: (Unspecified)
  if (groups.every((g) => g === 0)) return true;

  const first = groups[0]!;

  // fc00::/7 (Unique Local Address)
  if ((first & 0xfe00) === 0xfc00) return true;

  // fe80::/10 (Link-Local)
  if ((first & 0xffc0) === 0xfe80) return true;

  // ::ffff:0:0/96 (IPv4-Mapped) — pruefe den eingebetteten IPv4-Teil
  if (
    groups[0] === 0 && groups[1] === 0 && groups[2] === 0 &&
    groups[3] === 0 && groups[4] === 0 && groups[5] === 0xffff
  ) {
    const a = (groups[6]! >> 8) & 0xff;
    const b = groups[6]! & 0xff;
    return isPrivateIpv4(a, b);
  }

  // fd00:ec2::254 (AWS IMDS IPv6) — allgemein: fd-prefix ist in fc00::/7 schon abgedeckt
  return false;
}

// ============================================================================
// IPv4 Private-Check (gemeinsam genutzt)
// ============================================================================

function isPrivateIpv4(a: number, b: number): boolean {
  // 0.0.0.0/8
  if (a === 0) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 10.0.0.0/8 (RFC 1918)
  if (a === 10) return true;
  // 172.16.0.0/12 (RFC 1918)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (RFC 1918)
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (Link-Local / APIPA / Cloud Metadata)
  if (a === 169 && b === 254) return true;
  // 100.64.0.0/10 (Carrier-Grade NAT, RFC 6598) — oft als internes Netz genutzt
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

// ============================================================================
// isPrivateHost() — Haupt-Check (FC-001)
// ============================================================================

/**
 * Prueft ob ein Hostname auf eine private/interne Adresse zeigt.
 *
 * Erkennt:
 *  - IPv4 Standard, Dezimal, Oktal, Hex
 *  - IPv6 Loopback (::1), Private (fc00::/7, fe80::/10), IPv4-Mapped (::ffff:127.0.0.1)
 *  - Cloud-Metadata (169.254.169.254, metadata.google.internal, etc.)
 *  - URL-Encoded Hostnames (decode vor Check)
 *  - Blocked TLDs (.local, .internal, .localhost, etc.)
 *  - Bekannte lokale Hostnamen (localhost, [::1])
 */
export function isPrivateHost(hostname: string): boolean {
  // URL-Decode (doppelt, um %-Encoding-Chains abzufangen)
  let decoded: string;
  try {
    decoded = decodeURIComponent(decodeURIComponent(hostname));
  } catch {
    // Fehlerhaftes %-Encoding → sicherheitshalber als privat werten
    return true;
  }

  const lower = decoded.toLowerCase().trim();

  // Leerer Hostname → privat
  if (lower === "") return true;

  // Bekannte lokale Hostnamen
  if (lower === "localhost" || lower === "[::1]" || lower === "::1") return true;

  // Cloud-Metadata Hostnamen (exact match)
  if (CLOUD_METADATA_HOSTS.has(lower)) return true;

  // Blocked TLDs pruefen
  for (const tld of BLOCKED_TLDS) {
    if (lower === tld.slice(1) || lower.endsWith(tld)) return true;
  }

  // IPv6 in Klammern: [::1], [fe80::1], [::ffff:127.0.0.1]
  if (lower.startsWith("[") && lower.endsWith("]")) {
    const v6Groups = parseIpv6(lower);
    if (v6Groups && isPrivateIpv6(v6Groups)) return true;
    // Auch ohne Klammern versuchen
    const inner = lower.slice(1, -1);
    const v6Inner = parseIpv6(inner);
    if (v6Inner && isPrivateIpv6(v6Inner)) return true;
  }

  // IPv6 ohne Klammern (selten in Hostnames, aber defensiv pruefen)
  if (lower.includes(":")) {
    const v6Groups = parseIpv6(lower);
    if (v6Groups && isPrivateIpv6(v6Groups)) return true;
  }

  // IPv4: Standard, Dezimal, Oktal, Hex
  const ipv4 = parseIpNotation(lower);
  if (ipv4) {
    const [a, b] = ipv4;
    if (isPrivateIpv4(a, b)) return true;
  }

  return false;
}

// ============================================================================
// validateFetchUrl() — Oeffentliche API (FC-002)
// ============================================================================

/**
 * Validiert eine URL fuer ausgehende Fetch-Operationen.
 *
 * Prueft:
 *  1. Schema-Whitelist (https only, http opt-in via BALAGE_ALLOW_HTTP)
 *  2. isPrivateHost() auf decoded Hostname
 *  3. Hostname-Laenge und Format
 *
 * FC-001a: Redirect-SSRF Mitigation — diese Funktion MUSS auch auf die
 * finale URL nach Redirects aufgerufen werden, nicht nur auf die initiale URL.
 */
export function validateFetchUrl(
  url: string,
  options?: { allowHttp?: boolean },
): UrlValidationResult {
  const allowHttp = options?.allowHttp
    ?? (process.env["BALAGE_ALLOW_HTTP"] === "true");

  // Basis-Validierung
  if (!url || typeof url !== "string") {
    return { valid: false, reason: "URL is required and must be a string" };
  }

  // URL parsen
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: "Invalid URL format" };
  }

  // Schema-Whitelist
  if (parsed.protocol === "https:") {
    // OK
  } else if (parsed.protocol === "http:" && allowHttp) {
    // OK — explizit opt-in
    logger.warn({ url }, "HTTP URL allowed via opt-in (BALAGE_ALLOW_HTTP)");
  } else if (parsed.protocol === "http:") {
    return { valid: false, reason: "HTTP URLs are not allowed. Set BALAGE_ALLOW_HTTP=true to allow." };
  } else {
    return {
      valid: false,
      reason: `Protocol '${parsed.protocol}' is not allowed. Only https:// (and optionally http://) are permitted.`,
    };
  }

  // Hostname extrahieren und validieren
  const hostname = parsed.hostname;

  if (!hostname) {
    return { valid: false, reason: "URL has no hostname" };
  }

  // Maximal-Laenge (RFC 1035: 253 Zeichen)
  if (hostname.length > 253) {
    return { valid: false, reason: "Hostname exceeds maximum length (253)" };
  }

  // Credentials in URL blockieren (z.B. http://admin:pw@evil.com)
  if (parsed.username || parsed.password) {
    return { valid: false, reason: "URLs with embedded credentials are not allowed" };
  }

  // SSRF-Check: isPrivateHost() auf decoded hostname
  if (isPrivateHost(hostname)) {
    logger.warn({ url, hostname }, "SSRF blocked: private/internal host");
    return { valid: false, reason: "URL points to a private or internal address" };
  }

  return { valid: true };
}

// ============================================================================
// validateRedirectUrl() — FC-001a: Redirect-SSRF Mitigation
// ============================================================================

/**
 * Validiert eine Redirect-Ziel-URL.
 * Gleiche Pruefungen wie validateFetchUrl(), aber mit zusaetzlichem
 * Logging fuer Redirect-Chains.
 *
 * Aufrufer MUESSEN diese Funktion in ihrem Redirect-Handler nutzen.
 */
export function validateRedirectUrl(
  redirectUrl: string,
  originalUrl: string,
  options?: { allowHttp?: boolean },
): UrlValidationResult {
  const result = validateFetchUrl(redirectUrl, options);
  if (!result.valid) {
    logger.warn(
      { originalUrl, redirectUrl, reason: result.reason },
      "SSRF blocked: redirect to private/internal host",
    );
  }
  return result;
}
