import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateDeviceEnrollmentDto {
  @IsUUID("4")
  contractId!: string;

  @IsUUID("4")
  inventoryUnitId!: string;
}

export class AgentEnrollDto {
  @IsBoolean()
  deviceOwner!: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  appVersion!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8_000)
  integrityToken?: string;
}

export class AgentCheckInDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  iccid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  imsi?: string;

  @IsIn(["offline", "wifi", "cellular", "ethernet", "other"])
  connectivityState!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  appVersion!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4_096)
  fcmToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  firebaseInstallationId?: string;

  @IsBoolean()
  simChanged!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(8_000)
  integrityToken?: string;
}

export class AgentCommandAcknowledgementDto {
  @IsBoolean()
  success!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  failureReason?: string;
}
