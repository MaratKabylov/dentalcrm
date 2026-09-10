import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, IsOptional, IsEmail } from 'class-validator';

export class CreateTenantDto {
  @ApiProperty({ example: 'DentaLux Clinic Almaty' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'dentalux' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, { message: 'Subdomain must contain only lowercase alphanumeric characters and hyphens' })
  subdomain: string;

  @ApiProperty({ example: 'owner@dentalux.kz' })
  @IsEmail()
  @IsNotEmpty()
  ownerEmail: string;

  @ApiPropertyOptional({ example: 'Asia/Almaty' })
  @IsString()
  @IsOptional()
  timezone?: string;
}

export class UpdateTenantSettingsDto {
  @ApiPropertyOptional({ example: 'Asia/Almaty' })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ example: 'KZT' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ example: 'ru' })
  @IsString()
  @IsOptional()
  locale?: string;
}
