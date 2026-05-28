import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { PrismaService } from '../../shared/prisma/prisma.service';
import type { JwtService } from '@nestjs/jwt';

type AuthMocks = {
  findUnique: Mock;
  create: Mock;
  signAsync: Mock;
  prisma: PrismaService;
  jwt: JwtService;
};

function makeMocks(): AuthMocks {
  const findUnique = vi.fn();
  const create = vi.fn();
  const signAsync = vi.fn().mockResolvedValue('signed-jwt');
  const prisma = {
    user: { findUnique, create },
  } as unknown as PrismaService;
  const jwt = { signAsync } as unknown as JwtService;
  return { findUnique, create, signAsync, prisma, jwt };
}

describe('AuthService', () => {
  let m: AuthMocks;
  let svc: AuthService;

  beforeEach(() => {
    m = makeMocks();
    svc = new AuthService(m.prisma, m.jwt);
  });

  describe('register', () => {
    it('用户名未占用时:落库 user + 签 JWT,返回 token + user', async () => {
      m.findUnique.mockResolvedValueOnce(null);
      m.create.mockResolvedValueOnce({
        id: 1,
        username: 'alice',
        passwordHash: 'hashed',
        displayName: 'Alice',
        roleCode: 'USER',
      });

      const r = await svc.register({
        username: 'alice',
        password: 'pwpwpwpw',
        displayName: 'Alice',
      });

      expect(m.create).toHaveBeenCalled();
      const createArg = m.create.mock.calls[0][0] as {
        data: { passwordHash: string; roleCode: string };
      };
      // 写库前明文密码必须经 bcrypt 哈希,绝不存原文
      expect(createArg.data.passwordHash).not.toBe('pwpwpwpw');
      expect(createArg.data.passwordHash.length).toBeGreaterThan(20);
      expect(createArg.data.roleCode).toBe('USER');

      expect(m.signAsync).toHaveBeenCalledWith({
        sub: '1',
        username: 'alice',
        role: 'USER',
      });
      expect(r.token).toBe('signed-jwt');
      expect(r.user).toEqual({
        id: 1,
        username: 'alice',
        displayName: 'Alice',
        roleCode: 'USER',
      });
    });

    it('用户名已占用时:抛 ConflictException(USERNAME_TAKEN)', async () => {
      m.findUnique.mockResolvedValueOnce({ id: 9 });
      await expect(
        svc.register({
          username: 'alice',
          password: 'pwpwpwpw',
          displayName: 'A',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(m.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    let realHash: string;
    beforeEach(async () => {
      const bcrypt = await import('bcrypt');
      realHash = await bcrypt.hash('correct-pw', 4); // 测试用 4 轮提速
    });

    it('用户名 + 密码都对:签 JWT 返回 token + user', async () => {
      m.findUnique.mockResolvedValueOnce({
        id: 7,
        username: 'bob',
        passwordHash: realHash,
        displayName: 'Bob',
        roleCode: 'USER',
      });

      const r = await svc.login({ username: 'bob', password: 'correct-pw' });
      expect(r.token).toBe('signed-jwt');
      expect(r.user.id).toBe(7);
      expect(m.signAsync).toHaveBeenCalledWith({
        sub: '7',
        username: 'bob',
        role: 'USER',
      });
    });

    it('用户不存在:抛 401(INVALID_CREDENTIALS),不签 token', async () => {
      m.findUnique.mockResolvedValueOnce(null);
      await expect(
        svc.login({ username: 'ghost', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(m.signAsync).not.toHaveBeenCalled();
    });

    it('密码错:抛 401,且与"用户不存在"返回同一句话(防账号枚举)', async () => {
      // 准备:让"用户不存在"和"密码错"分别产生异常,提取它们 response.message 比对
      const m2 = makeMocks();
      const svc2 = new AuthService(m2.prisma, m2.jwt);
      m2.findUnique.mockResolvedValueOnce(null);
      let userNotFoundMsg: string | undefined;
      try {
        await svc2.login({ username: 'whoever', password: 'x' });
      } catch (e) {
        const resp = (e as UnauthorizedException).getResponse() as {
          message?: string;
        };
        userNotFoundMsg = resp.message;
      }

      m.findUnique.mockResolvedValueOnce({
        id: 7,
        username: 'bob',
        passwordHash: realHash,
        displayName: 'Bob',
        roleCode: 'USER',
      });
      let wrongPwMsg: string | undefined;
      try {
        await svc.login({ username: 'bob', password: 'wrong-pw' });
      } catch (e) {
        const resp = (e as UnauthorizedException).getResponse() as {
          message?: string;
        };
        wrongPwMsg = resp.message;
      }

      expect(userNotFoundMsg).toBeTruthy();
      expect(userNotFoundMsg).toBe(wrongPwMsg);
      expect(m.signAsync).not.toHaveBeenCalled();
    });
  });
});
