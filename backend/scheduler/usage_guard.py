"""Zero-cost usage limit guard: tracks free-tier quotas, auto-resets expired windows, warns at 80%, stops at 95%."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from backend.config import FreeOnlyModeViolation, get_settings
from backend.database.repositories import AyzelaRepository


def _next_reset_iso(period: str, now_utc: datetime) -> str:
    if period == "daily":
        nxt = (now_utc + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        return nxt.strftime("%Y-%m-%dT%H:%M:%SZ")
    # monthly: first day of next UTC month
    if now_utc.month == 12:
        nxt = now_utc.replace(year=now_utc.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        nxt = now_utc.replace(month=now_utc.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
    return nxt.strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass
class LimitCheckResult:
    allowed: bool
    warning: bool
    resource_key: str
    used: int
    max_limit: int
    pct: float
    message_tr: str


class UsageLimitGuard:
    def __init__(self, repo: AyzelaRepository) -> None:
        self.repo = repo

    def check_and_consume(self, resource_key: str, units: int = 1, heavy_task: bool = True) -> LimitCheckResult:
        settings = get_settings()
        if not settings.free_only_mode:
            # Explicit user override still tracks usage
            pass

        rows = self.repo.db.execute("SELECT * FROM usage_limits WHERE resource_key = ?", (resource_key,))
        if not rows:
            return LimitCheckResult(
                allowed=True,
                warning=False,
                resource_key=resource_key,
                used=0,
                max_limit=0,
                pct=0.0,
                message_tr="Limit kaydı bulunamadı.",
            )

        row = rows[0]
        used = int(row["used_amount"])
        max_lim = int(row["max_limit"])
        warn_pct = int(row["warn_threshold_pct"])
        stop_pct = int(row["hard_stop_threshold_pct"])

        now_utc = datetime.now(timezone.utc)
        reset_raw = row.get("reset_at_utc")
        if reset_raw:
            try:
                reset_dt = datetime.fromisoformat(str(reset_raw).replace("Z", "+00:00"))
                if reset_dt.tzinfo is None:
                    reset_dt = reset_dt.replace(tzinfo=timezone.utc)
                if reset_dt <= now_utc:
                    new_reset = _next_reset_iso(str(row.get("period") or "daily"), now_utc)
                    self.repo.db.execute(
                        "UPDATE usage_limits SET used_amount = 0, reset_at_utc = ?, updated_at = ? WHERE resource_key = ?",
                        (new_reset, now_utc.strftime("%Y-%m-%dT%H:%M:%SZ"), resource_key),
                    )
                    used = 0
            except Exception:
                pass

        projected = used + units
        pct = (projected / max_lim * 100.0) if max_lim > 0 else 0.0

        if heavy_task and pct >= stop_pct:
            return LimitCheckResult(
                allowed=False,
                warning=True,
                resource_key=resource_key,
                used=used,
                max_limit=max_lim,
                pct=round(pct, 1),
                message_tr=f"⛔ Ücretsiz kota sınırı doldu ({row['label_tr']}: %{pct:.1f}). Ağır işlem ertelendi.",
            )

        self.repo.increment_usage(resource_key, units)
        warning = pct >= warn_pct
        msg = (
            f"⚠️ Ücretsiz kota uyarısı ({row['label_tr']}: %{pct:.1f})"
            if warning
            else f"Kota normal ({row['label_tr']}: %{pct:.1f})"
        )
        return LimitCheckResult(
            allowed=True,
            warning=warning,
            resource_key=resource_key,
            used=projected,
            max_limit=max_lim,
            pct=round(pct, 1),
            message_tr=msg,
        )

    def assert_no_paid_service(self, service_name: str, is_paid: bool) -> None:
        if get_settings().free_only_mode and is_paid:
            raise FreeOnlyModeViolation(
                f"FREE_ONLY_MODE aktif: '{service_name}' ücretli olduğu için kullanılamaz."
            )
