import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [
    OutboxModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-dentalcrm-key-change-in-production-2026',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [IdentityController],
  providers: [IdentityService, PrismaService],
  exports: [IdentityService, JwtModule],
})
export class IdentityModule {}
