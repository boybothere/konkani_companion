"""ngrok tunnel helper: works with old (domain=) and new (url=) agents."""

import pytest

from app.tunnel import clean_domain, open_tunnel


class FakeTunnel:
    def __init__(self, url):
        self.public_url = url


class FakeNgrok:
    """Accepts only one way of asking for a domain, like a real agent version."""

    def __init__(self, accepts):
        self.accepts = accepts
        self.calls = []

    def connect(self, port, **options):
        self.calls.append(options)
        if options and next(iter(options)) != self.accepts:
            field = next(iter(options))
            raise RuntimeError(
                'ngrok client exception, API returned 400: {"msg":"invalid endpoint configuration",'
                f'"details":{{"err":"field {field} not found in type config.Endpoint"}}}}'
            )
        return FakeTunnel("https://kc.ngrok-free.app" if options else "https://random.ngrok-free.app")


def test_new_agent_uses_url():
    ngrok = FakeNgrok(accepts="url")
    assert open_tunnel(8000, "https://kc.ngrok-free.app/", ngrok) == "https://kc.ngrok-free.app"
    assert ngrok.calls == [{"url": "https://kc.ngrok-free.app"}]


def test_old_agent_falls_back_to_domain():
    ngrok = FakeNgrok(accepts="domain")
    assert open_tunnel(8000, "kc.ngrok-free.app", ngrok) == "https://kc.ngrok-free.app"
    assert ngrok.calls == [{"url": "https://kc.ngrok-free.app"}, {"domain": "kc.ngrok-free.app"}]


def test_no_domain_gets_a_random_url():
    ngrok = FakeNgrok(accepts="url")
    assert open_tunnel(8000, "  ", ngrok) == "https://random.ngrok-free.app"
    assert ngrok.calls == [{}]


def test_other_errors_are_not_swallowed():
    class Broken:
        def connect(self, port, **options):
            raise RuntimeError("ERR_NGROK_334: domain already in use")

    with pytest.raises(RuntimeError, match="ERR_NGROK_334"):
        open_tunnel(8000, "kc.ngrok-free.app", Broken())


def test_clean_domain():
    assert clean_domain(" https://kc.ngrok-free.app/ ") == "kc.ngrok-free.app"
    assert clean_domain(None) == ""


def test_auth_token_already_set_is_fine():
    from app.tunnel import set_auth_token

    class Agent:
        def __init__(self, message):
            self.message = message

        def set_auth_token(self, token):
            if self.message:
                raise RuntimeError(self.message)

    set_auth_token("t", Agent(None))
    set_auth_token("t", Agent("An error occurred when saving the auth token: b'Authtoken already set in configuration file'"))
    with pytest.raises(RuntimeError, match="invalid"):
        set_auth_token("t", Agent("authtoken invalid"))
