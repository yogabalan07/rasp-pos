"""Money helpers.

RULE 4: money is stored and transported as INTEGER PAISE.
        ₹100.50  ->  10050

Nothing in the system may use float arithmetic for money.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

PAISE_PER_RUPEE = 100

# Upper bound for a single money value accepted at the API boundary.
# 1e12 paise == Rs.10,000,000,000 (Rs.1000 crore): far above any realistic
# Indian retail POS transaction, yet ~9.2 million times below SQLite's INTEGER
# limit (9.2e18), so sums of bounded values can never overflow a column.
MAX_MONEY_PAISE = 1_000_000_000_000


def to_paise(amount) -> int:
    """Convert rupees (int | str | Decimal, never binary float math) to paise.

    Strings are preferred at API boundaries: to_paise("40.50") == 4050.
    Floats are accepted for convenience but converted via str() first so
    40.1 * 100 never becomes 4009.999...
    """
    if isinstance(amount, bool):  # bool is an int subclass — reject explicitly
        raise ValueError("boolean is not a money value")
    try:
        value = Decimal(str(amount))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"invalid money value: {amount!r}") from exc
    paise = (value * PAISE_PER_RUPEE).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(paise)


def from_paise(paise: int) -> str:
    """Paise -> decimal string in rupees, exactly 2 dp ("10050" -> "100.50")."""
    if not isinstance(paise, int):
        raise TypeError("paise must be int")
    sign = "-" if paise < 0 else ""
    p = abs(paise)
    return f"{sign}{p // PAISE_PER_RUPEE}.{p % PAISE_PER_RUPEE:02d}"


def round_to_rupee(paise: int) -> int:
    """Round an amount to the nearest rupee in paise (cash round-off).

    10049 -> 10000, 10050 -> 10100 (half up), matches POS round-off rules.
    """
    if paise >= 0:
        return ((paise + 50) // 100) * 100
    return -(((-paise) + 50) // 100) * 100


def round_div(numerator: int, denominator: int) -> int:
    """Integer division rounded half-up (denominator > 0)."""
    if denominator <= 0:
        raise ValueError("denominator must be > 0")
    if numerator >= 0:
        return (numerator + denominator // 2) // denominator
    return -(((-numerator) + denominator // 2) // denominator)
