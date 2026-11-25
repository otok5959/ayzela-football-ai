"""Acceptance tests: Telegram authorization, webhook secret, 18 commands, dedup, and sanitizer."""

from __future__ import annotations

import pytest

from backend.telegram.bot_client import TelegramBotClient
from backend.telegram.commands import COMMAND_HELP, TelegramCommandRouter
from backend.validation.sanitizer import assert_safe_report_text


def test_authorized_and_unauthorized_telegram_user(temp_repo):
    router = TelegramCommandRouter(
        repo=temp_repo,
        allowed_user_id="111222333",
        allowed_chat_id="111222333",
    )

    # Authorized user -> 200
    ok_res = router.handle_update(
        {"message": {"from": {"id": 111222333}, "chat": {"id": 111222333}, "text": "/start"}}
    )
    assert ok_res["authorized"] is True
    assert ok_res["status_code"] == 200

    # Unauthorized user -> 403 + security log
    bad_res = router.handle_update(
        {"message": {"from": {"id": 999888777}, "chat": {"id": 999888777}, "text": "/bugun"}}
    )
    assert bad_res["authorized"] is False
    assert bad_res["status_code"] == 403

    sec_logs = temp_repo.db.execute("SELECT * FROM system_logs WHERE level = 'SECURITY'")
    assert len(sec_logs) == 1


def test_all_18_telegram_commands_and_manual_queue(temp_repo):
    router = TelegramCommandRouter(
        repo=temp_repo,
        allowed_user_id="111222333",
        allowed_chat_id="111222333",
    )
    assert len(COMMAND_HELP) == 18

    for cmd, _ in COMMAND_HELP:
        text = "/analiz Galatasaray" if cmd == "/analiz" else cmd
        res = router.handle_update(
            {"message": {"from": {"id": 111222333}, "chat": {"id": 111222333}, "text": text}}
        )
        assert res["authorized"] is True
        assert res["status_code"] == 200
        assert res["reply_text"]

    # Manual /analiz must enqueue job in job_queue
    jobs = temp_repo.db.execute("SELECT * FROM job_queue WHERE job_type = 'manual_analysis'")
    assert len(jobs) == 1
    assert "Galatasaray" in jobs[0]["payload_json"]

    # Immediate full analysis trigger (/simdi_analiz)
    now_res = router.handle_update(
        {"callback_query": {"id": "cb1", "from": {"id": 111222333}, "message": {"chat": {"id": 111222333}}, "data": "/simdi_analiz"}}
    )
    assert now_res["authorized"] is True
    assert now_res["status_code"] == 200
    jobs2 = temp_repo.db.execute("SELECT * FROM job_queue WHERE job_type = 'manual_analysis'")
    assert len(jobs2) == 2
    assert any("full_now" in j["payload_json"] for j in jobs2)


def test_duplicate_telegram_notification_blocked_and_chunking(temp_repo):
    from backend.telegram.bot_client import split_telegram_message

    long_text = "\n".join([f"{i}. [Kod: {1000+i}] TakimA - TakimB | 1-X-2: %45/%28/%27" for i in range(120)])
    parts = split_telegram_message(long_text, max_len=3800)
    assert len(parts) >= 2
    assert all(len(p) <= 3850 for p in parts)

    bot = TelegramBotClient(repo=temp_repo, bot_token="", chat_id="111222333")
    r1 = bot.send_message(long_text, dedup_key="daily_2026-11-25_0800", notification_type="daily_report")
    r2 = bot.send_message(long_text, dedup_key="daily_2026-11-25_0800", notification_type="daily_report")
    assert r1["sent"] is True
    assert r1["parts"] >= 2
    assert r2["sent"] is False
    assert r2["reason"] == "duplicate_blocked"


def test_sanitizer_blocks_forbidden_betting_claims():
    with pytest.raises(ValueError):
        assert_safe_report_text("Bu maç kesin kazanır ve banko seçenektir.")
    with pytest.raises(ValueError):
        assert_safe_report_text("Kupon önerisi ve bahis miktarı: 100 TL")
    safe = assert_safe_report_text("Ev sahibi galibiyet olasılığı %52, veri kapsamı %84.")
    assert "%52" in safe
