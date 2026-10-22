import os
from celery import Celery

redis_url = os.environ["REDIS_URL"]

celery_app = Celery(
    "identity_worker",
    broker=redis_url,
    backend=redis_url,
)

celery_app.conf.update(
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    broker_transport_options={
        "visibility_timeout": 3600,
    },
    result_backend_transport_options={
        "visibility_timeout": 3600,
    },
    visibility_timeout=3600,
)