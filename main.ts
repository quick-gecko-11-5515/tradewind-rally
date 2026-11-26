// Tradewind Rally submission entrypoint (Node 22 stdlib + vendored makefun-game helper).
// Copies static game files and captured screenshots to the target output directory,
// then emits a deterministic dossier.json under the competition's gate limits.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const GATE_LIMITS = {
  text_max_bytes: 163840,
  screenshots: {
    max: 4,
    max_bytes: 262144,
  },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function copyDirectoryDeterministic(sourceDir: string, targetDir: string): void {
  fs.mkdirSync(targetDir, { recursive: true });
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  for (const entry of entries) {
    const srcPath = path.join(sourceDir, entry.name);
    const dstPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryDeterministic(srcPath, dstPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function packageEntry(): void {
  const repoRoot = path.dirname(fileURLToPath(import.meta.url));
  const outputRoot = process.env.MAKEFUN_OUTPUT_DIR || '/output';

  fs.mkdirSync(outputRoot, { recursive: true });

  const gameSource = path.join(repoRoot, 'game');
  const gameTarget = path.join(outputRoot, 'game');
  copyDirectoryDeterministic(gameSource, gameTarget);

  const shotsSource = path.join(repoRoot, 'screenshots');
  const shotsTarget = path.join(outputRoot, 'screenshots');
  fs.mkdirSync(shotsTarget, { recursive: true });
  if (fs.existsSync(shotsSource)) {
    copyDirectoryDeterministic(shotsSource, shotsTarget);
  }

  const dossierPayload = buildDossier(outputRoot, GATE_LIMITS);
  fs.writeFileSync(path.join(outputRoot, 'dossier.json'), dossierPayload);
}

packageEntry();
