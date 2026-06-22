"""Compute the 21 positive-marker percentages for ONE slide WITHOUT building
the OME-TIFF and WITHOUT a multi-GB scratch memmap on disk.

Why this is correct (no new math, no risk of different numbers):
  * It reuses run_wsi_inference.run_inference EXACTLY -- the same tiling, the
    same 50%-overlap band flushing, the same per-channel accumulation as the
    real pipeline. run_wsi_inference itself is never modified, so the original
    OME-TIFF pipeline (infer_slide) stays available untouched as a fallback.
  * run_inference only reads ``scratch.shape`` and *assigns* finished bands into
    the scratch; it never reads the scratch contents back (that happens later in
    write_ome_streaming, which we deliberately skip). So we hand it a NoOpScratch
    that reports the right shape and discards every write -- no multi-GB memmap
    is allocated, and the accumulated counts are byte-identical to a full run.
  * The 21 percentages come from build_results' positive_pixel_pct, i.e.
    pos_counts[c] / (H*W) * 100 -- exactly the reduction the finalization does.

Two entry points:
  * ``infer_percentages(slide_path, model, device, ...)`` -- importable by the
    Celery worker / API: pass a preloaded model + device and an optional
    progress_cb, get back run_wsi_inference's results dict. Does NOT touch the
    DB and writes no OME-TIFF; optionally writes the small results.json.
  * the CLI below -- ``python percentages_only.py <slide_path> <out_txt>`` --
    loads the model itself and writes the percentages to a text file.
"""
import json
import sys
import time
from pathlib import Path

import torch
import openslide

import run_wsi_inference as wsi
from run_wsi_inference import (
    read_native_mpp,
    plan_slide,
    run_inference,
    build_results,
    load_gigatime_model,
)


class NoOpScratch:
    """Quacks like the (C, H, W) scratch memmap for run_inference, but discards
    every band write. run_inference reads only ``.shape`` and does
    ``scratch[:, dst0:dst1, :] = binary`` -- it never reads the data back -- so
    dropping the writes leaves the accumulated counts identical to a real run."""

    def __init__(self, shape):
        self.shape = shape

    def __setitem__(self, key, value):
        pass  # intentionally discard -- we only need the accumulators

    def flush(self):
        pass


def infer_percentages(slide_path, model, device, *, mpp=None, region=None,
                      bg_skip=True, progress_cb=None, json_path=None,
                      write_json=False, quiet=True):
    """One slide -> run_wsi_inference results dict, computing ONLY the positive-
    marker percentages (no OME-TIFF, no scratch memmap).

    Designed to be called from the Celery worker / API as well as the CLI:
    pass a model preloaded via load_gigatime_model and the same device, plus an
    optional ``progress_cb(done, total, n_run, n_skip)`` for a live progress
    bar. When ``write_json`` and ``json_path`` are given, the small results.json
    is written there (same content as the full pipeline) so the restore_slide
    recovery command keeps working even though no OME-TIFF exists.
    """
    slide = openslide.OpenSlide(str(slide_path))
    try:
        native_mpp, mpp_source = read_native_mpp(slide, mpp)
        plan = plan_slide(slide, native_mpp, region)
        H, W = plan["true_h"], plan["true_w"]
        if not quiet:
            print(f"plan: H={H} W={W} n_tiles={plan['n_tiles']} "
                  f"mpp={native_mpp} ({mpp_source})", flush=True)
        scratch = NoOpScratch((len(wsi.KEEP_IDX), H, W))
        t0 = time.time()
        (pos, prob_sum, posprob_sum, tissue_px, total, n_run,
         n_skip) = run_inference(slide, plan, model, device, scratch,
                                 bg_skip=bg_skip, progress_cb=progress_cb)
        elapsed = time.time() - t0
    finally:
        slide.close()

    results = build_results(Path(slide_path).name, plan, "(no OME-TIFF)",
                            pos, prob_sum, posprob_sum, tissue_px, total,
                            n_run, n_skip, elapsed, mpp_source=mpp_source)
    if write_json and json_path:
        with open(json_path, "w") as f:
            json.dump(results, f, indent=2)
    return results


def main():
    slide_path = sys.argv[1]
    out_txt = sys.argv[2]

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if device.type != "cuda":
        print("ERROR: CUDA not available -- refusing to run on CPU (would take "
              "days for a whole-slide image).", flush=True)
        sys.exit(1)
    print(f"device={device}  slide={slide_path}", flush=True)

    model, device = load_gigatime_model(device)
    print("model loaded", flush=True)

    def progress_cb(done, total, n_run, n_skip):
        if done % 10000 == 0 or done == total:
            pct = 100.0 * done / total
            print(f"  progress {done}/{total} ({pct:.1f}%) "
                  f"run={n_run} skip={n_skip}", flush=True)

    results = infer_percentages(slide_path, model, device,
                                progress_cb=progress_cb, quiet=False)

    lines = [
        "# GigaTIME positive-marker percentages",
        f"# slide: {results['slide']}",
        f"# output pixels: {results['total_output_pixels']}   "
        f"tissue pixels: {results['tissue_pixels']}",
        f"# tiles: total={results['tiles']['total']} "
        f"run={results['tiles']['run']} skipped={results['tiles']['skipped']}",
        f"# elapsed: {results['elapsed_sec']} s",
        "",
    ]
    for m in results["markers"]:
        lines.append(f"{m['name']}: {m['positive_pixel_pct']:.2f}%")
    text = "\n".join(lines) + "\n"

    with open(out_txt, "w") as f:
        f.write(text)
    print("\n" + text, flush=True)
    print(f"WROTE {out_txt}", flush=True)


if __name__ == "__main__":
    main()
