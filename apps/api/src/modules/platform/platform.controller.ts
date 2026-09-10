import { Controller, Post, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PlatformService } from './platform.service';
import { CreateTenantDto, UpdateTenantSettingsDto } from './dto/tenant.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard, PermissionsGuard } from '../../common/guards/rbac.guard';
import { Public, RequirePermissions } from '../../common/decorators/rbac.decorator';
import { PermissionKey } from '@dentalcrm/contracts';
import { CurrentTenant } from '../../common/context/current-user.decorator';

@ApiTags('Platform')
@Controller('platform')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Public()
  @Post('tenants')
  @ApiOperation({ summary: 'Register a new tenant clinic' })
  @ApiResponse({ status: 201, description: 'Tenant clinic created successfully' })
  async createTenant(@Body() dto: CreateTenantDto) {
    return this.platformService.createTenant(dto);
  }

  @Get('tenant')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current tenant details' })
  async getCurrentTenant(@CurrentTenant() tenantId: string) {
    return this.platformService.getTenant(tenantId);
  }

  @Patch('tenant/settings')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PermissionKey.PLATFORM_ADMIN, PermissionKey.ORGANIZATION_MANAGE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update tenant localization, currency or timezone settings' })
  async updateSettings(
    @CurrentTenant() tenantId: string,
    @Body() dto: UpdateTenantSettingsDto,
  ) {
    return this.platformService.updateTenantSettings(tenantId, dto);
  }
}
