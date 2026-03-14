from __future__ import annotations

import argparse
import sys

import keyring


SERVICE_NAME = "StockDeskLLM"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["set", "get", "delete"])
    parser.add_argument("profile_id")
    parser.add_argument("api_key", nargs="?")
    args = parser.parse_args()

    if args.action == "set":
        if not args.api_key:
            raise SystemExit("api_key is required for set")
        keyring.set_password(SERVICE_NAME, args.profile_id, args.api_key)
        return

    if args.action == "get":
        value = keyring.get_password(SERVICE_NAME, args.profile_id)
        if value:
            sys.stdout.write(value)
        return

    keyring.delete_password(SERVICE_NAME, args.profile_id)


if __name__ == "__main__":
    main()

