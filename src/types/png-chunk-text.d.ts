declare module "png-chunk-text" {
  export interface IPngTextChunk {
    keyword: string;
    text: string;
  }

  export function encode(keyword: string, text: string): Uint8Array;
  export function decode(data: Uint8Array): IPngTextChunk;
}
