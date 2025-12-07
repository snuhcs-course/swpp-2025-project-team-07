import { AutoTokenizer, AutoModel, env } from '@xenova/transformers';
import path from 'path';

export interface EmbeddingManagerOptions {
  chatQueryEncoderPath: string;
  chatKeyEncoderPath: string;
  clipTokenizerPath: string;
}

/**
 * EmbeddingManager - Manages DRAGON embedding models using ONNX
 */
export class EmbeddingManager {
  private queryModel: any = null;
  private contextModel: any = null;
  private tokenizer: any = null;
  private clipTokenizer: any = null;
  private options: EmbeddingManagerOptions;

  constructor(options: EmbeddingManagerOptions) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    console.log('Initializing DRAGON embedding models...');

    // Use model paths directly
    const queryPath = this.options.chatQueryEncoderPath;
    const contextPath = this.options.chatKeyEncoderPath;
    const clipPath = this.options.clipTokenizerPath;

    // Configure Transformers.js environment for Electron/Node.js
    const parentDir = path.dirname(queryPath);
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.useBrowserCache = false;
    env.localModelPath = parentDir;

    // Use Node.js native ONNX backend instead of WASM
    env.backends.onnx.wasm.proxy = false;

    console.log(`localModelPath: ${parentDir}`);

    // Extract model names
    const queryModelName = path.basename(queryPath);
    const contextModelName = path.basename(contextPath);
    const clipModelName = path.basename(clipPath);

    // Load tokenizer (shared between DRAGON models)
    console.log('Loading DRAGON tokenizer...');
    this.tokenizer = await AutoTokenizer.from_pretrained(queryModelName, {
      local_files_only: true,
    });
    console.log('✓ DRAGON Tokenizer loaded');

    // Load CLIP tokenizer (set localModelPath to CLIP directory temporarily)
    console.log('Loading CLIP tokenizer...');
    const clipParentDir = path.dirname(clipPath);
    const originalLocalModelPath = env.localModelPath;
    env.localModelPath = clipParentDir;

    try {
      this.clipTokenizer = await AutoTokenizer.from_pretrained(clipModelName, {
        local_files_only: true,
      });
      console.log('✓ CLIP Tokenizer loaded');
    } catch (error) {
      console.error('✗ Failed to load CLIP tokenizer:', error);
      throw error;
    } finally {
      // Restore original localModelPath
      env.localModelPath = originalLocalModelPath;
    }

    // Load models
    console.log('Loading Query Encoder...');
    this.queryModel = await AutoModel.from_pretrained(queryModelName, {
      local_files_only: true,
    });
    console.log('✓ Query Encoder loaded');

    console.log('Loading Context Encoder...');
    this.contextModel = await AutoModel.from_pretrained(contextModelName, {
      local_files_only: true,
    });
    console.log('✓ Context Encoder loaded');

    console.log('Initialization complete');
  }

  /**
   * Fix tensor format for ONNX Runtime Node.js backend
   */
  private fixTensorLocation(inputs: any): any {
    for (const key in inputs) {
      const tensor = inputs[key];
      if (tensor && typeof tensor === 'object') {
        // Add missing 'location' property
        if ('dataLocation' in tensor && !('location' in tensor)) {
          tensor.location = tensor.dataLocation;
        }
        // ONNX Runtime expects 'data' not 'cpuData'
        if ('cpuData' in tensor && !tensor.data) {
          tensor.data = tensor.cpuData;
        }
      }
    }
    return inputs;
  }

  /**
   * Embed query text using [CLS] token
   */
  async embedQuery(text: string): Promise<number[]> {
    if (!this.queryModel || !this.tokenizer) {
      throw new Error('Query encoder not initialized');
    }

    const inputs = await this.tokenizer(text, {
      padding: true,
      truncation: true,
      max_length: 512,
    });

    // Fix tensor location for onnxruntime-node
    this.fixTensorLocation(inputs);

    const outputs = await this.queryModel(inputs);
    
    // Extract [CLS] token embedding (first token)
    const hiddenState = outputs.last_hidden_state;
    const hiddenSize = hiddenState.dims[2];
    
    // Try both 'data' and 'cpuData' properties
    const dataArray = hiddenState.data || hiddenState.cpuData;
    
    if (!dataArray) {
      throw new Error('Could not extract data from model output');
    }
    
    const clsEmbedding = dataArray.slice(0, hiddenSize);
    
    return Array.from(clsEmbedding);
  }

  /**
   * Embed context text using [CLS] token
   */
  async embedContext(text: string): Promise<number[]> {
    if (!this.contextModel || !this.tokenizer) {
      throw new Error('Context encoder not initialized');
    }

    const inputs = await this.tokenizer(text, {
      padding: true,
      truncation: true,
      max_length: 512,
    });

    // Fix tensor location for onnxruntime-node
    this.fixTensorLocation(inputs);

    const outputs = await this.contextModel(inputs);
    
    // Extract [CLS] token embedding (first token)
    const hiddenState = outputs.last_hidden_state;
    const hiddenSize = hiddenState.dims[2];
    
    // Try both 'data' and 'cpuData' properties
    const dataArray = hiddenState.data || hiddenState.cpuData;
    
    if (!dataArray) {
      throw new Error('Could not extract data from model output');
    }
    
    const clsEmbedding = dataArray.slice(0, hiddenSize);
    
    return Array.from(clsEmbedding);
  }

  /**
   * Tokenize text for CLIP
   */
  async tokenizeClip(text: string, maxLength: number = 77): Promise<number[]> {
    if (!this.clipTokenizer) {
      throw new Error('CLIP tokenizer not initialized');
    }

    try {
      console.log('[CLIP Tokenizer] Calling tokenizer with text:', text);
      const inputs = await this.clipTokenizer(text, {
        padding: 'max_length',
        max_length: maxLength,
        truncation: true,
        return_tensor: false,
      });

      if (!inputs || !inputs.input_ids) {
        console.error('[CLIP Tokenizer] Invalid tokenizer output:', inputs);
        throw new Error('CLIP tokenizer returned invalid output');
      }

      const tokenIds = inputs.input_ids;

      // Convert to number array
      const result = Array.isArray(tokenIds)
        ? tokenIds.flat().map(val => Number(val))
        : Array.from(tokenIds).map(val => Number(val));

      return result;
    } catch (error) {
      console.error('[CLIP Tokenizer] Error during tokenization:', error instanceof Error ? error.stack : 'No stack');
      throw error;
    }
  }

  isReady(): boolean {
    return this.queryModel !== null &&
           this.contextModel !== null &&
           this.tokenizer !== null &&
           this.clipTokenizer !== null;
  }

  async cleanup(): Promise<void> {
    console.log('Cleaning up embedding models...');

    if (this.queryModel?.dispose) {
      await this.queryModel.dispose();
    }
    if (this.contextModel?.dispose) {
      await this.contextModel.dispose();
    }

    this.queryModel = null;
    this.contextModel = null;
    this.tokenizer = null;
    this.clipTokenizer = null;

    console.log('Cleanup complete');
  }
}