from typing import Tuple


def round_to_clean_currency(amount: float) -> int:
    """
    Rounds amount to clean VND:
    - amount < 500,000: step = 10,000
    - 500,000 <= amount < 2,000,000: step = 50,000
    - amount >= 2,000,000: step = 100,000
    """
    if amount <= 0:
        return 0

    if amount < 500_000:
        step = 10_000
    elif amount < 2_000_000:
        step = 50_000
    else:
        step = 100_000

    rounded = int(round(amount / step) * step)

    # If rounded crosses into a higher step tier, ensure alignment
    if rounded >= 2_000_000 and rounded % 100_000 != 0:
        rounded = int(round(rounded / 100_000) * 100_000)
    elif rounded >= 500_000 and rounded % 50_000 != 0:
        rounded = int(round(rounded / 50_000) * 50_000)

    return rounded


def sanitize_price_range(
    min_price: float,
    max_price: float,
    floor: float = 50_000,
    ceiling: float = 20_000_000,
) -> Tuple[int, int]:
    """
    Clamps and enforces min_price < max_price with at least one step spread.
    Guarantees clean rounded integer currency for VND.
    """
    clean_min = round_to_clean_currency(min_price)
    clean_max = round_to_clean_currency(max_price)

    # Invert if min > max
    if clean_min > clean_max:
        clean_min, clean_max = clean_max, clean_min

    # Clamp to floor and ceiling
    clean_floor = round_to_clean_currency(floor)
    clean_ceiling = round_to_clean_currency(ceiling)

    clean_min = max(clean_floor, min(clean_min, clean_ceiling))
    clean_max = max(clean_floor, min(clean_max, clean_ceiling))

    # Enforce min_price < max_price with minimum step spread
    if clean_min >= clean_max:
        step = (
            10_000
            if clean_min < 500_000
            else (50_000 if clean_min < 2_000_000 else 100_000)
        )
        clean_max = clean_min + step
        if clean_max > clean_ceiling:
            clean_max = clean_ceiling
            clean_min = max(clean_floor, clean_max - step)

    return clean_min, clean_max
