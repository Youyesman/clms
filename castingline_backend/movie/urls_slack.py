from django.urls import path
from movie.views.slack_views import SlackInteractiveView

urlpatterns = [
    path('', SlackInteractiveView.as_view(), name='slack_interactive'),
]
