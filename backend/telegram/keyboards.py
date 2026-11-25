"""Interactive Turkish Telegram inline keyboards."""

from __future__ import annotations

from typing import Any


def main_menu_keyboard() -> dict[str, Any]:
    return {
        "inline_keyboard": [
            [
                {"text": "📊 Bugünkü Rapor", "callback_data": "/bugun"},
                {"text": "📅 Yarın Fikstürü", "callback_data": "/yarin"},
            ],
            [
                {"text": "👥 Kadrolar", "callback_data": "/kadro"},
                {"text": "📰 Futbol Haberleri", "callback_data": "/haberler"},
            ],
            [
                {"text": "🏁 Sonuçlar", "callback_data": "/sonuclar"},
                {"text": "📈 Performans", "callback_data": "/gunluk"},
            ],
            [
                {"text": "🏆 Aktif Ligler", "callback_data": "/ligler"},
                {"text": "🩺 Kaynak Sağlığı", "callback_data": "/kaynaklar"},
            ],
            [
                {"text": "⚙️ Sistem Durumu", "callback_data": "/durum"},
                {"text": "🖥️ Web Panel", "callback_data": "/panel"},
            ],
        ]
    }
