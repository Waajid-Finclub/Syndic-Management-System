"""
Domain services.

Routes in this codebase stay thin: they validate input, check access and shape
JSON. Anything that reasons about money, allocates a payment across invoices,
decides what a resident gets told, or renders a document lives here, where it
can be called from a route, from a seed script, or from a future scheduled job
without dragging a request context along with it.
"""
