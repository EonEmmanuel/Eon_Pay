import { IsEnum, IsInt, IsUUID, Max, Min } from "class-validator";

export class CreateSelfPaymentDto {
  @IsUUID("4")
  contractId!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountMinorUnits!: number;

  @IsEnum(["mtn_momo", "orange_money"])
  channel!: "mtn_momo" | "orange_money";
}
