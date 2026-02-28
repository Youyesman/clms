from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('crawler', '0011_crawltargetmovie'),
    ]

    operations = [
        migrations.AddField(
            model_name='crawltargetmovie',
            name='movie_type',
            field=models.CharField(
                max_length=10,
                choices=[('main', '주영화'), ('competitor', '경쟁작')],
                default='main',
                verbose_name='구분'
            ),
        ),
        migrations.AddField(
            model_name='crawltargetmovie',
            name='cgv',
            field=models.BooleanField(default=True, verbose_name='CGV'),
        ),
        migrations.AddField(
            model_name='crawltargetmovie',
            name='lotte',
            field=models.BooleanField(default=True, verbose_name='롯데'),
        ),
        migrations.AddField(
            model_name='crawltargetmovie',
            name='mega',
            field=models.BooleanField(default=True, verbose_name='메가박스'),
        ),
        migrations.AddField(
            model_name='crawltargetmovie',
            name='start_date',
            field=models.DateField(null=True, blank=True, verbose_name='시작일'),
        ),
        migrations.AddField(
            model_name='crawltargetmovie',
            name='end_date',
            field=models.DateField(null=True, blank=True, verbose_name='종료일'),
        ),
    ]
