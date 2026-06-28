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
]
