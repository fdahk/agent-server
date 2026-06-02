/**
 * auth 的 HTTP 入口层(NestJS Controller)。
 *
 * Controller 只做一件事:把 URL/HTTP 方法映射到处理函数,解析请求、调 service、返回结果
 *
 * - @nestjs/common —— 提供路由相关的装饰器(@Controller/@Get/@Post 等)。
 * - @nestjs/swagger —— 读取这些装饰器自动生成 OpenAPI/Swagger 接口文档。
 */
// 路由装饰器:
// Controller —— 声明这是一个控制器,'auth' 是公共路由前缀(/auth/...)
// Body —— 把请求体注入到参数(配合 DTO + 全局 ValidationPipe 完成校验)
// Get/Post —— 声明 HTTP 方法 + 子路径
// HttpCode/HttpStatus —— 显式指定成功时的状态码(如登录用 200 而非默认 201)
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
// ApiTags —— 在 Swagger 里把这些接口归到 "auth" 分组
// ApiBearerAuth —— 在 Swagger 文档上标注"此接口需要 Bearer token"
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto';
import { Public } from './public.decorator'; // 标记某个路由跳过全局 JWT 守卫(注册/登录/健康检查等无需鉴权的端点)
import { CurrentUser } from './current-user.decorator'; // 取出经 JWT 守卫挂上的当前用户;受保护 handler 用 @CurrentUser() user 注入
import type { AuthedUser } from './jwt.strategy'; // JWT 载荷:sub 存 userId(字符串)

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.auth.login(dto);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthedUser): Promise<AuthUserDto> {
    return this.auth.getProfile(user.userId);
  }
}
