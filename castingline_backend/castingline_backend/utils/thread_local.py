# thread_local.py
import threading

_thread_locals = threading.local()


def set_current_user(user):
    """현재 요청을 보낸 유저를 스레드 로컬에 저장"""
    _thread_locals.user = user


def get_current_user():
    """저장된 유저 정보를 반환 (없으면 None)"""
    return getattr(_thread_locals, "user", None)
