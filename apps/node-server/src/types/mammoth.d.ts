// 这个文件是一个 TypeScript 声明文件,用来告诉 TypeScript 编译器 mammoth 模块的类型信息
// 因为 mammoth 没有自带类型声明,我们又不想安装 @types/mammoth 这种第三方类型包(因为它可能过时或者不准确)
// 所以自己写了这个文件来声明我们需要用到的类型和函数
declare module 'mammoth' {
  export interface ExtractRawTextOptions {
    buffer: Buffer;
  }
  export interface ExtractResult {
    value: string;
    messages: unknown[];
  }
  export function extractRawText(
    options: ExtractRawTextOptions,
  ): Promise<ExtractResult>;
}
