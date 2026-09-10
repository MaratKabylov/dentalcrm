import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { IdentityService } from './identity.service';
import { RegisterUserDto, LoginDto, AssignRoleDto } from './dto/identity.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/rbac.guard';
import { Public, RequirePermissions } from '../../common/decorators/rbac.decorator';
import { PermissionKey } from '@dentalcrm/contracts';
import { CurrentUser, CurrentTenant } from '../../common/context/current-user.decorator';

@ApiTags('Identity & Access')
@Controller()
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Public()
  @Post('auth/register')
  @ApiOperation({ summary: 'Register a staff user or doctor' })
  async register(@Body() dto: RegisterUserDto) {
    return this.identityService.register(dto);
  }

  @Public()
  @Post('auth/login')
  @ApiOperation({ summary: 'Authenticate user and return JWT session' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string);
    const userAgent = req.headers['user-agent'];
    return this.identityService.login(dto, ip, userAgent);
  }

  @Get('auth/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user identity and permissions' })
  async getMe(@CurrentUser() user: any) {
    return user;
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PermissionKey.USERS_READ)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all staff users of the current clinic tenant' })
  async getUsers(@CurrentTenant() tenantId: string) {
    return this.identityService.getStaffUsers(tenantId);
  }

  @Post('users/:userId/roles')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PermissionKey.ROLES_MANAGE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign a role to a clinic staff user' })
  async assignRole(
    @CurrentTenant() tenantId: string,
    @Param('userId') userId: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.identityService.assignRole(tenantId, userId, dto);
  }

  @Get('roles')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List available roles and permissions' })
  async getRoles(@CurrentTenant() tenantId: string) {
    return this.identityService.getRoles(tenantId);
  }
}
