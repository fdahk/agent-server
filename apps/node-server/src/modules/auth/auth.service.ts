/**
 * auth 的业务逻辑层(NestJS Service / Provider)。
 *
 * - @nestjs/common —— 这里取它内置的 HTTP 异常类:抛出即被全局异常过滤器转成对应
 *   状态码的 JSON 响应(无需自己 res.status().json())。
 * - @nestjs/jwt —— 提供 JwtService 来签发登录后的 token。
 * - bcrypt —— 业界标准的密码哈希库(自带盐 + 可调强度的慢哈希),用于"存哈希、
 *   不存明文"以及登录时比对。它是 C++ 原生扩展,故 import 写法略特殊。
 */
// ConflictException —— 抛出即 409(这里用于"用户名已被占用")
// UnauthorizedException —— 抛出即 401(用于"用户名或密码错误")
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
// JwtService —— 由 JwtModule 提供,signAsync() 用配置好的密钥签发 token
import { JwtService } from '@nestjs/jwt';
// bcrypt 无默认导出,用 `* as` 拿到 hash()/compare() 等函数
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto';

/** bcrypt 加盐轮数:10 是安全/性能平衡点;> 12 在通用机器上耗时显著 */
const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // 先查用户名:如果已存在,抛 409;如果不存在,哈希密码、落库、签 JWT、返回结果
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const taken = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (taken) {
      throw new ConflictException({
        code: 'USERNAME_TAKEN',
        message: '用户名已被注册',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash,
        displayName: dto.displayName,
        roleCode: 'USER',
      },
    });

    return this.buildResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    // 用同一句话回应"用户不存在"和"密码错误",防止账号枚举
    if (!user) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: '用户名或密码错误',
      });
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: '用户名或密码错误',
      });
    }

    return this.buildResponse(user);
  }

  /** 受保护端点用:按 userId 取当前用户档案(不含 passwordHash) */
  async getProfile(userId: number): Promise<AuthUserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({
        code: 'USER_NOT_FOUND',
        message: '用户不存在',
      });
    }
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      roleCode: user.roleCode,
    };
  }

  private async buildResponse(user: {
    id: number;
    username: string;
    displayName: string;
    roleCode: string;
  }): Promise<AuthResponseDto> {
    // JWT sub 按 spec 是字符串;userId 用字符串形式存,客户端拿到 token 也不影响
    const token = await this.jwt.signAsync({
      sub: String(user.id),
      username: user.username,
      role: user.roleCode,
    });
    const safeUser: AuthUserDto = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      roleCode: user.roleCode,
    };
    return { token, user: safeUser };
  }
}
