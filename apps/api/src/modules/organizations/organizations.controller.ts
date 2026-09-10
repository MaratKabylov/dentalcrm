import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import {
  CreateOrganizationDto,
  CreateBranchDto,
  CreateRoomDto,
  CreateChairDto,
  UpdateChairStatusDto,
} from './dto/organization.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/rbac.guard';
import { RequirePermissions } from '../../common/decorators/rbac.decorator';
import { PermissionKey } from '@dentalcrm/contracts';
import { CurrentTenant } from '../../common/context/current-user.decorator';

@ApiTags('Organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  // --- Organizations ---

  @Post('organizations')
  @RequirePermissions(PermissionKey.ORGANIZATION_MANAGE)
  @ApiOperation({ summary: 'Create an organization inside the tenant' })
  async createOrganization(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.orgsService.createOrganization(tenantId, dto);
  }

  @Get('organizations')
  @ApiOperation({ summary: 'Get all organizations and branches for the current tenant' })
  async getOrganizations(@CurrentTenant() tenantId: string) {
    return this.orgsService.getOrganizations(tenantId);
  }

  // --- Branches ---

  @Post('organizations/:orgId/branches')
  @RequirePermissions(PermissionKey.BRANCH_MANAGE)
  @ApiOperation({ summary: 'Create a clinic branch' })
  async createBranch(
    @CurrentTenant() tenantId: string,
    @Param('orgId') organizationId: string,
    @Body() dto: CreateBranchDto,
  ) {
    return this.orgsService.createBranch(tenantId, organizationId, dto);
  }

  @Get('branches')
  @ApiOperation({ summary: 'List all clinic branches' })
  async getBranches(@CurrentTenant() tenantId: string) {
    return this.orgsService.getBranches(tenantId);
  }

  // --- Rooms ---

  @Post('branches/:branchId/rooms')
  @RequirePermissions(PermissionKey.BRANCH_MANAGE)
  @ApiOperation({ summary: 'Create a room inside a branch' })
  async createRoom(
    @CurrentTenant() tenantId: string,
    @Param('branchId') branchId: string,
    @Body() dto: CreateRoomDto,
  ) {
    return this.orgsService.createRoom(tenantId, branchId, dto);
  }

  // --- Chairs ---

  @Post('branches/:branchId/rooms/:roomId/chairs')
  @RequirePermissions(PermissionKey.CHAIR_MANAGE)
  @ApiOperation({ summary: 'Register a dental chair resource' })
  async createChair(
    @CurrentTenant() tenantId: string,
    @Param('branchId') branchId: string,
    @Param('roomId') roomId: string,
    @Body() dto: CreateChairDto,
  ) {
    return this.orgsService.createChair(tenantId, branchId, roomId, dto);
  }

  @Get('chairs')
  @ApiOperation({ summary: 'List all dental chairs with status and availability' })
  async getChairs(
    @CurrentTenant() tenantId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.orgsService.getChairs(tenantId, branchId);
  }

  @Patch('chairs/:chairId/status')
  @RequirePermissions(PermissionKey.CHAIR_MANAGE)
  @ApiOperation({ summary: 'Update operational status of a dental chair' })
  async updateChairStatus(
    @CurrentTenant() tenantId: string,
    @Param('chairId') chairId: string,
    @Body() dto: UpdateChairStatusDto,
  ) {
    return this.orgsService.updateChairStatus(tenantId, chairId, dto);
  }
}
