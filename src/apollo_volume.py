"""
Apollo Volume Keyboard Control
Shift + VolumeUp/Down  →  adjust Apollo monitor dB by ±2 dB
Shift + VolumeMute     →  toggle Apollo monitor mute

Talks directly to UAMixerEngine.exe via TCP on 127.0.0.1:4710.
Wire format: plain-text NUL-terminated commands, JSON NUL-terminated responses.
Pure stdlib — no pip dependencies.
"""

import ctypes
import ctypes.wintypes as wt
import json
import socket
import sys
import threading

# ── UA Console SDK config ─────────────────────────────────────────────
APOLLO_HOST = "127.0.0.1"
APOLLO_PORT = 4710
PATH_DB     = "/devices/0/outputs/4/CRMonitorLevel/value"
PATH_MUTE   = "/devices/0/outputs/4/Mute/value"
STEP_DB     = 2.0
DB_MIN      = -96.0
DB_MAX      = 0.0

# ── Windows VK / message constants ───────────────────────────────────
WH_KEYBOARD_LL  = 13
WM_KEYDOWN      = 0x0100
WM_SYSKEYDOWN   = 0x0104
VK_SHIFT        = 0x10
VK_LSHIFT       = 0xA0
VK_RSHIFT       = 0xA1
VK_VOLUME_MUTE  = 0xAD
VK_VOLUME_DOWN  = 0xAE
VK_VOLUME_UP    = 0xAF
_SHIFT_KEYS     = {VK_SHIFT, VK_LSHIFT, VK_RSHIFT}

# ── Mutable state (guarded by _lock) ─────────────────────────────────
_lock         = threading.Lock()
_current_db   = -43.0
_current_mute = False
# Shift tracking in the hook (avoids GetAsyncKeyState which fails for injected keys)
_shift_down   = False


class KBDLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [
        ("vkCode",      wt.DWORD),
        ("scanCode",    wt.DWORD),
        ("flags",       wt.DWORD),
        ("time",        wt.DWORD),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]


# ── SDK helpers ───────────────────────────────────────────────────────

def apollo_cmd(cmd: str) -> dict | None:
    """Open a fresh TCP connection, send NUL-terminated cmd, return parsed JSON response or None."""
    try:
        with socket.create_connection((APOLLO_HOST, APOLLO_PORT), timeout=1.5) as s:
            s.sendall(cmd.encode("ascii") + b"\x00")
            buf = b""
            s.settimeout(1.5)
            while b"\x00" not in buf:
                chunk = s.recv(65536)
                if not chunk:
                    break
                buf += chunk
            raw = buf.split(b"\x00")[0]
            return json.loads(raw.decode("utf-8")) if raw else None
    except Exception:
        return None


def sync_state() -> None:
    """Read current dB and Mute from live SDK to initialise local state."""
    global _current_db, _current_mute
    r = apollo_cmd(f"get {PATH_DB}")
    if r and isinstance(r.get("data"), (int, float)):
        with _lock:
            _current_db = float(r["data"])
    r = apollo_cmd(f"get {PATH_MUTE}")
    if r and isinstance(r.get("data"), bool):
        with _lock:
            _current_mute = bool(r["data"])


# ── Volume / mute actions ─────────────────────────────────────────────

def volume_step(delta: float) -> None:
    """Fetch current dB, apply delta (clamped to -96..0), and set the new value."""
    global _current_db
    # Always get current value to avoid stale cache diverging from external UI changes
    r = apollo_cmd(f"get {PATH_DB}")
    if r and isinstance(r.get("data"), (int, float)):
        with _lock:
            _current_db = float(r["data"])
    with _lock:
        new_db = max(DB_MIN, min(DB_MAX, _current_db + delta))
    r = apollo_cmd(f"set {PATH_DB} {new_db:.1f}")
    if r and isinstance(r.get("data"), (int, float)):
        with _lock:
            _current_db = float(r["data"])


def toggle_mute() -> None:
    """Fetch current mute state, flip it, and set."""
    global _current_mute
    # Always get current value to stay in sync with external UI changes
    r = apollo_cmd(f"get {PATH_MUTE}")
    if r and isinstance(r.get("data"), bool):
        with _lock:
            _current_mute = bool(r["data"])
    with _lock:
        new_mute = not _current_mute
    r = apollo_cmd(f"set {PATH_MUTE} {'true' if new_mute else 'false'}")
    confirmed = r.get("data") if r else None
    with _lock:
        _current_mute = bool(confirmed) if isinstance(confirmed, bool) else new_mute


# ── Low-level keyboard hook ───────────────────────────────────────────

def _build_hook_callback():
    """Return a ctypes HOOKPROC callback (caller must keep reference alive)."""
    user32 = ctypes.windll.user32

    # lParam is a 64-bit pointer on x64 — must declare argtypes so ctypes doesn't truncate it
    user32.CallNextHookEx.argtypes = [wt.HHOOK, ctypes.c_int, wt.WPARAM, wt.LPARAM]
    user32.CallNextHookEx.restype  = ctypes.c_long

    LRESULT  = ctypes.c_long
    HOOKPROC = ctypes.WINFUNCTYPE(LRESULT, ctypes.c_int, wt.WPARAM, wt.LPARAM)

    @HOOKPROC
    def _proc(nCode, wParam, lParam):
        global _shift_down
        try:
            if nCode >= 0:
                kb = ctypes.cast(lParam, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents
                vk = kb.vkCode
                # Track Shift from hook events — GetAsyncKeyState unreliable for injected keys
                if vk in _SHIFT_KEYS:
                    _shift_down = wParam in (WM_KEYDOWN, WM_SYSKEYDOWN)
                elif _shift_down and wParam in (WM_KEYDOWN, WM_SYSKEYDOWN):
                    if vk == VK_VOLUME_UP:
                        threading.Thread(target=volume_step, args=(STEP_DB,),  daemon=True).start()
                        return 1  # suppress OS volume change
                    if vk == VK_VOLUME_DOWN:
                        threading.Thread(target=volume_step, args=(-STEP_DB,), daemon=True).start()
                        return 1
                    if vk == VK_VOLUME_MUTE:
                        threading.Thread(target=toggle_mute, daemon=True).start()
                        return 1
        except Exception:
            # Never let an exception escape the hook proc — it would corrupt the
            # hook chain and cause WH_KEYBOARD_LL to time out, freezing the keyboard.
            pass
        return user32.CallNextHookEx(None, nCode, wParam, lParam)

    return _proc


# ── Entry point ───────────────────────────────────────────────────────

def main() -> None:
    kernel32 = ctypes.windll.kernel32
    user32   = ctypes.windll.user32

    # Single-instance guard — second launch exits immediately instead of stacking hooks.
    # A second WH_KEYBOARD_LL hook that crashes on every keystroke can freeze the keyboard
    # by exhausting the LowLevelHooksTimeout before the callback returns.
    _mutex = kernel32.CreateMutexW(None, True, "ApolloVolumeControl_v1")
    if kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
        sys.exit("apollo_volume: another instance is already running — exiting")

    user32.SetWindowsHookExW.restype  = wt.HANDLE
    user32.UnhookWindowsHookEx.restype = wt.BOOL
    user32.GetMessageW.restype         = wt.BOOL

    sync_state()

    cb   = _build_hook_callback()
    # WH_KEYBOARD_LL (LL hooks) requires hmod=NULL — module handle causes ERROR_MOD_NOT_FOUND
    hook = user32.SetWindowsHookExW(WH_KEYBOARD_LL, cb, None, 0)
    if not hook:
        sys.exit("SetWindowsHookExW failed — cannot install keyboard hook")

    # Windows message pump: drives the hook callbacks
    msg = wt.MSG()
    try:
        while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) != 0:
            user32.TranslateMessage(ctypes.byref(msg))
            user32.DispatchMessageW(ctypes.byref(msg))
    finally:
        user32.UnhookWindowsHookEx(hook)


if __name__ == "__main__":
    main()
