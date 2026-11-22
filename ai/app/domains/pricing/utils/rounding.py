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


def _get_currency_step(amount: int) -> int:
    if amount < 500_000:
        return 10_000
    elif amount < 2_000_000:
        return 50_000
    return 100_000


def sanitize_price_range(
    min_price: float,
    max_price: float,
    floor: float = 50_000,
    ceiling: float = 20_000_000,
) -> Tuple[int, int]:
    """
    Clamps and enforces 0 < min_price < max_price <= ceiling with at least one step spread.
    Guarantees clean rounded integer currency for VND.
    """
    clean_ceiling = round_to_clean_currency(ceiling)
    if clean_ceiling < 20_000:
        clean_ceiling = 20_000

    step_for_ceiling = _get_currency_step(clean_ceiling)
    if clean_ceiling <= step_for_ceiling:
        step_for_ceiling = 10_000

    clean_floor = round_to_clean_currency(floor)
    if clean_floor < 10_000:
        clean_floor = 10_000

    # Handle inverted or equal bounds: floor >= ceiling
    if clean_floor >= clean_ceiling:
        clean_floor = max(10_000, clean_ceiling - step_for_ceiling)

    clean_min = round_to_clean_currency(min_price)
    clean_max = round_to_clean_currency(max_price)

    # Invert if min > max
    if clean_min > clean_max:
        clean_min, clean_max = clean_max, clean_min

    # Clamp to floor and ceiling
    clean_min = max(clean_floor, min(clean_min, clean_ceiling))
    clean_max = max(clean_floor, min(clean_max, clean_ceiling))

    # Enforce min_price < max_price with minimum step spread
    if clean_min >= clean_max:
        step = _get_currency_step(clean_min)
        clean_max = clean_min + step
        if clean_max > clean_ceiling:
            clean_max = clean_ceiling
            step_down = _get_currency_step(clean_max)
            clean_min = max(10_000, clean_max - step_down)
            if clean_min >= clean_max:
                clean_min = max(10_000, clean_max - 10_000)

    # Final guarantee: 0 < clean_min < clean_max <= clean_ceiling
    if clean_min <= 0:
        clean_min = 10_000
    if clean_max <= clean_min:
        clean_max = clean_min + 10_000
    if clean_max > clean_ceiling:
        clean_max = clean_ceiling
        clean_min = max(10_000, clean_max - 10_000)

    return clean_min, clean_max
