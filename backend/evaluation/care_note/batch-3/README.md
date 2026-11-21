# Batch 3: halted at the first request

Batch 3 was the first paid run of the batch Garden Note contract (ADR-0085 N8),
at commit `117d99c` on 2026-11-20. Its compatibility request (unit 1, 7,802
bytes) failed at OpenAI after 716 ms without reported usage, so the ledger
halted before any case ran. The tool did not yet record the provider's error
class, status, or code, so the cause is unknown. A request that fails before
generation reports no usage; the OpenAI usage page is the check on whether it
was billed.

The tool now records the error class, HTTP status, and error code (never the
message), and the evaluation continues as batch 4 with the same cases. This
directory keeps the ledger and the one run record unchanged.
