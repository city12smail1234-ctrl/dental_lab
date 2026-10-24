import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateDoctorProfileDto {
  @IsString() @MinLength(2) @MaxLength(100)
  full_name: string;

  @Matches(/^\+?[0-9]{8,15}$/, { message: 'phone must be 8-15 digits' })
  phone: string;

  @IsString() @MinLength(2) @MaxLength(150)
  clinic_name: string;

  @IsOptional() @IsString() @MaxLength(300)
  clinic_address?: string;
}

export class SetDoctorStatusDto {
  @IsIn(['approved', 'rejected', 'suspended'])
  status: 'approved' | 'rejected' | 'suspended';
}
