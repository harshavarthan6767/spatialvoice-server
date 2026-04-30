import os
import shutil
import torch
import torch.nn as nn

# 1. Copy position_lstm_int8.onnx to models/
shutil.copy('all/position_lstm_int8.onnx', 'models/position_lstm_int8.onnx')

# 2. Define SpatialNet
class SpatialNet(nn.Module):
    def __init__(self, filter_length=128):
        super(SpatialNet, self).__init__()
        self.network = nn.Sequential(
            nn.Linear(3, 64),  nn.ReLU(),
            nn.Linear(64, 128), nn.ReLU(),
            nn.Linear(128, 256), nn.ReLU()
        )
        self.head_left  = nn.Linear(256, filter_length)
        self.head_right = nn.Linear(256, filter_length)

    def forward(self, coords):
        features = self.network(coords)
        return self.head_left(features), self.head_right(features)

# 3. Export to ONNX (FP32)
model_export = SpatialNet(filter_length=128)
model_export.load_state_dict(torch.load('all/spatialnet.pth', map_location='cpu'))
model_export.eval()

dummy_input = torch.randn(1, 3)

torch.onnx.export(
    model_export,
    dummy_input,
    'models/spatialnet.onnx',
    input_names=['position'],
    output_names=['hrtf_left', 'hrtf_right'],
    dynamic_axes={'position': {0: 'batch'}},
    opset_version=17,
    verbose=False
)

print('Models successfully fixed! (Using FP32 for spatialnet.onnx)')
