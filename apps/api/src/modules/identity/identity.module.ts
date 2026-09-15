import { Module } from "@nestjs/common";
import { IdentityController } from "./identity.controller.js";
import { IdentityRepository } from "./identity.repository.js";
import { TokenVerifierService } from "./token-verifier.service.js";

@Module({
  controllers: [IdentityController],
  providers: [IdentityRepository, TokenVerifierService],
  exports: [IdentityRepository, TokenVerifierService]
})
export class IdentityModule {}
