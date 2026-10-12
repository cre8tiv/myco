---
type: llm
---
PASS if the response reports a Request changes verdict and names the SQL injection in `searchOrders` in `src/orders.js`, where the search term is concatenated into the query string, as a blocking finding, ideally suggesting a parameterized query.
FAIL if the verdict is Approve, if the injection is not mentioned, or if it is mentioned only as a minor style note.
