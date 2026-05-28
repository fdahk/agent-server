import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 标记某个路由跳过全局 JWT 守卫(注册/登录/健康检查等无需鉴权的端点) */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
