import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTaskDto {
  // agent 要完成的自然语言任务,如"把我上传的 X 类文档整理成综述"
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  task!: string;
}
