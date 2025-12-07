import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const NATIVE_DEPENDENCIES = [
  'onnxruntime-node',
  'onnxruntime-web',
  'onnxruntime-common',
  'node-llama-cpp',
  '@node-llama-cpp/mac-arm64',
  '@node-llama-cpp/mac-x64',
  '@node-llama-cpp/linux-x64',
  '@node-llama-cpp/linux-arm64',
  '@node-llama-cpp/win32-x64',
  'sharp',
  '@img/sharp-darwin-arm64',
  '@img/sharp-libvips-darwin-arm64',
  '@img/sharp-darwin-x64',
  '@img/sharp-libvips-darwin-x64',
  'electron-ollama',
  'ollama',
  '@ffmpeg-installer/ffmpeg',
  '@ffmpeg-installer/darwin-arm64',
  '@ffmpeg-installer/darwin-x64',
  '@ffmpeg-installer/linux-arm64',
  '@ffmpeg-installer/linux-ia32',
  '@ffmpeg-installer/linux-x64',
  '@ffmpeg-installer/win32-ia32',
  '@ffmpeg-installer/win32-x64',
  'ffmpeg-static',
  'fluent-ffmpeg',
  'detect-libc',
];

const config: ForgeConfig = {
  packagerConfig: {
    icon: path.join(__dirname, 'src', 'assets', 'logo'),
    asar: {
      unpack:
        '{**/node_modules/node-llama-cpp/**,**/node_modules/onnxruntime-node/**,**/node_modules/sharp/**,**/node_modules/@img/**,**/node_modules/@ffmpeg-installer/**,**/node_modules/ffmpeg-static/**}',
    },
    extraResource: [
      path.join(__dirname, '.env'),
    ],
  },
  rebuildConfig: {},
  hooks: {
    packageAfterCopy: async (_forgeConfig, buildPath) => {
      const projectNodeModules = path.resolve(__dirname, 'node_modules');
      const packageNodeModules = path.join(buildPath, 'node_modules');

      await mkdir(packageNodeModules, { recursive: true });

      const visited = new Set<string>();

      const copyDependency = async (dependency: string): Promise<void> => {
        if (visited.has(dependency)) {
          return;
        }
        visited.add(dependency);

        const source = path.join(projectNodeModules, dependency);
        if (!existsSync(source)) {
          return;
        }

        const destination = path.join(packageNodeModules, dependency);
        await cp(source, destination, { recursive: true, dereference: true, force: true });

        const packageJsonPath = path.join(source, 'package.json');
        if (!existsSync(packageJsonPath)) {
          return;
        }

        try {
          const packageJsonRaw = await readFile(packageJsonPath, 'utf-8');
          const packageJson = JSON.parse(packageJsonRaw) as {
            dependencies?: Record<string, string>;
            optionalDependencies?: Record<string, string>;
            peerDependencies?: Record<string, string>;
          };

          const children = new Set<string>([
            ...Object.keys(packageJson.dependencies ?? {}),
            ...Object.keys(packageJson.optionalDependencies ?? {}),
            ...Object.keys(packageJson.peerDependencies ?? {}),
          ]);

          for (const child of children) {
            if (!child) {
              continue;
            }
            await copyDependency(child);
          }
        } catch {
          // Ignore malformed package.json files.
        }
      };

      for (const dependency of NATIVE_DEPENDENCIES) {
        await copyDependency(dependency);
      }
    },
  },
  makers: [
    new MakerSquirrel({
      setupIcon: path.join(__dirname, 'src', 'assets', 'logo.ico'),
    }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
    new MakerDMG({
      icon: path.join(__dirname, 'src', 'assets', 'logo.icns'),
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
