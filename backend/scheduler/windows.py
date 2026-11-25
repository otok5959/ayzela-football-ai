"""Europe/Istanbul scheduling windows (08:00 and 11:59) and midnight crossover handling."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta

from backend.config import ISTANBUL_TZ


@dataclass(frozen=True)
class AnalysisWindow:
    run_type: str  # "morning_0800" | "midday_1159"
    analysis_day_tr: str
    scheduled_at_tr: datetime
    window_start_tr: datetime
    window_end_tr: datetime


def get_analysis_window(run_type: str, now_tr: datetime | None = None) -> AnalysisWindow:
    """
    08:00 analysis covers [D 08:00 TRT, D+1 08:00 TRT).
    11:59 analysis covers [D 11:59 TRT, D+1 08:00 TRT).
    Matches starting after midnight (e.g. D+1 02:00 TRT) belong to analysis_day_tr = D.
    """
    ref = (now_tr or datetime.now(ISTANBUL_TZ)).astimezone(ISTANBUL_TZ)
    day = ref.date()
    next_day = day + timedelta(days=1)
    end_dt = datetime.combine(next_day, time(8, 0), tzinfo=ISTANBUL_TZ)

    if run_type == "morning_0800":
        start_dt = datetime.combine(day, time(8, 0), tzinfo=ISTANBUL_TZ)
        sched_dt = start_dt
    elif run_type == "midday_1159":
        start_dt = datetime.combine(day, time(11, 59), tzinfo=ISTANBUL_TZ)
        sched_dt = start_dt
    else:
        start_dt = ref
        sched_dt = ref

    return AnalysisWindow(
        run_type=run_type,
        analysis_day_tr=day.isoformat(),
        scheduled_at_tr=sched_dt,
        window_start_tr=start_dt,
        window_end_tr=end_dt,
    )
