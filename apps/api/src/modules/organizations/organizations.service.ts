import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateOrganizationDto,
  CreateBranchDto,
  CreateRoomDto,
  CreateChairDto,
  UpdateChairStatusDto,
} from './dto/organization.dto';
import { DomainEventType } from '@dentalcrm/contracts';
import { OutboxService } from '../outbox/outbox.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
  ) {}

  // --- Organizations ---

  async createOrganization(tenantId: string, dto: CreateOrganizationDto) {
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          tenantId,
          name: dto.name,
          bin: dto.bin,
          legalAddress: dto.legalAddress,
        },
      });

      await this.outboxService.enqueueEvent(
        tenantId,
        DomainEventType.ORGANIZATION_CREATED,
        { organizationId: org.id, name: org.name, tenantId },
        tx,
      );

      return org;
    });
  }

  async getOrganizations(tenantId: string) {
    return this.prisma.organization.findMany({
      where: { tenantId, archivedAt: null },
      include: {
        branches: {
          where: { archivedAt: null },
          include: {
            rooms: {
              include: { chairs: true },
            },
          },
        },
      },
    });
  }

  // --- Branches ---

  async createBranch(tenantId: string, organizationId: string, dto: CreateBranchDto) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, tenantId, archivedAt: null },
    });
    if (!org) {
      throw new NotFoundException(`Organization "${organizationId}" not found for this clinic`);
    }

    return this.prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({
        data: {
          tenantId,
          organizationId,
          name: dto.name,
          code: dto.code,
          city: dto.city,
          address: dto.address,
          phone: dto.phone,
        },
      });

      await this.outboxService.enqueueEvent(
        tenantId,
        DomainEventType.BRANCH_CREATED,
        { branchId: branch.id, organizationId, name: branch.name, tenantId },
        tx,
      );

      return branch;
    });
  }

  async getBranches(tenantId: string) {
    return this.prisma.branch.findMany({
      where: { tenantId, archivedAt: null },
      include: {
        rooms: {
          include: {
            chairs: true,
          },
        },
      },
    });
  }

  // --- Rooms ---

  async createRoom(tenantId: string, branchId: string, dto: CreateRoomDto) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId, archivedAt: null },
    });
    if (!branch) {
      throw new NotFoundException(`Branch "${branchId}" not found for this clinic`);
    }

    return this.prisma.room.create({
      data: {
        tenantId,
        branchId,
        name: dto.name,
        number: dto.number,
        floor: dto.floor,
      },
    });
  }

  // --- Chairs ---

  async createChair(tenantId: string, branchId: string, roomId: string, dto: CreateChairDto) {
    const room = await this.prisma.room.findFirst({
      where: { id: roomId, branchId, tenantId },
    });
    if (!room) {
      throw new NotFoundException(`Room "${roomId}" not found in branch "${branchId}"`);
    }

    return this.prisma.$transaction(async (tx) => {
      const chair = await tx.chair.create({
        data: {
          tenantId,
          branchId,
          roomId,
          name: dto.name,
          code: dto.code,
          status: dto.status || 'OPERATIONAL',
          isAvailableForBooking: dto.isAvailableForBooking !== undefined ? dto.isAvailableForBooking : true,
        },
      });

      await this.outboxService.enqueueEvent(
        tenantId,
        DomainEventType.CHAIR_CREATED,
        { chairId: chair.id, branchId, roomId, name: chair.name, tenantId },
        tx,
      );

      return chair;
    });
  }

  async getChairs(tenantId: string, branchId?: string) {
    return this.prisma.chair.findMany({
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
      },
      include: {
        room: true,
        branch: true,
      },
    });
  }

  async updateChairStatus(tenantId: string, chairId: string, dto: UpdateChairStatusDto) {
    const chair = await this.prisma.chair.findFirst({
      where: { id: chairId, tenantId },
    });
    if (!chair) {
      throw new NotFoundException(`Chair "${chairId}" not found`);
    }

    return this.prisma.chair.update({
      where: { id: chairId },
      data: {
        status: dto.status,
        ...(dto.isAvailableForBooking !== undefined ? { isAvailableForBooking: dto.isAvailableForBooking } : {}),
      },
    });
  }
}
