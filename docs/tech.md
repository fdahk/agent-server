# `test/app.e2e-spec.ts` 报错说明

## 这次报错是什么

本次报错集中在 `test/app.e2e-spec.ts` 里的这段链式调用：

```ts
return request(app.getHttpServer())
  .get('/')
  .expect(200)
  .expect('Hello World!');
```

报错主要有两类：

1. `@typescript-eslint/no-unsafe-call`
2. `@typescript-eslint/no-unsafe-return`

它们的共同含义是：

- ESLint 在做“带 TypeScript 类型信息的静态检查”时，发现这里调用的对象类型没有被正确解析。
- 一旦调用目标的类型不清晰，后续 `.get()`、`.expect()`、最终 `return` 出去的值，都会被认为存在潜在不安全性。

这不是说代码运行时一定有 bug，而是“类型系统无法证明这段代码是安全的”。

## 本次问题的直接原因

原来的写法是：

```ts
import * as request from 'supertest';
import { App } from 'supertest/types';

let app: INestApplication<App>;
```

这里有两个关键问题。

### 1. `supertest` 的导入方式不对

`supertest` 的主导出本质上是一个可直接调用的函数，常见正确写法是：

```ts
import request from 'supertest';
```

而原来的：

```ts
import * as request from 'supertest';
```

在当前 `TypeScript + NodeNext + esModuleInterop` 配置下，推断出来的是“模块命名空间对象”。

模块命名空间对象可以理解成：

```ts
{
  default: ...,
  Test: ...,
  agent: ...
}
```

它是一个对象，不是一个可直接执行的函数，所以当代码写成 `request(...)` 时，TypeScript 会认为：

> 你在尝试把一个普通对象当函数调用。

因此会出现截图里的这条核心 TS 报错：

> 此表达式不可调用。类型没有调用签名。

一旦第一步 `request(...)` 的类型错了，后面的 `.get()`、`.expect()` 就都会连锁报错。

### 2. `INestApplication<App>` 这个泛型没有必要，还容易干扰类型理解

Nest 官方常见模板里一般直接写：

```ts
let app: INestApplication;
```

`app.getHttpServer()` 返回的是底层 HTTP Server 句柄，交给 `supertest` 即可。

这里额外引入 `supertest/types` 里的 `App` 泛型并不是必须的，而且会让测试文件的类型关系变得更复杂。对于当前这个简单 e2e 测试，去掉它更稳妥，也更符合官方模板。

## 修复后做了什么

修复后的关键改动只有两点：

```ts
import request from 'supertest';
let app: INestApplication;
```

本质上是在做两件事：

1. 让 `request` 被正确识别为 `supertest` 导出的可调用函数。
2. 让 `app.getHttpServer()` 与 `supertest` 的入参类型回到官方推荐的简单路径。

这样 ESLint 和 TypeScript 就都能正确推断这条调用链的类型。

## 这些概念分别是什么意思

### 1. E2E 测试

E2E 是 End-to-End，端到端测试。

它不是只测某个函数，而是尽量按“真实请求经过真实应用”的方式验证整个流程，例如：

1. 启动 Nest 应用
2. 获取 HTTP Server
3. 用 `supertest` 模拟发送 HTTP 请求
4. 校验响应状态码和响应内容

这比单元测试更接近真实运行场景。

### 2. `supertest`

`supertest` 是 Node.js 生态里常用的 HTTP 测试库。

它的作用是：

- 不需要真正把服务发布到外网端口
- 直接拿到应用的 HTTP server 实例
- 在内存里模拟请求
- 返回一个可链式断言的对象

所以这里的：

```ts
request(app.getHttpServer()).get('/').expect(200)
```

可以理解为：

“对这个应用的 HTTP 服务发一个 GET `/` 请求，并断言它应该返回 200。”

### 3. `INestApplication`

这是 NestJS 应用实例的接口类型。调用：

```ts
moduleFixture.createNestApplication()
```

会创建一个 Nest 应用对象，随后：

```ts
await app.init();
```

会完成模块初始化、控制器注册、路由装配等动作。

### 4. 静态检查

静态检查是“代码不运行，先在编辑阶段分析代码”。

这里实际有两层：

1. TypeScript 编译器检查类型是否成立
2. ESLint 基于 TypeScript 类型信息进一步检查是否存在“不安全调用”“不安全返回”等问题

也就是说，这些报错不是运行时报错，而是开发期的质量保护机制。

## 这些规则本质在做什么

### `no-unsafe-call`

这个规则要防止你去调用一个类型不明确的值。

例如下面这种思路就是危险的：

```ts
const x: any = something;
x();
```

因为 `x` 可能根本不是函数，但 `any` 会绕过类型系统，让问题拖到运行时才爆炸。

所以 `no-unsafe-call` 的本质是：

> 不允许在“类型系统无法确认可调用”的前提下执行函数调用。

### `no-unsafe-return`

这个规则要防止你从函数里返回一个不安全类型。

原因是：一旦危险类型被 return 出去，它就会继续污染调用方，导致更大范围的类型失真。

所以它的本质是：

> 不要把一个来源不明、类型不可靠的值继续向外传播。

## 它们发挥作用的原理

底层依赖的是 TypeScript 的类型信息。

当前项目的 ESLint 配置里启用了：

```ts
...tseslint.configs.recommendedTypeChecked
```

并且配置了：

```ts
parserOptions: {
  projectService: true,
  tsconfigRootDir: import.meta.dirname,
}
```

这意味着 ESLint 不是只看语法，而是会调用 TypeScript 的类型服务来理解：

- `request` 到底是什么
- `request(...)` 的返回值是什么
- `.get()` 是否真的存在
- `return` 出去的对象类型是否安全

也正因为如此，这类规则比普通语法规则更严格，也更有价值。

## 这次报错的完整传导过程

这次问题可以按下面的链路理解：

1. `import * as request from 'supertest'` 让 `request` 被推成“模块对象”
2. 模块对象没有调用签名，所以 `request(...)` 不成立
3. 由于第一步类型已坏，`request(...)` 的结果也无法可靠推断
4. 所以后面的 `.get()`、`.expect()` 被认为是对未知危险对象做成员访问和调用
5. 最终 `return request(...).get(...).expect(...)` 时，又触发 `no-unsafe-return`

可以看出，后续错误基本都是“首个类型错误的连锁反应”。

## 更底层一点：为什么 `import * as` 会出问题

这和 ES Module / CommonJS 互操作有关。

### CommonJS 和 ES Module

Node.js 生态里历史上大量包使用 CommonJS：

```js
module.exports = fn;
```

而现代 TypeScript / ESM 更常见的是：

```ts
export default fn;
```

这两套模块系统在“默认导出”“命名导出”“命名空间导入”上的语义并不完全一样。

`import * as request from 'supertest'` 的语义更接近：

> 把整个模块的所有导出收集成一个对象。

因此拿到的通常是“命名空间对象”，而不是默认导出的那个函数本身。

而 `import request from 'supertest'` 才是在当前配置下更符合 `supertest` 用法的写法。

## 本质是在测什么

这段测试的本质不是“测试 `supertest`”，而是测试：

- Nest 应用是否成功启动
- `/` 路由是否存在
- 这个路由是否返回 `200`
- 返回体是否是 `'Hello World!'`

也就是验证“HTTP 接口对外表现是否符合预期”。

## 作用过程的底层原理

可以把整个执行过程理解成下面几步：

1. `Test.createTestingModule()` 创建一个只用于测试的 Nest 模块容器
2. `.compile()` 让 Nest 完成依赖解析和模块编译
3. `createNestApplication()` 基于测试模块创建应用实例
4. `app.init()` 完成路由注册、中间件装载、生命周期钩子初始化
5. `app.getHttpServer()` 取到底层 Node HTTP Server
6. `supertest` 把这个 server 包装成一个可发请求、可断言响应的测试客户端
7. `.get('/')` 构造 GET 请求
8. `.expect(200)` 和 `.expect('Hello World!')` 对响应结果做断言

如果其中任一步类型没对齐，静态检查就会预警；如果逻辑没对齐，测试运行时就会失败。

## 为什么这种检查有必要

必要性主要有三点。

### 1. 提前暴露问题

如果没有这些规则，很多错误会拖到运行时才发现，例如：

- 把对象当函数调用
- 调用不存在的方法
- 错误的模块导入方式

### 2. 避免 `any` 污染

一旦测试代码里大量出现 `any` 或无法解析的类型，IDE 自动补全、重构、错误提示都会明显变差。

### 3. 保证测试代码质量

很多人只关注业务代码质量，忽略测试代码。但测试代码本身如果类型混乱，也会导致误报、漏报，甚至让错误测试“看起来在通过”。

## 相关扩展知识

### 1. 为什么测试代码也要严格类型化

因为测试代码不是一次性脚本，它也是项目代码的一部分。

测试如果写得不严谨，会出现两类问题：

1. 误以为覆盖到了场景，实际上没有测到关键路径
2. 测试本身因为类型错误或导入错误而变得脆弱

### 2. 链式调用为什么容易把错误放大

链式调用依赖前一步返回值的类型是正确的。

一旦第一环出错，后面整条链的类型都会失真，所以编辑器里经常会看到“一串连续红线”。

### 3. `await` 和 `return` 在 Jest 测试里的关系

这类测试常见两种写法：

```ts
return request(...).get(...).expect(...);
```

或者：

```ts
await request(...).get(...).expect(...);
```

它们都能告诉 Jest“这个测试是异步的，请等待 Promise 完成”。  
当前这段使用 `return` 是成立的，只要返回值类型被正确推断即可。

### 4. 为什么官方模板通常更稳

像 Nest 这种成熟框架，官方模板里的测试写法通常已经兼顾了：

- 类型兼容性
- 工具链兼容性
- 社区最佳实践

如果没有明确需求，优先靠近官方模板通常比自己补复杂泛型更安全。

## 需要注意的点

1. 在 `TypeScript + ESLint type checked` 项目里，模块导入方式非常重要，不能只看“运行起来像没问题”。
2. `import * as xxx` 不等于默认导入，尤其在 CommonJS / ESM 混用场景里要谨慎。
3. 看到一串 `unsafe-*` 报错时，优先找“第一个真正的类型错误”，后面的很多时候只是连锁反应。
4. 测试代码也应该遵守和业务代码同级别的类型规范。
5. 如果库本身提供了官方推荐写法，优先使用官方写法，能减少很多工具链兼容问题。

## 这次修复结论

这次修复并不是改业务逻辑，而是修正“模块导入方式和不必要的泛型声明”，让：

- TypeScript 能正确理解 `request` 是可调用函数
- ESLint 能正确分析整条链式调用的类型
- `supertest` 与 Nest e2e 测试回到标准用法

最终结果就是：代码行为不变，但类型系统恢复正常，编辑器报错消失，测试文件的静态安全性也更高。
