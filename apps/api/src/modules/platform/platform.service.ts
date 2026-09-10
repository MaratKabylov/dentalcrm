import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateTenantDto, UpdateTenantSettingsDto } from './dto/tenant.dto';
import { DomainEventType, StandardRole, DEFAULT_ROLE_PERMISSIONS } from '@dentalcrm/contracts';
import { OutboxService } from '../outbox/outbox.service';

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
  ) {}

  async createTenant(dto: CreateTenantDto) {
    const existing = await this.prisma.tenant.findUnique({
      where: { subdomain: dto.subdomain.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException(`Subdomain "${dto.subdomain}" is already registered`);
    }

    // Execute in a single ACID transaction (Tenant + Settings + Standard Roles + Outbox Event)
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.name,
          subdomain: dto.subdomain.toLowerCase(),
          settings: {
            create: {
              timezone: dto.timezone || 'Asia/Almaty',
              currency: 'KZT',
              locale: 'ru',
            },
          },
        },
        include: {
          settings: true,
        },
      });

      // Seed standard roles for this tenant
      for (const [roleCode, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
        if (roleCode === StandardRole.SUPER_ADMIN) continue;

        const role = await tx.role.create({
          data: {
            tenantId: tenant.id,
            name: roleCode.replace('_', ' '),
            code: roleCode,
            isSystem: true,
          },
        });

        // Link permissions
        for (const permKey of permissions) {
          // Ensure permission exists globally
          const permission = await tx.permission.upsert({
            where: { key: permKey },
            update: {},
            create: {
              key: permKey,
              domain: permKey.split('.')[0],
              description: `Permission for ${permKey}`,
            },
          });

          await tx.rolePermission.create({
            data: {
              roleId: role.id,
              permissionId: permission.id,
            },
          });
        }
      }

      // Enqueue domain event to transactional outbox
      await this.outboxService.enqueueEvent(
        tenant.id,
        DomainEventType.TENANT_CREATED,
        {
          tenantId: tenant.id,
          name: tenant.name,
          subdomain: tenant.subdomain,
          ownerEmail: dto.ownerEmail,
        },
        tx,
      );

      return tenant;
    });
  }

  async getTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        settings: true,
        organizations: {
          include: {
            branches: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID "${tenantId}" not found`);
    }

    return tenant;
  }

  async updateTenantSettings(tenantId: string, dto: UpdateTenantSettingsDto) {
    return this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: { ...dto },
      create: {
        tenantId,
        timezone: dto.timezone || 'Asia/Almaty',
        currency: dto.currency || 'KZT',
        locale: dto.locale || 'ru',
      },
    });
  }
}
