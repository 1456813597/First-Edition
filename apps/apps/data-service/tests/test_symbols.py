from stockdesk_service.utils.symbols import normalize_symbol


def test_normalize_symbol_plain_code() -> None:
    assert normalize_symbol("000001") == "000001.SZ"


def test_normalize_symbol_prefixed() -> None:
    assert normalize_symbol("sh600000") == "600000.SH"
