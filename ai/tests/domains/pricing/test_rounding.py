import pytest
from app.domains.pricing.utils.rounding import round_to_clean_currency, sanitize_price_range


def test_round_to_clean_currency_sub_500k():
    # Amounts < 500,000 VND should round to nearest 10,000 VND
    assert round_to_clean_currency(153250) == 150000
    assert round_to_clean_currency(156000) == 160000
    assert round_to_clean_currency(278000) == 280000
    assert round_to_clean_currency(9500) == 10000
    assert round_to_clean_currency(490000) == 490000
    assert round_to_clean_currency(496000) == 500000


def test_round_to_clean_currency_500k_to_2m():
    # Amounts between 500,000 VND and 2,000,000 VND should round to nearest 50,000 VND
    assert round_to_clean_currency(520000) == 500000
    assert round_to_clean_currency(540000) == 550000
    assert round_to_clean_currency(780000) == 800000
    assert round_to_clean_currency(1230000) == 1250000
    assert round_to_clean_currency(1970000) == 1950000
    assert round_to_clean_currency(1980000) == 2000000


def test_round_to_clean_currency_above_2m():
    # Amounts >= 2,000,000 VND should round to nearest 100,000 VND
    assert round_to_clean_currency(2040000) == 2000000
    assert round_to_clean_currency(2340000) == 2300000
    assert round_to_clean_currency(2360000) == 2400000
    assert round_to_clean_currency(5150000) == 5200000


def test_sanitize_price_range_ordering_and_spread():
    # Enforces min_price < max_price with minimum step spread
    min_p, max_p = sanitize_price_range(150000, 150000)
    assert min_p < max_p
    assert max_p >= min_p + 10000

    # Handles inverted ranges
    min_p, max_p = sanitize_price_range(300000, 200000)
    assert min_p == 200000
    assert max_p == 300000


def test_sanitize_price_range_clamping():
    # Clamps to floor and ceiling
    min_p, max_p = sanitize_price_range(10000, 30000000, floor=50000, ceiling=20000000)
    assert min_p >= 50000
    assert max_p <= 20000000


def test_sanitize_price_range_floor_greater_than_ceiling():
    # When floor > ceiling, ensure min < max and does not exceed ceiling
    min_p, max_p = sanitize_price_range(700000, 750000, floor=700000, ceiling=600000)
    assert 0 < min_p < max_p
    assert max_p <= 600000


def test_sanitize_price_range_floor_equals_ceiling():
    min_p, max_p = sanitize_price_range(500000, 500000, floor=500000, ceiling=500000)
    assert 0 < min_p < max_p
    assert max_p <= 500000


def test_sanitize_price_range_low_ceiling():
    min_p, max_p = sanitize_price_range(50000, 60000, floor=50000, ceiling=20000)
    assert 0 < min_p < max_p
    assert max_p <= 20000


def test_sanitize_price_range_rounding_boundaries():
    # Close to 500k and 2M step boundaries
    min_p, max_p = sanitize_price_range(496000, 498000, floor=100000, ceiling=1000000)
    assert 0 < min_p < max_p
    assert min_p % 10000 == 0
    assert max_p % 50000 == 0 or max_p % 10000 == 0

