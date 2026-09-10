import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/rbac.guard';
import { RequirePermissions } from '../../common/decorators/rbac.decorator';
import { PermissionKey } from '@dentalcrm/contracts';
import { CurrentTenant } from '../../common/context/current-user.decorator';

@ApiTags('Audit & Compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions(PermissionKey.AUDIT_READ)
  @ApiOperation({ summary: 'Retrieve immutable audit log events for the clinic' })
  async getAuditLogs(
    @CurrentTenant() tenantId: string,
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.auditService.getAuditLogs(tenantId, {
      entityType,
      action,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
    });
  }

  @Get('verify')
  @RequirePermissions(PermissionKey.AUDIT_READ)
  @ApiOperation({ summary: 'Verify cryptographic SHA-256 chain integrity of the audit trail' })
  async verifyChainIntegrity(@CurrentTenant() tenantId: string) {
    return this.auditService.verifyChainIntegrity(tenantId);
  }
}
