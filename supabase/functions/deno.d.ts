declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};

declare module 'npm:@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js';
}
