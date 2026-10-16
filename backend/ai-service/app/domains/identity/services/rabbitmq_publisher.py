from __future__ import annotations

import json
import os
import ssl
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.domains.identity.core.config import settings
from app.domains.identity.core.logger import logger


def publish_kyc_event(pattern: str, payload: dict[str, Any]) -> bool:
    """
    Publish an event to RabbitMQ using the NestJS microservices message envelope:
    { "pattern": pattern, "data": payload }
    Uses Kombu (built-in with Celery) or Pika.
    """
    rabbitmq_url = (
        settings.rabbitmq_url
        or os.getenv("RABBITMQ_URL")
        or ""
    )
    if not rabbitmq_url:
        logger.warning("RABBITMQ_URL chưa được cấu hình. Bỏ qua publish event %s", pattern)
        return False

    exchange_name = settings.rabbitmq_exchange or os.getenv("RABBITMQ_EXCHANGE", "handy-go.events")

    # Build standard event envelope
    event_data = {
        "eventId": uuid4().hex,
        "eventType": pattern,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "producer": "ai-service",
        **payload,
    }

    # NestJS Transport.RMQ format
    envelope = {
        "pattern": pattern,
        "data": event_data,
    }

    # 1. Try Kombu (available in Celery environment)
    try:
        from kombu import Connection, Exchange, Producer

        use_ssl = rabbitmq_url.startswith("amqps://")
        ssl_options = {"cert_reqs": ssl.CERT_NONE} if use_ssl else None

        with Connection(rabbitmq_url, ssl=ssl_options, connect_timeout=5) as conn:
            exchange = Exchange(exchange_name, type="topic", durable=True)
            with Producer(conn) as producer:
                producer.publish(
                    envelope,
                    exchange=exchange,
                    routing_key=pattern,
                    serializer="json",
                    content_type="application/json",
                    delivery_mode=2,
                    declare=[exchange],
                )
                logger.info("Đã gửi event RabbitMQ: %s cho user %s", pattern, payload.get("userId"))
                return True
    except ImportError:
        pass
    except Exception as exc:
        logger.error("Lỗi gửi RabbitMQ qua kombu (%s): %s", pattern, exc)

    # 2. Try Pika fallback
    try:
        import pika

        parameters = pika.URLParameters(rabbitmq_url)
        if rabbitmq_url.startswith("amqps://"):
            context = ssl.create_default_context()
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
            parameters.ssl_options = pika.SSLOptions(context)

        connection = pika.BlockingConnection(parameters)
        channel = connection.channel()
        channel.exchange_declare(exchange=exchange_name, exchange_type="topic", durable=True)
        channel.basic_publish(
            exchange=exchange_name,
            routing_key=pattern,
            body=json.dumps(envelope, ensure_ascii=False),
            properties=pika.BasicProperties(
                delivery_mode=2,
                content_type="application/json",
            ),
        )
        connection.close()
        logger.info("Đã gửi event RabbitMQ qua pika: %s cho user %s", pattern, payload.get("userId"))
        return True
    except ImportError:
        logger.warning("Cả kombu và pika đều không khả dụng để publish RabbitMQ.")
        return False
    except Exception as exc:
        logger.error("Lỗi gửi RabbitMQ qua pika (%s): %s", pattern, exc)
        return False
