"""Interactive Turkish Telegram inline keyboards."""

from __future__ import annotations

from typing import Any


def main_menu_keyboard() -> dict[str, Any]:
    return {
        "inline_keyboard": [
            [
                {"text": "⚡ Şimdi Analiz Et", "callback_data": "/simdi_analiz"},
            ],
            [
                {"text": "🎯 Seçilen 15 Maç", "callback_data": "/bugun"},
                {"text": "🎟️ Kuponlarım", "callback_data": "/kuponlarim"},
            ],
            [
                {"text": "🔴 Canlı Sonuçlar", "callback_data": "/canli"},
                {"text": "🏁 Sonuçlar", "callback_data": "/sonuclar"},
            ],
            [
                {"text": "📅 Yarın Fikstürü", "callback_data": "/yarin"},
                {"text": "🩺 Kaynak Sağlığı", "callback_data": "/kaynaklar"},
            ],
            [
                {"text": "🖥️ Web Panel", "callback_data": "/panel"},
            ],
        ]
    }
