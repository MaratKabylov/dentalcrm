import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serverKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serverKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) in apps/api/.env");
}

const client = createClient(url, serverKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const { error } = await client.auth.admin.listUsers({ page: 1, perPage: 1 });

if (error) throw error;
console.info("Supabase API connection is healthy");
