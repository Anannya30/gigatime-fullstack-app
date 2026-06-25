# GigaTIME — Installation Guide (Ubuntu server with an NVIDIA GPU)

This guide takes you from a fresh Ubuntu machine to a running app where you can
upload slides and read results. Follow the parts in order. Commands are meant to
be copy‑pasted into the terminal one block at a time.

> You only do Parts 1–7 **once**. After that, starting the app is a single command (Part 8).

---

## Part 0 — Check your machine first

Make sure your server has all of these before you start:

- [ ] **Ubuntu** 22.04 or 24.04
- [ ] An **NVIDIA GPU** (required — the AI will not run without it)
- [ ] At least **16 GB RAM** (you have 64 GB — great)
- [ ] At least **40 GB free disk space** (the AI software image alone is ~7 GB, plus slides)
- [ ] **Internet access** (to download Docker, the AI model, etc.)
- [ ] A **Gmail address** you will log in with and receive codes on

Check your GPU is visible to Ubuntu:

```bash
nvidia-smi
```

- If you see a table with your GPU → good, skip to Part 1.
- If you see *"command not found"* → install the driver:

```bash
sudo ubuntu-drivers autoinstall
sudo reboot
```

After the reboot, run `nvidia-smi` again — you should now see your GPU.

---

## Part 1 — Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
```

Then let your user run Docker without `sudo`:

```bash
sudo usermod -aG docker $USER
```

**Log out and log back in** (or reboot) so this takes effect. Test it:

```bash
docker run --rm hello-world
```

You should see *"Hello from Docker!"*. (Official guide: https://docs.docker.com/engine/install/ubuntu/)

---

## Part 2 — Let Docker use the GPU (NVIDIA Container Toolkit)

Copy‑paste this whole block:

```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

Test that Docker can see the GPU:

```bash
docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi
```

You should see your GPU table again. (Official guide:
https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)

---

## Part 3 — Get the project files

Download the project onto the server with Git:

```bash
git clone https://github.com/Anannya30/gigatime-fullstack-app.git
```

> If `git` isn't installed: `sudo apt update && sudo apt install -y git`, then run the clone again.
>
> Alternatively, download it as a ZIP from
> https://github.com/Anannya30/gigatime-fullstack-app → green **Code** button →
> **Download ZIP**, then unzip it on the server.

Go into the folder — **run every later command from here**:

```bash
cd gigatime-fullstack-app
```

---

## Part 4 — Get your Hugging Face token (for the AI model)

The AI model is downloaded from Hugging Face the first time you process a slide.
You need a free account, access to the model, and a token.

1. Create a free account: https://huggingface.co/join
2. Open the model page and click **"Agree and access repository"** (or **Request access**):
   https://huggingface.co/prov-gigatime/GigaTIME
3. Create a token: https://huggingface.co/settings/tokens
   - Click **New token** → Type: **Read** → create it.
   - Copy the token (looks like `hf_xxxxxxxx...`). You'll paste it in Part 6.

---

## Part 5 — Create a Gmail "App Password" (for login codes)

When you log in, the app emails you a 6‑digit code. To let it send email through
your Gmail, you need an **App Password** (a special 16‑character password — not
your normal Gmail password).

1. Turn on **2‑Step Verification** (required before app passwords appear):
   https://myaccount.google.com/security
2. Create the app password: https://myaccount.google.com/apppasswords
   - Name it "GigaTIME" and click **Create**.
   - Copy the 16‑character password it shows. You'll paste it in Part 6.

---

## Part 6 — Fill in the settings (two small files)

There are two settings files. Create them from the provided examples and edit them.

### 6a. The root settings file (database + access)

```bash
cp .env.example .env
nano .env
```

Set:

- `POSTGRES_PASSWORD` → any password you like (used only inside this machine).
- `ALLOWED_HOSTS` → leave as `*` (lets you open the app from your laptop).

Save and close (in `nano`: `Ctrl+O`, `Enter`, then `Ctrl+X`).

### 6b. The backend settings file (token, email, etc.)

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Fill in these values:

| Setting | What to put |
|---|---|
| `SECRET_KEY` | A long random value — generate one with the command below |
| `DEBUG` | `False` |
| `HF_TOKEN` | Your Hugging Face token from Part 4 |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USERNAME` | Your Gmail address |
| `SMTP_PASSWORD` | The 16‑char App Password from Part 5 |
| `EMAIL_USE_SSL` | `True` |
| `EMAIL_USE_TLS` | `False` |

To generate a `SECRET_KEY`, run this and paste the output:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

> You can leave every other line in the file as-is — the Google login, `DB_*`,
> and `FRONTEND_URL` lines are not needed for this setup.

Save and close.

---

## Part 7 — Create the scratch folder

```bash
mkdir -p ml/scratch
```

---

## Part 8 — Start the app

```bash
docker compose up --build -d
```

- The **first** run downloads and builds everything — this can take **10–30 minutes**. Be patient.
- Later starts take only a few seconds.

Check everything is running:

```bash
docker compose ps
```

All services should show `running` (or `healthy`). If one shows `exited`, see Troubleshooting.

---

## Part 9 — Create your login account

Run this once, using **the same Gmail** you set up in Part 5 (so codes reach you):

```bash
docker compose exec backend python manage.py create_gigatime_user \
  --email "you@gmail.com" \
  --password "ChooseAStrongPassword" \
  --first_name "Your Name" \
  --lab_name "Your Lab"
```

You should see `User created: you@gmail.com`.

---

## Part 10 — Open the app and log in

1. Open a browser and go to the app:
   - **If you're using the same machine that's running the app:** go to `http://localhost/`
   - **If you're opening it from a different computer (e.g. your laptop):** go to
     `http://SERVER_IP/`. To find `SERVER_IP`, run this on the server:
     ```bash
     hostname -I | awk '{print $1}'
     ```
     It prints one address like `192.168.1.50` — use that (so: `http://192.168.1.50/`).
2. Log in with the email + password from Part 9.
3. A **6‑digit code** is emailed to your Gmail — type it in to finish logging in.
   (No email? Check your spam folder and see Troubleshooting.)

---

## Part 11 — Upload a slide and get results

1. Go to the **Upload** page and select your slide file (`.svs` / `.tif`).
2. The slide starts processing. A **whole‑slide image is large and takes a while**
   (often 1–2 hours each on the GPU). You can watch live progress.
3. When done, open the **Results** page to see the 21 protein percentages and
   confidence scores, and to export them.

> The very first slide also downloads the AI model (one time), so it's slower than usual.

---

## Part 12 — Everyday commands

```bash
# Stop the app (keeps your data):
docker compose down

# Start it again later:
docker compose up -d

# See what's running:
docker compose ps

# View logs (e.g. if something looks stuck):
docker compose logs -f backend
docker compose logs -f celery     # the AI worker

# Update to a newer version of the code:
git pull
docker compose up --build -d
```

---

## Part 13 — Troubleshooting (common issues)

| What you see | What it means | Fix |
|---|---|---|
| **"Bad Request (400)"** in the browser | The server address isn't allowed | In `.env` set `ALLOWED_HOSTS=*`, then `docker compose up -d` |
| **No login code email arrives** | Email settings are off | Check `backend/.env`: `SMTP_PORT=465`, `EMAIL_USE_SSL=True`, `EMAIL_USE_TLS=False`, and that `SMTP_PASSWORD` is the **App Password** (not your Gmail password). Check spam. Then `docker compose up -d` |
| **Page loads but progress bars never move** | (Already fixed in this version) | Make sure you're on the latest code (`git pull`), rebuild |
| **A slide fails with a download/401/403 error** | Hugging Face token missing or no model access | Confirm `HF_TOKEN` is set in `backend/.env` and you clicked "access" on the model page (Part 4) |
| **The `celery` service won't start / "could not select device driver"** | Docker can't see the GPU | Re‑do Part 2, run `nvidia-smi`, and test `docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi` |
| **Build fails: "no space left on device"** | Disk is full | Free up space (need ~40 GB), then rebuild |
| **"port 80 is already allocated"** | Something else uses port 80 | Stop the other program, or ask the developer to change the port |

If you get stuck, copy the output of `docker compose logs backend` (or `celery`)
and send it over — it usually says exactly what's wrong.
