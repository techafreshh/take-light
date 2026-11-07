// Minimal ambient Deno declaration for the Supabase Edge Function.
//
// Intentionally minimal and offline: it declares only the Deno surface
// actually used by supabase/functions/submit/index.ts (Deno.serve with a
// (req: Request) => Response | Promise<Response> handler, and
// Deno.env.get for SUPABASE_URL / SUPABASE_SERVICE_KEY), so `tsc -b`
// can type-check the Edge file with no Deno toolchain or types package.
// KEEP IN SYNC with supabase/functions/submit/index.ts: if the Edge file
// adopts new Deno APIs, extend this declaration to cover them.

declare namespace Deno {
  function serve(
    handler: (req: Request) => Response | Promise<Response>,
  ): void;
  namespace env {
    function get(key: string): string | undefined;
  }
}
