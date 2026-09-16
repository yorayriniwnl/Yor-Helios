import pytest


def make_dummy_user(uid=1, pw_hash="hashed"):
    class Dummy:
        def __init__(self, id_, password_hash):
            self.id = id_
            self.password_hash = password_hash
            self.is_active = True

    return Dummy(uid, pw_hash)


def test_login_success(monkeypatch):
    from backend.app.services import auth_service

    dummy_user = make_dummy_user(1, "pw-hash")

    monkeypatch.setattr(auth_service, "get_user_by_email", lambda db, email: dummy_user)
    monkeypatch.setattr(auth_service, "verify_password", lambda pw, h: True)
    monkeypatch.setattr(auth_service, "create_access_token", lambda uid: "tok-123")
    monkeypatch.setattr(auth_service, "svc_log_action", lambda *a, **k: None)

    token = auth_service.login(None, "u@example.com", "pass")
    assert token == "tok-123"


def test_login_invalid_user(monkeypatch):
    from backend.app.services import auth_service

    monkeypatch.setattr(auth_service, "get_user_by_email", lambda db, email: None)
    with pytest.raises(ValueError):
        auth_service.login(None, "u@example.com", "pass")


def test_login_invalid_password(monkeypatch):
    from backend.app.services import auth_service

    dummy_user = make_dummy_user(2, "pw-hash")
    monkeypatch.setattr(auth_service, "get_user_by_email", lambda db, email: dummy_user)
    monkeypatch.setattr(auth_service, "verify_password", lambda pw, h: False)
    with pytest.raises(ValueError):
        auth_service.login(None, "u@example.com", "bad")
