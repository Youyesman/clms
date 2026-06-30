from django.urls import path

from . import views

urlpatterns = [
    path("mail/folders/", views.mail_folders, name="mail-folders"),
    path("mail/messages/", views.mail_messages, name="mail-messages"),
    path("mail/lotte-report/", views.mail_lotte_report, name="mail-lotte-report"),
    path("mail/messages/<int:uid>/", views.mail_message_detail, name="mail-message-detail"),
    path(
        "mail/messages/<int:uid>/attachments/<int:index>/",
        views.mail_attachment,
        name="mail-attachment",
    ),
    # ── 정산서(부금계산서) 수집 ──
    path("settlement/movie-search/", views.movie_search, name="settlement-movie-search"),
    path("settlement/targets/", views.settlement_targets, name="settlement-targets"),
    path(
        "settlement/targets/<int:pk>/",
        views.settlement_target_detail,
        name="settlement-target-detail",
    ),
    path("settlement/scan/", views.settlement_scan, name="settlement-scan"),
    path(
        "settlement/collect-attachment/",
        views.settlement_collect_attachment,
        name="settlement-collect-attachment",
    ),
    path("settlement/collected/", views.settlement_list, name="settlement-collected"),
    path("settlement/summary/", views.settlement_summary, name="settlement-summary"),
    path(
        "settlement/download-zip/",
        views.settlement_download_zip,
        name="settlement-download-zip",
    ),
    path(
        "settlement/collected/<int:pk>/",
        views.settlement_detail,
        name="settlement-collected-detail",
    ),
]
