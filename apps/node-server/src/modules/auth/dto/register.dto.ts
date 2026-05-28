import { IsString, MaxLength, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  /** 用户名:3-64 字符,允许字母、数字、下划线、连字符 */
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: '用户名只能包含字母、数字、下划线、连字符',
  })
  username!: string;

  /** 密码:至少 8 字符;hash 用 bcrypt 落库,明文绝不存 */
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  /** 显示名:1-128 字符,允许中文/空格 */
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  displayName!: string;
}
