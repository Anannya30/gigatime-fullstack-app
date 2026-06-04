"""Diagnose why CD20's Pearson is 0.0 in the eval.
Reuses the notebook's own cells for setup, then runs a custom per-channel
diagnostic over the test loader (variance of box-counts decides Pearson NaN).
"""
import json, os, sys
import matplotlib; matplotlib.use("Agg")
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE); sys.path.insert(0, HERE)
import numpy as np, torch, torch.nn.functional as F

nb = json.load(open("gigatime_testing.ipynb"))
code = {i: "".join(c["source"]) for i, c in enumerate(nb["cells"]) if c["cell_type"] == "code"}
ns = {"__name__": "__main__"}
for i in [1, 3, 5, 7, 9, 10, 11, 15, 16]:        # imports..dataset..model..do_inference
    exec(code[i], ns)
    if i == 1:
        import tqdm as _t; ns["tqdm"] = _t

ch = ns["common_channel_list"]
cd20 = ch.index("CD20")
do_inference = ns["do_inference"]; model = ns["model"]; device = ns["device"]
split_into_boxes = ns["split_into_boxes"]; count_ones = ns["count_ones"]
test_loader = ns["test_loader"]; config = ns["config"]

box = 8
model.eval()
n_imgs = 0
n_target_const = 0     # images where CD20 target box-counts are constant
n_pred_const = 0       # images where CD20 prediction box-counts are constant
n_valid = 0            # images where BOTH vary -> real per-image Pearson
n_target_has_signal = 0
with torch.no_grad():
    for input, target_g, name in test_loader:
        downs = F.interpolate(target_g, scale_factor=1/8, mode="bilinear", align_corners=False)
        target = F.interpolate(downs, size=(512, 512), mode="bilinear", align_corners=False).to(device)
        logits = do_inference(input.to(device), model, 256)
        pred = (torch.sigmoid(logits) > 0.5).float().to(device)

        pred_counts = count_ones(split_into_boxes(pred, box))[:, cd20]   # (B,ny,nx)
        mask_counts = count_ones(split_into_boxes(target, box))[:, cd20]

        for bi in range(input.shape[0]):
            n_imgs += 1
            pc = pred_counts[bi].flatten().cpu().numpy().astype(float)
            mc = mask_counts[bi].flatten().cpu().numpy().astype(float)
            tconst = (mc.var() == 0); pconst = (pc.var() == 0)
            if mc.sum() > 0: n_target_has_signal += 1
            if tconst: n_target_const += 1
            if pconst: n_pred_const += 1
            if not tconst and not pconst: n_valid += 1

print(f"\n=== CD20 per-image Pearson breakdown over {n_imgs} test images ===")
print(f"  images where CD20 TARGET has any signal (post-processing) : {n_target_has_signal}")
print(f"  images where CD20 TARGET box-counts are constant -> NaN   : {n_target_const}")
print(f"  images where CD20 PREDICTION box-counts are constant->NaN : {n_pred_const}")
print(f"  images where BOTH vary -> a real Pearson is produced      : {n_valid}")
print(f"\n  => per-image Pearson is NaN for ALL images: {n_valid == 0}")
print(f"     channel value = np.nanmean([all NaN]) = NaN -> test() skips the")
print(f"     update (`if not np.isnan(value)`), so the AverageMeter stays at its")
print(f"     initial 0.0. That 0.0 is what shows in the table.")

# Compare: what fraction of CD20 survives the dataset's cell-thresholding vs raw
print("\n--- one-time check: CD20 after dataset processing vs raw, patch 0 ---")
ds = ns["test_dataset"]
img0, mask0, _ = ds[0]
print("dataset-returned mask CD20 positive pixels (post cell_mask_label):",
      int((mask0[cd20] > 0.5).sum()), "of", mask0[cd20].size)
