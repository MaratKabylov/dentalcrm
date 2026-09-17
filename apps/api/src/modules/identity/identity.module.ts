import { Module } from "@nestjs/common";
import { IdentityController } from "./identity.controller.js";
import { IdentityRepository } from "./identity.repository.js";
import { TokenVerifierService } from "./token-verifier.service.js";
import { AuthController } from "./auth.controller.js";
import { LocalAuthService } from "./local-auth.service.js";

@Module({
  controllers: [IdentityController, AuthController],
  providers: [IdentityRepository, TokenVerifierService, LocalAuthService],
  exports: [IdentityRepository, TokenVerifierService, LocalAuthService]
})
export class IdentityModule {}
