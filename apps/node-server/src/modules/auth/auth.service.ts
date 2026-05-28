import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
