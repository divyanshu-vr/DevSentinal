/** Internal types for graph-sitter / madge output parsing */

export interface GraphSitterOutput {
  files: {
    path: string;
    functions: { name: string; line_start: number; line_end: number; calls: string[] }[];
    classes: { name: string; line_start: number; line_end: number; bases: string[]; methods: string[] }[];
    imports: { module: string; names: string[] }[];
    exports: string[];
  }[];
}

/** madge --json output: { "file.ts": ["dep1.ts", "dep2.ts"] } */
export type MadgeOutput = Record<string, string[]>;
