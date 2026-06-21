import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MinLength,
  Min,
} from 'class-validator';

export class SendMessageDto {
  // 用户提问,流式生成的输入
  @IsString()
  @MinLength(1)
  query!: string;

  // 检索 top-k,可选;不传走检索器默认值(6)。范围兜底防塞爆上下文
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  topK?: number;
}
