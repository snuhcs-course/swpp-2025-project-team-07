/**
 * Test Optimum-converted ONNX models
 * Save as: test_optimum_model.mjs
 * Run with: node test_optimum_model.mjs
 */

import { AutoTokenizer, AutoModel, env } from '@xenova/transformers';

const MODEL_NAME = 'chat-query-encoder-optimum';
const PARENT_DIR = 'C:/Users/26689/AppData/Roaming/Clone/embeddings';

async function testOptimumModel() {
  console.log('='.repeat(60));
  console.log('Testing Optimum-Converted ONNX Model');
  console.log('='.repeat(60));
  
  try {
    // Configure environment
    console.log('\n[Step 1] Configuring environment...');
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.useBrowserCache = false;
    env.localModelPath = PARENT_DIR;
    
    console.log(`✓ localModelPath: ${PARENT_DIR}`);
    console.log(`✓ Model name: ${MODEL_NAME}`);
    
    // Load tokenizer
    console.log('\n[Step 2] Loading tokenizer...');
    const tokenizer = await AutoTokenizer.from_pretrained(MODEL_NAME, {
      local_files_only: true,
    });
    console.log('✓ Tokenizer loaded');
    
    // Load model
    console.log('\n[Step 3] Loading ONNX model...');
    console.log('(This may take 30-60 seconds for large models...)');
    
    const startTime = Date.now();
    const model = await AutoModel.from_pretrained(MODEL_NAME, {
      local_files_only: true,
    });
    const loadTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✓ Model loaded in ${loadTime} seconds`);
    
    // Test inference
    console.log('\n[Step 4] Testing inference...');
    const testText = 'What is machine learning?';
    console.log(`Input: "${testText}"`);
    
    const inputs = await tokenizer(testText, {
      padding: true,
      truncation: true,
      max_length: 512,
    });
    
    const outputs = await model(inputs);
    console.log(`✓ Inference successful`);
    console.log(`  Output shape: [${outputs.last_hidden_state.dims.join(', ')}]`);
    
    // Extract embedding
    console.log('\n[Step 5] Extracting [CLS] embedding...');
    const hiddenSize = outputs.last_hidden_state.dims[2];
    const clsEmbedding = outputs.last_hidden_state.data.slice(0, hiddenSize);
    const embedding = Array.from(clsEmbedding);
    
    console.log(`✓ Embedding extracted`);
    console.log(`  Dimension: ${embedding.length}`);
    console.log(`  First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    console.log(`  L2 norm: ${Math.sqrt(embedding.reduce((s, v) => s + v*v, 0)).toFixed(4)}`);
    
    // Success!
    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL TESTS PASSED!');
    console.log('='.repeat(60));
    console.log('\n🎉 Optimum-converted model works perfectly with Transformers.js!');
    
    // Cleanup
    if (model.dispose) await model.dispose();
    
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ TEST FAILED');
    console.error('='.repeat(60));
    console.error('\nError:', error.message);
    console.error('\nStack:', error.stack);
    
    console.error('\n💡 Troubleshooting:');
    console.error('1. Make sure model.onnx is renamed to model_quantized.onnx');
    console.error('2. Check file structure:');
    console.error('   chat-query-encoder-optimum/');
    console.error('     ├── config.json');
    console.error('     ├── tokenizer.json');
    console.error('     └── model_quantized.onnx');
    
    process.exit(1);
  }
}

console.log('\nStarting Optimum model test...\n');
testOptimumModel();