# GigaTIME - Claude Code Instructions

## Environment
- Always use the `gigatime` conda environment
- Activate with: `source ~/miniforge3/etc/profile.d/conda.sh && conda activate gigatime`
- Python 3.11, PyTorch with CUDA 13.0

## Project Structure
- `data/` — sample test data (extracted from zip)
- `scripts/` — project scripts

## Common Commands
- Activate env: `conda activate gigatime`
- Run scripts: `python scripts/<script_name>.py`

## Notes
- GPU is available (torch.cuda.is_available() = True)
- HF_TOKEN must be set before pulling pretrained models

## Environment Variables
- HF_TOKEN — required for model download, set in ~/.bashrc
