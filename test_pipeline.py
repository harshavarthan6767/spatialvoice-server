import numpy as np
import requests
import struct, json
import time

try:
    from pipeline import SpatialVoicePipeline
    p = SpatialVoicePipeline(models_dir='models')

    mono = np.random.randn(64000).astype(np.float32) * 0.3
    
    t0 = time.perf_counter()
    result = p.process_chunk(mono)
    latency_ms = (time.perf_counter() - t0) * 1000

    print(f'Stereo shape  : {result["stereo"].shape}')
    print(f'Positions     : {result["positions"]}')
    print(f'Latency       : {latency_ms:.2f} ms')
    print('✅ Pipeline test passed')

except Exception as e:
    import traceback
    traceback.print_exc()
