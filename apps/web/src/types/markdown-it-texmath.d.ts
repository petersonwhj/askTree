declare module "markdown-it-texmath" {
  import type { PluginWithOptions } from "markdown-it";

  interface TexMathOptions {
    engine?: unknown;
    delimiters?: string | string[];
    katexOptions?: unknown;
  }

  interface TexMathRule {
    name: string;
  }

  const texmath: PluginWithOptions<TexMathOptions> & {
    mergeDelimiters(delimiters: string | string[]): { block: TexMathRule[] };
    block(rule: TexMathRule): import("markdown-it/lib/parser_block.mjs").RuleBlock;
  };
  export default texmath;
}
