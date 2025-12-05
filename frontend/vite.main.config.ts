import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        // Externalize node-llama-cpp and its native dependencies
        'node-llama-cpp',
        '@node-llama-cpp/mac-x64',
        '@node-llama-cpp/mac-arm64',
        '@node-llama-cpp/linux-x64',
        '@node-llama-cpp/linux-arm64',
        '@node-llama-cpp/win32-x64',
        'onnxruntime-node',
        'sharp',
        'onnxruntime-web',
        'transformers',
        // Also externalize electron-dl for model downloads
        'electron-dl',
        // Externalize FFmpeg dependencies
        'fluent-ffmpeg',
        '@ffmpeg-installer/ffmpeg',
        '@ffmpeg-installer/darwin-arm64',
        '@ffmpeg-installer/darwin-x64',
        '@ffmpeg-installer/linux-arm64',
        '@ffmpeg-installer/linux-ia32',
        '@ffmpeg-installer/linux-x64',
        '@ffmpeg-installer/win32-ia32',
        '@ffmpeg-installer/win32-x64',
      ]
    }
  }
});
