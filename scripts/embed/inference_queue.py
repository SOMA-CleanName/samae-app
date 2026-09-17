"""모델 하나의 추론 차례: 검색 → 사용자 이미지 → 백필, 같은 순위는 FIFO."""

import heapq
import itertools
import threading
import time
from contextlib import contextmanager


class InferenceQueue:
    PRIORITIES = {"search": 0, "interactive": 1, "backfill": 2}

    def __init__(self):
        self._condition = threading.Condition()
        self._sequence = itertools.count()
        self._waiting = []
        self._running = None

    @contextmanager
    def slot(self, priority, timeout=60):
        ticket = (self.PRIORITIES[priority], next(self._sequence), priority)
        deadline = time.monotonic() + timeout
        with self._condition:
            heapq.heappush(self._waiting, ticket)
            try:
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise TimeoutError(f"{priority} 추론 대기 시간 초과")
                    if self._running is None and self._waiting[0] == ticket:
                        heapq.heappop(self._waiting)
                        self._running = priority
                        break
                    self._condition.wait(remaining)
            except BaseException:
                self._waiting.remove(ticket)
                heapq.heapify(self._waiting)
                self._condition.notify_all()
                raise
        try:
            yield
        finally:
            with self._condition:
                self._running = None
                self._condition.notify_all()

    def snapshot(self):
        """인증된 /health에서 대기 상태를 확인한다. 요청 내용은 노출하지 않는다."""
        with self._condition:
            waiting = dict.fromkeys(self.PRIORITIES, 0)
            for _, _, priority in self._waiting:
                waiting[priority] += 1
            return {"running": self._running, "waiting": waiting}
