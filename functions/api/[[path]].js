/**
 * Cloudflare Pages Function: same-origin proxy for the independent API Worker.
 * Configure the Pages environment variable API_ORIGIN to the deployed staging
 * Worker origin, e.g. https://menarat-alhaouz-api.<account-subdomain>.workers.dev
 */
export async function onRequest(context) {
  const apiOrigin = context.env.API_ORIGIN;
  if (!apiOrigin) {
    return new Response(JSON.stringify({
      error: "API_ORIGIN is not configured for this Pages environment"
    }), {
      status: 503,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }

  let target;
  try {
    const base = new URL(apiOrigin);
    if (base.protocol !== "https:") throw new Error("HTTPS required");
    const incoming = new URL(context.request.url);
    target = new URL(incoming.pathname + incoming.search, base);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid API_ORIGIN configuration" }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }

  const headers = new Headers(context.request.headers);
  headers.delete("host");
  headers.delete("cf-connecting-ip");
  const init = {
    method: context.request.method,
    headers,
    redirect: "manual"
  };
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    init.body = context.request.body;
  }

  try {
    return await fetch(new Request(target.toString(), init));
  } catch {
    return new Response(JSON.stringify({ error: "API upstream is unavailable" }), {
      status: 502,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }
}
