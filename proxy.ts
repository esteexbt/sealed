import { NextResponse, type NextRequest } from "next/server";

/**
 * When REDIRECT_TO is set (for example on an old copy of the site), send every visit to the same path
 * on that address, so old links in videos and posts keep working.
 */
export function proxy(request: NextRequest) {
  const target = process.env.REDIRECT_TO?.replace(/\/$/, "");
  if (!target) return NextResponse.next();
  const from = new URL(request.url);
  if (new URL(target).host === from.host) return NextResponse.next();
  return NextResponse.redirect(`${target}${from.pathname}${from.search}`, 308);
}
