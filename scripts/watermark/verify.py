#!/usr/bin/env python3
"""
VideoSeal Watermark Verification Script

Verifies if an image contains a PixelSeal watermark.
Supports: local file path, URL, or file picker dialog.
"""

import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import requests
from PIL import Image
import torch
import torchvision.transforms as T
import videoseal


# Expected watermark message
EXPECTED_MESSAGE = "akademiadermatoskopii"
BIT_ACCURACY_THRESHOLD = 0.75  # 75% bit accuracy = watermark detected


def text_to_bits(text: str, nbits: int = 256) -> list:
    """Convert text to a list of bits."""
    bits = []
    for char in text:
        for i in range(8):
            bits.append((ord(char) >> (7 - i)) & 1)
    # Pad or truncate to nbits
    return (bits[:nbits] + [0] * nbits)[:nbits]


def load_model():
    """Load the PixelSeal model."""
    print("Loading PixelSeal model...")
    model = videoseal.load("pixelseal")
    model.eval()
    print("Model loaded successfully\n")
    return model


def verify_watermark(model, img_path: Path) -> dict:
    """Verify if an image contains a watermark by comparing to expected message."""
    img = Image.open(img_path).convert("RGB")
    img_tensor = T.ToTensor()(img).unsqueeze(0)

    with torch.no_grad():
        result = model.detect(img_tensor)

    # preds shape is [B, 1+nbits] = [1, 257]
    preds = result["preds"]  # [1, 257]

    # Extract message bits (skip first element which is detection logit)
    message_logits = preds[0, 1:].cpu()
    extracted_bits = (message_logits > 0).int().tolist()

    # Compare to expected message
    expected_bits = text_to_bits(EXPECTED_MESSAGE)
    matching_bits = sum(a == b for a, b in zip(extracted_bits, expected_bits))
    bit_accuracy = matching_bits / len(expected_bits)

    # Watermark detected if bit accuracy exceeds threshold
    has_watermark = bit_accuracy >= BIT_ACCURACY_THRESHOLD

    # Decode message as text
    decoded_msg = bits_to_text(extracted_bits)

    return {
        "has_watermark": has_watermark,
        "bit_accuracy": bit_accuracy,
        "message_bits": extracted_bits,
        "message_text": decoded_msg,
        "expected_message": EXPECTED_MESSAGE,
    }


def bits_to_text(bits: list, max_chars: int = 32) -> str:
    """Convert bit list to ASCII text, replacing non-printable with '?'."""
    text = ""
    for i in range(0, min(len(bits), max_chars * 8), 8):
        byte_bits = bits[i : i + 8]
        if len(byte_bits) == 8:
            val = sum(b << (7 - j) for j, b in enumerate(byte_bits))
            if 32 <= val < 127:
                text += chr(val)
            else:
                text += "?"
    return text.rstrip("?")


def download_image(url: str, dest: Path) -> bool:
    """Download image from URL."""
    try:
        response = requests.get(url, timeout=30, stream=True)
        response.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        return True
    except Exception as e:
        print(f"Error downloading image: {e}")
        return False


def pick_file() -> str | None:
    """Open a file picker dialog."""
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()  # Hide the main window
        root.attributes("-topmost", True)  # Bring dialog to front

        file_path = filedialog.askopenfilename(
            title="Select an image to verify",
            filetypes=[
                ("Image files", "*.jpg *.jpeg *.png *.webp *.JPG *.JPEG *.PNG"),
                ("All files", "*.*"),
            ],
        )
        root.destroy()
        return file_path if file_path else None
    except Exception as e:
        print(f"File picker not available: {e}")
        return None


def is_url(s: str) -> bool:
    """Check if string is a URL."""
    try:
        result = urlparse(s)
        return all([result.scheme in ("http", "https"), result.netloc])
    except:
        return False


def bits_to_hex(bits: list) -> str:
    """Convert bit list to hex string."""
    hex_str = ""
    for i in range(0, len(bits), 8):
        byte = bits[i : i + 8]
        if len(byte) == 8:
            val = sum(b << (7 - j) for j, b in enumerate(byte))
            hex_str += f"{val:02x}"
    return hex_str


def print_result(result: dict, source: str):
    """Print verification result."""
    print("=" * 50)
    print(f"Source: {source}")
    print("=" * 50)

    if result["has_watermark"]:
        print("✅ WATERMARK DETECTED - Akademia Dermatoskopii")
    else:
        print("❌ NO WATERMARK DETECTED")

    print(f"Bit accuracy: {result['bit_accuracy']:.1%}")
    print(f"Expected: '{result.get('expected_message', 'N/A')}'")
    print(f"Decoded:  '{result.get('message_text', 'N/A')}'")

    print("=" * 50)


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Verify if an image contains a PixelSeal watermark"
    )
    parser.add_argument(
        "source",
        nargs="?",
        help="Image file path or URL. If not provided, opens file picker.",
    )
    args = parser.parse_args()

    # Load model first
    model = load_model()

    # Determine source
    source = args.source

    if not source:
        # Open file picker
        print("Opening file picker...")
        source = pick_file()
        if not source:
            print("No file selected. Exiting.")
            sys.exit(0)

    # Process based on source type
    if is_url(source):
        print(f"Downloading from URL: {source}")
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        if not download_image(source, tmp_path):
            sys.exit(1)
        result = verify_watermark(model, tmp_path)
        tmp_path.unlink()  # Clean up
    else:
        # Local file
        file_path = Path(source)
        if not file_path.exists():
            print(f"Error: File not found: {source}")
            sys.exit(1)
        result = verify_watermark(model, file_path)

    print_result(result, source)


if __name__ == "__main__":
    main()
