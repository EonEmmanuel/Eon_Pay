import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsUUID } from "class-validator";
import { CurrentAuthorization, RequirePermissions } from "../common/decorators.js";
import type { AuthorizationContext } from "../common/request-context.js";
import { IdParamDto } from "../common/validation.js";
import { CreateDocumentUploadDto } from "./documents.dto.js";
import { DocumentsService } from "./documents.service.js";

class DocumentListQueryDto {
  @IsOptional()
  @IsUUID("4")
  applicationId?: string;
}

@ApiTags("documents")
@ApiBearerAuth()
@ApiHeader({ name: "X-Tenant-Id", required: true })
@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @RequirePermissions()
  @Get()
  list(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query() query: DocumentListQueryDto,
  ) {
    return this.documents.list(context, query.applicationId);
  }

  @RequirePermissions()
  @Post("upload")
  createUpload(
    @CurrentAuthorization() context: AuthorizationContext,
    @Body() input: CreateDocumentUploadDto,
  ) {
    return this.documents.createUpload(context, input);
  }

  @RequirePermissions()
  @Post(":id/confirm")
  confirm(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.documents.confirm(context, params.id);
  }

  @RequirePermissions()
  @Get(":id/download")
  download(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param() params: IdParamDto,
  ) {
    return this.documents.download(context, params.id);
  }
}
