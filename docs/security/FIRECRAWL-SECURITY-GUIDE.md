# Firecrawl Integration — Security Guide

This document covers the security architecture of BALAGE's URL-based analysis
feature. It is intended for operators deploying BALAGE in production and for
developers integrating `analyzeFromURL` into their applications.

---

## 1. SSRF Protection

### What it does

Every URL passed to `analyzeFromURL` is validated **before** any network request
is made. The validator (`src/security/url-validator.ts`) blocks:

| Attack Vector | Example | Blocked? |
|---------------|---------|----------|
| IPv4 private ranges | `http://192.168.1.1`, `http://10.0.0.1` | Yes |
| IPv4 loopback | `http://127.0.0.1`, `http://localhost` | Yes |
| Decimal IP notation | `http://2130706433` (= 127.0.0.1) | Yes |
| Octal IP notation | `http://0177.0.0.1` (= 127.0.0.1) | Yes |
| Hex IP notation | `http://0x7f.0.0.1` (= 127.0.0.1) | Yes |
| IPv6 loopback | `http://[::1]` | Yes |
| IPv6 private (ULA) | `http://[fc00::1]`, `http://[fd00::1]` | Yes |
| IPv6 link-local | `http://[fe80::1]` | Yes |
| IPv4-mapped IPv6 | `http://[::ffff:127.0.0.1]` | Yes |
| Cloud metadata | `http://169.254.169.254` (AWS IMDS) | Yes |
| Cloud metadata | `http://metadata.google.internal` (GCP) | Yes |
| Cloud metadata | `http://100.100.100.200` (Alibaba) | Yes |
| Internal TLDs | `http://app.local`, `http://api.internal` | Yes |
| URL-encoded bypass | `http://%31%32%37.0.0.1` | Yes |
| Embedded credentials | `http://admin:pw@evil.com` | Yes |
| Non-HTTP protocols | `file:///etc/passwd`, `gopher://...` | Yes |

### When using Firecrawl Cloud

With Firecrawl Cloud, the fetch happens on Firecrawl's servers, not on your
machine. BALAGE still validates the URL locally before sending it to Firecrawl.
This means:

- Your server is protected against SSRF regardless of which provider is used.
- Firecrawl Cloud applies its own server-side protections as a second layer.
- The URL validator runs synchronously and adds negligible latency.

### When using Playwright (local)

With Playwright, the fetch happens on the machine running BALAGE. SSRF
protection is critical here because the local browser could reach internal
services on the same network.

### Redirect-SSRF

The URL validator must also be applied to the final URL after redirects.
Firecrawl handles this server-side. For the Playwright fetcher, BALAGE
validates each redirect target through `validateRedirectUrl()`.

---

## 2. API Key Protection

Firecrawl API keys (pattern: `fc-[a-zA-Z0-9]+`) are automatically redacted
from all error messages, log output, and client-facing responses.

The redaction is implemented in `src/fetcher/errors.ts` and covers:

- Firecrawl keys (`fc-...`)
- OpenAI-style keys (`sk-...`)
- Generic key patterns (`key_...`)
- Bearer tokens in headers

**Rules:**
- Never pass `FirecrawlFetcherConfig.apiKey` to any logging call.
- Never include raw API responses in error messages without redaction.
- The `FirecrawlApiError` class automatically redacts its message via the
  `redactApiKeys()` utility.

---

## 3. Environment Variables — Security Relevant

| Variable | Default | Description | Security Impact |
|----------|---------|-------------|-----------------|
| `BALAGE_FIRECRAWL_API_KEY` | (none) | Firecrawl API key | Treat as a secret. Never commit to version control. |
| `BALAGE_FIRECRAWL_API_URL` | `https://api.firecrawl.dev` | Firecrawl endpoint | Change only for self-hosted instances. Ensure HTTPS. |
| `BALAGE_FIRECRAWL_ENABLED` | `false` | Enable Firecrawl provider | Must be explicitly `true` to use Firecrawl. |
| `BALAGE_FIRECRAWL_MAX_RESPONSE_SIZE_MB` | `5` | Max response body size | Prevents memory exhaustion from oversized pages. |
| `BALAGE_FIRECRAWL_TIMEOUT_MS` | `30000` | Request timeout | Prevents hanging connections. Do not set above 60000. |
| `BALAGE_ALLOW_HTTP` | `false` | Allow HTTP (non-TLS) URLs | **Never enable in production.** Only for local development against `http://localhost`. |
| `BALAGE_OPENAI_API_KEY` | (none) | OpenAI API key (for LLM mode) | Treat as a secret. |
| `BALAGE_ANTHROPIC_API_KEY` | (none) | Anthropic API key (for LLM mode) | Treat as a secret. |
| `BALAGE_MAX_COST_PER_RUN_USD` | `1.00` | Max LLM cost per analysis run | Cost ceiling per invocation. |

### Recommended `.env.local` for production

```bash
# Required for LLM mode (pick one)
BALAGE_OPENAI_API_KEY=sk-...

# Firecrawl Cloud
BALAGE_FIRECRAWL_API_KEY=fc-...
BALAGE_FIRECRAWL_ENABLED=true
BALAGE_FIRECRAWL_MAX_RESPONSE_SIZE_MB=5

# Security hardening
BALAGE_ALLOW_HTTP=false
BALAGE_MAX_COST_PER_RUN_USD=1.00
```

---

## 4. Cost Limiter

The built-in cost limiter (`src/fetcher/cost-limiter.ts`) prevents runaway
API usage:

| Limit | Default | Configurable? |
|-------|---------|---------------|
| Calls per minute | 10 | Yes (via `CostLimiterConfig`) |
| Calls per hour | 100 | Yes (via `CostLimiterConfig`) |

When a limit is reached, the fetcher throws a `FetchRateLimitError` with a
`retryAfterSec` value. The caller should back off and retry.

The limiter uses a sliding-window approach with no background timers.
Old entries are pruned lazily on the next `check()` call.

---

## 5. Response Size Limit

Pages larger than `BALAGE_FIRECRAWL_MAX_RESPONSE_SIZE_MB` (default: 5 MB) are
rejected before the response body is fully processed. This protects against:

- Memory exhaustion (OOM) from unusually large pages
- Excessive LLM token costs from oversized HTML
- Potential denial-of-service via crafted page responses

The check happens in two stages:
1. `Content-Length` header is checked before reading the body.
2. Actual body size is checked after reading (in case `Content-Length` is
   missing or incorrect).

---

## 6. Cloud vs. Self-Hosted Deployment

### Firecrawl Cloud (recommended for most users)

- Operated by Mendable Inc.
- URLs and page content are sent to Firecrawl's servers for rendering.
- Firecrawl's [privacy policy](https://firecrawl.dev/privacy) applies.
- Suitable when the target URLs are public websites.

### Firecrawl Self-Hosted

- Run Firecrawl on your own infrastructure via Docker.
- No data leaves your network.
- Set `BALAGE_FIRECRAWL_API_URL` to your self-hosted endpoint.
- Required when analyzing internal or sensitive URLs.
- See: [Firecrawl Self-Hosting Guide](https://docs.firecrawl.dev/self-host)

### Playwright (local)

- Runs a headless Chromium on the machine running BALAGE.
- No third-party service involved.
- Full control over network access, but requires managing browser dependencies.
- Suitable for CI/CD pipelines and air-gapped environments.

### Decision Matrix

| Concern | Cloud | Self-Hosted | Playwright |
|---------|-------|-------------|------------|
| Data stays on-premise | No | Yes | Yes |
| No infrastructure to maintain | Yes | No | Partially |
| Handles bot-protection/JS-heavy sites | Yes | Yes | Yes |
| GDPR-sensitive URLs (see below) | No | Yes | Yes |
| Setup complexity | Low (API key) | Medium (Docker) | Medium (browser install) |

---

## 7. GDPR / DSGVO Considerations

### URLs can contain personal data

URLs may encode personally identifiable information (PII):

```
https://example.com/user/john.doe@company.com/settings
https://app.com/reset-password?token=abc123&email=user@mail.com
https://crm.com/contact/12345
```

When using **Firecrawl Cloud**, these URLs are transmitted to a third-party
service. Under GDPR Article 28, this may constitute data processing by a
sub-processor.

### Recommendations

1. **Public websites only with Firecrawl Cloud.** If the URLs you analyze
   are public marketing pages (e.g., `https://github.com/login`,
   `https://stripe.com/docs`), no PII concern exists.

2. **Self-Hosted Firecrawl or Playwright for internal URLs.** If URLs contain
   user identifiers, session tokens, or reference internal systems, use a
   self-hosted Firecrawl instance or the Playwright provider.

3. **URL scrubbing.** If you must use Firecrawl Cloud with URLs that may
   contain PII, strip query parameters and path segments before passing
   them to `analyzeFromURL`.

4. **Data Processing Agreement (DPA).** If you use Firecrawl Cloud in a
   GDPR-regulated context, ensure you have a DPA with Mendable Inc.

### What BALAGE does NOT do

- BALAGE does not store or log URLs by default (log level is `silent`).
- BALAGE does not transmit URLs anywhere except to the configured fetcher.
- BALAGE does not cache URL content beyond the in-memory fingerprint cache
  (which is per-process and not persisted).

---

## 8. Threat Model Summary

For the full threat model, see:
[THREAT-MODEL-FIRECRAWL-INTEGRATION.md](./THREAT-MODEL-FIRECRAWL-INTEGRATION.md)

Key threats addressed by this implementation:

| Threat | Mitigation | Status |
|--------|-----------|--------|
| SSRF via crafted URL | `validateFetchUrl()` with comprehensive IP/hostname checks | Implemented |
| SSRF via redirect chain | `validateRedirectUrl()` on each hop | Implemented |
| API key leak in logs/errors | `redactApiKeys()` on all error messages | Implemented |
| Cost explosion | In-memory rate limiter (10/min, 100/h) | Implemented |
| Memory exhaustion | Response size limit (5 MB default) | Implemented |
| DNS rebinding | URL validation before fetch | Implemented (pattern-based) |
| HTTP downgrade | HTTPS-only by default, HTTP opt-in | Implemented |

---

*Last updated: 2026-03-29*
*Author: SECURITY + ENGINEER*
