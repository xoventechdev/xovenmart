import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class ListCategoriesQuery {
  @ApiPropertyOptional({ description: "Set true to include sub-categories in the response" })
  @IsOptional()
  includeChildren?: string;

  @ApiPropertyOptional({ description: "Set true to include only top-level categories" })
  @IsOptional()
  rootOnly?: string;
}

export class ListProductsQuery {
  @ApiPropertyOptional({ description: "Filter by category slug (includes sub-categories)" })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: "Search term (Bangla or English)" })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: ["new", "price_asc", "price_desc", "discount", "popular"] })
  @IsOptional()
  @IsString()
  sort?: "new" | "price_asc" | "price_desc" | "discount" | "popular";

  @ApiPropertyOptional({ description: "Page number (1-based)", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: "Items per page (max 100)", default: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perPage?: number = 24;

  @ApiPropertyOptional({ description: "Featured-only filter" })
  @IsOptional()
  featured?: string;
}

export class SearchQuery {
  @ApiPropertyOptional({ description: "Search query — searches product name (BN+EN)" })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: "Limit autocomplete results", default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;
}