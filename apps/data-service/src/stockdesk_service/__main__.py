from __future__ import annotations

import os

import uvicorn


def main() -> None:
    port = int(os.environ.get("STOCKDESK_PORT", "18765"))
    uvicorn.run("stockdesk_service.app:app", host="127.0.0.1", port=port)


if __name__ == "__main__":
    main()

