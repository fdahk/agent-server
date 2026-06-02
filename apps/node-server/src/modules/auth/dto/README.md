# DTO 层说明(auth 模块)

**DTO(Data Transfer Object,数据传输对象)**:描述每个 API 在网络边界上"请求体/响应体长什么形状、有什么约束"的类。

---

## 一、`@IsString()` 这种 `@` 是什么:装饰器(Decorator)

`@IsString()` / `@MinLength(3)` 是 **装饰器**,它**不是 class-validator 独有的语法**,而是语言级特性(TC39 提案 + TypeScript 实现)。class-validator 只是"用"了它,就像 React 用闭包,但闭包不是 React 发明的。Angular、NestJS、TypeORM、MobX 也都在用装饰器。

### 装饰器本质是一个"在类定义时被调用的函数"

注意时机:是 **class 这段代码被加载、求值时**调用,不是实例化(`new`)时。`@MinLength(3)` 后面带括号,说明它是**装饰器工厂**——先调用 `MinLength(3)` 返回真正的装饰器,这样能把参数 `3` 闭包进去。

把 `@MinLength(3)` 还原成普通代码大概是这样:

```ts
function MinLength(min: number) {
  return function (target: object, propertyKey: string) {
    // 不校验任何东西,只是把“这个字段要满足 minLength=min”
    // 登记到一张全局元数据表里(key = target 构造函数 + 字段名)
    registerValidationMetadata({ target, propertyKey, type: 'minLength', constraints: [min] });
  };
}
```

**关键结论:装饰器自己不校验任何东西。** 它只在类加载时把"这个字段有哪些规则"**登记**进一张元数据表。真正跑校验是另一个时刻的事(见第三节的 `ValidationPipe`)。所以装饰器 = 声明 + 登记,校验 = 后面 pipe 去读表执行。

### 它依赖两个编译开关 + 一个运行时库

本项目 `tsconfig.json` 开了:

- `experimentalDecorators: true` —— 启用 TS 的 legacy 版装饰器语法。
- `emitDecoratorMetadata: true` —— class-validator/transformer 的命脉,见第二节。

运行时要 `import 'reflect-metadata'`(NestJS 入口引一次),提供 `Reflect.getMetadata/defineMetadata` 存取元数据。

> **装饰器有两套,别混。** 一套是 TS 早期的 legacy 版(靠 `experimentalDecorators`),一套是 2023 年进 Stage 3、Node/TS 原生支持的"新版"。整个 NestJS 生态建立在 **legacy 版 + reflect-metadata** 上;新版装饰器**故意不支持 `emitDecoratorMetadata`**,所以 NestJS 短期不会迁。你在这套代码里看到的全是 legacy 装饰器。

---

## 二、为什么后端校验非用装饰器不可:类型会被擦除

你写 `username!: string`,可能想:"我都标了 `string`,运行时来个数字不就报错了?" **不会。** TS 类型只活在编译期,`tsc` 产出 JS 后,所有 `: string`、`interface`、`type` **全部消失**。运行时服务器拿到的只是 `JSON.parse` 出来的一坨 `any`,**它根本不知道前端传了什么形状**。

所以:**不能靠 TS 类型校验不可信的外部输入。** 类型是给编译器和你自己看的,运行时零保护。

那运行时怎么知道 "username 应是 string、长 3~64"?只有两条路:

1. 每个字段每个接口手写 `if (typeof x !== 'string' || ...) throw`——地狱。
2. 让校验规则以**运行时还活着的形式**存在 —— 这就是装饰器:登记进元数据表的那段代码,编译后**真实存在于 JS 里,擦不掉**。

`emitDecoratorMetadata` 再进一步:编译时把字段的设计类型也塞进元数据(`design:type`),于是 class-transformer 能反查出"username 设计类型是 String"。这是 `@Type()` 自动转换、嵌套对象校验能工作的底层原因——相当于把一部分本会被擦除的类型,以元数据形式抢救回运行时。

> **结论:DTO 必须是** `class`**,不能是** `interface` **/** `type`**。** interface 编译后彻底消失,没有"东西"挂装饰器、没有运行时实例可校验。这也是后端到处是 class、而前端你习惯 interface 的根因——两边对"运行时是否需要这个形状"需求不同。

---

## 三、这套链路在本项目里怎么跑(以登录为例)

```
前端 POST /auth/login  { username, password }
        │
        ▼
@Body() dto: LoginDto              ← auth.controller.ts 把原始 JSON 交给 ValidationPipe
        │
全局 ValidationPipe(main.ts 里 useGlobalPipes 注册):
  1. plainToInstance(LoginDto, body)   ← class-transformer 把普通对象变成 LoginDto 实例
  2. validate(实例)                     ← class-validator 读元数据表,逐条跑 @IsString/@MinLength…
  3. whitelist:true → 删掉 DTO 未声明的字段
  4. transform:true → 顺带类型转换(如 "12" → 12)
        │
   失败 → 抛 400,带每条失败信息
   通过 → controller 拿到的 dto 已是干净、可信、强类型对象
        │
        ▼
auth.service.login(dto)            ← service 层永远只拿到已校验数据
```

本项目 `main.ts` 的实际配置是 `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false })`。两个安全/体验要点:

- `**whitelist: true`(防越权批量赋值):** 前端若多传 `{ username, password, role: 'ADMIN' }`,`role` 不在 `LoginDto` 里 → 被直接剥掉,传不进 service。这能挡 **mass assignment / over-posting**(前端偷塞字段试图改不该改的属性)。`forbidNonWhitelisted: false` 表示遇到多余字段只悄悄丢弃、不报错(设 true 则直接 400)。
- `**transform: true`:** 让 controller 参数从"普通对象"升级成真正的 DTO 类实例,`@Type()`、`ParseIntPipe` 之类的转换才生效。

补充 `username!: string` 里的 `!`:是 **definite assignment assertion(确定赋值断言)**,告诉 TS"这字段我保证会被赋值,别报 `strictPropertyInitialization`"。它**纯哄编译器,运行时零保证**——真正保证 username 存在的是 `@IsString()` + ValidationPipe。

---

## 四、DTO 层是什么、为什么要单独一层

**DTO 描述"一次 API 调用在网络边界上传输的数据形状"。** 为什么不直接用 Prisma 模型、或随手 `any`:

1. **边界即信任边界。** controller 是系统接触外部不可信输入的第一关。分层架构的纪律是"边界处一次性校验,之后内部都当可信数据用"。DTO 就是这道安检契约。
2. **把 API 契约和内部模型解耦。** 本项目 DB 用 Prisma,有 `User` 模型(含 `passwordHash`、`createdAt` 等)。如果直接拿 Prisma 模型收发:
  - **请求方向**会把 `passwordHash`、`id`、`roleCode` 这种字段也暴露成"可被前端赋值",危险;
  - **响应方向**(看 `auth-response.dto.ts`)会泄露 `passwordHash` 等内部字段。
   DTO 让"对外契约"和"对内存储"各自独立演进:DB 加字段不一定动 API,API 改形状不一定动表。
3. **单一收口点。** 形状、校验、转换、Swagger 文档(`@nestjs/swagger` 也读这些 class)集中在 DTO 一处,而不是散落在 controller 各个 `if`。`register.dto.ts` 就是例子:用户名正则 `@Matches`、密码长度 `@MinLength(8)` 全声明在字段上,一眼看清契约。

---

## 五、业界对比与取舍(为什么是 class-validator,而不是 Zod)

NestJS 默认这套 **class-validator + class-transformer(装饰器派)**,不是唯一解。前端你大概率更熟 **Zod**,值得对照:


| 维度   | class-validator(装饰器派)                           | Zod / Yup / Joi(schema 派)           |
| ---- | ----------------------------------------------- | ----------------------------------- |
| 形态   | 装饰器贴在 class 字段上                                 | 一个独立的 schema 对象                     |
| 类型来源 | **类型和校验各写一遍**(`: string` 和 `@IsString()`),可能漂移  | schema 即真相,`z.infer` **反推**出类型,单一来源 |
| 依赖   | 需 `experimentalDecorators` + `reflect-metadata` | 纯函数,零装饰器、零元数据                       |
| 生态契合 | 与 NestJS DI、Swagger 天然集成                        | 与 React Hook Form、tRPC 等前端生态契合      |
| 心智   | OO、声明式、和 class 绑定                               | 函数式、可组合(`.extend/.merge/.pick`)     |


取舍小结:

- **留在 class-validator:** 你在 NestJS 里,且想吃 `@nestjs/swagger`、`ValidationPipe`、DI 的整套开箱集成。代价是"类型 + 装饰器写两遍"有漂移风险(改了类型忘改装饰器,反之亦然),且绑死 legacy 装饰器 + reflect-metadata。
- **换 Zod(可经 `nestjs-zod` 接入):** 想要"schema 即类型"单一真相、和前端共享同一套 schema(前后端同构校验)。代价是离开 NestJS 默认范式,Swagger 集成要额外适配。

**Zod 在前端已是事实标准**(表单、tRPC、API 边界),后端 NestJS 又默认 class-validator

---

## 六、常见踩坑清单

1. **DTO 必须是 `class`。** 用 interface/type 装饰器无处可挂,运行时啥都不剩。
2. **光写装饰器不会自动校验。** 必须有 `ValidationPipe`(本项目在 `main.ts` 全局注册)。漏了它,DTO 就只是个普通 class,装饰器形同虚设——这是新手最常见的"我加了 @IsString 怎么没拦住"。
3. **可选字段要 `@IsOptional()`。** 否则缺字段会校验失败。
4. **嵌套对象要 `@ValidateNested()` + `@Type(() => Child)`。** 否则只校验外层,内层是个未经校验的普通对象。
5. `**!` 不是运行时保证。** 它只关掉编译器的未初始化报错,别误以为字段一定有值。
6. **响应也用 DTO + 控制序列化。** 像 `auth-response.dto.ts` 这样显式声明对外字段,避免把 `passwordHash` 等内部字段泄露出去(配合 `ClassSerializerInterceptor` / `@Exclude` 更稳)。
7. `**reflect-metadata` 只引一次、且要在最早。** 入口顶部 import,晚引或多引可能导致元数据读不到。

