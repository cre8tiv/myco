---
type: llm
---
PASS if the response includes a required control, or a blocking finding, about the shipment webhook (`POST /hooks/shipped`) accepting requests that are not authenticated, such as verifying a signature, using a shared secret or mutual TLS, or validating the sender.
FAIL if the webhook is not mentioned, or is mentioned only as a general note with no control or finding.
