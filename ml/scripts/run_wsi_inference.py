"""
GigaTIME inference on real whole-slide images (.svs / pyramidal .tif) at full
resolution, streaming tiles via OpenSlide so RAM stays bounded.

Reuses the validated model logic from run_png_inference.py UNCHANGED:
  load_model, normalize, do_inference_binary, CHANNEL_NAMES, BACKGROUND_CHANNELS,
  NUM_CLASSES, ImageNet normalization, 256x256 tiling, sigmoid > 0.5. The
  OME-TIFF writer and marker table are reimplemented to STREAM (the validated
  versions load the whole stack into RAM, which OOMs on a real WSI); the output
  format -- 21-channel binary OME-TIFF + per-marker positive-pixel % table -- is
  identical.

Resolution recipe (paper STAR Methods, "Details of generating virtual
population data"): each H&E slide is tiled into 128 um physical patches mapped
to 256x256 px model inputs (=> 0.5 um/px effective), with a 50%-overlap sliding
window to suppress edge artifacts. We read (128 / native_mpp) native px per
patch from the pyramid level at-or-above that resolution, then resize to 256 --
generalizing to ANY slide MPP. A slide with no MPP metadata falls back to
DEFAULT_MPP (0.25 um/px, a 40x scan) with a loud warning instead of crashing;
the result records mpp_source so a fallback is distinguishable from a real value.
Pass --mpp to override explicitly.

Memory-safe streaming:
  * tiles are read one at a time via OpenSlide read_region (RGBA -> drop alpha);
  * near-white / low-variance tiles are skipped (blank glass) unless --no-bg-skip;
  * overlapping sigmoid probabilities are summed in a rolling 2-tile-row band
    plus a per-pixel coverage count, averaged, thresholded once (sigmoid > 0.5),
    and finalized rows are flushed to a disk-backed scratch memmap;
  * the scratch memmap is transcoded to a compressed tiled OME-TIFF one channel
    at a time, so the full output stack never sits in RAM.

Usage:
    python scripts/run_wsi_inference.py --slide S.tif --output OUT.ome.tiff --dry-run
    python scripts/run_wsi_inference.py --slide S.tif --output OUT.ome.tiff \
        --region 20000 40000 4000 4000          # small-crop end-to-end test
    python scripts/run_wsi_inference.py --slide S.tif --output OUT.ome.tiff   # full slide
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import openslide
import tifffile
import torch
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import run_png_inference as rp  # noqa: E402  reuse the validated pipeline

# --- Paper inference recipe ---------------------------------------------------
PHYS_UM = 128.0           # physical patch size (um) -> one 256 px model input
MODEL_TILE = rp.TILE      # 256
OUT_STRIDE = MODEL_TILE // 2   # 128 px: paper's 50%-overlap sliding window
OVERLAP = 1.0 - OUT_STRIDE / MODEL_TILE   # 0.5
TARGET_MPP = PHYS_UM / MODEL_TILE         # 0.5 um/px effective (derived)

# Fallback MPP for slides that carry no resolution metadata. 0.25 um/px is the
# typical native resolution of a 40x scan, so it is the least-bad assumption when
# we cannot read the real value. Using it is recorded as mpp_source="assumed_
# default_0.25" so downstream consumers know the prediction relied on a guess.
DEFAULT_MPP = 0.25

# --- Background skip (cheap, on the 256-px RGB tile before normalize) ---------
BG_WHITE = 220            # pixels brighter than this are treated as glass
BG_MIN_TISSUE_FRAC = 0.05  # skip tile if < 5% of pixels are tissue
BG_MIN_STD = 5.0          # skip flat/blank tiles

KEEP_IDX = [i for i, n in enumerate(rp.CHANNEL_NAMES)
            if n not in rp.BACKGROUND_CHANNELS]
KEEP_NAMES = [rp.CHANNEL_NAMES[i] for i in KEEP_IDX]  # 21 analysis channels

# Per-channel test-set Pearson r from the GigaTIME paper (Fig 2B / S5): a FIXED
# published reliability value per protein, NOT computed from any slide. These are
# the honest "trustworthiness" indicator. Left as None until transcribed from the
# paper -- a None is reported verbatim as "n/a (see paper Fig 2B)" rather than a
# fabricated number. Fill from the paper, do not guess.
PAPER_PEARSON = {name: None for name in KEEP_NAMES}


def read_native_mpp(slide, override=None):
    """Return ``(mpp, mpp_source)`` -- the slide's microns-per-pixel and where it
    came from. ``mpp_source`` is "metadata" when the value is an explicit override
    or read from the slide, and "assumed_default_0.25" when no metadata was found
    and DEFAULT_MPP had to be assumed (a loud warning is printed in that case)."""
    if override is not None:
        mpp = float(override)
        if mpp <= 0:
            raise ValueError(f"--mpp must be positive, got {override!r}.")
        print(f"  MPP: {mpp} um/px (from --mpp override)")
        return mpp, "metadata"
    mx = slide.properties.get(openslide.PROPERTY_NAME_MPP_X)
    my = slide.properties.get(openslide.PROPERTY_NAME_MPP_Y)
    if mx is None:
        print("  " + "!" * 60)
        print(f"  WARNING: Slide has no MPP metadata (openslide.mpp-x missing).")
        print(f"  WARNING: Assuming DEFAULT_MPP = {DEFAULT_MPP} um/px (40x scan).")
        print(f"  WARNING: If the slide was NOT scanned at ~40x, predictions will")
        print(f"  WARNING: be at the wrong resolution. Pass --mpp to override.")
        print("  " + "!" * 60)
        return DEFAULT_MPP, "assumed_default_0.25"
    mpp = float(mx)
    if mpp <= 0:
        raise ValueError(f"Slide reports non-positive MPP ({mx!r}).")
    if my is not None and abs(float(my) - mpp) / mpp > 0.01:
        print(f"  WARNING: anisotropic MPP (x={mx}, y={my}); using x.")
    print(f"  MPP: {mpp} um/px (from slide metadata)")
    return mpp, "metadata"


def pick_level(slide, read_native_px):
    """Highest-downsample level whose downsample does not exceed the level-0 read
    ratio, so the residual resize only downsamples (never upsamples) to 256."""
    target_ds = read_native_px / MODEL_TILE
    best = 0
    for lvl, ds in enumerate(slide.level_downsamples):
        if ds <= target_ds + 1e-6:
            best = lvl
    return best, float(slide.level_downsamples[best])


def plan_slide(slide, mpp, region=None):
    """Read/output geometry for the 128 um, 50%-overlap recipe, optionally over a
    level-0 sub-rectangle (region=(ox, oy, w, h)) for the small-crop test."""
    w0, h0 = slide.dimensions
    ox, oy, rw, rh = region if region else (0, 0, w0, h0)
    read_native = PHYS_UM / mpp
    level, ds = pick_level(slide, read_native)
    read_at_level = int(round(read_native / ds))
    residual = read_at_level / MODEL_TILE
    stride_native = read_native * (1 - OVERLAP)

    nx = int(np.ceil((rw - read_native) / stride_native)) + 1 if rw > read_native else 1
    ny = int(np.ceil((rh - read_native) / stride_native)) + 1 if rh > read_native else 1
    out_w = (nx - 1) * OUT_STRIDE + MODEL_TILE   # band/grid width
    out_h = (ny - 1) * OUT_STRIDE + MODEL_TILE
    true_w = min(int(round(rw * mpp / TARGET_MPP)), out_w)  # crop trailing pad
    true_h = min(int(round(rh * mpp / TARGET_MPP)), out_h)

    return {
        "w0": w0, "h0": h0, "ox": ox, "oy": oy, "rw": rw, "rh": rh, "mpp": mpp,
        "read_native": read_native, "level": level, "level_ds": ds,
        "read_at_level": read_at_level, "residual": residual,
        "stride_native": stride_native, "nx": nx, "ny": ny, "n_tiles": nx * ny,
        "out_w": out_w, "out_h": out_h, "true_w": true_w, "true_h": true_h,
    }


def print_plan(slide, path, p):
    print(f"\n===== WSI plan: {Path(path).name} =====")
    print(f"  level-0 dims      : {p['w0']} x {p['h0']} px")
    if (p['ox'], p['oy'], p['rw'], p['rh']) != (0, 0, p['w0'], p['h0']):
        print(f"  region (level-0)  : x={p['ox']} y={p['oy']} {p['rw']} x {p['rh']} px")
    print(f"  pyramid levels    : {slide.level_count}  "
          f"downsamples={tuple(round(float(d), 3) for d in slide.level_downsamples)}")
    print(f"  native MPP        : {p['mpp']:.4f} um/px")
    print(f"  effective MPP     : {TARGET_MPP:.4f} um/px (128 um -> 256 px)")
    print(f"  read window       : {p['read_native']:.1f} native px / 128 um")
    print(f"  chosen level      : {p['level']} (downsample {p['level_ds']:.3f})")
    print(f"  read @ level      : {p['read_at_level']} px -> resize to {MODEL_TILE}")
    print(f"  residual resize   : {p['residual']:.4f}x (>=1 means downsample)")
    print(f"  sliding stride    : {p['stride_native']:.1f} native px ({int(OVERLAP*100)}% overlap)")
    print(f"  tile grid         : {p['nx']} x {p['ny']} = {p['n_tiles']} tiles")
    print(f"  output canvas     : {p['true_w']} x {p['true_h']} px @ {TARGET_MPP} um/px")


def is_background(rgb256):
    """True for near-white / flat tiles (blank glass) -- cheap, no model call."""
    g = rgb256.mean(axis=2)
    if g.std() < BG_MIN_STD:
        return True
    return float((g < BG_WHITE).mean()) < BG_MIN_TISSUE_FRAC


def read_tile(slide, p, tx, ty):
    """Read one 256x256 RGB tile (alpha stripped, residual-resized) for grid cell
    (tx, ty). Out-of-bounds reads come back transparent -> black (= zero pad)."""
    x0 = p["ox"] + int(round(tx * p["stride_native"]))
    y0 = p["oy"] + int(round(ty * p["stride_native"]))
    n = p["read_at_level"]
    region = slide.read_region((x0, y0), p["level"], (n, n))  # RGBA PIL image
    rgb = np.asarray(region)[..., :3]                          # drop alpha
    if rgb.shape[0] != MODEL_TILE or rgb.shape[1] != MODEL_TILE:
        rgb = np.asarray(Image.fromarray(rgb).resize(
            (MODEL_TILE, MODEL_TILE), Image.BILINEAR))
    return np.ascontiguousarray(rgb)


def run_inference(slide, p, model, device, scratch, bg_skip=True,
                  progress_cb=None, progress_every=500):
    """Stream the slide tile-by-tile into ``scratch`` (a [21, H, W] uint8 memmap).
    Returns (pos_counts, prob_sum, posprob_sum, tissue_px, total, n_run, n_skip).
    ``prob_sum`` sums the coverage-averaged sigmoid probability over tissue pixels
    (coverage > 0); ``tissue_px`` counts those pixels, so prob_sum/tissue_px is
    the mean activation over tissue. ``posprob_sum`` sums probability over only
    the positive pixels (sigmoid > 0.5), so posprob_sum/pos_counts is the mean
    confidence on the pixels the model called positive -- the same semantics as
    run_png_inference's confidence_score, used for the product marker table."""
    C, H, W = scratch.shape
    BW = p["out_w"]
    prob_band = np.zeros((C, MODEL_TILE, BW), np.float32)
    count_band = np.zeros((MODEL_TILE, BW), np.int32)
    pos_counts = np.zeros(C, np.int64)
    prob_sum = np.zeros(C, np.float64)
    posprob_sum = np.zeros(C, np.float64)
    tissue_px = np.zeros(1, np.int64)   # shared count of covered (tissue) pixels
    n_run = n_skip = 0
    t0 = time.time()

    def flush(out_row_base):
        """Finalize the top 128 band rows -> scratch, then accumulate positives
        and tissue-pixel sigmoid sums."""
        dst0 = out_row_base
        dst1 = min(out_row_base + OUT_STRIDE, H)
        if dst1 <= dst0:
            return
        n = dst1 - dst0
        cnt = count_band[:n, :W]
        avg = prob_band[:, :n, :W] / np.maximum(cnt, 1)[None]
        covered = cnt > 0                                   # tissue pixels
        binary = ((avg > 0.5) & covered[None]).astype(np.uint8)
        scratch[:, dst0:dst1, :] = binary
        pos_counts[:] += binary.sum(axis=(1, 2), dtype=np.int64)
        prob_sum[:] += (avg * covered[None]).sum(axis=(1, 2))
        posprob_sum[:] += (avg * binary).sum(axis=(1, 2))
        tissue_px[0] += int(covered.sum())

    for ty in range(p["ny"]):
        for tx in range(p["nx"]):
            rgb = read_tile(slide, p, tx, ty)
            ox = tx * OUT_STRIDE
            if bg_skip and is_background(rgb):
                n_skip += 1
            else:
                n_run += 1
                _, prob = rp.do_inference_binary(model, rp.normalize(rgb), device)
                prob_band[:, :, ox:ox + MODEL_TILE] += prob[KEEP_IDX]
                count_band[:, ox:ox + MODEL_TILE] += 1
            done = ty * p["nx"] + tx + 1
            if done % 2000 == 0 or done == p["n_tiles"]:
                rate = done / max(time.time() - t0, 1e-6)
                print(f"  tiles {done}/{p['n_tiles']}  run={n_run} skip={n_skip}  "
                      f"({rate:.0f} tiles/s)")
            if progress_cb and (done % progress_every == 0 or done == p["n_tiles"]):
                progress_cb(done, p["n_tiles"], n_run, n_skip)

        flush(ty * OUT_STRIDE)                       # top 128 rows are final
        prob_band[:, :OUT_STRIDE, :] = prob_band[:, OUT_STRIDE:, :]
        prob_band[:, OUT_STRIDE:, :] = 0
        count_band[:OUT_STRIDE, :] = count_band[OUT_STRIDE:, :]
        count_band[OUT_STRIDE:, :] = 0

    flush(p["ny"] * OUT_STRIDE)                       # last carried 128 rows
    return (pos_counts, prob_sum, posprob_sum, int(tissue_px[0]),
            H * W, n_run, n_skip)


def write_ome_streaming(out_path, scratch):
    """Transcode the [21, H, W] uint8 scratch memmap to a compressed tiled
    OME-TIFF, one 256-tile at a time (RAM stays at one tile). Same format as
    run_png_inference.write_ome_tiff: minisblack, zlib, tile 256, CYX + names."""
    C, H, W = scratch.shape

    def tiles():
        for c in range(C):
            plane = scratch[c]
            for y in range(0, H, MODEL_TILE):
                for x in range(0, W, MODEL_TILE):
                    t = plane[y:y + MODEL_TILE, x:x + MODEL_TILE]
                    if t.shape != (MODEL_TILE, MODEL_TILE):
                        pad = np.zeros((MODEL_TILE, MODEL_TILE), np.uint8)
                        pad[:t.shape[0], :t.shape[1]] = t
                        t = pad
                    yield np.ascontiguousarray(t)

    metadata = {"axes": "CYX", "Channel": {"Name": list(KEEP_NAMES)}}
    with tifffile.TiffWriter(out_path, bigtiff=True, ome=True) as tw:
        tw.write(tiles(), shape=(C, H, W), dtype=np.uint8,
                 photometric="minisblack", compression="zlib",
                 tile=(MODEL_TILE, MODEL_TILE), metadata=metadata)
    print(f"  wrote {out_path}  ({C}, {H}, {W}) uint8")


def build_results(slide_filename, plan, output_path, pos_counts, prob_sum,
                  posprob_sum, tissue_px, total, n_run, n_skip, elapsed,
                  mpp_source="metadata"):
    """Assemble the slide -> 21-marker result as a plain dict (JSON-serializable),
    so a frontend/API can consume it directly instead of scraping terminal output.

    Per marker we report numbers, each labelled by its source:
      * positive_pixel_pct   -- from THIS slide: % of output pixels predicted
        positive (sigmoid > 0.5), over the whole output canvas.
      * mean_sigmoid_tissue  -- from THIS slide: mean coverage-averaged sigmoid
        probability over tissue pixels (how strongly the model activates). None
        if no tissue pixels were processed.
      * mean_sigmoid_positive -- from THIS slide: mean sigmoid over only the
        positive pixels (same semantics as run_png_inference's confidence_score);
        None when the marker has no positive pixels.
      * paper_pearson        -- from the PAPER (Fig 2B / S5): fixed published
        test-set Pearson r for that protein. None until transcribed -- never
        fabricated per-slide.
    """
    markers = []
    for i, name in enumerate(KEEP_NAMES):
        pos = int(pos_counts[i])
        markers.append({
            "name": name,
            "positive_pixel_pct": round(float(pos) / total * 100.0, 4),
            "mean_sigmoid_tissue": (round(float(prob_sum[i]) / tissue_px, 4)
                                    if tissue_px else None),
            "mean_sigmoid_positive": (round(float(posprob_sum[i]) / pos, 4)
                                      if pos else None),
            "paper_pearson": PAPER_PEARSON.get(name),
        })
    return {
        "slide": slide_filename,
        "output_path": output_path,
        "native_mpp": round(float(plan["mpp"]), 5),
        "mpp_source": mpp_source,
        "effective_mpp": TARGET_MPP,
        "output_dims": {"width": plan["true_w"], "height": plan["true_h"]},
        "total_output_pixels": total,
        "tissue_pixels": tissue_px,
        "tiles": {"total": plan["n_tiles"], "run": n_run, "skipped": n_skip},
        "elapsed_sec": round(float(elapsed), 1),
        "markers": markers,
    }


def print_table(results):
    """Render the result dict as a Marker | Pos% | mean-sigmoid | paper-r table.
    Pos% and mean-sigmoid are from this slide; paper-r is the paper's value."""
    markers = results["markers"]
    width = 64
    print("\n" + "=" * width)
    print(f" Slide: {results['slide']} ".center(width))
    print("=" * width)
    print(f"  pos% & mean-sigmoid = THIS slide | paper-r = paper Fig 2B")
    print("-" * width)
    print(f"{'Marker':<14}{'Positive %':>12}{'mean sigmoid':>16}{'paper r':>12}")
    print(f"{'':<14}{'(slide)':>12}{'(slide, tissue)':>16}{'(paper)':>12}")
    print("-" * width)
    for m in markers:
        ms = "n/a" if m["mean_sigmoid_tissue"] is None else f"{m['mean_sigmoid_tissue']:.3f}"
        pr = "n/a" if m["paper_pearson"] is None else f"{m['paper_pearson']:.2f}"
        print(f"{m['name']:<14}{m['positive_pixel_pct']:>12.2f}{ms:>16}{pr:>12}")
    print("-" * width)
    by_pos = sorted(markers, key=lambda m: m["positive_pixel_pct"])
    print(f"Highest expression: {by_pos[-1]['name']} ({by_pos[-1]['positive_pixel_pct']:.2f}%)")
    print(f"Lowest expression : {by_pos[0]['name']} ({by_pos[0]['positive_pixel_pct']:.2f}%)")
    print("=" * width)


def load_gigatime_model(device=None):
    """Load the GigaTIME model (reuses run_png_inference.load_model). Returns
    (model, device). Importable by a Celery worker / API so the model is loaded
    once and reused across slides."""
    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if device.type == "cuda":
        torch.backends.cudnn.benchmark = True
    return rp.load_model(device), device


def infer_slide(slide_path, output_path, model, device, *, mpp=None, region=None,
                bg_skip=True, progress_cb=None, keep_scratch=False,
                write_json=True, quiet=False):
    """Core entry point -- a whole-slide image -> 21-marker result dict.

    Opens ``slide_path`` with OpenSlide, plans the 128 um / 50%-overlap tiling,
    streams inference into a disk-backed scratch memmap, writes the OME-TIFF to
    ``output_path``, and returns the JSON-ready results dict (see build_results).
    Designed to be called from a Celery worker / API as well as the CLI -- it
    only prints, never reads stdin, and frees the scratch + slide on the way out.

    ``progress_cb(done, total, n_run, n_skip)`` is invoked periodically during
    inference so a caller can stream a live tiles-processed progress bar.
    """
    slide = openslide.OpenSlide(str(slide_path))
    try:
        native_mpp, mpp_source = read_native_mpp(slide, mpp)
        plan = plan_slide(slide, native_mpp, region)
        if not quiet:
            print_plan(slide, slide_path, plan)
        H, W = plan["true_h"], plan["true_w"]
        scratch_path = f"{output_path}.scratch.dat"
        scratch = np.memmap(scratch_path, dtype=np.uint8, mode="w+",
                            shape=(len(KEEP_IDX), H, W))
        try:
            t0 = time.time()
            (pos, prob_sum, posprob_sum, tissue_px, total, n_run,
             n_skip) = run_inference(slide, plan, model, device,
                                     bg_skip=bg_skip, scratch=scratch,
                                     progress_cb=progress_cb)
            elapsed = time.time() - t0
            scratch.flush()
            if not quiet:
                print(f"\nInference done in {elapsed:.1f}s  (ran {n_run}, "
                      f"skipped {n_skip} of {plan['n_tiles']} tiles)")
            write_ome_streaming(output_path, scratch)
        finally:
            del scratch
            if not keep_scratch and os.path.exists(scratch_path):
                os.remove(scratch_path)
        results = build_results(Path(slide_path).name, plan, str(output_path),
                                pos, prob_sum, posprob_sum, tissue_px, total,
                                n_run, n_skip, elapsed, mpp_source=mpp_source)
        if write_json:
            with open(f"{output_path}.results.json", "w") as f:
                json.dump(results, f, indent=2)
        return results
    finally:
        slide.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slide", required=True, help="path to .svs / pyramidal .tif")
    ap.add_argument("--output", help="output OME-TIFF path")
    ap.add_argument("--mpp", type=float, default=None,
                    help="override microns-per-pixel when metadata lacks it")
    ap.add_argument("--region", type=int, nargs=4, metavar=("X", "Y", "W", "H"),
                    help="process only this level-0 sub-rectangle (test crop)")
    ap.add_argument("--no-bg-skip", action="store_true",
                    help="run the model on every tile, including blank glass")
    ap.add_argument("--keep-scratch", action="store_true",
                    help="keep the intermediate scratch memmap file")
    ap.add_argument("--dry-run", action="store_true",
                    help="print geometry and exit (no model load, no inference)")
    args = ap.parse_args()

    region = tuple(args.region) if args.region else None
    if args.dry_run:
        slide = openslide.OpenSlide(args.slide)
        print(f"Opened {args.slide}")
        mpp, _mpp_source = read_native_mpp(slide, args.mpp)
        plan = plan_slide(slide, mpp, region)
        print_plan(slide, args.slide, plan)
        slide.close()
        print("\n[dry-run] geometry only; stopping before inference.")
        return
    if not args.output:
        raise SystemExit("--output is required unless --dry-run.")

    model, device = load_gigatime_model()
    print(f"\nDevice: {device}")
    results = infer_slide(
        args.slide, args.output, model, device, mpp=args.mpp, region=region,
        bg_skip=not args.no_bg_skip, keep_scratch=args.keep_scratch)
    print_table(results)
    t = results["tiles"]
    print(f"\nTiles: ran {t['run']} / skipped {t['skipped']} / total {t['total']}")
    print(f"Results JSON: {args.output}.results.json")
    return results


if __name__ == "__main__":
    main()
