import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OutboxModule } from '../outbox/outbox.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    OutboxModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-dentalcrm-key-change-in-production-2026',
    }),
  ],
  controllers: [PlatformController],
  providers: [PlatformService, PrismaService],
  exports: [PlatformService],
})
export class PlatformModule {}
