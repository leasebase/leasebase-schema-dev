import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

/** Allowed signup user types sent by the web registration form. */
export enum SignupUserType {
  OWNER = 'OWNER',
  PROPERTY_MANAGER = 'PROPERTY_MANAGER',
}

export class RegisterDto {
  @ApiProperty({ description: 'User email address', example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ description: 'User password (min 8 characters)', example: 'password123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string;

  @ApiProperty({ description: 'User first name', example: 'John' })
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty({ description: 'User last name', example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiPropertyOptional({
    description: 'Signup user type / intended role',
    enum: SignupUserType,
    example: 'OWNER',
  })
  @IsOptional()
  @IsEnum(SignupUserType)
  userType?: SignupUserType;
}
