import {
  IsEnum,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class EnrollManagedDeviceDto {
  @IsUUID("4")
  contractId!: string;

  @IsUUID("4")
  providerDeviceId!: string;

  @Matches(/^[0-9]{15}$/)
  imei!: string;
}

const commands = ["lock", "restrict", "release", "sync", "wipe"] as const;

export class IssueMdmCommandDto {
  @IsEnum(commands)
  kind!: (typeof commands)[number];

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
