import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export const businessLegalForms = [
  "sole_proprietorship",
  "limited_liability_company",
  "public_limited_company",
  "partnership",
  "cooperative",
  "other",
] as const;
export type BusinessLegalForm = (typeof businessLegalForms)[number];

export class UpdateBusinessProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  legalName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  tradingName?: string;

  @IsEnum(businessLegalForms)
  legalForm!: BusinessLegalForm;

  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9./_-]{2,79}$/)
  registrationNumber!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9./_-]{2,79}$/)
  taxIdentificationNumber!: string;

  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(240)
  registeredAddressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  registeredAddressLine2?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  postalCode?: string;

  @IsEmail()
  @MaxLength(254)
  contactEmail!: string;

  @IsString()
  @Matches(/^\+[1-9][0-9]{7,14}$/)
  contactPhone!: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ["http", "https"] })
  @MaxLength(500)
  websiteUrl?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  incorporationDate?: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  baseCurrency!: string;
}

export class ArchiveTenantDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class CreateTenantDto {
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MinLength(2)
  @MaxLength(63)
  slug!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  ownerName!: string;

  @IsEmail()
  @MaxLength(254)
  ownerEmail!: string;

  @IsString()
  @Matches(/^[A-Z0-9_-]{2,20}$/)
  branchCode!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  branchName!: string;
}

export class CreateBranchDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,20}$/)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateCustomerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName!: string;

  @IsString()
  @Matches(/^\+?[1-9][0-9]{7,14}$/)
  phone!: string;

  @IsUUID("4")
  branchId!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  nationalIdReference?: string;

  @IsOptional()
  @IsUUID("4")
  userId?: string;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9][0-9]{7,14}$/)
  phone?: string;

  @IsOptional()
  @IsUUID("4")
  branchId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  nationalIdReference?: string;
}

export const membershipStatuses = [
  "invited",
  "active",
  "suspended",
  "revoked",
] as const;
export type MembershipStatusValue = (typeof membershipStatuses)[number];

export class InviteMembershipDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName!: string;

  @IsUUID("4")
  roleId!: string;

  @IsBoolean()
  allBranches!: boolean;

  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  branchIds!: string[];
}

export class UpdateMembershipDto {
  @IsEnum(membershipStatuses)
  status!: MembershipStatusValue;
}

export class UpdateMembershipAccessDto {
  @IsBoolean()
  allBranches!: boolean;

  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  branchIds!: string[];
}

export class AssignRoleDto {
  @IsUUID("4")
  roleId!: string;
}
