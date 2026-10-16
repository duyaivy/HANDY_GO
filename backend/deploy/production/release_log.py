"""Deployment diagnostics: redact shared ENV credentials before emitting any output."""
import base64
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

SECRETS = set()


def load_secrets(path):
    if not Path(path).is_file():
        return
    for line in Path(path).read_text().splitlines():
        key, separator, value = line.partition('=')
        if not separator or not re.search(r'URL|SECRET|KEY|TOKEN|PASS|SMTP_USER', key):
            continue
        candidates = [value]
        if 'URL' in key:
            try:
                parsed = urlsplit(value)
                candidates.extend(unquote(part) for part in (parsed.username, parsed.password) if part)
            except ValueError:
                pass
        if value.startswith('base64:'):
            try:
                candidates.extend(base64.b64decode(value[7:]).decode().splitlines())
            except (ValueError, UnicodeError):
                pass
        for candidate in candidates:
            if candidate:
                SECRETS.update((candidate, json.dumps(candidate)[1:-1]))


def redact(value):
    text = str(value)
    for secret in sorted(SECRETS, key=len, reverse=True):
        text = text.replace(secret, '[REDACTED]')
    text = re.sub(r'\b[a-zA-Z][a-zA-Z0-9+.-]*://[^\s\x22\x27<>]+', '[REDACTED_URL]', text)
    # Prevent terminal escapes and remote log lines from injecting Actions commands.
    text = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', text)
    text = ''.join(char for char in text if char >= ' ' or char in '\n\t')
    return text.replace('::', ': :')


def emit(role, message):
    import sys
    for line in redact(message).splitlines():
        print(f'[{role}] {line}', file=sys.stderr, flush=True)
