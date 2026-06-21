import { IsString, MaxLength, MinLength } from 'class-validator';

// login.dto.ts —— 登录请求体

export class LoginDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
