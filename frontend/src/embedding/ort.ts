// src/embedding/ort.ts
import * as ort from 'onnxruntime-web';

// Configure ONNX Runtime
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.logLevel = 'error';

// In dev mode, let ONNX Runtime use default paths from node_modules
// In production, the build process copies files to the correct locations
console.log('[ort] ONNX Runtime loaded from node_modules');

export default ort;
