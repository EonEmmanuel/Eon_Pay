import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { JwtVerifierService } from "./jwt-verifier.service.js";

@Module({
  controllers: [AuthController],
  providers: [JwtVerifierService, AuthService],
  exports: [JwtVerifierService],
})
export class AuthModule {}
