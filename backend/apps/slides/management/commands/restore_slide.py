"""Rebuild a Slide + SlideResult row from an on-disk results.json.

Used to recover slides whose Postgres rows were lost (e.g. a wiped DB volume)
while the source slide, the ``_pred.ome.tiff`` overlay, and the
``*.results.json`` produced by ``run_wsi_inference`` all survived on disk under
MEDIA_ROOT (``ml/data``). The marker_table is rebuilt in the exact shape the
Celery task writes (confidence_score = mean_sigmoid_positive), so the restored
slide is indistinguishable from a freshly-run one in the UI.

Example (run inside the backend container):

    python manage.py restore_slide \
        --email you@example.com \
        --results /app/ml/data/7c4f9903c4434ea48e68222d1e3c4545_pred.ome.tiff.results.json
"""

import json
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.slides.models import Slide, SlideResult, SlideStatus


def _wsi_marker_table(results):
    """Mirror apps.inference.tasks._wsi_marker_table so the restored row matches
    exactly what a live run would have persisted."""
    table = []
    for m in results["markers"]:
        sp = m.get("mean_sigmoid_positive")
        table.append({
            "marker": m["name"],
            "positive_pixel_pct": round(float(m["positive_pixel_pct"]), 2),
            "confidence_score": round(float(sp), 4) if sp is not None else 0.0,
            "mean_sigmoid_tissue": m.get("mean_sigmoid_tissue"),
            "paper_pearson": m.get("paper_pearson"),
        })
    return table


class Command(BaseCommand):
    help = "Recreate a Slide + SlideResult from an on-disk results.json."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True,
                            help="Email of the existing user who should own the slide.")
        parser.add_argument("--results", required=True,
                            help="Absolute path to the *.results.json file.")
        parser.add_argument("--source", default=None,
                            help="Absolute path to the source slide. Defaults to "
                                 "the results.json's 'slide' resolved under MEDIA_ROOT.")
        parser.add_argument("--filename", default=None,
                            help="Display filename. Defaults to the source basename.")

    def handle(self, *args, **opts):
        from django.conf import settings

        results_path = opts["results"]
        if not os.path.exists(results_path):
            raise CommandError(f"results.json not found: {results_path}")
        with open(results_path) as fh:
            results = json.load(fh)

        User = get_user_model()
        try:
            owner = User.objects.get(email=opts["email"])
        except User.DoesNotExist:
            raise CommandError(
                f"No user with email {opts['email']!r}. Sign up first, then re-run."
            )

        source = opts["source"] or os.path.join(
            str(settings.MEDIA_ROOT), results["slide"]
        )
        if not os.path.exists(source):
            raise CommandError(f"Source slide not found: {source}")

        # The download endpoint derives the overlay from the source stem.
        base, _ext = os.path.splitext(source)
        overlay = f"{base}_pred.ome.tiff"
        if not os.path.exists(overlay):
            self.stderr.write(self.style.WARNING(
                f"Overlay not found next to source ({overlay}); the slide will "
                f"restore but the OME-TIFF download will 404."
            ))

        filename = opts["filename"] or os.path.basename(source)
        tiles = results.get("tiles", {})
        tiles_total = tiles.get("total")

        # Reuse an existing row for this owner+path if one is somehow present,
        # so re-running is idempotent.
        slide, created = Slide.all_objects.update_or_create(
            owner=owner,
            file_path=source,
            defaults=dict(
                filename=filename,
                original_filename=filename,
                file_size=os.path.getsize(source),
                status=SlideStatus.COMPLETED,
                mpp_value=results.get("native_mpp"),
                mpp_source=results.get("mpp_source"),
                tiles_total=tiles_total,
                tiles_done=tiles_total or 0,
                started_at=timezone.now(),
                completed_at=timezone.now(),
                is_deleted=False,
            ),
        )

        SlideResult.objects.update_or_create(
            slide=slide,
            defaults={"marker_table": _wsi_marker_table(results)},
        )

        verb = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(
            f"{verb} slide {slide.id} ({filename}) for {owner.email} "
            f"with {len(results['markers'])} markers."
        ))
