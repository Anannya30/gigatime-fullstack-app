"""Standalone: compute the 21 positive-marker percentages for ONE slide WITHOUT
building the OME-TIFF.

Why this is correct (no new math, no risk of different numbers):
  * It reuses run_wsi_inference.run_inference EXACTLY -- the same tiling, the
    same 50%-overlap band flushing, the same per-channel accumulation as the
    real pipeline.
  * run_inference only reads ``scratch.shape`` and *assigns* finished bands into
    the scratch; it never reads the scratch contents back (that happens later in
    write_ome_streaming, which we deliberately skip). So we hand it a NoOpScratch
    that reports the right shape and discards every write -- no multi-GB memmap
    is allocated, and the accumulated counts are byte-identical to a full run.
  * The 21 percentages come from build_results' positive_pixel_pct, i.e.
    pos_counts[c] / (H*W) * 100 -- exactly the reduction the finalization does.

Usage: python percentages_only.py <slide_path> <out_txt>
Does NOT touch the DB, does NOT write an OME-TIFF, does NOT re-run anything else.
"""
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

    slide = openslide.OpenSlide(str(slide_path))
    try:
        native_mpp, mpp_source = read_native_mpp(slide, None)
        plan = plan_slide(slide, native_mpp, None)
        H, W = plan["true_h"], plan["true_w"]
        print(f"plan: H={H} W={W} n_tiles={plan['n_tiles']} "
              f"mpp={native_mpp} ({mpp_source})", flush=True)

        scratch = NoOpScratch((len(wsi.KEEP_IDX), H, W))

        def progress_cb(done, total, n_run, n_skip):
            if done % 10000 == 0 or done == total:
                pct = 100.0 * done / total
                print(f"  progress {done}/{total} ({pct:.1f}%) "
                      f"run={n_run} skip={n_skip}", flush=True)

        t0 = time.time()
        (pos, prob_sum, posprob_sum, tissue_px, total, n_run,
         n_skip) = run_inference(slide, plan, model, device,
                                 bg_skip=True, scratch=scratch,
                                 progress_cb=progress_cb)
        elapsed = time.time() - t0
    finally:
        slide.close()

    results = build_results(Path(slide_path).name, plan, "(no OME-TIFF)",
                            pos, prob_sum, posprob_sum, tissue_px, total,
                            n_run, n_skip, elapsed, mpp_source=mpp_source)

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
