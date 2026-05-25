from concurrent.futures import ThreadPoolExecutor
import logging

logger = logging.getLogger(__name__)

# Managed thread pool for lightweight background tasks (e.g., sending emails)
# This is safer than spawning raw, detached threads in a WSGI environment.
task_executor = ThreadPoolExecutor(max_workers=4)

def run_async(func, *args, **kwargs):
    """
    Submits a function to be executed in the background thread pool.
    """
    try:
        task_executor.submit(func, *args, **kwargs)
    except Exception as e:
        logger.error(f"Failed to submit task to executor: {e}", exc_info=True)
