import { Global, Module } from "@nestjs/common";
import { SupabaseAdminService } from "./supabase-admin.service.js";

@Global()
@Module({
  providers: [SupabaseAdminService],
  exports: [SupabaseAdminService]
})
export class SupabaseModule {}
