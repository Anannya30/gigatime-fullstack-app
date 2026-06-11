"""
Run GigaTIME inference on plain PNG slide images (no OpenSlide/WSI).

Mirrors the official inference path (gigatime_testing.ipynb / inference_demo.py):
    ImageNet normalize, no stain normalization, 256x256 non-overlapping windows,
    sigmoid > 0.5 -> binary per-channel mask, 23-channel model output.

For each PNG in ~/GigaTIME/data/ it:
    * loads the image directly (assume MPP=0.5, no resampling),
    * tiles into 256x256 patches (zero-padded at the edges), runs the model,
      stitches the binary predictions back to the original image size,
    * writes a 21-channel binary OME-TIFF (TRITC + Cy5 background channels dropped),
    * prints a per-slide table of positive-pixel % per marker.

There are two inference modes:
    * default (native 256): feed each 256x256 tile straight to the model, like
      inference_demo.py.
    * --resize512: replicate the testing notebook's per-patch path -- resize each
      256 tile up to 512x512, run do_inference (which windows the 512 back into
      256 sub-tiles), threshold, then downsample the binary mask back to 256.
      Outputs go to *_pred_512.ome.tiff so the two modes can be compared.

Usage:
    export HF_TOKEN=<hf read-only token>
    python scripts/run_png_inference.py              # native 256 mode
    python scripts/run_png_inference.py --resize512  # notebook patch path
"""

import argparse
import os
import sys
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import archs  # noqa: E402

# --- Pipeline constants (match the official testing notebook) -----------------
CHANNEL_NAMES = [
    "DAPI", "TRITC", "Cy5", "PD-1", "CD14", "CD4", "T-bet", "CD34", "CD68",
    "CD16", "CD11c", "CD138", "CD20", "CD3", "CD8", "PD-L1", "CK", "Ki67",
    "Tryptase", "Actin-D", "Caspase3-D", "PHH3-B", "Transgelin",
]
BACKGROUND_CHANNELS = {"TRITC", "Cy5"}  # not used in analysis
NUM_CLASSES = 23
TILE = 256
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

DATA_DIR = Path.home() / "GigaTIME" / "data"
# Slides to process, in the order requested. Files on disk use spaces; outputs
# use underscores (slide_093737_pred.ome.tiff).
SLIDE_IDS = ["093737", "093831", "093906"]


def load_model(device):
    from huggingface_hub import snapshot_download
    local_dir = snapshot_download(repo_id="prov-gigatime/GigaTIME")
    weights_path = os.path.join(local_dir, "model.pth")
    model = archs.gigatime(NUM_CLASSES, input_channels=3).to(device)
    state_dict = torch.load(weights_path, map_location=device)
    model.load_state_dict(state_dict)
    model.eval()
    print(f"=> loaded model 'gigatime' from {weights_path}")
    return model


def find_slide(slide_id):
    """Locate the PNG for a slide id, tolerating space or underscore naming."""
    for name in (f"slide {slide_id}.png", f"slide_{slide_id}.png"):
        p = DATA_DIR / name
        if p.exists():
            return p
    raise FileNotFoundError(f"No PNG found for slide {slide_id} in {DATA_DIR}")


def normalize(tile_rgb_uint8):
    """uint8 HxWx3 -> float32 CxHxW, ImageNet-normalized."""
    arr = tile_rgb_uint8.astype(np.float32) / 255.0
    arr = (arr - IMAGENET_MEAN) / IMAGENET_STD
    return arr.transpose(2, 0, 1)


@torch.no_grad()
def do_inference_binary(model, chw_float32, device):
    """Window an H,W (multiples of 256) normalized tile into 256 sub-tiles, infer
    each, and return a tuple (binary_mask, prob_stack). ``binary_mask`` is a
    [23, H, W] uint8 sigmoid > 0.5 mask and ``prob_stack`` is the matching
    [23, H, W] float32 raw sigmoid probabilities. Mirrors the notebook's
    do_inference() + sigmoid > 0.5."""
    _, h, w = chw_float32.shape
    x = torch.from_numpy(chw_float32[None]).to(device)
    logits = torch.zeros(1, NUM_CLASSES, h, w, device=device)
    for i in range(0, h, TILE):
        for j in range(0, w, TILE):
            window = x[:, :, i:i + TILE, j:j + TILE]
            logits[:, :, i:i + TILE, j:j + TILE] = model(window)
    probs = torch.sigmoid(logits)
    binary = (probs > 0.5).cpu().numpy().astype(np.uint8)[0]  # [23, h, w]
    prob_stack = probs.cpu().numpy().astype(np.float32)[0]  # [23, h, w]
    return binary, prob_stack


def _resize_binary(mask_23, size):
    """Resize a [23, H, W] uint8 binary stack to (size, size) with nearest."""
    out = np.zeros((NUM_CLASSES, size, size), dtype=np.uint8)
    for c in range(NUM_CLASSES):
        im = Image.fromarray(mask_23[c] * 255).resize((size, size), Image.NEAREST)
        out[c] = (np.asarray(im) > 127).astype(np.uint8)
    return out


def _resize_prob(prob_23, size):
    """Resize a [23, H, W] float32 probability stack to (size, size) with nearest
    so each downsampled probability stays aligned with its binary pixel."""
    out = np.zeros((NUM_CLASSES, size, size), dtype=np.float32)
    for c in range(NUM_CLASSES):
        im = Image.fromarray(prob_23[c]).resize((size, size), Image.NEAREST)
        out[c] = np.asarray(im, dtype=np.float32)
    return out


def predict_slide(model, png_path, device, resize512=False):
    """Return (binary_stack, prob_stack) for the full image. ``binary_stack`` is
    the [23, H, W] uint8 sigmoid > 0.5 prediction and ``prob_stack`` is the
    matching [23, H, W] float32 raw sigmoid probabilities."""
    img = Image.open(png_path).convert("RGB")
    w, h = img.size
    arr = np.asarray(img, dtype=np.uint8)  # H, W, 3

    # Pad up to a whole number of 256-px tiles, infer, then crop back.
    ph = (TILE - h % TILE) % TILE
    pw = (TILE - w % TILE) % TILE
    padded = np.pad(arr, ((0, ph), (0, pw), (0, 0)), mode="constant")
    H, W = padded.shape[:2]

    canvas = np.zeros((NUM_CLASSES, H, W), dtype=np.uint8)
    prob_canvas = np.zeros((NUM_CLASSES, H, W), dtype=np.float32)
    n_tiles = (H // TILE) * (W // TILE)
    mode = "resize512 (notebook patch path)" if resize512 else "native 256"
    print(f"  {png_path.name}: {w}x{h} -> padded {W}x{H}, {n_tiles} tiles [{mode}]")

    for y0 in range(0, H, TILE):
        for x0 in range(0, W, TILE):
            tile = padded[y0:y0 + TILE, x0:x0 + TILE]  # 256x256x3 uint8
            if resize512:
                # Notebook path: upscale the 256 tile to 512, infer (windowed
                # into 256), then downsample the binary mask back to 256.
                tile512 = np.asarray(
                    Image.fromarray(tile).resize((512, 512), Image.BILINEAR))
                pred512, prob512 = do_inference_binary(
                    model, normalize(tile512), device)
                pred = _resize_binary(pred512, TILE)
                prob = _resize_prob(prob512, TILE)
            else:
                pred, prob = do_inference_binary(model, normalize(tile), device)
            canvas[:, y0:y0 + TILE, x0:x0 + TILE] = pred
            prob_canvas[:, y0:y0 + TILE, x0:x0 + TILE] = prob

    return canvas[:, :h, :w], prob_canvas[:, :h, :w]  # crop padding away


def write_ome_tiff(out_path, full_pred):
    """full_pred: [23, H, W] uint8. Writes the 21 analysis channels as OME-TIFF."""
    import tifffile
    keep = [(i, n) for i, n in enumerate(CHANNEL_NAMES)
            if n not in BACKGROUND_CHANNELS]
    stack = np.stack([full_pred[i] for i, _ in keep], axis=0)  # [21, H, W]
    metadata = {"axes": "CYX", "Channel": {"Name": [n for _, n in keep]}}
    tifffile.imwrite(out_path, stack, photometric="minisblack",
                     compression="zlib", ome=True, metadata=metadata,
                     tile=(256, 256))
    print(f"  wrote {out_path} ({stack.shape}, dtype={stack.dtype})")
    return keep, stack


def print_table(slide_filename, keep, stack):
    """Print Marker | Positive Pixel % for each of the 21 analysis channels."""
    total = stack.shape[1] * stack.shape[2]
    rows = []
    for ci, (_, name) in enumerate(keep):
        pct = round(float((stack[ci] == 1).sum()) / total * 100.0, 2)
        rows.append((name, pct))

    header = f" Slide: {slide_filename} "
    width = 34
    print("\n" + "=" * width)
    print(header.center(width))
    print("=" * width)
    print(f"{'Marker':<18}{'Positive Pixel %':>16}")
    print("-" * width)
    for name, pct in rows:
        print(f"{name:<18}{pct:>16.2f}")
    print("-" * width)

    hi = max(rows, key=lambda r: r[1])
    lo = min(rows, key=lambda r: r[1])
    print(f"Highest expression: {hi[0]} ({hi[1]:.2f}%)")
    print(f"Lowest expression : {lo[0]} ({lo[1]:.2f}%)")
    print("=" * width)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--resize512", action="store_true",
                    help="replicate the notebook patch path: resize each 256 tile "
                         "to 512, infer, downsample back. Writes *_pred_512.ome.tiff")
    args = ap.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")
    model = load_model(device)
    if device.type == "cuda":
        torch.backends.cudnn.benchmark = True

    suffix = "_pred_512" if args.resize512 else "_pred"
    for slide_id in SLIDE_IDS:
        png_path = find_slide(slide_id)
        out_path = DATA_DIR / f"slide_{slide_id}{suffix}.ome.tiff"
        t0 = time.time()
        full_pred, _prob = predict_slide(
            model, png_path, device, resize512=args.resize512)
        keep, stack = write_ome_tiff(out_path, full_pred)
        print(f"  elapsed: {time.time() - t0:.1f}s")
        print_table(png_path.name, keep, stack)


if __name__ == "__main__":
    main()
