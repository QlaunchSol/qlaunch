import { NextResponse, type NextRequest } from "next/server";
import { strictDirectives } from "@/lib/csp";

/**
 * The strict Content-Security-Policy, with a fresh nonce per page view so only
 * our own scripts run. The baseline policy is enforced on every response from
 * next.config.ts; this one is report-only until CSP_ENFORCE_SCRIPTS=1. Browser
 * wallets inject their providers through extension worlds, which this
 * shouldn't touch, but a blocked wallet would break every launch, so it is
 * observed first.
 *
 * Next copies every header set on this response onto the request it renders,
 * so the baseline must not be set here: Next would read that (nonce-less)
 * policy instead of the strict one and stamp no nonce on its scripts.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const enforce = process.env.CSP_ENFORCE_SCRIPTS === "1";
  // Enforced, this replaces the baseline header, so it carries its upgrade directive (browsers ignore it in report-only).
  const strict = [...strictDirectives(nonce), ...(enforce ? ["upgrade-insecure-requests"] : [])].join("; ");

  const requestHeaders = new Headers(request.headers);
  // Next reads the nonce from this request header and stamps it on its own scripts.
  requestHeaders.set("Content-Security-Policy", strict);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", strict);
  return response;
}

export const config = {
  // Pages only: API responses are JSON, static assets need no policy.
  matcher: [{ source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|brand|verify.py).*)" }],
};
