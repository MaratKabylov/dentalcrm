import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
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
  controllers: [OrganizationsController],
  providers: [OrganizationsService, PrismaService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
