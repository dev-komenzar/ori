import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// cwd 依存にしない: skill dir やサブ dir から実行されても上方探索で .ori/ を持つ project root を解決する。
// git repo の境界 (.git がある dir) で探索を止め、無関係な祖先 ($HOME や外側の repo) の .ori/ は拾わない。
// 見つからなければ従来どおり cwd を返す (root 直下での実行と .ori/ 未作成時の挙動は変えない)。
export async function findProjectRoot(start: string = process.cwd()): Promise<string> {
  let d = start;
  for (;;) {
    if (await isDir(join(d, ".ori"))) return d;
    const parent = dirname(d);
    if (parent === d || (await exists(join(d, ".git")))) return start;
    d = parent;
  }
}
