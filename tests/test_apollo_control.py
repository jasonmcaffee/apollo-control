"""
Integration tests for the UA Console TCP SDK layer.
Requires UAMixerEngine.exe to be running on 127.0.0.1:4710.
Run: python -m pytest tests/test_apollo_control.py -v
"""

import json
import socket
import threading
import time

APOLLO_HOST = "127.0.0.1"
APOLLO_PORT = 4710
PATH_DB     = "/devices/0/outputs/4/CRMonitorLevel/value"
PATH_MUTE   = "/devices/0/outputs/4/Mute/value"
SAFE_DB     = -43.0  # restored after each test


def sdk_cmd(verb: str, path: str, value=None, timeout: float = 2.0) -> dict:
    """Send a single SDK command and return the parsed JSON response."""
    line = f"{verb} {path}" + (f" {value}" if value is not None else "")
    with socket.create_connection((APOLLO_HOST, APOLLO_PORT), timeout=timeout) as s:
        s.sendall(line.encode("ascii") + b"\x00")
        buf = b""
        s.settimeout(timeout)
        while b"\x00" not in buf:
            chunk = s.recv(65536)
            if not chunk:
                break
            buf += chunk
    raw = buf.split(b"\x00")[0]
    return json.loads(raw.decode("utf-8"))


def get_db() -> float:
    return float(sdk_cmd("get", PATH_DB)["data"])


def get_mute() -> bool:
    return bool(sdk_cmd("get", PATH_MUTE)["data"])


def restore_db(original: float) -> None:
    sdk_cmd("set", PATH_DB, f"{original:.1f}")


def restore_mute(original: bool) -> None:
    sdk_cmd("set", PATH_MUTE, "true" if original else "false")


# ── Connectivity ──────────────────────────────────────────────────────

def test_sdk_reachable():
    """SDK should respond with a valid JSON envelope for a get command."""
    r = sdk_cmd("get", PATH_DB)
    assert "path" in r
    assert "data" in r
    assert r["path"] == PATH_DB


# ── Volume (dB) ───────────────────────────────────────────────────────

def test_get_current_db_in_range():
    db = get_db()
    assert -96.0 <= db <= 0.0, f"dB {db} outside expected range"


def test_set_db_and_restore():
    original = get_db()
    try:
        target = max(-96.0, original - 4.0)
        r = sdk_cmd("set", PATH_DB, f"{target:.1f}")
        assert abs(float(r["data"]) - target) < 0.01, "set dB response mismatch"
        time.sleep(0.05)
        assert abs(get_db() - target) < 0.01, "confirmed dB after set mismatch"
    finally:
        restore_db(original)


def test_volume_step_up():
    original = get_db()
    try:
        new_db = min(0.0, original + 2.0)
        sdk_cmd("set", PATH_DB, f"{new_db:.1f}")
        time.sleep(0.05)
        assert abs(get_db() - new_db) < 0.01
    finally:
        restore_db(original)


def test_volume_step_down():
    original = get_db()
    try:
        new_db = max(-96.0, original - 2.0)
        sdk_cmd("set", PATH_DB, f"{new_db:.1f}")
        time.sleep(0.05)
        assert abs(get_db() - new_db) < 0.01
    finally:
        restore_db(original)


def test_clamp_at_zero():
    original = get_db()
    try:
        sdk_cmd("set", PATH_DB, "0.0")
        time.sleep(0.05)
        assert get_db() == 0.0, "SDK should accept 0.0 (unity)"
    finally:
        restore_db(original)


def test_clamp_at_floor():
    original = get_db()
    try:
        sdk_cmd("set", PATH_DB, "-96.0")
        time.sleep(0.05)
        assert get_db() == -96.0, "SDK should accept -96.0 (silence)"
    finally:
        restore_db(original)


# ── Mute ─────────────────────────────────────────────────────────────

def test_get_mute_is_bool():
    assert isinstance(get_mute(), bool)


def test_mute_toggle():
    original = get_mute()
    try:
        flipped = not original
        r = sdk_cmd("set", PATH_MUTE, "true" if flipped else "false")
        assert isinstance(r["data"], bool)
        assert r["data"] == flipped
        time.sleep(0.05)
        assert get_mute() == flipped
    finally:
        restore_mute(original)


def test_mute_double_toggle_restores():
    original = get_mute()
    try:
        sdk_cmd("set", PATH_MUTE, "true" if (not original) else "false")
        sdk_cmd("set", PATH_MUTE, "true" if original else "false")
        time.sleep(0.05)
        assert get_mute() == original
    finally:
        restore_mute(original)


# ── Subscribe (push notifications) ───────────────────────────────────

def test_subscribe_pushes_on_change():
    """Subscribe should receive a push when the value changes externally."""
    original = get_db()
    received: list[dict] = []

    def listen():
        with socket.create_connection((APOLLO_HOST, APOLLO_PORT), timeout=3) as s:
            s.sendall(f"subscribe {PATH_DB}\x00".encode("ascii"))
            buf = b""
            s.settimeout(2.0)
            try:
                while len(received) < 2:
                    chunk = s.recv(65536)
                    if not chunk:
                        break
                    buf += chunk
                    while b"\x00" in buf:
                        msg, buf = buf.split(b"\x00", 1)
                        if msg:
                            received.append(json.loads(msg.decode("utf-8")))
            except socket.timeout:
                pass

    t = threading.Thread(target=listen, daemon=True)
    t.start()
    time.sleep(0.1)
    try:
        sdk_cmd("set", PATH_DB, f"{max(-96.0, original - 2.0):.1f}")
        t.join(timeout=3)
        assert any(r["path"] == PATH_DB for r in received), \
            f"expected subscribe push for {PATH_DB}, got: {received}"
    finally:
        restore_db(original)


# ── Device topology sanity ────────────────────────────────────────────

def test_output_4_is_monitor():
    r = sdk_cmd("get", "/devices/0/outputs/4/Name/value")
    assert r["data"] == "MONITOR", f"Output 4 name changed: {r['data']}"


def test_device_is_apollo_solo():
    r = sdk_cmd("get", "/devices/0/DeviceName/value")
    assert "Apollo" in str(r["data"]), f"Unexpected device: {r['data']}"
