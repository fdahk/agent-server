# Java 后端核心知识详解

## 目录

1. [.mvn 目录详解](#1-mvn-目录详解)
2. [Java 项目目录结构：为什么要套 java/com/...？](#2-java-项目目录结构为什么要套-javacom)
3. [泛型方法签名详解：`public static <T> ApiResponse<T> success(T data)`](#3-泛型方法签名详解public-static-t-apiresponset-successt-data)
4. [Java 的 import 机制 vs Node 的模块化引入](#4-java-的-import-机制-vs-node-的模块化引入)
5. [Java 注解（Annotation）机制详解](#5-java-注解annotation机制详解)
6. [Stream API 链式调用详解](#6-stream-api-链式调用详解)
7. [@Configuration、@Bean 与 Spring IoC 容器底层机制](#7-configurationbean-与-spring-ioc-容器底层机制)
8. [Java 常用注解大全](#8-java-常用注解大全)
9. [依赖注入（DI）与控制反转（IoC）底层原理](#9-依赖注入di与控制反转ioc底层原理)
10. [Java 的运行平台区分：为什么要强调 "Java Web"？](#10-java-的运行平台区分为什么要强调-java-web)
11. [target 目录与 Java 编译原理](#11-target-目录与-java-编译原理)
12. [mvnw、mvnw.cmd 与 pom.xml 详解](#12-mvnwmvnwcmd-与-pomxml-详解)

---

## 1. .mvn 目录详解

### 这是什么？

`.mvn/` 是 **Maven Wrapper 的配置目录**。在我们的项目中，它位于：

```
apps/java-server/
├── .mvn/
│   └── wrapper/
│       └── maven-wrapper.properties   ← 唯一的配置文件
├── mvnw                               ← Linux/macOS 启动脚本
├── mvnw.cmd                           ← Windows 启动脚本
└── pom.xml                            ← Maven 项目配置文件
```

### maven-wrapper.properties 的内容

```properties
wrapperVersion=3.3.4
distributionType=only-script
distributionUrl=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.14/apache-maven-3.9.14-bin.zip
```

- `wrapperVersion`：Maven Wrapper 本身的版本
- `distributionType`：下载类型（`only-script` 表示只下载脚本，不下载完整安装包）
- `distributionUrl`：Maven 的下载地址，指定了要使用的 Maven 版本（3.9.14）

### 为什么需要它？

**类比 Node.js**：你可以把 Maven Wrapper 类比为 Node.js 生态中的 `nvm`（Node Version Manager）+ `npx` 的结合体。

**核心问题**：不同开发者的电脑上可能安装了不同版本的 Maven，版本差异可能导致构建结果不一致。Maven Wrapper 解决了这个问题：

| 特性 | Maven Wrapper（mvnw） | 全局 Maven（mvn） |
|------|----------------------|-------------------|
| 需要预装 Maven？ | 不需要，自动下载 | 需要 |
| 版本一致性 | 项目锁定版本 | 取决于各人安装的版本 |
| 用法 | `./mvnw clean install` | `mvn clean install` |
| CI/CD 友好 | 是（不需要在服务器装 Maven） | 需要在服务器配置 |

**工作流程**：
1. 你运行 `./mvnw clean install`
2. mvnw 脚本读取 `.mvn/wrapper/maven-wrapper.properties`
3. 检查本地缓存是否有指定版本的 Maven
4. 如果没有 → 从 `distributionUrl` 下载
5. 使用下载好的 Maven 执行你的命令

### 是否需要提交到 Git？

**是的**。`.mvn/` 目录、`mvnw`、`mvnw.cmd` 都应该提交到 Git，这样团队成员和 CI 服务器不需要预装 Maven 就能构建项目。

---

## 2. Java 项目目录结构：为什么要套 java/com/...？

### 完整的目录层级

```
src/main/java/com/agentserver/server/
            │    │           │
            │    │           └── 项目模块名
            │    └── 公司/组织的域名倒写
            └── 语言标识
```

### 为什么有这么多层？

这需要理解 Java 的 **包（Package）** 机制。

#### 第一层：`src/main/java` — Maven 约定的源码根目录

这是 Maven 的标准目录约定（Convention over Configuration）：

```
src/
├── main/
│   ├── java/        ← Java 源代码
│   └── resources/   ← 配置文件（properties、xml、sql 等）
└── test/
    ├── java/        ← 测试代码
    └── resources/   ← 测试配置
```

**类比 Node.js**：

| Java（Maven 约定） | Node.js 对应 |
|---------------------|-------------|
| `src/main/java/` | `src/` |
| `src/main/resources/` | 项目根目录下的 `.env`、`config/` |
| `src/test/java/` | `test/` 或 `__tests__/` |
| `target/` | `dist/` |

#### 第二层：`com/agentserver/server` — Java 包名 = 目录路径

Java 强制要求：**包名和目录结构必须一一对应**。

```java
package com.agentserver.server.config;  // 代码中声明的包名
```

对应的文件必须放在：
```
com/agentserver/server/config/SecurityConfig.java
```

如果目录和包名不匹配，编译会直接报错。

#### 为什么要用域名倒写？

Java 生态有上百万个库，为了避免类名冲突，Java 约定用 **组织域名倒写** 作为包名前缀：

```
com.google.gson        ← Google 的 JSON 库
com.alibaba.fastjson   ← 阿里巴巴的 JSON 库
org.apache.commons     ← Apache 基金会的工具库
com.agentserver.server ← 我们的项目
```

**类比 Node.js**：这就像 npm 的 `@scope/package-name`（如 `@nestjs/core`），只不过 Java 更严格——它直接体现在文件系统的目录结构上。

#### 为什么 Java 这么"啰嗦"？

| 特性 | Java | Node.js |
|------|------|---------|
| 模块定位方式 | 包名 = 目录路径（编译器强制检查） | 文件路径（`import from './xxx'`） |
| 命名空间 | 包名天然是命名空间 | 需要模块导出来避免冲突 |
| 全球唯一性 | 域名倒写保证唯一 | npm scope 保证唯一 |
| 灵活性 | 低（强约定） | 高（随便放） |
| 大型项目可维护性 | 高（结构可预测） | 取决于团队约定 |

**核心理念**：Java 的设计哲学是"宁可啰嗦也要确定性"——任何人拿到一个类名 `com.agentserver.server.config.SecurityConfig`，都能立刻知道文件在哪里。

---

## 3. 泛型方法签名详解：`public static <T> ApiResponse<T> success(T data)`

### 逐词拆解

```java
public static <T> ApiResponse<T> success(T data) {
│       │      │        │          │       │
│       │      │        │          │       └── 参数：类型为 T 的 data
│       │      │        │          └── 方法名
│       │      │        └── 返回值类型：ApiResponse<T>
│       │      └── 泛型声明：声明一个类型变量 T
│       └── 静态方法（不需要实例化就能调用）
└── 访问修饰符（public = 任何地方都能访问）
```

### 四个部分详解

#### 第一部分：`public`（访问修饰符）

Java 有四种访问级别：

| 修饰符 | 含义 | Node.js 对比 |
|--------|------|-------------|
| `public` | 任何地方都能访问 | `export`（导出的） |
| `private` | 只有当前类能访问 | 没有 `export` 的变量 |
| `protected` | 当前类 + 子类能访问 | 无直接对应 |
| （默认/不写） | 同一个包内能访问 | 无直接对应 |

#### 第二部分：`static`（静态关键字）

```java
// static 方法：通过类名直接调用，不需要 new
ApiResponse.success(myData);

// 非 static 方法：需要先创建实例
ApiResponse resp = new ApiResponse(true, myData, "ok");
resp.getData();
```

**类比 TypeScript**：
```typescript
class ApiResponse {
  // static 方法
  static success(data: any) { ... }  // 调用：ApiResponse.success(data)

  // 实例方法
  getData() { ... }                   // 调用：new ApiResponse().getData()
}
```

#### 第三部分：`<T>`（泛型声明）

**这是最容易困惑的地方**。`<T>` 出现在返回值类型前面，它的作用是 **声明一个类型变量 T**。

```java
//      声明 T ↓     ↓ 使用 T    ↓ 使用 T
public static <T> ApiResponse<T> success(T data)
```

**为什么需要声明？**

因为这是一个 **泛型方法**（不是泛型类的普通方法）。泛型类的 `T` 在类定义时已经声明了：

```java
public record ApiResponse<T>( ... ) {  // 类级别声明了 T
    // 实例方法可以直接用 T，不需要再声明
    public T getData() { return this.data; }

    // 但 static 方法不属于任何实例，无法使用类级别的 T
    // 所以必须自己声明一个：<T>
    public static <T> ApiResponse<T> success(T data) { ... }
}
```

**类比 TypeScript**：
```typescript
// TypeScript 中泛型方法也需要声明 <T>
function success<T>(data: T): ApiResponse<T> { ... }
//               ↑ 声明 T    ↑ 使用 T   ↑ 使用 T
```

### `new ApiResponse<>(true, data, "ok")` 中的 `<>` 为什么是空的？

这叫做 **钻石运算符（Diamond Operator）**，是 Java 7 引入的语法糖。

```java
// Java 7 之前：必须写两遍泛型类型（啰嗦！）
ApiResponse<String> resp = new ApiResponse<String>(true, "hi", "ok");

// Java 7 之后：右边的泛型可以省略，编译器自动推断
ApiResponse<String> resp = new ApiResponse<>(true, "hi", "ok");
//                                         ↑ 空的钻石运算符
```

**底层原理**：编译器做了 **类型推断（Type Inference）**。它看到左边的变量类型是 `ApiResponse<String>`（或者方法声明的返回类型是 `ApiResponse<T>`），就能推断出 `<>` 里应该是 `String`（或 `T`）。所以你不需要写两遍，编译器帮你填。

**类比 TypeScript**：
```typescript
// TypeScript 也有类型推断，你几乎不需要手动写泛型参数
const resp = ApiResponse.success("hi");  // TS 自动推断 T = string
```

**注意 `<>` 和不写 `<>` 的区别**：
```java
new ApiResponse<>(...)   // ✅ 钻石运算符：编译器推断泛型类型，类型安全
new ApiResponse(...)     // ⚠️ 原始类型（Raw Type）：不使用泛型，丢失类型安全
                         //    编译器会发出警告
```

---

## 4. Java 的 import 机制 vs Node 的模块化引入

### Java 的 import 语句示例

```java
import com.agentserver.server.common.api.ApiResponse;          // 项目内部的类
import jakarta.validation.ConstraintViolationException;          // Jakarta 标准库的类
import java.util.stream.Collectors;                              // Java 标准库的类
import org.springframework.http.HttpStatus;                      // Spring 框架的类
import org.springframework.http.ResponseEntity;                  // Spring 框架的类
import org.springframework.validation.FieldError;                // Spring 框架的类
import org.springframework.web.bind.MethodArgumentNotValidException;  // Spring 框架的类
import org.springframework.web.bind.annotation.ExceptionHandler;     // Spring 框架的注解
import org.springframework.web.bind.annotation.RestControllerAdvice; // Spring 框架的注解
import org.springframework.web.server.ResponseStatusException;       // Spring 框架的类
```

### Java import 的本质

**Java 的 import 不是"加载模块"，而是"声明全称的简写"。**

```java
// 不用 import，也能编译——但你得写全称
org.springframework.http.ResponseEntity<com.agentserver.server.common.api.ApiResponse<Void>> resp =
    org.springframework.http.ResponseEntity.badRequest().body(
        com.agentserver.server.common.api.ApiResponse.failure("error"));

// 用了 import 后，可以省略前缀
import org.springframework.http.ResponseEntity;
import com.agentserver.server.common.api.ApiResponse;

ResponseEntity<ApiResponse<Void>> resp = ResponseEntity.badRequest().body(ApiResponse.failure("error"));
```

**import 只是编译期的名称简写工具**，不会影响运行时的性能。Java 的类加载是在运行时按需进行的（下面详述）。

### 包名前缀的含义

| 前缀 | 来源 | 含义 |
|------|------|------|
| `java.*` | JDK 标准库 | Java 自带的基础类（如 `java.util.List`、`java.io.File`） |
| `javax.*` / `jakarta.*` | Java EE / Jakarta EE 标准 | 企业级 API 标准（如 Servlet、Validation） |
| `org.springframework.*` | Spring 框架 | 第三方框架（Spring 全家桶） |
| `com.agentserver.*` | 本项目 | 我们自己写的代码 |
| `io.jsonwebtoken.*` | jjwt 库 | 第三方 JWT 处理库 |

**怎么记？不需要死记**。IDE（IDEA / VS Code + Java 插件）会自动帮你添加 import。你只需要写类名，按 `Alt + Enter`（或 `Ctrl + .`），IDE 就会自动找到完整包名并添加 import 语句。

### Java import vs Node import 对比

```java
// Java：import 声明全称简写，一个类一行
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
```

```typescript
// Node/TypeScript：import 从文件路径或包名导入符号
import { HttpStatus, ResponseEntity } from '@nestjs/common';
```

| 特性 | Java import | Node import/require |
|------|-------------|-------------------|
| **本质** | 编译期名称简写 | 运行时模块加载 |
| **粒度** | 一个类一行（或用 `*` 导入整个包） | 一行可导入多个符号 |
| **路径** | 包名（全球唯一，域名倒写） | 相对路径 `./xxx` 或包名 `@nestjs/core` |
| **解析时机** | 编译期（javac 检查是否存在） | 运行时（Node 按需加载） |
| **循环依赖** | 基本不存在问题（类按需加载） | 可能导致运行时问题 |
| **IDE 自动导入** | 非常智能（几乎不需要手写） | 同样智能 |

### Java 的类加载过程（运行时）

虽然 import 只是编译期的事，但理解 Java 的类加载有助于理解整个运行机制：

```
                    ┌──────────────────────────┐
                    │  .java 源文件              │
                    │  import xxx.yyy.ZzzClass  │
                    └──────────┬───────────────┘
                               │ javac 编译
                    ┌──────────▼───────────────┐
                    │  .class 字节码文件        │
                    │  引用：xxx.yyy.ZzzClass   │
                    └──────────┬───────────────┘
                               │ JVM 运行时，首次使用某个类时
                    ┌──────────▼───────────────┐
                    │  ClassLoader 类加载器      │
                    │  从 classpath 中查找并     │
                    │  加载 ZzzClass.class       │
                    └──────────────────────────┘
```

1. **编译期**：`javac` 把 `.java` 编译为 `.class`，import 被转换为完整类名引用
2. **运行时**：JVM 首次用到某个类时，通过 ClassLoader 从 classpath 中查找对应的 `.class` 文件并加载
3. **classpath**：包括你的代码编译产物（target/classes）和所有依赖 jar 包

---

## 5. Java 注解（Annotation）机制详解

### Java 的 `@` 是"装饰器"还是"注解"？

**答：Java 叫"注解"（Annotation），不叫"装饰器"（Decorator）。**

虽然 Java 注解和 TypeScript 装饰器看起来很像（都用 `@` 符号），但它们的底层机制完全不同：

| 特性 | Java 注解（Annotation） | TypeScript 装饰器（Decorator） |
|------|------------------------|-------------------------------|
| 语法 | `@RestController` | `@Controller()` |
| 本质 | 元数据标记（数据，不是代码） | 函数（实际执行的代码） |
| 运行方式 | 由框架读取元数据后决定行为 | 装饰器函数直接修改/包装目标 |
| 谁处理它？ | 编译器 / 运行时反射 / 注解处理器 | JavaScript 引擎直接执行 |
| 能否修改类？ | 不能（只是标记，需要框架配合） | 可以（装饰器函数直接修改原型） |

### Java 注解的底层运行机制

#### 第一步：定义注解（以 `@RestControllerAdvice` 为例）

```java
// Spring 框架源码中，注解的定义长这样：
@Target(ElementType.TYPE)          // 只能标注在类上
@Retention(RetentionPolicy.RUNTIME) // 运行时保留（可被反射读取）
@Documented
@ControllerAdvice                   // 组合了另一个注解
@ResponseBody                       // 组合了另一个注解
public @interface RestControllerAdvice {
    // 注解的参数定义
    String[] value() default {};
}
```

关键概念：
- `@interface`：Java 中定义注解的关键字（不是 interface！）
- `@Retention(RUNTIME)`：告诉 JVM "运行时保留这个注解的信息"（否则编译后就丢弃了）
- `@Target(TYPE)`：限制这个注解只能用在类上（不能用在方法或字段上）

#### 第二步：使用注解

```java
@RestControllerAdvice  // ← 在你的类上标注注解
public class GlobalExceptionHandler { ... }
```

这一步**什么也不会自动发生**。注解只是给类打了一个"标签"，就像在文件上贴了一张便利贴。

#### 第三步：框架扫描并读取注解（核心！）

Spring Boot 启动时会做以下事情：

```
Spring Boot 启动
    │
    ▼
扫描项目中所有的 .class 文件
    │
    ▼
对每个类，通过反射检查：这个类上有没有 @RestControllerAdvice？
    │
    ├── 有 → 把这个类注册为"全局异常处理器"
    │        后续所有 Controller 抛出的异常都交给它处理
    │
    └── 没有 → 跳过
```

**用 Java 反射 API 来理解这个过程**：

```java
// Spring 内部大致是这样检查的（简化版）：
Class<?> clazz = GlobalExceptionHandler.class;

// 检查类上是否有 @RestControllerAdvice 注解
if (clazz.isAnnotationPresent(RestControllerAdvice.class)) {
    // 发现了！注册为全局异常处理器
    registerAsExceptionHandler(clazz);
}

// 扫描类中所有方法，找标了 @ExceptionHandler 的方法
for (Method method : clazz.getDeclaredMethods()) {
    ExceptionHandler handler = method.getAnnotation(ExceptionHandler.class);
    if (handler != null) {
        // 获取这个方法负责处理哪种异常
        Class<?>[] exceptionTypes = handler.value();
        // 注册：当出现 exceptionTypes 中的异常时，调用 method 来处理
        registerExceptionMapping(exceptionTypes, method);
    }
}
```

#### 总结：Java 注解的三层架构

```
┌──────────────────────────────────┐
│ 第一层：你写的代码                 │
│   @RestControllerAdvice          │  ← 只是贴标签
│   public class MyHandler { }     │
├──────────────────────────────────┤
│ 第二层：Java 反射 API              │
│   clazz.getAnnotation(...)       │  ← 读取标签
│   method.isAnnotationPresent(...)│
├──────────────────────────────────┤
│ 第三层：框架逻辑（Spring）         │
│   根据读取到的注解信息              │  ← 根据标签做事
│   决定如何组装和运行你的代码        │
└──────────────────────────────────┘
```

**核心区别**：
- TypeScript 装饰器：装饰器函数**直接修改**类或方法的行为
- Java 注解：注解**本身不做任何事**，是框架（如 Spring）在运行时通过**反射读取**注解信息，然后**框架自己**决定怎么处理

---

#### (4) `.map(FieldError::getDefaultMessage)`

对流中的每个元素执行转换操作——从 `FieldError` 对象中提取错误消息字符串。

`FieldError::getDefaultMessage` 是 **方法引用**（Method Reference），是 Lambda 表达式的简写：

```java
// 方法引用写法（简洁）
.map(FieldError::getDefaultMessage)

// 等价的 Lambda 写法
.map(error -> error.getDefaultMessage())

// 等价的匿名内部类写法（最啰嗦）
.map(new Function<FieldError, String>() {
    @Override
    public String apply(FieldError error) {
        return error.getDefaultMessage();
    }
})
```

**类比 TypeScript**：
```typescript
fieldErrors.map(error => error.defaultMessage)  // 箭头函数
// FieldError::getDefaultMessage 相当于上面的箭头函数
```

---

## 7. @Configuration、@Bean 与 Spring IoC 容器底层机制

### 为什么要告诉 Spring "这是一个配置类"？

因为 Spring 不是一个普通的 Java 程序，它有一个**IoC 容器**（也叫 **ApplicationContext**），所有的对象（Bean）都由这个容器创建和管理。

**如果没有 Spring 容器**，你需要自己 new 所有对象并手动组装：

```java
// 手动组装（痛苦版）
PasswordEncoder encoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();
AuthUserMapper mapper = new AuthUserMapperImpl(dataSource);
JwtTokenProvider jwt = new JwtTokenProvider(jwtProperties);
AuthApplicationService authService = new AuthApplicationService(mapper, encoder, jwt);
AuthController controller = new AuthController(authService);
// ... 几十个对象要手动 new 和传参
```

**有了 Spring 容器**，你只需要"声明"每个对象，Spring 自动组装：

```java
@Configuration   // 告诉 Spring：这个类里有 Bean 的定义
public class SecurityConfig {

    @Bean          // 告诉 Spring：请调用这个方法，把返回值作为 Bean 放进容器
    public PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }
}
```

### Bean 是什么？

**Bean = Spring IoC 容器中管理的对象实例。**

你可以把 Spring 容器想象成一个巨大的 `Map<Class, Object>`：

```
Spring 容器（IoC Container）
┌──────────────────────────────────────────┐
│  Key（类型）           →  Value（实例）    │
│  PasswordEncoder       →  BCryptEncoder  │
│  SecurityFilterChain   →  filterChain    │
│  AuthApplicationService→  authService    │
│  JwtTokenProvider      →  jwtProvider    │
│  ...                                     │
└──────────────────────────────────────────┘
```

当某个类的构造函数需要 `PasswordEncoder` 参数时，Spring 从容器中找到对应的实例自动传入——这就是"依赖注入"。

### @Configuration 的底层运行机制

#### 第一阶段：启动扫描

```
SpringApplication.run(JavaServerApplication.class, args)
    │
    ▼
Spring 扫描所有类，寻找带注解的类
    │
    ├── 发现 @Configuration → 识别为配置类
    ├── 发现 @Service       → 识别为服务类
    ├── 发现 @Component     → 识别为通用组件
    ├── 发现 @Controller    → 识别为控制器
    └── ...
```

#### 第二阶段：处理 @Configuration 类

Spring 对 `@Configuration` 类做了一个特殊操作——**CGLIB 代理**：

```java
// 你写的原始类
@Configuration
public class SecurityConfig {
    @Bean
    public PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }
}

// Spring 在运行时会生成一个代理子类（你看不到）：
public class SecurityConfig$$EnhancerBySpringCGLIB extends SecurityConfig {
    @Override
    public PasswordEncoder passwordEncoder() {
        // 先检查容器中是否已经有这个 Bean
        if (container.contains(PasswordEncoder.class)) {
            return container.get(PasswordEncoder.class);  // 直接返回已有实例
        }
        // 没有的话，调用原始方法创建，然后缓存到容器中
        PasswordEncoder bean = super.passwordEncoder();
        container.put(PasswordEncoder.class, bean);
        return bean;
    }
}
```

**为什么需要代理？** 为了保证 **单例**。如果 `@Bean` 方法被多次调用，代理会确保每次返回同一个实例，而不是创建多个。

#### 第三阶段：实例化 Bean

Spring 按照依赖关系顺序，调用每个 `@Bean` 方法：

```
1. 调用 passwordEncoder() → 创建 PasswordEncoder 实例 → 放入容器
2. 调用 securityFilterChain(http, jwtFilter) →
     Spring 发现参数需要 HttpSecurity 和 JwtAuthenticationFilter
     → 从容器中查找并注入 → 创建 SecurityFilterChain → 放入容器
3. ...
```

#### 第四阶段：运行时

当有 HTTP 请求进来时，Spring 从容器中取出已经组装好的对象来处理请求：

```
HTTP 请求 → SecurityFilterChain（容器中的 Bean）
         → JwtAuthenticationFilter（容器中的 Bean）
         → AuthController（容器中的 Bean）
         → AuthApplicationService（容器中的 Bean）
         → 返回响应
```

### 和 NestJS 的对比

```typescript
// NestJS 的依赖注入——原理相同，语法不同
@Module({
  providers: [
    AuthService,           // ← 等价于 Spring 的 @Service
    JwtTokenProvider,
    {
      provide: 'PASSWORD_ENCODER',  // ← 等价于 Spring 的 @Bean
      useFactory: () => new BcryptEncoder(),
    },
  ],
})
export class AuthModule {}
```

| 概念 | Spring (Java) | NestJS (TypeScript) |
|------|--------------|-------------------|
| IoC 容器 | ApplicationContext | NestJS IoC Container |
| 声明 Bean | `@Bean` / `@Service` / `@Component` | `providers` 数组 |
| 配置类 | `@Configuration` | `@Module()` |
| 注入 | 构造函数参数 | 构造函数参数 + `@Inject()` |

---

## 8. Java 常用注解大全

### 一、Java 语言内置注解

| 注解 | 用在哪里 | 含义 |
|------|---------|------|
| `@Override` | 方法 | 声明这个方法覆盖了父类的方法。如果父类没有同签名方法，编译报错。防止你拼错方法名 |
| `@Deprecated` | 类/方法/字段 | 标记为"已过时"。别人用到这个方法时 IDE 会画删除线警告 |
| `@SuppressWarnings("xxx")` | 类/方法 | 抑制编译器警告。`"unchecked"` 抑制泛型警告，`"deprecation"` 抑制过时警告 |
| `@FunctionalInterface` | 接口 | 声明这是一个函数式接口（只有一个抽象方法），可以用 Lambda 表达式实现 |
| `@SafeVarargs` | 方法 | 抑制泛型可变参数的警告 |

### 二、Spring 框架核心注解

#### Bean 声明相关

| 注解 | 含义 | 说明 |
|------|------|------|
| `@Component` | 通用组件 | 告诉 Spring "把这个类实例化为 Bean 放进容器" |
| `@Service` | 服务层 Bean | 语义化的 `@Component`，用于标记业务逻辑类 |
| `@Controller` | 控制器 Bean | 处理 HTTP 请求的控制器 |
| `@RestController` | REST 控制器 | `@Controller` + `@ResponseBody`（返回值自动序列化为 JSON） |
| `@Repository` | 数据访问 Bean | 语义化的 `@Component`，用于标记数据库操作类 |
| `@Configuration` | 配置类 | 包含 `@Bean` 方法的配置类（详见第 7 节） |
| `@Bean` | 方法级别 | 把方法的返回值注册为 Bean |

> **`@Component` vs `@Service` vs `@Repository` 的区别**：功能完全相同，只是语义不同——看到注解名就知道这个类的职责。就像"汽车"和"轿车"都是车，但"轿车"更具体。

#### 依赖注入相关

| 注解 | 含义 |
|------|------|
| `@Autowired` | 自动注入依赖（Spring 会从容器中找到匹配的 Bean 注入）。在构造函数上可省略 |
| `@Qualifier("name")` | 当容器中有多个同类型 Bean 时，指定注入哪一个 |
| `@Value("${app.name}")` | 从配置文件中注入值 |

#### Web/HTTP 相关

| 注解 | 含义 |
|------|------|
| `@RequestMapping("/api")` | 映射 URL 路径前缀 |
| `@GetMapping("/list")` | 映射 GET 请求 |
| `@PostMapping("/create")` | 映射 POST 请求 |
| `@PutMapping("/update")` | 映射 PUT 请求 |
| `@DeleteMapping("/delete")` | 映射 DELETE 请求 |
| `@PathVariable` | 从 URL 路径中提取参数，如 `/user/{id}` |
| `@RequestParam` | 从查询字符串中提取参数，如 `?page=1` |
| `@RequestBody` | 把请求体的 JSON 反序列化为 Java 对象 |
| `@ResponseBody` | 把返回值序列化为 JSON 写入响应体 |
| `@ResponseStatus(HttpStatus.CREATED)` | 设置响应的 HTTP 状态码 |

#### 参数校验相关

| 注解 | 含义 |
|------|------|
| `@Valid` | 触发参数校验（配合下面的注解使用） |
| `@NotBlank` | 字符串不能为 null、不能为空、不能全是空格 |
| `@NotNull` | 不能为 null |
| `@NotEmpty` | 集合/字符串不能为空 |
| `@Size(min=2, max=20)` | 字符串/集合的长度范围 |
| `@Min(1)` / `@Max(100)` | 数字的最小/最大值 |
| `@Email` | 必须是合法的邮箱格式 |
| `@Pattern(regexp="...")` | 必须匹配正则表达式 |

#### 异常处理相关

| 注解 | 含义 |
|------|------|
| `@RestControllerAdvice` | 全局异常处理器（`@ControllerAdvice` + `@ResponseBody`） |
| `@ExceptionHandler(XxxException.class)` | 声明处理某种异常的方法 |

#### Spring Security 相关

| 注解 | 含义 |
|------|------|
| `@EnableWebSecurity` | 启用 Web 安全配置 |
| `@PreAuthorize("hasRole('ADMIN')")` | 方法级权限控制——调用前检查权限 |
| `@Secured("ROLE_ADMIN")` | 简化版的权限控制 |

#### 配置相关

| 注解 | 含义 |
|------|------|
| `@ConfigurationProperties(prefix="app.ai")` | 把配置文件中的属性绑定到 Java 对象 |
| `@EnableConfigurationProperties(...)` | 激活某个 `@ConfigurationProperties` 类 |
| `@Profile("test")` | 只在指定 profile 下生效 |
| `@ConditionalOnProperty(...)` | 根据配置开关决定是否创建 Bean |

#### 异步与调度

| 注解 | 含义 |
|------|------|
| `@Async` | 方法异步执行（在单独的线程中运行） |
| `@EnableAsync` | 启用异步方法支持 |
| `@Scheduled(fixedRate=5000)` | 定时任务，每 5000 毫秒执行一次 |
| `@EnableScheduling` | 启用定时任务支持 |

#### 事务

| 注解 | 含义 |
|------|------|
| `@Transactional` | 方法内的数据库操作在一个事务中执行，异常时自动回滚 |

### 三、MyBatis 注解

| 注解 | 含义 |
|------|------|
| `@Mapper` | 标记接口为 MyBatis Mapper（自动生成实现类） |
| `@MapperScan("com.xxx.mapper")` | 扫描指定包下的所有 Mapper 接口 |
| `@Select("SQL")` | 内联 SELECT SQL |
| `@Insert("SQL")` | 内联 INSERT SQL |
| `@Update("SQL")` | 内联 UPDATE SQL |
| `@Delete("SQL")` | 内联 DELETE SQL |
| `@Param("name")` | 给 SQL 参数起别名 |
| `@Options(useGeneratedKeys=true)` | 返回自增主键 |

### 四、Lombok 注解（编译时代码生成）

| 注解 | 含义 |
|------|------|
| `@Data` | 自动生成 getter、setter、toString、equals、hashCode |
| `@Getter` / `@Setter` | 只生成 getter / setter |
| `@NoArgsConstructor` | 生成无参构造函数 |
| `@AllArgsConstructor` | 生成全参构造函数 |
| `@Builder` | 生成 Builder 模式的构造器 |
| `@Slf4j` | 自动生成日志对象 `private static final Logger log = ...` |

### 五、JUnit 测试注解

| 注解 | 含义 |
|------|------|
| `@Test` | 标记一个方法为测试方法 |
| `@BeforeEach` | 每个测试方法执行前运行 |
| `@AfterEach` | 每个测试方法执行后运行 |
| `@SpringBootTest` | 启动完整的 Spring 容器来跑测试 |
| `@ActiveProfiles("test")` | 激活 test profile |
| `@MockBean` | 创建一个 Mock 对象替代真实的 Bean |

---

## 9. 依赖注入（DI）与控制反转（IoC）底层原理

### 什么是控制反转（IoC）？

**"控制"指的是"对象创建的控制权"，"反转"指的是这个控制权从你手里转移到了框架手里。**

```java
// ❌ 传统方式（你自己控制）：
public class AuthApplicationService {
    private final AuthUserMapper mapper = new AuthUserMapperImpl();
    private final PasswordEncoder encoder = new BCryptPasswordEncoder();
    private final JwtTokenProvider jwt = new JwtTokenProvider("secret", 7200);
    // 问题：硬编码了具体实现，换一个实现就得改代码
    // 问题：测试时没法换成 Mock 对象
}

// ✅ IoC 方式（Spring 控制）：
public class AuthApplicationService {
    private final AuthUserMapper mapper;        // 不 new，留个"插槽"
    private final PasswordEncoder encoder;       // 不 new，留个"插槽"
    private final JwtTokenProvider jwt;          // 不 new，留个"插槽"

    // 通过构造函数接收——Spring 负责"把东西插进来"
    public AuthApplicationService(AuthUserMapper mapper, PasswordEncoder encoder, JwtTokenProvider jwt) {
        this.mapper = mapper;
        this.encoder = encoder;
        this.jwt = jwt;
    }
}
```

### 依赖注入（DI）的三种方式

```java
// 方式一：构造器注入（推荐！Spring 官方推荐的方式）
// 优点：依赖明确、不可变（final）、方便测试
@Service
public class AuthApplicationService {
    private final AuthUserMapper authUserMapper;

    // Spring 看到构造函数参数需要 AuthUserMapper，就从容器中找到对应的 Bean 传入
    public AuthApplicationService(AuthUserMapper authUserMapper) {
        this.authUserMapper = authUserMapper;
    }
}

// 方式二：字段注入（不推荐，但你会在很多老项目中看到）
// 缺点：依赖不可见（看不出这个类需要什么）、无法 final、测试困难
@Service
public class AuthApplicationService {
    @Autowired
    private AuthUserMapper authUserMapper;
}

// 方式三：Setter 注入（少见）
@Service
public class AuthApplicationService {
    private AuthUserMapper authUserMapper;

    @Autowired
    public void setAuthUserMapper(AuthUserMapper authUserMapper) {
        this.authUserMapper = authUserMapper;
    }
}
```

### Spring IoC 容器的完整启动流程

```
┌─ SpringApplication.run() ─────────────────────────────────────┐
│                                                                │
│  1. 创建 ApplicationContext（IoC 容器）                          │
│                                                                │
│  2. 包扫描（Component Scan）                                    │
│     扫描 @SpringBootApplication 所在包及其子包的所有类            │
│     找到所有带 @Component/@Service/@Controller/@Configuration   │
│     等注解的类                                                   │
│                                                                │
│  3. 生成 BeanDefinition（Bean 定义）                             │
│     记录每个 Bean 的类型、依赖关系、作用域等元数据                  │
│     ┌───────────────────────────────────────┐                  │
│     │ BeanDefinition: AuthApplicationService │                  │
│     │   type: AuthApplicationService.class   │                  │
│     │   dependencies:                        │                  │
│     │     - AuthUserMapper                   │                  │
│     │     - PasswordEncoder                  │                  │
│     │     - JwtTokenProvider                 │                  │
│     │   scope: singleton                     │                  │
│     └───────────────────────────────────────┘                  │
│                                                                │
│  4. 解析依赖关系，确定实例化顺序                                  │
│     AuthUserMapper 没有依赖 → 先创建                             │
│     PasswordEncoder 没有依赖 → 先创建                            │
│     JwtTokenProvider 依赖 JwtProperties → 先创建 JwtProperties  │
│     AuthApplicationService 依赖上面三个 → 最后创建                │
│                                                                │
│  5. 实例化所有 Bean                                              │
│     new AuthUserMapperProxy(dataSource)        → 放入容器       │
│     PasswordEncoderFactories.create...()       → 放入容器       │
│     new JwtTokenProvider(jwtProperties)        → 放入容器       │
│     new AuthApplicationService(mapper, encoder, jwt) → 放入容器 │
│                                                                │
│  6. 初始化完成，应用就绪                                         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### 对比 NestJS 的依赖注入

```typescript
// NestJS 的 DI 机制和 Spring 非常相似
@Injectable()  // 相当于 Java 的 @Service
export class AuthApplicationService {
  constructor(
    private readonly authUserMapper: AuthUserMapper,  // 构造器注入
    private readonly passwordEncoder: PasswordEncoder,
    private readonly jwtTokenProvider: JwtTokenProvider,
  ) {}
}
```

| 步骤 | Spring (Java) | NestJS (TypeScript) |
|------|--------------|-------------------|
| 声明可注入 | `@Service` / `@Component` | `@Injectable()` |
| 声明模块 | `@Configuration` + `@Bean` | `@Module({ providers: [...] })` |
| 注入方式 | 构造函数参数 | 构造函数参数 |
| 容器扫描 | `@ComponentScan` | `@Module({ imports: [...] })` |
| 底层原理 | Java 反射（`Constructor.newInstance()`） | TypeScript reflect-metadata |

---

## 10. Java 的运行平台区分：为什么要强调 "Java Web"？

### Java 确实区分不同的运行平台

Java 不像 Node.js 那样——"一个运行时跑天下"。Java 生态有多种应用形态，每种形态的运行环境和可用 API 不同：

| 运行平台 | 用途 | 特点 | 类比 |
|----------|------|------|------|
| **Java SE** (Standard Edition) | 桌面应用、命令行工具、基础库 | 纯 JDK，没有 Web 相关 API | Node.js 不加任何 Web 框架 |
| **Java EE** / **Jakarta EE** (Enterprise Edition) | 企业级 Web 应用 | 提供 Servlet、JPA、JMS 等规范 | Node.js + Express/NestJS |
| **Spring Boot** | 现代 Web 应用（当前主流） | 基于 Java SE + 内嵌 Servlet 容器 | Node.js + NestJS + 内嵌服务器 |
| **Android** | 移动端应用 | 使用 Dalvik/ART 虚拟机（不是标准 JVM） | React Native |
| **Java ME** (Micro Edition) | 嵌入式设备（已过时） | 精简版 JDK | 无对应 |

### 为什么 Filter 要强调是 "Java Web" 的概念？

**Filter（过滤器）是 Servlet 规范中的概念**，只存在于 Web 应用中。

```
Servlet 规范定义了：
├── Servlet     → 处理 HTTP 请求的组件（Controller 的底层）
├── Filter      → 在 Servlet 之前/之后拦截请求的组件
├── Listener    → 监听应用生命周期事件的组件
└── HttpSession → 会话管理
```

如果你写一个纯命令行程序（`public static void main(String[] args) { ... }`），是**没有 Filter 这个概念的**——因为没有 HTTP 请求，也就不需要过滤器链。

```
Java 运行时（JVM 是通用平台，但 API 按规范分层）
├── Java SE：基础 API（集合、IO、并发、网络...）
├── Jakarta EE：在 SE 基础上增加企业级 API（Servlet、JPA...）
├── Spring Boot：在 SE + Servlet 基础上提供开发框架
└── 不同平台可用的类和注解不同
```

**所以当文档说"Java Web 应用中的 Filter"时，是在明确告诉你**：这个概念属于 Web 领域（Servlet 规范），不是 Java 语言本身的特性。

---

## 11.Java 编译原理

### target 是什么？

### target 目录的结构

```
target/
├── classes/                    ← 编译后的 .class 文件（主代码）
│   ├── com/agentserver/server/
│   │   ├── JavaServerApplication.class
│   │   ├── config/
│   │   │   └── SecurityConfig.class
│   │   └── ...
│   ├── application.properties  ← resources/ 下的文件也会复制到这里
│   └── db/migration/
│       └── V1__init_schema.sql
├── test-classes/               ← 编译后的 .class 文件（测试代码）
├── generated-sources/          ← 注解处理器生成的源码（如 Lombok）
├── maven-status/               ← Maven 构建状态信息
├── surefire-reports/           ← 测试报告
└── agent-server-0.0.1-SNAPSHOT.jar  ← 打包后的可执行 JAR 文件
```

### Java 的编译过程（完整流程）

```
┌──────────────────────────────────────────────────────────────────┐
│                    Java 编译与运行全流程                           │
│                                                                  │
│  阶段一：编写                                                     │
│  ┌─────────────────────┐                                        │
│  │ HelloWorld.java     │  ← 你写的 Java 源代码（人类可读的文本）    │
│  │ public class Hello  │                                        │
│  │ { ... }             │                                        │
│  └──────────┬──────────┘                                        │
│             │                                                    │
│  阶段二：编译（javac）                                             │
│             │ javac HelloWorld.java                              │
│             ▼                                                    │
│  ┌─────────────────────┐                                        │
│  │ HelloWorld.class    │  ← 字节码（Bytecode），不是机器码！       │
│  │ 0xCAFEBABE ...      │    是 JVM 能理解的中间格式               │
│  └──────────┬──────────┘                                        │
│             │                                                    │
│  阶段三：运行（JVM）                                               │
│             │ java HelloWorld                                    │
│             ▼                                                    │
│  ┌─────────────────────────────────────────────┐                │
│  │ JVM (Java Virtual Machine)                   │                │
│  │                                              │                │
│  │  ┌──────────────┐   ┌──────────────────┐    │                │
│  │  │ ClassLoader  │   │ 字节码验证器      │    │                │
│  │  │ 加载 .class  │ → │ 检查安全性       │    │                │
│  │  └──────────────┘   └────────┬─────────┘    │                │
│  │                              │               │                │
│  │                   ┌──────────▼──────────┐    │                │
│  │                   │ 解释器 + JIT 编译器  │    │                │
│  │                   │                     │    │                │
│  │                   │ 解释器：逐行翻译     │    │                │
│  │                   │   字节码 → 机器码    │    │                │
│  │                   │                     │    │                │
│  │                   │ JIT：检测热点代码    │    │                │
│  │                   │   整块编译为机器码   │    │                │
│  │                   │   缓存以提高性能     │    │                │
│  │                   └──────────┬──────────┘    │                │
│  │                              │               │                │
│  │                   ┌──────────▼──────────┐    │                │
│  │                   │ 操作系统 / CPU       │    │                │
│  │                   │ 执行真正的机器码     │    │                │
│  │                   └─────────────────────┘    │                │
│  └──────────────────────────────────────────────┘                │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 关键概念对比

| 概念 | Java | TypeScript/Node.js |
|------|------|-------------------|
| 源代码 | `.java` 文件 | `.ts` 文件 |
| 编译器 | `javac` | `tsc` |
| 编译产物 | `.class` 字节码 | `.js` JavaScript 文件 |
| 运行时 | JVM（Java Virtual Machine） | V8 引擎（Node.js 内置） |
| 中间表示 | 字节码（Bytecode） | JavaScript（本身也是 V8 的"中间表示"） |
| 最终执行 | JIT 编译为机器码 | V8 也有 JIT（TurboFan） |
| 跨平台原理 | "一次编译，到处运行"（字节码在任何 JVM 上运行） | "一次编写，到处运行"（JS 在任何 V8/Node 上运行） |

### 为什么 Java 用字节码而不是直接编译成机器码？

```
                   C/C++ 的方式：源码 → 机器码（平台相关）
                   ┌─────────┐
 .c 源码 → gcc → │ x86 机器码 │  ← 只能在 x86 CPU 上运行
                   └─────────┘
                   ┌─────────┐
 .c 源码 → gcc → │ ARM 机器码 │  ← 只能在 ARM CPU 上运行（要重新编译）
                   └─────────┘

                   Java 的方式：源码 → 字节码（平台无关）→ JVM 翻译为机器码
                   ┌─────────┐
 .java → javac → │ 字节码    │ → Windows JVM → x86 机器码
                   │ (通用)   │ → macOS JVM   → ARM 机器码
                   │          │ → Linux JVM   → x86 机器码
                   └─────────┘
```

**一次编译，到处运行（Write Once, Run Anywhere）**——你只需要编译一次生成 `.class` 文件，然后把它拷贝到任何安装了 JVM 的机器上都能运行。

### JIT 编译器（Just-In-Time）

JVM 启动时先用**解释器**逐行翻译字节码（启动快但运行慢），同时统计哪些代码执行频率高（"热点代码"）。当某段代码被执行了很多次后，JIT 编译器会把它**整块编译为本地机器码**并缓存——之后再执行这段代码就直接用机器码，速度接近 C/C++。

这就是为什么 Java 程序"启动慢但跑起来快"——预热后的 Java 性能可以非常高。

---

## 12. mvnw、mvnw.cmd 与 pom.xml 详解

### 三个文件的关系

```
┌─────────┐     读取配置      ┌──────────────────────────┐
│  mvnw   │ ──────────────→ │ .mvn/wrapper/             │
│(Linux)  │                  │   maven-wrapper.properties │
├─────────┤                  │   (指定 Maven 版本)        │
│mvnw.cmd │ ──────────────→ └──────────────────────────┘
│(Windows)│
└────┬────┘     下载并使用指定版本的 Maven
     │
     ▼          读取项目配置
┌──────────────────────────────────────────┐
│  Maven（构建工具）                         │
│  根据 pom.xml 中的配置：                   │
│    · 下载依赖                              │
│    · 编译代码                              │
│    · 运行测试                              │
│    · 打包部署                              │
└──────────────────────────────────────────┘
```

### mvnw（Maven Wrapper - Linux/macOS 版）

这是一个 **Shell 脚本**（类似 `.sh` 文件），用于在 Linux/macOS 系统上启动 Maven。

```bash
# 使用 Maven Wrapper 构建项目（Linux/macOS）
./mvnw clean install

# 等价于（如果你全局安装了 Maven）
mvn clean install
```

### mvnw.cmd（Maven Wrapper - Windows 版）

功能和 `mvnw` 完全相同，只是给 Windows 用的批处理脚本。

```powershell
# 使用 Maven Wrapper 构建项目（Windows）
.\mvnw.cmd clean install

# 或直接
mvnw clean install
```

### pom.xml（Project Object Model — 项目对象模型）

**这是 Java 项目最核心的配置文件，相当于 Node.js 的 `package.json`。**

#### 完整对照表

| pom.xml 概念 | package.json 对应 | 说明 |
|-------------|-------------------|------|
| `<groupId>` | `@scope`（如 `@nestjs`） | 组织标识 |
| `<artifactId>` | `name` | 项目名称 |
| `<version>` | `version` | 项目版本 |
| `<dependencies>` | `dependencies` + `devDependencies` | 项目依赖 |
| `<build><plugins>` | `scripts` | 构建工具和脚本 |
| `<parent>` | 无直接对应（类似 extends） | 继承父 POM 的配置 |
| `<properties>` | 无直接对应 | 全局变量定义 |

#### pom.xml 逐段解析

##### 1. 项目坐标（相当于 package.json 的 name + version）

```xml
<groupId>com.agentserver</groupId>     <!-- 组织 ID（域名倒写） -->
<artifactId>agent-server</artifactId>   <!-- 项目名称 -->
<version>0.0.1-SNAPSHOT</version>       <!-- 版本号，SNAPSHOT 表示开发中 -->
```

**Maven 坐标**（groupId + artifactId + version）是 Java 世界中唯一标识一个库的方式，类似 npm 的 `@scope/package@version`。

##### 2. 父 POM（继承 Spring Boot 的默认配置）

```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.5.5</version>
</parent>
```

继承了 Spring Boot 的父 POM 后，你获得了：
- 所有 Spring Boot starter 依赖的默认版本管理（不需要手动指定版本号）
- Java 编译配置的默认值
- 资源过滤和打包插件的默认配置

**类比 Node.js**：就像用 `create-next-app` 创建项目后，很多配置都是预设好的。

##### 3. 依赖声明（相当于 package.json 的 dependencies）

```xml
<dependencies>
    <!-- Spring Boot Web Starter：一站式引入 Web 开发所需的所有库 -->
    <!-- 包含：Spring MVC、内嵌 Tomcat、JSON 序列化等 -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
        <!-- 不写 version：继承自 parent 的版本管理 -->
    </dependency>

    <!-- MySQL 驱动 -->
    <dependency>
        <groupId>com.mysql</groupId>
        <artifactId>mysql-connector-j</artifactId>
        <scope>runtime</scope>  <!-- 只在运行时需要，编译时不需要 -->
    </dependency>

    <!-- 测试依赖 -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-test</artifactId>
        <scope>test</scope>  <!-- 只在测试时可用，不会打进生产包 -->
    </dependency>
</dependencies>
```

**依赖范围（scope）**——这是 Node.js 没有的精细概念：

| scope | 含义 | Node.js 对应 |
|-------|------|-------------|
| compile（默认） | 编译 + 运行 + 测试都可用 | `dependencies` |
| runtime | 运行 + 测试可用，编译时不可用 | `dependencies`（但无编译期检查） |
| test | 只在测试时可用 | `devDependencies` |
| provided | 编译时可用，运行时由容器提供 | 无对应 |
| optional | 可选依赖，不传递 | `optionalDependencies` |

##### 4. 构建插件（相当于 package.json 的 scripts + 构建工具）

```xml
<build>
    <plugins>
        <!-- Spring Boot Maven 插件：打包为可执行 JAR -->
        <plugin>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-maven-plugin</artifactId>
            <configuration>
                <excludes>
                    <!-- Lombok 只在编译时用，不需要打进 JAR -->
                    <exclude>
                        <groupId>org.projectlombok</groupId>
                        <artifactId>lombok</artifactId>
                    </exclude>
                </excludes>
            </configuration>
        </plugin>
    </plugins>
</build>
```

#### Maven 常用命令 vs npm 命令

| Maven 命令 | npm 对应 | 说明 |
|-----------|---------|------|
| `mvn clean` | `rm -rf dist/` | 清除 target/ 目录 |
| `mvn compile` | `tsc`（编译） | 编译源代码 |
| `mvn test` | `npm test` | 运行测试 |
| `mvn package` | `npm run build` | 编译 + 测试 + 打包为 JAR |
| `mvn install` | 无直接对应 | 打包并安装到本地 Maven 仓库 |
| `mvn spring-boot:run` | `npm run start:dev` | 启动 Spring Boot 应用 |
| `mvn dependency:tree` | `npm ls` | 查看依赖树 |

#### Maven 的生命周期

Maven 有一个固定的构建生命周期，每个阶段会自动执行前面的所有阶段：

```
validate → compile → test → package → verify → install → deploy
                                │
                                └── 你执行 mvn package，前面的阶段会自动执行
```

**类比**：就像你说 `npm run build`，实际上 TypeScript 编译会自动先做类型检查再生成 JS 文件。

---

## 总结：Java vs Node.js 核心概念速查表

| 维度 | Java | Node.js |
|------|------|---------|
| 包管理器 | Maven / Gradle | npm / pnpm / yarn |
| 包配置文件 | pom.xml | package.json |
| 版本锁定 | Maven Wrapper (.mvn/) | .nvmrc / package-lock.json |
| 源码目录 | src/main/java/ | src/ |
| 编译产物 | target/ (.class) | dist/ (.js) |
| 模块导入 | import 包.类名 | import { X } from 'path' |
| IoC 框架 | Spring | NestJS |
| 注解/装饰器 | @Annotation（元数据标记） | @Decorator()（执行函数） |
| HTTP 框架 | Spring MVC | Express / NestJS |
| ORM | MyBatis / JPA | TypeORM / Prisma |
| 测试框架 | JUnit + MockBean | Jest + Supertest |
| 运行命令 | mvn spring-boot:run | npm run start:dev |
| 编译命令 | mvn compile | tsc |
| 测试命令 | mvn test | npm test |
| 打包命令 | mvn package | npm run build |
