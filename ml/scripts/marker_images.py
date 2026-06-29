"""Generate 21 per-marker SPATIAL OVERVIEW images for ONE whole-slide image,
WITHOUT writing the multi-GB scratch / OME-TIFF.

Why the numbers are NOT affected (no result tampering):
  This reuses run_wsi_inference.run_inference EXACTLY -- same model, same tiling,
  same 50%-overlap band flushing, same per-pixel sigmoid>0.5 threshold, same
  full-resolution positive-pixel counting. The 21 percentages come from
  build_results() over those full-res counts, IDENTICALLY to a normal run.
  The ONLY thing we change is what happens to the spatial map: instead of writing
  every output pixel to a ~27 GB scratch memmap, we hand run_inference a
  DownsamplingCollector that shrinks each finished band into small in-RAM
  per-marker density grids (<= --max-side px). run_inference only does
  `scratch[:, dst0:dst1, :] = binary` and never reads it back, so swapping the
  storage cannot change the accumulated counts -- the percentages are byte-
  identical to a full run (this is the same trick percentages_only.py uses).

What you get:
  * <stem>_positive_markers.txt  -- the 21 corrected percentages (mpp-aware run)
  * <stem>/<NN>_<MARKER>.png      -- one image per marker: that protein's color
                                     painted over a faded H&E thumbnail, darker /
                                     more opaque where the protein is denser.
  * <stem>_markers_contact_sheet.png -- all 21 in one grid for a quick glance
  * <stem>_markers.zip           -- the 21 PNGs zipped, ready to send.

The per-marker image OPACITY is a visualisation of LOCAL positive-area fraction
(positives / pixels in that cell), shaped with a gentle sqrt for visibility. It
is a faithful average of the real predictions -- nothing is invented -- but it is
a *picture*; the quantitative answer is the percentages .txt.

Usage (inside the GPU Docker env):
    python marker_images.py <slide.svs> <out_dir> [--mpp 0.20] [--max-side 4000]
"""
import argparse
import colorsys
import sys
import time
import zipfile
from pathlib import Path

import numpy as np
import openslide
import torch
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import run_wsi_inference as wsi  # noqa: E402
from run_wsi_inference import (  # noqa: E402
    KEEP_NAMES,
    build_results,
    load_gigatime_model,
    plan_slide,
    read_native_mpp,
    run_inference,
)


class DownsamplingCollector:
    """Quacks like the (C, H, W) scratch memmap run_inference writes into, but
    instead of storing full resolution it accumulates small per-marker grids.

    run_inference only does `self[:, dst0:dst1, :] = binary` (a uint8 0/1 band of
    shape (C, n, W)) and never reads it back, so we just shrink each band into the
    grids. Per output cell we keep:
      * pos_sum[c]  -- number of positive full-res pixels for marker c
      * px_count    -- number of full-res pixels mapped into the cell (geometry)
    so pos_sum / px_count is the local positive-area fraction (0..1), the same
    quantity the global percentage sums to.
    """

    def __init__(self, shape, max_side):
        C, H, W = shape
        self.shape = shape
        scale = min(1.0, max_side / max(H, W))          # only ever downscale
        self.out_h = max(1, int(round(H * scale)))
        self.out_w = max(1, int(round(W * scale)))
        # full-res row/col -> target row/col (monotonic, surjective onto 0..out-1)
        self.tr_full = (np.arange(H) * self.out_h // H).astype(np.int64)
        tc_full = (np.arange(W) * self.out_w // W).astype(np.int64)
        # reduceat segment starts for columns + how many full cols fall in each
        self.col_start = np.searchsorted(tc_full, np.arange(self.out_w), "left")
        self.cc = np.add.reduceat(np.ones(W, np.float32), self.col_start)  # (out_w,)
        self.pos_sum = np.zeros((C, self.out_h, self.out_w), np.float32)
        self.px_count = np.zeros((self.out_h, self.out_w), np.float32)

    def __setitem__(self, key, value):
        dst0 = key[1].start or 0
        n = value.shape[1]
        # sum columns within each target column (vectorised), then rows per target
        vc = np.add.reduceat(value.astype(np.float32), self.col_start, axis=2)
        tr_band = self.tr_full[dst0:dst0 + n]
        for t in np.unique(tr_band):                    # ~12 target rows per band
            mask = tr_band == t
            self.pos_sum[:, t, :] += vc[:, mask, :].sum(axis=1)
            self.px_count[t, :] += float(mask.sum()) * self.cc

    def flush(self):
        pass

    def density(self):
        """(C, out_h, out_w) local positive-area fraction in 0..1."""
        return self.pos_sum / np.maximum(self.px_count, 1.0)[None]


def marker_colors(n):
    """n visually distinct, fairly saturated RGB colors (one per marker)."""
    out = []
    for i in range(n):
        r, g, b = colorsys.hsv_to_rgb(i / n, 0.85, 0.95)
        out.append(np.array([r * 255, g * 255, b * 255], np.float32))
    return out


def render_marker(density, he_bg, color, label, pct):
    """One marker image: `color` over the faded H&E `he_bg`, opacity from density.
    sqrt shaping makes faint-but-real signal visible without inventing anything."""
    alpha = np.sqrt(np.clip(density, 0.0, 1.0))[..., None]   # (h, w, 1)
    blended = he_bg * (1.0 - alpha) + color[None, None, :] * alpha
    img = Image.fromarray(blended.astype(np.uint8), "RGB")
    # title strip
    strip_h = 26
    canvas = Image.new("RGB", (img.width, img.height + strip_h), (20, 20, 20))
    canvas.paste(img, (0, strip_h))
    ImageDraw.Draw(canvas).text((6, 7), f"{label}   {pct:.2f}%", fill=(255, 255, 255))
    return canvas


def streaming_thumbnail(slide, out_w, out_h, strip_px=1024):
    """Build an (out_h, out_w, 3) RGB H&E thumbnail WITHOUT loading the whole
    slide. slide.get_thumbnail() reads the best level in one shot, but these
    slides are non-pyramidal (level_count == 1), so that would pull the full
    ~80k x 108k image (tens of GB) into RAM and OOM. Instead we read the slide
    in full-width horizontal strips, shrink each strip's width to out_w, and
    average its rows into the target grid -- peak memory is one strip.
    """
    W, H = slide.dimensions
    acc = np.zeros((out_h, out_w, 3), np.float64)
    cnt = np.zeros((out_h, 1), np.float64)
    for y0 in range(0, H, strip_px):
        h = min(strip_px, H - y0)
        strip = slide.read_region((0, y0), 0, (W, h)).convert("RGB")
        strip = strip.resize((out_w, h), Image.BILINEAR)        # shrink width only
        arr = np.asarray(strip, np.float64)                     # (h, out_w, 3)
        tr = (np.arange(y0, y0 + h) * out_h // H)               # src row -> target row
        for t in np.unique(tr):
            m = tr == t
            acc[t] += arr[m].sum(axis=0)
            cnt[t, 0] += float(m.sum())
    return (acc / np.maximum(cnt, 1.0)[..., None]).astype(np.float32)


def _label_font(size):
    """A readable TrueType font, falling back to PIL's bitmap default if no
    TrueType is installed in the container."""
    for name in ("DejaVuSans-Bold.ttf", "DejaVuSans.ttf", "Arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def contact_sheet(images, labels, cols=5, thumb_w=520):
    """Tile all marker images into one grid for a quick overview. Tiles are
    downscaled to thumb_w px wide so the sheet stays small and easy to open.
    Each tile gets its own readable label band drawn at sheet resolution -- the
    per-image title strip is baked in at full res, so it shrinks to a few
    illegible pixels once the tile is downscaled, hence the re-draw here."""
    scale = thumb_w / images[0].width
    tw, th = thumb_w, max(1, round(images[0].height * scale))
    band_h = 34
    font = _label_font(22)
    thumbs = [im.resize((tw, th), Image.BILINEAR) for im in images]
    rows = (len(images) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw, rows * (th + band_h)), (10, 10, 10))
    draw = ImageDraw.Draw(sheet)
    for i, im in enumerate(thumbs):
        x = (i % cols) * tw
        y = (i // cols) * (th + band_h)
        draw.text((x + 8, y + 7), labels[i], fill=(255, 255, 255), font=font)
        sheet.paste(im, (x, y + band_h))
    return sheet


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slide")
    ap.add_argument("out_dir")
    ap.add_argument("--mpp", type=float, default=None,
                    help="microns-per-pixel override (use 0.20 for these slides)")
    ap.add_argument("--max-side", type=int, default=4000,
                    help="longest side of the output images in pixels")
    ap.add_argument("--name", default=None,
                    help="output filename prefix (e.g. the original uploaded "
                         "name like 'slide1'); defaults to the slide file's stem")
    args = ap.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    # On-disk slides are stored under a UUID, so default to that stem but let the
    # caller pass the friendly uploaded name (e.g. --name slide1) for readable files.
    stem = args.name or Path(args.slide).stem

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if device.type != "cuda":
        sys.exit("ERROR: CUDA not available -- refusing to run on CPU.")
    print(f"device={device}  slide={args.slide}  max_side={args.max_side}", flush=True)

    model, device = load_gigatime_model(device)
    print("model loaded", flush=True)

    slide = openslide.OpenSlide(args.slide)
    try:
        mpp, mpp_source = read_native_mpp(slide, args.mpp)
        plan = plan_slide(slide, mpp, None)
        H, W = plan["true_h"], plan["true_w"]
        collector = DownsamplingCollector((len(wsi.KEEP_IDX), H, W), args.max_side)
        print(f"plan: H={H} W={W}  image={collector.out_w}x{collector.out_h}  "
              f"mpp={mpp} ({mpp_source})  n_tiles={plan['n_tiles']}", flush=True)

        def progress_cb(done, total, n_run, n_skip):
            if done % 10000 == 0 or done == total:
                print(f"  progress {done}/{total} ({100*done/total:.1f}%) "
                      f"run={n_run} skip={n_skip}", flush=True)

        t0 = time.time()
        (pos, prob_sum, posprob_sum, tissue_px, total, n_run,
         n_skip) = run_inference(slide, plan, model, device, collector,
                                 bg_skip=True, progress_cb=progress_cb)
        elapsed = time.time() - t0

        # H&E thumbnail at exactly the output grid size, faded so color stands
        # out. Streamed in strips because the slide is non-pyramidal and a plain
        # get_thumbnail() would read the whole full-res image into RAM (OOM).
        he = streaming_thumbnail(slide, collector.out_w, collector.out_h)
        he_bg = he * 0.45 + 255.0 * 0.55
    finally:
        slide.close()

    # --- corrected percentages (identical math to a normal run) ---
    results = build_results(Path(args.slide).name, plan, "(images only)", pos,
                            prob_sum, posprob_sum, tissue_px, total, n_run, n_skip,
                            elapsed, mpp_source=mpp_source)
    pct_by_name = {m["name"]: m["positive_pixel_pct"] for m in results["markers"]}
    txt = [
        "# GigaTIME positive-marker percentages (mpp-corrected)",
        f"# slide: {results['slide']}   mpp: {results['native_mpp']} ({mpp_source})",
        f"# output pixels: {total}   tissue pixels: {tissue_px}",
        f"# tiles: total={plan['n_tiles']} run={n_run} skipped={n_skip}",
        f"# elapsed: {round(elapsed,1)} s", "",
    ] + [f"{m['name']}: {m['positive_pixel_pct']:.2f}%" for m in results["markers"]]
    pct_path = out_dir / f"{stem}_positive_markers.txt"
    pct_path.write_text("\n".join(txt) + "\n")
    print("\n".join(txt), flush=True)

    # --- render + zip the 21 marker images ---
    density = collector.density()
    colors = marker_colors(len(KEEP_NAMES))
    images, png_paths = [], []
    for i, name in enumerate(KEEP_NAMES):
        img = render_marker(density[i], he_bg, colors[i], name, pct_by_name[name])
        p = out_dir / f"{i:02d}_{name}.png"
        img.save(p)
        images.append(img)
        png_paths.append(p)

    sheet_path = out_dir / f"{stem}_markers_contact_sheet.png"
    sheet_labels = [f"{name}  {pct_by_name[name]:.2f}%" for name in KEEP_NAMES]
    contact_sheet(images, sheet_labels).save(sheet_path)

    zip_path = out_dir / f"{stem}_markers.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for p in png_paths:
            z.write(p, p.name)
        z.write(sheet_path, sheet_path.name)
        z.write(pct_path, pct_path.name)

    print(f"\nWROTE {len(png_paths)} images + contact sheet + percentages", flush=True)
    print(f"ZIP : {zip_path}", flush=True)


if __name__ == "__main__":
    main()
