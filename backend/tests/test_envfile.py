import os

from app.envfile import load_env_file


def test_env_file_parsing_and_precedence(tmp_path, monkeypatch):
    for key in ("KC_A", "KC_B", "KC_C", "KC_D", "KC_E"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("KC_D", "from-environment")
    env = tmp_path / ".env"
    env.write_text(
        "# comment\n"
        "KC_A=plain\n"
        'KC_B="quoted value"\n'
        "export KC_C='single'\n"
        "KC_D=from-file\n"
        "KC_E=value # trailing comment\n"
        "EMPTY=\n"
        "not a line\n",
        encoding="utf-8",
    )
    loaded = load_env_file(env)
    assert os.environ["KC_A"] == "plain"
    assert os.environ["KC_B"] == "quoted value"
    assert os.environ["KC_C"] == "single"
    assert os.environ["KC_D"] == "from-environment"  # real environment wins
    assert os.environ["KC_E"] == "value"
    assert sorted(loaded) == ["KC_A", "KC_B", "KC_C", "KC_E"]


def test_missing_env_file_is_ignored(tmp_path):
    assert load_env_file(tmp_path / "nope.env") == []
