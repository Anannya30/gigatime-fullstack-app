"""Run one or more PNG images through the GigaTIME PNG inference path and write a
single combined .txt report: per file -> file name, file size, and the 21
positive-marker percentages.

Reuses run_png_inference EXACTLY (load_model, predict_slide, CHANNEL_NAMES,
BACKGROUND_CHANNELS) so the numbers match the app's PNG pipeline. The two
background channels (TRITC, Cy5) are excluded, leaving the 21 analysis markers.

Usage: python png_percentages.py <out_txt> <img1.png> [img2.png ...]
"""
import sys
from pathlib import Path

import torch

import run_png_inference as rp


def marker_percentages(binary_stack):
    """[(name, positive_pixel_pct)] for the 21 analysis channels, same reduction
    as the backend's _build_marker_table: positives / total_pixels * 100."""
    h, w = binary_stack.shape[1], binary_stack.shape[2]
    total = h * w
    out = []
    for idx, name in enumerate(rp.CHANNEL_NAMES):
        if name in rp.BACKGROUND_CHANNELS:
            continue
        positive = int((binary_stack[idx] == 1).sum())
        pct = round(positive / total * 100.0, 2) if total else 0.0
        out.append((name, pct))
    return out


def human_size(n):
    size = float(n)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{int(n)} B" if unit == "B" else f"{size:.2f} {unit}"
        size /= 1024


def main():
    if len(sys.argv) < 3:
        print("usage: python png_percentages.py <out_txt> <img1.png> [img2.png ...]",
              file=sys.stderr)
        sys.exit(2)
    out_txt = sys.argv[1]
    paths = [Path(p) for p in sys.argv[2:]]

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device={device}", flush=True)
    model = rp.load_model(device)
    print("model loaded", flush=True)

    blocks = []
    for p in paths:
        size = p.stat().st_size
        print(f"==> inferring {p.name} ...", flush=True)
        binary_stack, _prob_stack = rp.predict_slide(model, p, device)
        pcts = marker_percentages(binary_stack)

        lines = [
            "=" * 64,
            f"File: {p.name}",
            f"Size: {human_size(size)} ({size} bytes)",
            "-" * 64,
            "21 positive-marker percentages:",
        ]
        for name, pct in pcts:
            lines.append(f"  {name:<12} {pct:6.2f}%")
        blocks.append("\n".join(lines))

    header = "# GigaTIME PNG positive-marker percentages\n"
    text = header + "\n" + "\n\n".join(blocks) + "\n"
    with open(out_txt, "w") as f:
        f.write(text)
    print("\n" + text, flush=True)
    print(f"WROTE {out_txt}", flush=True)


if __name__ == "__main__":
    main()
