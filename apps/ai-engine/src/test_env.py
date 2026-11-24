import sys

try:
    import pydantic_ai
    from pydantic import BaseModel

    print("SUCCESS: Environment fully configured. Type safety layers resolved.")
    print(f"Running Python version: {sys.version}")
except ImportError as err:
    print(f"FAILURE: Missing dependency -> {err}")
