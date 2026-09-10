import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RegisterUserDto, LoginDto, AssignRoleDto, CreateRoleDto } from './dto/identity.dto';
import { AuthContext, DomainEventType, StandardRole, DEFAULT_ROLE_PERMISSIONS } from '@dentalcrm/contracts';
import { OutboxService } from '../outbox/outbox.service';

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly outboxService: OutboxService,
  ) {}

  async register(dto: RegisterUserDto, tenantIdContext?: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException(`User with email "${dto.email}" already exists`);
    }

    const tenantId = tenantIdContext || dto.tenantId;
    if (!tenantId) {
      throw new ConflictException('Tenant ID is required for user registration');
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID "${tenantId}" not found`);
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.password, salt);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          iin: dto.iin,
        },
      });

      const membership = await tx.membership.create({
        data: {
          tenantId,
          userId: user.id,
          status: 'ACTIVE',
        },
      });

      // Find or assign role
      const roleCode = dto.initialRole || StandardRole.DOCTOR;
      let role = await tx.role.findFirst({
        where: {
          code: roleCode,
          OR: [{ tenantId }, { tenantId: null }],
        },
      });

      if (!role) {
        // Fallback: create role if not exists
        role = await tx.role.create({
          data: {
            tenantId,
            name: roleCode,
            code: roleCode,
            isSystem: true,
          },
        });
      }

      await tx.membershipRole.create({
        data: {
          membershipId: membership.id,
          roleId: role.id,
        },
      });

      await this.outboxService.enqueueEvent(
        tenantId,
        DomainEventType.USER_CREATED,
        { userId: user.id, email: user.email, tenantId, role: roleCode },
        tx,
      );

      return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        tenantId,
        role: roleCode,
      };
    });
  }

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        memberships: {
          include: {
            tenant: true,
            roles: {
              include: {
                role: {
                  include: {
                    permissions: {
                      include: {
                        permission: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Identify target tenant
    let membership = user.memberships[0];
    if (dto.subdomain) {
      const match = user.memberships.find(
        (m) => m.tenant.subdomain.toLowerCase() === dto.subdomain?.toLowerCase(),
      );
      if (match) membership = match;
    }

    if (!membership) {
      throw new UnauthorizedException('User is not a member of any active clinic');
    }

    const tenantId = membership.tenantId;

    // Collect roles and distinct permissions
    const roles: string[] = [];
    const permissionsSet = new Set<string>();

    for (const mr of membership.roles) {
      roles.push(mr.role.code);
      for (const rp of mr.role.permissions) {
        permissionsSet.add(rp.permission.key);
      }
    }

    const permissions = Array.from(permissionsSet);

    const authContext: AuthContext = {
      userId: user.id,
      tenantId,
      roles,
      permissions,
      email: user.email,
    };

    const accessToken = await this.jwtService.signAsync(authContext, {
      expiresIn: process.env.JWT_EXPIRATION || '1d',
    });

    const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');

    // Record session
    await this.prisma.userSession.create({
      data: {
        userId: user.id,
        tenantId,
        tokenHash,
        ip: ip || '127.0.0.1',
        userAgent: userAgent || 'Unknown',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Enqueue login event
    await this.outboxService.enqueueEvent(tenantId, DomainEventType.USER_LOGGED_IN, {
      userId: user.id,
      email: user.email,
      ip,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        tenant: {
          id: membership.tenant.id,
          name: membership.tenant.name,
          subdomain: membership.tenant.subdomain,
        },
        roles,
        permissions,
      },
    };
  }

  async getStaffUsers(tenantId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { tenantId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            iin: true,
            isActive: true,
            createdAt: true,
          },
        },
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    return memberships.map((m) => ({
      ...m.user,
      membershipId: m.id,
      roles: m.roles.map((r) => r.role.code),
    }));
  }

  async assignRole(tenantId: string, userId: string, dto: AssignRoleDto) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        tenantId_userId: {
          tenantId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('User membership not found in this tenant');
    }

    const role = await this.prisma.role.findFirst({
      where: {
        code: dto.roleCode,
        OR: [{ tenantId }, { tenantId: null }],
      },
    });

    if (!role) {
      throw new NotFoundException(`Role with code "${dto.roleCode}" not found`);
    }

    return this.prisma.membershipRole.upsert({
      where: {
        membershipId_roleId: {
          membershipId: membership.id,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        membershipId: membership.id,
        roleId: role.id,
      },
    });
  }

  async getRoles(tenantId: string) {
    return this.prisma.role.findMany({
      where: {
        OR: [{ tenantId }, { tenantId: null }],
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }
}
