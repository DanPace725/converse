"""Offline audit contracts: python -m unittest discover -s test -p '*_test.py'."""
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("report", Path(__file__).resolve().parents[1] / "scripts/conclave_report.py")
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)


def event(seq, kind, content, metadata=None):
    return {"id": f"evt_{seq}", "seq": seq, "kind": kind, "content": content, "metadata": metadata or {}}


class AuditTest(unittest.TestCase):
    def test_memory_before_split_context_and_all_jev_purposes(self):
        events = [event(1, "user", "Question", {"web_settings": {"jev": True}}),
                  event(2, "inference_request", "answer", {"provider": "openai", "estimated_input_units": 1000,
                      "input_budget": 10000, "payload": {"input": [{"content": "Conversation memory: []"},
                          {"content": "Working context: []"}, {"content": "Recent context tail: []"}]}}),
                  event(3, "inference_response", "answer", {"request_id": "evt_2", "model": "fixture",
                      "usage": {"input_tokens": 100, "output_tokens": 10}}),
                  event(4, "inference_request", "retrieval-reranking", {"provider": "typesafe", "input_budget": 100,
                      "estimated_input_units": 90, "payload": {"model": "jev-1.13.0"}}),
                  event(5, "inference_response", "retrieval-reranking", {"request_id": "evt_4", "model": "jev-1.13.0",
                      "usage": {"input_tokens": 8, "output_tokens": 2}, "elapsed_ms": 50}),
                  event(6, "inference_request", "web-search", {"provider": "openai", "payload": {}}),
                  event(7, "inference_response", "web-search", {"request_id": "evt_6", "usage": {"input_tokens": 300, "output_tokens": 5}}),
                  event(8, "agent_checkpoint", "stopped", {"state": {"status": "stopped", "user_event_id": "evt_1"}})]
        result = report.analyze({"context_layer": {"events": events, "snapshots": [], "context": {}, "state": {}, "memory": {"entries": []}}})
        self.assertEqual(result["est_calls"], 1)
        self.assertEqual(result["peak_pressure"], 0.1, "delegate guard is separate from the answer guard")
        self.assertEqual(result["mgmt_in"], 8, "search is not context management")
        self.assertEqual(result["turns"][0]["outcome"], "stopped")
        self.assertEqual(result["audit"]["jev"]["retrieval-reranking"]["latency_ms"], 50)
        self.assertFalse(any("never" in f and "Jev" in f for f in result["flags"]))

    def test_structured_fresh_observations_are_delivery_and_exact_pages_are_distinct_from_loss(self):
        original = {"content": "x" * 3000, "offset": 100, "next_offset": None}
        for length in (3000, 600):
            supplied = {**original, "content": "x" * length, "next_offset": 100 + length if length < 3000 else None}
            handoff = "Continue\nCONCLAVE_CONTINUATION_OBSERVATIONS\n" + json.dumps({"fresh_tool_results": [{"call_id": "fresh", "result": supplied}]})
            events = [event(1, "tool_result", json.dumps(original), {"tool": "retrieve_event", "call_id": "fresh"}),
                      event(2, "inference_request", "answer", {"payload": {"input": [{"role": "user", "content": handoff}]}})]
            result = report.automated_audit({"events": events})["retrieval"]
            self.assertEqual(result["fresh_large_outputs_missing_from_next_request"], [])
            self.assertEqual(len(result["fresh_large_outputs_paged"]), int(length < 3000))
            if length < 3000:
                self.assertEqual(result["fresh_large_outputs_paged"][0]["next_offset"], 700)

    def test_fresh_retrieval_handoff_and_failed_delegation_stay_visible(self):
        es = [event(1, "tool_result", '{"content":"' + 'x' * 3000 + '"}', {"tool": "retrieve_event", "call_id": "c"}),
              event(2, "inference_request", "answer", {"payload": {"input": [{"content": "The preceding tool exchange is archived"}]}}),
              event(3, "inference_request", "retrieval-reranking", {"provider": "typesafe", "payload": {}}),
              event(4, "embedding_failure", "Fallback"), event(5, "memory_capture", "Capture", {"status": "completed"})]
        audit = report.automated_audit({"events": es, "memory": {"entries": []}, "state": {"entries": [{"state_key": "fact"}]}})
        self.assertEqual(audit["memory"]["named_entries"], 1)
        self.assertEqual(audit["memory"]["automatic_entries"], 0)
        self.assertEqual(audit["jev"]["retrieval-reranking"]["responses"], 0)
        self.assertEqual(audit["retrieval"]["fresh_large_outputs_missing_from_next_request"][0]["next_request_seq"], 2)
        self.assertIn("embedding-fallback", [f["code"] for f in audit["findings"]])


if __name__ == "__main__":
    unittest.main()
