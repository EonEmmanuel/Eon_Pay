import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const categories = [
  "national_id_front",
  "national_id_back",
  "proof_of_address",
  "proof_of_income",
  "signed_contract",
  "other",
] as const;
const mimeTypes = ["image/jpeg", "image/png", "application/pdf"] as const;

export class CreateDocumentUploadDto {
  @IsOptional()
  @IsUUID("4")
  customerId?: string;

  @IsOptional()
  @IsUUID("4")
  applicationId?: string;

  @IsEnum(categories)
  category!: (typeof categories)[number];

  @IsString()
  @MaxLength(180)
  originalFileName!: string;

  @IsEnum(mimeTypes)
  mimeType!: (typeof mimeTypes)[number];

  @IsInt()
  @Min(1)
  @Max(20 * 1024 * 1024)
  sizeBytes!: number;

  @Matches(/^[a-f0-9]{64}$/)
  sha256!: string;
}
