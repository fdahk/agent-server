import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';

/**
 * 测试用 Milvus 单容器启动助手。
 *
 * 生产部署 Milvus Standalone 需 etcd + MinIO + milvus 三件套(对象存储后端),
 * 但测试只要一个可读写的 Milvus 实例:用官方镜像的 standalone 模式 + 内嵌 etcd
 * (ETCD_USE_EMBED)+ 本地文件存储(COMMON_STORAGETYPE=local),单容器即可起,
 * 省去 etcd/MinIO 两个伴随容器,CI 更轻。
 *
 * 内嵌 etcd 需要镜像里存在 embedEtcd.yaml;官方镜像默认没有,这里用
 * withCopyContentToContainer 在启动前写进去(user.yaml 占位即可)。
 *
 * 就绪判定:9091 端口的 /healthz 返回 200(gRPC 19530 此时才可用)。
 */
const EMBED_ETCD_YAML =
  'listen-client-urls: http://0.0.0.0:2379\n' +
  'advertise-client-urls: http://0.0.0.0:2379\n';

export interface StartedMilvus {
  container: StartedTestContainer;
  /** host:port,直接喂给 process.env.MILVUS_ADDRESS */
  address: string;
}

export async function startMilvusContainer(
  image = 'milvusdb/milvus:v2.5.4',
): Promise<StartedMilvus> {
  const container = await new GenericContainer(image)
    .withCommand(['milvus', 'run', 'standalone'])
    .withEnvironment({
      ETCD_USE_EMBED: 'true',
      ETCD_DATA_DIR: '/var/lib/milvus/etcd',
      ETCD_CONFIG_PATH: '/milvus/configs/embedEtcd.yaml',
      COMMON_STORAGETYPE: 'local',
    })
    .withCopyContentToContainer([
      { content: EMBED_ETCD_YAML, target: '/milvus/configs/embedEtcd.yaml' },
      { content: '\n', target: '/milvus/configs/user.yaml' },
    ])
    .withExposedPorts(19530, 9091)
    .withWaitStrategy(Wait.forHttp('/healthz', 9091).forStatusCode(200))
    .withStartupTimeout(180_000)
    .start();

  const address = `${container.getHost()}:${container.getMappedPort(19530)}`;
  return { container, address };
}
