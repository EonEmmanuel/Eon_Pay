import { Global, Module } from "@nestjs/common";
import { DiditProvider } from "./didit.provider.js";
import { EsperMdmProvider } from "./esper.provider.js";
import { SupabaseStorageProvider } from "./storage.provider.js";
import { SupabaseInvitationsProvider } from "./supabase-invitations.provider.js";

@Global()
@Module({
  providers: [
    DiditProvider,
    EsperMdmProvider,
    SupabaseStorageProvider,
    SupabaseInvitationsProvider,
  ],
  exports: [
    DiditProvider,
    EsperMdmProvider,
    SupabaseStorageProvider,
    SupabaseInvitationsProvider,
  ],
})
export class ProvidersModule {}
