from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('crawler', '0012_crawltargetmovie_add_fields'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='crawltargetmovie',
            name='cgv',
        ),
        migrations.RemoveField(
            model_name='crawltargetmovie',
            name='lotte',
        ),
        migrations.RemoveField(
            model_name='crawltargetmovie',
            name='mega',
        ),
        migrations.RemoveField(
            model_name='crawltargetmovie',
            name='start_date',
        ),
        migrations.RemoveField(
            model_name='crawltargetmovie',
            name='end_date',
        ),
    ]
