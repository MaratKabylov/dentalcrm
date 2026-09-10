import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsEmail, IsString, MinLength, IsOptional, Matches } from 'class-validator';

export class RegisterUserDto {
  @ApiProperty({ example: 'doctor.ivanov@dentalux.kz' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'SecurePassword123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Иван' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Иванов' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiPropertyOptional({ example: '+7 777 123 45 67' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: '900101300123' })
  @IsString()
  @IsOptional()
  @Matches(/^[0-9]{12}$/, { message: 'Kazakhstan IIN must be exactly 12 numeric digits' })
  iin?: string;

  @ApiPropertyOptional({ example: 'tenant-uuid-or-subdomain' })
  @IsString()
  @IsOptional()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'DOCTOR' })
  @IsString()
  @IsOptional()
  initialRole?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'doctor.ivanov@dentalux.kz' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'SecurePassword123!' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({ example: 'dentalux' })
  @IsString()
  @IsOptional()
  subdomain?: string;
}

export class AssignRoleDto {
  @ApiProperty({ example: 'DOCTOR' })
  @IsString()
  @IsNotEmpty()
  roleCode: string;
}

export class CreateRoleDto {
  @ApiProperty({ example: 'SENIOR_SURGEON' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Старший хирург-имплантолог' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: ['clinical.read', 'clinical.write', 'clinical.sign'] })
  @IsNotEmpty()
  permissions: string[];
}
