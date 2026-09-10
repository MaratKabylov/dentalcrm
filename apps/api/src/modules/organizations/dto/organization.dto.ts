import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { ChairStatus } from '@prisma/client';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'ТОО "ДентаЛюкс Клиник"' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: '120340001234' })
  @IsString()
  @IsOptional()
  bin?: string;

  @ApiPropertyOptional({ example: 'г. Алматы, пр. Абая 150' })
  @IsString()
  @IsOptional()
  legalAddress?: string;
}

export class CreateBranchDto {
  @ApiProperty({ example: 'Филиал Самал' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'SML' })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiProperty({ example: 'Алматы' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'мкр. Самал-2, д. 45' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiPropertyOptional({ example: '+7 727 333 44 55' })
  @IsString()
  @IsOptional()
  phone?: string;
}

export class CreateRoomDto {
  @ApiProperty({ example: 'Кабинет терапии 1' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: '101' })
  @IsString()
  @IsOptional()
  number?: string;

  @ApiPropertyOptional({ example: '1 этаж' })
  @IsString()
  @IsOptional()
  floor?: string;
}

export class CreateChairDto {
  @ApiProperty({ example: 'Кресло Planmeca Compact i5 #1' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'CHAIR-01' })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ enum: ChairStatus, default: ChairStatus.OPERATIONAL })
  @IsEnum(ChairStatus)
  @IsOptional()
  status?: ChairStatus;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isAvailableForBooking?: boolean;
}

export class UpdateChairStatusDto {
  @ApiProperty({ enum: ChairStatus })
  @IsEnum(ChairStatus)
  @IsNotEmpty()
  status: ChairStatus;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isAvailableForBooking?: boolean;
}
