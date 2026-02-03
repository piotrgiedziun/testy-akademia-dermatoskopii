#!/usr/bin/env python3
"""
VideoSeal Watermarking Script for Firebase Storage Images

Downloads images from Firebase Storage, applies VideoSeal watermarks,
and re-uploads them to the same location.
"""

import os
import sys
import tempfile
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, storage, firestore
from urllib.parse import quote
from PIL import Image
import torch
import torchvision.transforms as T
import videoseal


# Configuration
BUCKET_NAME = "akademiadermatoskopiitesty.firebasestorage.app"
CASES_PREFIX = "cases/"
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
WATERMARK_MESSAGE = "akademiadermatoskopii"  # Unique identifier embedded in all images
WATERMARK_THRESHOLD = 0.75  # 75% bit accuracy = already watermarked


def text_to_bits(text: str, nbits: int = 256) -> torch.Tensor:
    """Convert text to a tensor of bits for watermark message."""
    bits = []
    for char in text:
        for i in range(8):
            bits.append((ord(char) >> (7 - i)) & 1)
    # Pad or truncate to nbits
    bits = bits[:nbits] + [0] * (nbits - len(bits))
    return torch.tensor(bits, dtype=torch.float32).unsqueeze(0)


def text_to_bits_list(text: str, nbits: int = 256) -> list:
    """Convert text to a list of bits for comparison."""
    bits = []
    for char in text:
        for i in range(8):
            bits.append((ord(char) >> (7 - i)) & 1)
    return (bits[:nbits] + [0] * nbits)[:nbits]


def check_watermark(model, img_path: Path) -> tuple[bool, float]:
    """Check if an image already has our watermark.

    Returns:
        (is_watermarked, bit_accuracy)
    """
    img = Image.open(img_path).convert("RGB")
    img_tensor = T.ToTensor()(img).unsqueeze(0)

    with torch.no_grad():
        result = model.detect(img_tensor)

    # Extract message bits
    preds = result["preds"]
    extracted_bits = (preds[0, 1:] > 0).int().tolist()

    # Compare to expected message
    expected_bits = text_to_bits_list(WATERMARK_MESSAGE)
    matching_bits = sum(a == b for a, b in zip(extracted_bits, expected_bits))
    bit_accuracy = matching_bits / len(expected_bits)

    return bit_accuracy >= WATERMARK_THRESHOLD, bit_accuracy


def init_firebase() -> storage.bucket:
    """Initialize Firebase Admin SDK and return the storage bucket."""
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")

    if not cred_path:
        print("Error: GOOGLE_APPLICATION_CREDENTIALS environment variable not set")
        print("Please set it to the path of your service account JSON file")
        sys.exit(1)

    if not Path(cred_path).exists():
        print(f"Error: Credentials file not found at {cred_path}")
        sys.exit(1)

    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred, {"storageBucket": BUCKET_NAME})

    return storage.bucket()


def list_case_images(bucket) -> list:
    """List all images in the cases/ folder."""
    blobs = bucket.list_blobs(prefix=CASES_PREFIX)

    image_blobs = []
    for blob in blobs:
        ext = Path(blob.name).suffix.lower()
        if ext in SUPPORTED_EXTENSIONS:
            image_blobs.append(blob)

    return image_blobs


def update_firestore_urls(db, old_path: str, new_blob) -> int:
    """Update Firestore documents that reference the old image path.

    Returns number of documents updated.
    """
    # Make the new blob publicly accessible
    new_blob.make_public()
    new_url = new_blob.public_url

    # Search for documents with the old path in their image URLs
    # The old path might be URL-encoded in the stored URL
    old_filename = Path(old_path).name

    updated = 0
    cases = db.collection('cases').stream()

    for case in cases:
        data = case.to_dict()
        images = data.get('images', [])
        if not images:
            continue

        updated_images = []
        needs_update = False

        for img in images:
            url = img.get('url', '')
            # Check if this URL references our old file
            if old_filename in url and 'firebasestorage.googleapis.com' in url:
                updated_images.append({**img, 'url': new_url})
                needs_update = True
            else:
                updated_images.append(img)

        if needs_update:
            db.collection('cases').document(case.id).update({'images': updated_images})
            updated += 1

    return updated


def apply_watermark(model, input_path: Path, output_path: Path, msg_tensor: torch.Tensor) -> bool:
    """Apply VideoSeal watermark to an image with custom message."""
    try:
        img = Image.open(input_path).convert("RGB")
        img_tensor = T.ToTensor()(img).unsqueeze(0)

        with torch.no_grad():
            outputs = model.embed(img_tensor, msgs=msg_tensor)

        watermarked_img = T.ToPILImage()(outputs["imgs_w"][0])

        # Save as PNG for lossless compression (preserves watermark better)
        watermarked_img.save(output_path, format="PNG")

        return True
    except Exception as e:
        print(f"  Error applying watermark: {e}")
        return False


def process_images(bucket, db, blobs: list, model, msg_tensor: torch.Tensor, dry_run: bool = False, force: bool = False):
    """Process all images: download, watermark, upload, and update Firestore."""
    total = len(blobs)
    success = 0
    skipped = 0
    failed = 0

    print(f"\nProcessing {total} images...")
    print(f"Watermark message: '{WATERMARK_MESSAGE}'")
    if force:
        print("Force mode: re-watermarking all images")

    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)

        for i, blob in enumerate(blobs, 1):
            filename = Path(blob.name).name
            print(f"\n[{i}/{total}] Processing: {blob.name}")

            # Download
            input_path = tmpdir / f"input_{filename}"
            # Output as PNG for lossless compression
            output_filename = Path(filename).stem + ".png"
            output_path = tmpdir / f"output_{output_filename}"

            print(f"  Downloading...")
            blob.download_to_filename(str(input_path))

            # Check if already watermarked (unless --force)
            if not force:
                print(f"  Checking watermark...")
                is_watermarked, accuracy = check_watermark(model, input_path)
                if is_watermarked:
                    print(f"  ⏭️  Already watermarked ({accuracy:.1%} accuracy) - skipping")
                    skipped += 1
                    input_path.unlink(missing_ok=True)
                    continue

            # Watermark
            print(f"  Applying watermark...")
            if not apply_watermark(model, input_path, output_path, msg_tensor):
                failed += 1
                continue

            # Upload - use new PNG path
            new_blob_name = str(Path(blob.name).parent / output_filename)
            new_blob = bucket.blob(new_blob_name)

            if dry_run:
                print(f"  [DRY RUN] Would upload to: {new_blob_name}")
            else:
                print(f"  Uploading to: {new_blob_name}")
                new_blob.upload_from_filename(str(output_path), content_type="image/png")

                # Update Firestore references and make blob public
                print(f"  Updating Firestore references...")
                updated_docs = update_firestore_urls(db, blob.name, new_blob)
                if updated_docs > 0:
                    print(f"  Updated {updated_docs} Firestore document(s)")

                # Delete old blob if extension changed
                if blob.name != new_blob_name:
                    print(f"  Deleting original: {blob.name}")
                    blob.delete()

            success += 1

            # Clean up temp files
            input_path.unlink(missing_ok=True)
            output_path.unlink(missing_ok=True)

    print(f"\n{'='*50}")
    print(f"Completed: {success} watermarked, {skipped} skipped, {failed} failed")


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Apply VideoSeal watermarks to Firebase Storage images"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Process images but don't upload (for testing)"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-watermark even if already watermarked"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Limit number of images to process (0 = all)"
    )
    args = parser.parse_args()

    print("VideoSeal Watermarking Script")
    print("="*50)

    # Initialize Firebase
    print("\nInitializing Firebase...")
    bucket = init_firebase()
    db = firestore.client()
    print(f"Connected to bucket: {BUCKET_NAME}")

    # Load VideoSeal model
    print("\nLoading VideoSeal model...")
    model = videoseal.load("pixelseal")
    model.eval()
    print("Model loaded successfully")

    # Create message tensor
    msg_tensor = text_to_bits(WATERMARK_MESSAGE)

    # List images
    print(f"\nListing images in {CASES_PREFIX}...")
    blobs = list_case_images(bucket)
    print(f"Found {len(blobs)} images")

    if not blobs:
        print("No images to process")
        return

    # Apply limit if specified
    if args.limit > 0:
        blobs = blobs[:args.limit]
        print(f"Limited to {len(blobs)} images")

    # Process images
    process_images(bucket, db, blobs, model, msg_tensor, dry_run=args.dry_run, force=args.force)


if __name__ == "__main__":
    main()
