import {
  IsBoolean,
  IsEmail,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class InvitePlatformUserDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName!: string;

  @IsUUID("4")
  roleId!: string;
}

export class AssignPlatformRoleDto {
  @IsUUID("4")
  roleId!: string;
}

export class UpdatePlatformProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  displayName!: string;
}

export class UpdatePlatformAccessDto {
  @IsBoolean()
  disabled!: boolean;
}
