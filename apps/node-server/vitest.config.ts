import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// 相比 Jest,Vitest 更快(esbuild/swc)、原生 ESM/TS、V8 覆盖率。
// NestJS 的装饰器与 metadata 由 unplugin-swc 处理(读取 .swcrc)。
export default defineConfig({
  plugins: [
    // Vitest 编译测试与源码时启用 swc,使 @Injectable/@Controller 等装饰器生效
    swc.vite(),
  ],
  test: {
    // 不开 globals:测试文件显式 import { describe, it, expect } from 'vitest'
    // (避免污染主 tsconfig 的 types,且更显式)
    environment: 'node',
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.test.ts'],
    // testcontainers 启动容器较慢,给足超时
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/main.ts',
        'src/**/*.module.ts',
        'src/**/dto/**',
        'src/**/*.dto.ts',
      ],
      // thresholds: { lines: 80, functions: 80, branches: 80 },
    },
  },
});
