# VideoSeal Watermarking Script

Applies invisible VideoSeal watermarks to case images stored in Firebase Storage.

## Prerequisites

- Python 3.10+
- [uv](https://github.com/astral-sh/uv) package manager
- Firebase service account credentials with Storage access

## Setup

1. **Install uv** (if not already installed):
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```

2. **Get Firebase credentials**:
   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate new private key"
   - Save the JSON file securely

3. **Set environment variable**:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
   ```

## Usage

```bash
cd scripts/watermark

# Install dependencies
uv sync

# Install videoseal without its dependencies (decord doesn't have macOS ARM wheels)
uv pip install --no-deps "videoseal @ git+https://github.com/facebookresearch/videoseal.git"

# Copy config files (required for model loading)
git clone --depth 1 https://github.com/facebookresearch/videoseal.git /tmp/videoseal_tmp
cp -r /tmp/videoseal_tmp/configs .venv/lib/python3.*/site-packages/videoseal/
rm -rf /tmp/videoseal_tmp

# Run with dry-run first (downloads and watermarks but doesn't upload)
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json uv run python watermark.py --dry-run --limit 5

# Process all images
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json uv run python watermark.py
```

### Options

| Flag | Description |
|------|-------------|
| `--dry-run` | Process images but don't upload (for testing) |
| `--limit N` | Only process first N images |

## How It Works

1. Connects to Firebase Storage bucket
2. Lists all images in `cases/` folder
3. For each image:
   - Downloads to temp directory
   - Applies VideoSeal watermark
   - Uploads back to the same path (overwrites original)
4. Cleans up temp files

## Verifying Watermarks

To verify a watermark was applied, you can use VideoSeal's detect function:

```python
import videoseal
from PIL import Image
import torchvision.transforms as T

model = videoseal.load("pixelseal")
img = T.ToTensor()(Image.open("watermarked.jpg")).unsqueeze(0)
result = model.detect(img)
print(f"Watermark detected: {result['preds'][0] > 0.5}")
```

## Supported Image Formats

- JPEG (.jpg, .jpeg)
- PNG (.png)
- WebP (.webp)
