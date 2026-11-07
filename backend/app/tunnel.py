"""Open an ngrok tunnel, with or without a reserved (static) domain.

ngrok changed how a reserved domain is requested: older agents take a
``domain`` field, newer ones (the "endpoints" API) take ``url`` and reject
``domain`` with "field domain not found in type config.Endpoint". We try the
new form first and fall back to the old one, so any pyngrok/ngrok version works.
"""

from __future__ import annotations


def clean_domain(value: str | None) -> str:
    return (value or "").strip().removeprefix("https://").removeprefix("http://").strip("/")


def _unknown_field(exc: Exception) -> bool:
    text = str(exc)
    return "not found in type" in text or "invalid endpoint configuration" in text or "invalid tunnel configuration" in text


def set_auth_token(token: str, ngrok=None) -> None:
    """Save the authtoken. Newer agents report "Authtoken already set" when it is
    unchanged, which pyngrok treats as an error; that case is fine."""
    if ngrok is None:
        from pyngrok import ngrok  # noqa: PLC0415 - optional dependency
    try:
        ngrok.set_auth_token(token)
    except Exception as exc:  # noqa: BLE001
        if "already set" not in str(exc).lower():
            raise


def open_tunnel(port: int, domain: str | None = None, ngrok=None) -> str:
    """Start the tunnel and return its public URL. ``ngrok`` is injectable for tests."""
    if ngrok is None:
        from pyngrok import ngrok  # noqa: PLC0415 - optional dependency

    domain = clean_domain(domain)
    if not domain:
        return ngrok.connect(port).public_url

    attempts = [{"url": f"https://{domain}"}, {"domain": domain}]
    last: Exception | None = None
    for options in attempts:
        try:
            return ngrok.connect(port, **options).public_url
        except Exception as exc:  # noqa: BLE001
            if not _unknown_field(exc):
                raise
            last = exc  # this agent uses the other format; try it
    assert last is not None
    raise last
