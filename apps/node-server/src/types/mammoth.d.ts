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
