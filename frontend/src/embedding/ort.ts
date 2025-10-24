// src/embedding/ort.ts
import * as ort from 'onnxruntime-web';

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

// for deployment
ort.env.wasm.wasmPaths = {
  'ort-wasm.wasm': '/ort/ort-wasm.wasm',
  'ort-wasm-simd.wasm': '/ort/ort-wasm-simd.wasm',
  'ort-wasm-simd-threaded.wasm': '/ort/ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.jsep.wasm': '/ort/ort-wasm-simd-threaded.jsep.wasm',
};
console.log('[ort] wasmPaths =', ort.env.wasm.wasmPaths);

const ORT_REWRITE: Array<[string, string]> = [
  ['ort-wasm-simd-threaded.jsep.wasm', '/ort/ort-wasm-simd-threaded.jsep.wasm'],
  ['ort-wasm-simd-threaded.wasm', '/ort/ort-wasm-simd-threaded.wasm'],
  ['ort-wasm-simd.wasm', '/ort/ort-wasm-simd.wasm'],
  ['ort-wasm.wasm', '/ort/ort-wasm.wasm'],
];

const originalFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const urlStr = typeof input === 'string' ? input : (input as URL).toString();
  for (const [needle, replacement] of ORT_REWRITE) {
    if (urlStr.includes(needle)) {
      console.log('[ort] FETCH (rewrite) →', urlStr, '⇒', replacement);
      return originalFetch(replacement, init);
    }
  }
  return originalFetch(input, init);
};

export default ort;
