import { Global, Module } from "@nestjs/common";
import { InvitationsService } from "./invitations.service.js";

@Global()
@Module({
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
