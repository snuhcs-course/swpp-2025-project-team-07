#!/usr/bin/env python3
"""
Convert DRAGON models to ONNX using Optimum (recommended for Transformers.js)
This ensures full compatibility with @xenova/transformers
"""

from optimum.onnxruntime import ORTModelForFeatureExtraction
from transformers import AutoTokenizer
from pathlib import Path
import sys

def convert_with_optimum(model_name_or_path, output_dir):
    """
    Convert model using Optimum for guaranteed Transformers.js compatibility
    """
    
    print(f"Loading model from {model_name_or_path}...")
    print("This will take a few minutes for large models...")
    
    try:
        # Load and export model in one step
        model = ORTModelForFeatureExtraction.from_pretrained(
            model_name_or_path,
            export=True,  # This triggers ONNX conversion
        )
        
        # Save the converted model
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        print(f"\nSaving ONNX model to {output_dir}...")
        model.save_pretrained(output_dir)
        
        # Save tokenizer
        print("Saving tokenizer...")
        tokenizer = AutoTokenizer.from_pretrained(model_name_or_path)
        tokenizer.save_pretrained(output_dir)
        
        print(f"\n✅ Conversion complete!")
        print(f"✅ Model saved to: {output_dir}")
        print(f"\nGenerated files:")
        for file in output_path.iterdir():
            if file.is_file():
                size_mb = file.stat().st_size / (1024 * 1024)
                print(f"  - {file.name} ({size_mb:.2f} MB)")
        
        # Show expected structure for Transformers.js
        print(f"\n📁 For Transformers.js, create this structure:")
        print(f"  {output_dir}/")
        print(f"    ├── config.json")
        print(f"    ├── tokenizer.json")
        print(f"    ├── tokenizer_config.json")
        print(f"    └── onnx/")
        print(f"        └── model_quantized.onnx (rename model.onnx)")
        
    except Exception as e:
        print(f"\n❌ Conversion failed: {e}")
        print(f"\nMake sure you have installed:")
        print(f"  pip install optimum[onnxruntime]")
        raise

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python convert_with_optimum.py <model_name_or_path> <output_dir>")
        print("\nExample:")
        print("  python convert_with_optimum.py nvidia/dragon-multiturn-query-encoder ./query_onnx_optimum")
        print("\nNote: Install optimum first:")
        print("  pip install optimum[onnxruntime]")
        sys.exit(1)
    
    model_path = sys.argv[1]
    output_dir = sys.argv[2]
    
    convert_with_optimum(model_path, output_dir)