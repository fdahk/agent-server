# ========== 阶段一：构建 ==========
# 使用带 Maven 的 JDK 镜像编译项目
FROM eclipse-temurin:17-jdk AS builder

WORKDIR /build

# 先复制 Maven Wrapper 和 pom.xml，利用 Docker 缓存层减少重复下载依赖
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw dependency:go-offline -B

# 复制源码并打包（跳过测试，Docker 构建阶段不跑测试）
COPY src/ src/
RUN ./mvnw package -DskipTests -B

# ========== 阶段二：运行 ==========
# 使用精简的 JRE 镜像运行（比 JDK 镜像小很多）
FROM eclipse-temurin:17-jre

WORKDIR /app

# 从构建阶段复制打包好的 JAR
COPY --from=builder /build/target/*.jar app.jar

# 创建存储目录
RUN mkdir -p /app/storage/agent-runs

EXPOSE 3000

# JVM 参数：容器环境下推荐显式设置堆内存
ENTRYPOINT ["java", \
  "-XX:+UseContainerSupport", \
  "-XX:MaxRAMPercentage=75.0", \
  "-jar", "app.jar"]
