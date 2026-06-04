"""
Setup-verification runner for GigaTIME.
Executes the CORE cells of gigatime_testing.ipynb in order:
  imports -> config -> metrics helpers -> dataset -> model load (HF) -> test()
Applies two minimal, well-understood fixes so the tutorial runs on the
installed package versions:
  * make `tqdm` refer to the module (notebook cell 20 calls tqdm.tqdm)
Skips ONLY the optional color-plot cells (13, 17) which rely on the
matplotlib<3.9 `plt.cm.get_cmap` API. None of the model/inference logic
is altered.
"""
import json, os, sys
import matplotlib
matplotlib.use("Agg")            # headless: plt.show() returns instead of blocking on a display

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)                      # so "./../data/..." and local imports resolve
sys.path.insert(0, HERE)

nb = json.load(open("gigatime_testing.ipynb"))
code = {i: "".join(c["source"]) for i, c in enumerate(nb["cells"])
        if c["cell_type"] == "code"}

ns = {"__name__": "__main__"}

# Core cells only, in notebook order. 13 & 17 (plotting) and 18 (empty) skipped.
CORE = [1, 3, 5, 7, 9, 10, 11, 15, 16, 20, 21, 22]

for i in CORE:
    print(f"\n===== executing notebook cell [{i}] =====", flush=True)
    exec(code[i], ns)
    # right after the import cell, make tqdm the MODULE (cell 20 uses tqdm.tqdm)
    if i == 1:
        import tqdm as _tqdm_mod
        ns["tqdm"] = _tqdm_mod

print("\n===== DONE =====")
# cell 22 builds result_df (Pearson per channel); show it if present
if "result_df" in ns:
    df = ns["result_df"]
    cols = [c for c in ["Channel", "Pearson Correlation"] if c in df.columns]
    print("\nPearson correlation per channel (50-patch sample test set):")
    print(df[cols].to_string(index=False))
    print(f"\nMean Pearson across {len(df)} analysis channels: "
          f"{df['Pearson Correlation'].mean():.4f}")
    # save the bar chart that cell 22's plt.show() would have displayed
    try:
        import matplotlib.pyplot as plt
        out = os.path.join(HERE, "scratch", "pearson_by_channel.png")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        plt.savefig(out, dpi=120, bbox_inches="tight")
        print(f"\nSaved bar chart -> {out}")
    except Exception as e:
        print("(figure save skipped:", e, ")")
