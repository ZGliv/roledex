import "server-only";

export function sameOriginFormOrigin(request: Request) {
  const requestSource =
    request.headers.get("origin") ?? request.headers.get("referer");
  if (!requestSource) return null;

  try {
    const sourceUrl = new URL(requestSource);
    const requestUrl = new URL(request.url);
    if (sourceUrl.origin === requestUrl.origin) return sourceUrl.origin;

    // `next start` can canonicalize request.url to localhost even when the
    // browser used 127.0.0.1. Origin-versus-Host is the same comparison Next
    // uses for Server Action CSRF checks and also supports Vercel aliases.
    const requestHost = request.headers.get("host");
    const matchesBrowserHost =
      Boolean(requestHost) &&
      sourceUrl.host === requestHost &&
      sourceUrl.protocol === requestUrl.protocol;
    return matchesBrowserHost ? sourceUrl.origin : null;
  } catch {
    return null;
  }
}

export function isSameOriginFormPost(request: Request) {
  return sameOriginFormOrigin(request) !== null;
}

export function acceptsSmallUrlEncodedForm(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const contentLength = Number(request.headers.get("content-length") ?? "0");

  return (
    contentType.toLowerCase().startsWith("application/x-www-form-urlencoded") &&
    Number.isFinite(contentLength) &&
    contentLength >= 0 &&
    contentLength <= 2_048
  );
}
