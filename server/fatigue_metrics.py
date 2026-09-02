"""Fatigue / deterioration metrics for ChartWatch analytics.

This module is intentionally separate from app.py. Replace the existing
compute_coder_stats function with the small wrapper described in the README
instructions, or import the helper from here while keeping the rest of the app.
"""


def analyze_fatigue(page_breakdown, trend):
    """Detect a worsening slow-section pattern without requiring steady speed.

    The goal is not to punish a coder for occasional slow pages. We look for
    repeated bucket-level slowdowns plus a meaningful deterioration from the
    first half of the chart to the second half.
    """
    if len(trend) < 4:
        return {
            "fatigue_flag": False,
            "fatigue_score": 0,
            "fatigue_label": "Insufficient trend data",
            "slowdown_pct": 0,
            "slow_bucket_count": 0,
        }

    mid = max(1, len(trend) // 2)
    first = trend[:mid]
    second = trend[mid:]
    first_ppm = sum(x["avg_ppm"] for x in first) / len(first)
    second_ppm = sum(x["avg_ppm"] for x in second) / len(second)
    slowdown_pct = ((second_ppm - first_ppm) /
                    first_ppm * 100) if first_ppm else 0

    # Count later buckets that are yellow/orange/red while an earlier bucket
    # was green. This captures "starts normal, recovers, then increasingly
    # struggles" better than a single overall average.
    later_slow = sum(1 for x in second if x["avg_ppm"] >= 2.0)
    later_at_risk = sum(1 for x in second if x["avg_ppm"] >= 3.0)
    earlier_green = sum(1 for x in first if x["avg_ppm"] < 2.0)

    score = 0
    if slowdown_pct >= 15:
        score += 1
    if slowdown_pct >= 30:
        score += 1
    if later_slow >= 2 and earlier_green >= 1:
        score += 1
    if later_at_risk >= 1 and earlier_green >= 1:
        score += 1

    flag = score >= 2
    label = "Progressive fatigue detected" if flag else "No progressive fatigue"

    return {
        "fatigue_flag": flag,
        "fatigue_score": score,
        "fatigue_label": label,
        "slowdown_pct": round(slowdown_pct, 1),
        "slow_bucket_count": later_slow,
    }
