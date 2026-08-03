import { IsDateString, IsEnum, IsOptional, IsUUID, Matches } from "class-validator";

export class CreateContractDto {
  @IsUUID("4")
  applicationId!: string;
}

export class ActivateContractDto {
  @IsUUID("4")
  inventoryUnitId!: string;

  @IsOptional()
  @IsDateString()
  signedAt?: string;
}

const serviceStatuses = [
  "active",
  "past_due",
  "suspended",
  "completed",
  "terminated",
  "written_off",
] as const;

export class TransitionContractDto {
  @IsEnum(serviceStatuses)
  status!: (typeof serviceStatuses)[number];
}
