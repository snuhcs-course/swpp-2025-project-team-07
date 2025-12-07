// src/embedding/ClipVideoEmbedder.ts
import ort from './ort';
import {
  DEFAULT_VIDEO_SAMPLE_FRAMES,
  sampleUniformFrames,
} from './video-sampler';

const MEAN = [0.48145466, 0.4578275, 0.40821073] as const;
const STD  = [0.26862954, 0.26130258, 0.27577711] as const;

type ImgLike = ImageData | ImageBitmap | HTMLCanvasElement;

export type ClipVideoEmbedding = {
  pooled: Float32Array;
  frames: { time: number; emb: Float32Array }[];
  modelInput: string;
  modelOutput: string;
};

// CLIP tokenizer
async function tokenizeText(text: string, maxLength: number = 77): Promise<number[]> {
  return await (window as any).embeddingAPI.tokenizeClip(text, maxLength);
}

export class ClipVideoEmbedder {
  private static _inst: ClipVideoEmbedder | null = null;
  static async get(): Promise<ClipVideoEmbedder> {
    if (!this._inst) this._inst = new ClipVideoEmbedder();
    await this._inst.ensureReady();
    return this._inst!;
  }

  private session!: ort.InferenceSession;
  private inputName!: string; 
  
  private imageOutputName!: string;
  private textOutputName!: string;

  private needTextFeeds = false;
  private textSeqLen = 77;
  private inputDTypes: Record<string, ort.Tensor.Type> = {};

  private ready: Promise<void> | null = null;
  private constructor() {}

  private async ensureReady() {
    if (!this.ready) this.ready = this.init();
    return this.ready;
  }

  private dimFix(dim: number | string | undefined, fallback: number) {
    return (typeof dim === 'number' && dim > 0) ? dim : fallback;
  }

  private makeZerosTensor(name: string, dtype: ort.Tensor.Type, shape: number[], ones = false) {
    const size = shape.reduce((a, b) => a * b, 1);
    switch (dtype) {
      case 'int64': {
        const arr = new BigInt64Array(size);
        if (ones) arr.fill(1n);
        return new ort.Tensor('int64', arr, shape);
      }
      case 'int32': {
        const arr = new Int32Array(size);
        if (ones) arr.fill(1);
        return new ort.Tensor('int32', arr, shape);
      }
      case 'float32':
      default: {
        const arr = new Float32Array(size);
        if (ones) arr.fill(1);
        return new ort.Tensor('float32', arr, shape);
      }
    }
  }

  private async init() {
    const bytes: ArrayBuffer = await (window as any).llmAPI.getVideoModelBytes();

    this.session = await ort.InferenceSession.create(bytes, {
      executionProviders: ['webgpu', 'wasm'],
    } as any);

    const ins  = this.session.inputNames ?? [];
    const outs = this.session.outputNames ?? [];
    const meta = (this.session as any).inputMetadata as Record<string, { type: ort.Tensor.Type, dimensions: Array<number | string> }>;

    this.inputName =
      ins.includes('pixel_values') ? 'pixel_values' :
      (ins[0] ?? 'pixel_values');

    this.imageOutputName =
      outs.find(n => n === 'image_embeds') ??
      outs.find(n => n === 'pooled_output') ??
      outs.find(n => n === 'output') ??
      outs.find(n => n === 'last_hidden_state') ??
      outs[0];

    this.textOutputName =
      outs.find(n => n === 'text_embeds') ??
      outs.find(n => n === 'text_projection') ??
      outs.find(n => n === 'pooled_output') ?? // fallback
      outs.find(n => n === 'output') ??
      outs.find(n => n === 'last_hidden_state') ??
      outs[0];

    this.needTextFeeds = ins.includes('input_ids') || ins.includes('attention_mask');
    if (this.needTextFeeds && meta) {
      const idMeta   = meta['input_ids'];
      const maskMeta = meta['attention_mask'];
      const seqFromMeta =
        this.dimFix(idMeta?.dimensions?.[1] as number | string | undefined, 77);
      this.textSeqLen = seqFromMeta > 0 ? seqFromMeta : 77;
      this.inputDTypes['input_ids']      = (idMeta?.type as ort.Tensor.Type)   ?? 'int64';
      this.inputDTypes['attention_mask'] = (maskMeta?.type as ort.Tensor.Type) ?? this.inputDTypes['input_ids'] ?? 'int64';
    }

    console.log('[clip] inputs=', ins, ' chosen=', this.inputName);
    console.log('[clip] outputs=', outs, ' chosen=', outs);

    if (this.needTextFeeds) {
      console.log('[clip] unified CLIP detected → textSeqLen=', this.textSeqLen,
                  ' dtypes=', this.inputDTypes);
    }
  }

  async embedVideo(videoBlob: Blob, frameCount = DEFAULT_VIDEO_SAMPLE_FRAMES): Promise<ClipVideoEmbedding> {
    await this.ensureReady();

    const sampled = await sampleUniformFrames(videoBlob, frameCount, { size: 224 });
    const perFrame: { time: number; emb: Float32Array }[] = [];

    for (const f of sampled) {
      const emb = await this.embedImage(f.image as ImgLike);
      perFrame.push({ time: f.time ?? 0, emb });
      if ('close' in (f.image as any)) { try { (f.image as ImageBitmap).close(); } catch {} }
    }

    const dim = perFrame[0]?.emb.length ?? 512;
    const mean = new Float32Array(dim);
    for (const pf of perFrame) for (let d = 0; d < dim; d++) mean[d] += pf.emb[d];
    for (let d = 0; d < dim; d++) mean[d] /= Math.max(1, perFrame.length);

    return {
      pooled: l2norm(mean),
      frames: perFrame,
      modelInput: this.inputName,
      modelOutput: this.imageOutputName,
    };
  }

  async embedImage(image: ImgLike): Promise<Float32Array> {
    await this.ensureReady();

    const tensor = await toTensor(image, 224);

    const feeds: Record<string, ort.Tensor> = { [this.inputName]: tensor };

    if (this.needTextFeeds) {
      if (!('input_ids' in feeds) && (this.session.inputNames ?? []).includes('input_ids')) {
        const t = this.makeZerosTensor('input_ids', this.inputDTypes['input_ids'] ?? 'int64', [1, this.textSeqLen], /*ones*/ false);
        feeds['input_ids'] = t;
      }
      if (!('attention_mask' in feeds) && (this.session.inputNames ?? []).includes('attention_mask')) {
        const t = this.makeZerosTensor('attention_mask', this.inputDTypes['attention_mask'] ?? 'int64', [1, this.textSeqLen], /*ones*/ true);
        feeds['attention_mask'] = t;
      }
    }

    const outMap = await this.session.run(feeds);
    const out = outMap[this.imageOutputName];
    if (!out) throw new Error(`output "${this.imageOutputName}" not found: ${Object.keys(outMap)}`);

    if (out.dims.length <= 2) {
      const data = out.data as Float32Array | number[];
      return l2norm(data instanceof Float32Array ? data : Float32Array.from(data));
    }
    if (out.dims.length === 3) {
      const [b, t, c] = out.dims;
      if (b !== 1) throw new Error(`unexpected batch size ${b}`);
      const data = out.data as Float32Array;
      const cls = new Float32Array(c);
      for (let i = 0; i < c; i++) cls[i] = data[0 * t * c + 0 * c + i];
      return l2norm(cls);
    }
    throw new Error(`unhandled output shape ${out.dims.join('x')}`);
  }

  async embedText(text: string): Promise<Float32Array> {
    await this.ensureReady();

    // For unified CLIP models with text support
    if (!this.needTextFeeds) {
      throw new Error('This CLIP model does not support text embedding (vision-only model). Text embedding requires a unified CLIP model.');
    }

    const tokens = await tokenizeText(text, this.textSeqLen);
    const inputIds = new BigInt64Array(tokens.map(t => BigInt(t)));
    const attentionMask = new BigInt64Array(tokens.map(t => t !== 0 ? 1n : 0n));

    const feeds: Record<string, ort.Tensor> = {
      input_ids: new ort.Tensor(this.inputDTypes['input_ids'] ?? 'int64', inputIds, [1, this.textSeqLen]),
      attention_mask: new ort.Tensor(this.inputDTypes['attention_mask'] ?? 'int64', attentionMask, [1, this.textSeqLen]),
    };

    // Add zero pixel values since unified model might need both inputs
    if (this.session.inputNames.includes(this.inputName)) {
      feeds[this.inputName] = this.makeZerosTensor(this.inputName, 'float32', [1, 3, 224, 224]);
    }

    const outMap = await this.session.run(feeds);
    const out = outMap[this.textOutputName];
    if (!out) throw new Error(`output "${this.textOutputName}" not found: ${Object.keys(outMap)}`);

    if (out.dims.length <= 2) {
      const data = out.data as Float32Array | number[];
      return l2norm(data instanceof Float32Array ? data : Float32Array.from(data));
    }
    if (out.dims.length === 3) {
      const [b, t, c] = out.dims;
      if (b !== 1) throw new Error(`unexpected batch size ${b}`);
      const data = out.data as Float32Array;
      const cls = new Float32Array(c);
      for (let i = 0; i < c; i++) cls[i] = data[0 * t * c + 0 * c + i];
      return l2norm(cls);
    }
    throw new Error(`unhandled output shape ${out.dims.join('x')}`);
  }
}

/* ===== helpers ===== */

function l2norm(v: Float32Array): Float32Array {
  let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  const o = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) o[i] = v[i] / n;
  return o;
}

async function toTensor(frame: ImgLike, size: number): Promise<ort.Tensor> {
  const target = size;

  let w = 0, h = 0;
  if (frame instanceof HTMLCanvasElement) { w = frame.width; h = frame.height; }
  else if ('close' in (frame as any)) { w = (frame as ImageBitmap).width; h = (frame as ImageBitmap).height; }
  else { w = (frame as ImageData).width; h = (frame as ImageData).height; }

  const scale = Math.max(target / w, target / h);
  const rw = Math.round(w * scale), rh = Math.round(h * scale);

  const c1 = new OffscreenCanvas(rw, rh);
  const g1 = c1.getContext('2d')!;
  if (frame instanceof HTMLCanvasElement) g1.drawImage(frame, 0, 0, rw, rh);
  else if ('close' in (frame as any)) g1.drawImage(frame as ImageBitmap, 0, 0, rw, rh);
  else { const t = new OffscreenCanvas(w, h); t.getContext('2d')!.putImageData(frame as ImageData, 0, 0); g1.drawImage(t, 0, 0, rw, rh); }

  const sx = Math.floor((rw - target) / 2);
  const sy = Math.floor((rh - target) / 2);
  const c2 = new OffscreenCanvas(target, target);
  const g2 = c2.getContext('2d', { willReadFrequently: true })!;
  g2.drawImage(c1, sx, sy, target, target, 0, 0, target, target);

  const { data } = g2.getImageData(0, 0, target, target);

  const hw = target * target;
  const out = new Float32Array(3 * hw);
  for (let y = 0; y < target; y++) for (let x = 0; x < target; x++) {
    const i = (y * target + x) * 4;
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    out[0 * hw + y * target + x] = (r - MEAN[0]) / STD[0];
    out[1 * hw + y * target + x] = (g - MEAN[1]) / STD[1];
    out[2 * hw + y * target + x] = (b - MEAN[2]) / STD[2];
  }
  return new ort.Tensor('float32', out, [1, 3, target, target]);
}
