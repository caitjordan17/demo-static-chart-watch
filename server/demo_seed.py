"""Synthetic demo data for ChartWatch.

This module is intentionally separate from app.py so the demo dataset can be
swapped out or deleted without changing the application itself.
"""

from datetime import datetime, timedelta
import os
import random


def _make_demo_pdf(path, title, patient, mrn, pages):
    """Create a clearly synthetic, text-only PDF with the requested page count."""
    if os.path.exists(path):
        return

    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

    c = canvas.Canvas(path, pagesize=letter)
    width, height = letter
    for page in range(1, pages + 1):
        c.setFont("Helvetica-Bold", 13)
        c.drawString(54, height - 54, "CHARTWATCH DEMO — SYNTHETIC RECORD")
        c.setFont("Helvetica", 9)
        c.drawString(54, height - 72, f"Demo chart: {title}")
        c.drawString(54, height - 86,
                     f"Synthetic patient: {patient}   Demo MRN: {mrn}")
        c.drawString(54, height - 100, f"Page {page} of {pages}")
        c.setStrokeColorRGB(0.72, 0.72, 0.72)
        c.line(54, height - 112, width - 54, height - 112)

        # Filler deliberately resembles the density of a real chart without
        # containing real clinical information.
        y = height - 140
        c.setFont("Helvetica", 8)
        for section in range(1, 8):
            c.setFont("Helvetica-Bold", 9)
            c.drawString(54, y, f"DEMO SECTION {section}")
            y -= 14
            c.setFont("Helvetica", 8)
            for line in range(5 + (page + section) % 5):
                text = (
                    "Synthetic documentation filler. No real patient information. "
                    "Example note text for ChartWatch page-timing demonstrations."
                )
                c.drawString(62, y, text)
                y -= 11
                if y < 54:
                    break
            y -= 8
            if y < 70:
                break

        c.setFont("Helvetica-Oblique", 7)
        c.drawString(
            54, 32, "FOR DEMONSTRATION ONLY — ALL CONTENT IS FABRICATED")
        c.showPage()
    c.save()


def _ppm_for_pattern(progress, pattern, noise_sd, rng):
    """Return page speed using an intentionally non-linear fatigue pattern."""
    # The pattern is a list of (end_progress, ppm) points. Linear interpolation
    # creates realistic-looking starts, recoveries, and deteriorating slowdowns.
    previous_progress, previous_ppm = 0.0, pattern[0][1]
    for end_progress, end_ppm in pattern:
        if progress <= end_progress:
            span = max(end_progress - previous_progress, 1e-9)
            fraction = (progress - previous_progress) / span
            target = previous_ppm + (end_ppm - previous_ppm) * fraction
            noise = rng.gauss(0, noise_sd)
            return max(0.45, target + noise)
        previous_progress, previous_ppm = end_progress, end_ppm
    return max(0.45, pattern[-1][1] + rng.gauss(0, noise_sd))


def _seed_timing(db, PageEvent, assignments, charts, coders):
    rng = random.Random(42)
    now = datetime.utcnow()

    # Each profile intentionally contains recoveries. A good coder does not
    # move at a perfectly steady pace; the signal we care about is whether
    # slower sections become increasingly slow as the chart progresses.
    patterns = {
        "jsmith":   [(0.20, 1.35), (0.38, 1.65), (0.52, 1.40), (0.68, 1.70), (0.82, 1.55), (1.00, 1.75)],
        "alopez":   [(0.18, 1.55), (0.35, 2.05), (0.50, 1.70), (0.67, 2.20), (0.82, 1.95), (1.00, 2.55)],
        "mchen":    [(0.18, 1.70), (0.35, 2.25), (0.50, 1.85), (0.66, 2.55), (0.82, 2.30), (1.00, 3.25)],
        "tpatel":   [(0.20, 1.30), (0.38, 1.55), (0.53, 1.35), (0.70, 1.60), (0.84, 1.45), (1.00, 1.80)],
        "sbrown":   [(0.18, 2.15), (0.35, 2.65), (0.50, 2.25), (0.66, 3.15), (0.82, 2.90), (1.00, 4.15)],
        "dwilliams": [(0.18, 2.50), (0.35, 3.15), (0.50, 2.70), (0.66, 3.70), (0.82, 3.35), (1.00, 5.20)],
        "rnguyen":  [(0.18, 1.55), (0.35, 1.95), (0.50, 1.60), (0.66, 2.10), (0.82, 1.85), (1.00, 2.35)],
    }

    for coder in coders:
        for chart in charts:
            if not assignments.get((coder.id, chart.id)):
                continue
            # The 310-page chart is the main demo for long-chart fatigue.
            if chart.total_pages >= 300:
                review_fraction = 0.90
            else:
                review_fraction = 0.86
            reviewed = int(chart.total_pages * review_fraction)
            pages = list(range(1, reviewed + 1))
            session_start = now - timedelta(hours=rng.uniform(2, 96))
            elapsed = 0.0
            for page in pages:
                progress = page / chart.total_pages
                ppm = _ppm_for_pattern(
                    progress, patterns[coder.username], 0.10, rng)
                seconds = 60.0 / ppm
                # Occasional brief jumps in dwell time model a coder stopping
                # to read a dense section, while the underlying fatigue trend
                # remains visible.
                if page % 37 == 0:
                    seconds *= 1.25
                elapsed += seconds
                db.session.add(PageEvent(
                    user_id=coder.id,
                    chart_id=chart.id,
                    page_number=page,
                    time_spent_seconds=round(seconds, 1),
                    recorded_at=session_start + timedelta(seconds=elapsed),
                ))


def seed_demo_data(app, db, bcrypt, User, Chart, ChartAssignment, PageEvent, ICD10Code):
    """Seed demo users, synthetic PDFs, assignments, timing and codes.

    Safe to call on every startup: existing demo users/charts are detected and
    no duplicate records are created.
    """
    with app.app_context():
        admin = User.query.filter_by(username="admin").first()
        if not admin:
            admin = User(
                username="admin",
                email="admin@chartwatch.dev",
                password_hash=bcrypt.generate_password_hash(
                    "Admin123!").decode(),
                role="admin",
            )
            db.session.add(admin)
            db.session.flush()

        coder_configs = [
            ("jsmith", "jsmith@chartwatch.dev"),
            ("alopez", "alopez@chartwatch.dev"),
            ("mchen", "mchen@chartwatch.dev"),
            ("tpatel", "tpatel@chartwatch.dev"),
            ("sbrown", "sbrown@chartwatch.dev"),
            ("dwilliams", "dwilliams@chartwatch.dev"),
            ("rnguyen", "rnguyen@chartwatch.dev"),
        ]
        coders = []
        for username, email in coder_configs:
            coder = User.query.filter_by(username=username).first()
            if not coder:
                coder = User(
                    username=username,
                    email=email,
                    password_hash=bcrypt.generate_password_hash(
                        "Coder123!").decode(),
                    role="coder",
                )
                db.session.add(coder)
            coders.append(coder)
        db.session.flush()

        upload_dir = app.config["UPLOAD_FOLDER"]
        chart_specs = [
            ("demo_wellness_81pg.pdf", "Demo Wellness Chart — Synthetic",
             "Demo Patient A", "DEMO-001", 81),
            ("demo_complex_310pg.pdf", "Demo Complex Care Chart — Synthetic",
             "Demo Patient B", "DEMO-002", 310),
            ("demo_followup_145pg.pdf", "Demo Follow-up Chart — Synthetic",
             "Demo Patient C", "DEMO-003", 145),
        ]
        charts = []
        for filename, original, patient, mrn, pages in chart_specs:
            path = os.path.join(upload_dir, filename)
            _make_demo_pdf(path, original, patient, mrn, pages)
            chart = Chart.query.filter_by(filename=filename).first()
            if not chart:
                chart = Chart(
                    filename=filename,
                    original_name=original,
                    patient_name=patient,
                    mrn=mrn,
                    total_pages=pages,
                    uploaded_by=admin.id,
                )
                db.session.add(chart)
            charts.append(chart)
        db.session.flush()

        assignments = {}
        for coder in coders:
            for chart in charts:
                # Everyone gets the large chart; first four also get the other
                # two so the admin dashboard has a varied sample.
                include = chart.total_pages == 310 or coder.username in {
                    "jsmith", "alopez", "mchen", "tpatel"}
                if not include:
                    continue
                a = ChartAssignment.query.filter_by(
                    user_id=coder.id, chart_id=chart.id).first()
                if not a:
                    a = ChartAssignment(user_id=coder.id, chart_id=chart.id)
                    db.session.add(a)
                assignments[(coder.id, chart.id)] = a
        db.session.flush()

        # Only create timing data if this demo installation does not already
        # have it. This keeps restart behavior idempotent.
        if PageEvent.query.count() == 0:
            _seed_timing(db, PageEvent, assignments, charts, coders)

        if ICD10Code.query.count() == 0:
            sample_codes = [
                ("I10", "Essential hypertension", 12),
                ("E11.9", "Type 2 diabetes mellitus without complications", 28),
                ("N18.3", "Chronic kidney disease, stage 3", 44),
            ]
            for coder in coders[:3]:
                chart = charts[-1]
                for code, desc, page in sample_codes:
                    db.session.add(ICD10Code(
                        user_id=coder.id,
                        chart_id=chart.id,
                        code=code,
                        description=desc,
                        page_number=page,
                        provider="Demo Provider",
                        date_of_service="2026-01-15",
                        comment="Synthetic demo coding entry",
                    ))

        db.session.commit()
        print("SUCCESS: Synthetic ChartWatch demo data ready.")
