export class AuthUserDto {
  id!: number;
  username!: string;
  displayName!: string;
  roleCode!: string;
}

export class AuthResponseDto {
  /** 已签发的 JWT(Bearer);客户端后续请求放在 Authorization 头里 */
  token!: string;
  user!: AuthUserDto;
}
