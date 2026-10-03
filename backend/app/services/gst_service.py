"""Centralised GST calculation (STEP 8).

Single authority for tax maths. The frontend may show an estimate, but the
server always recomputes and is authoritative for invoice totals.

Phase 1 convention (matches the existing POS UI and Indian retail practice):

    * Selling prices are GST-INCLUSIVE.
    * tax   = gross * rate / (100 + rate)
    * taxable = gross - tax
    * CGST = SGST = tax / 2  (intra-state; IGST is out of Phase 1 scope)

All arithmetic is integer paise — no floats anywhere.
"""

from __future__ import annotations

from typing import Iterable, Sequence

from ..utils.money import round_div

VALID_GST_RATES = (0, 5, 12, 18, 28)


def validate_rate(gst_rate: int) -> int:
    if gst_rate not in VALID_GST_RATES:
        raise ValueError(f"unsupported GST rate: {gst_rate}")
    return gst_rate


def inclusive_tax(gross_paise: int, gst_rate: int) -> int:
    """Tax contained in a GST-inclusive gross amount (integer paise)."""
    if gross_paise < 0:
        raise ValueError("gross cannot be negative")
    validate_rate(gst_rate)
    if gst_rate == 0:
        return 0
    return round_div(gross_paise * gst_rate, 100 + gst_rate)


def exclusive_tax(taxable_paise: int, gst_rate: int) -> int:
    """Tax added on top of a GST-exclusive taxable amount."""
    if taxable_paise < 0:
        raise ValueError("taxable cannot be negative")
    validate_rate(gst_rate)
    if gst_rate == 0:
        return 0
    return round_div(taxable_paise * gst_rate, 100)


def taxable_from_inclusive(gross_paise: int, gst_rate: int) -> int:
    return gross_paise - inclusive_tax(gross_paise, gst_rate)


def split_cgst_sgst(tax_paise: int) -> tuple[int, int]:
    """Intra-state split. Remainder paisa goes to SGST so the sum is exact."""
    cgst = tax_paise // 2
    sgst = tax_paise - cgst
    return cgst, sgst


def allocate_proportional(total_paise: int, weights: Sequence[int]) -> list[int]:
    """Split `total_paise` across `weights` using the largest-remainder method.

    Guarantees: sum(result) == total_paise and every result >= 0 when
    total_paise >= 0.  Used to spread a bill-level discount across lines so
    per-line GST still adds up to the invoice GST exactly.
    """
    if total_paise < 0:
        raise ValueError("total cannot be negative")
    weight_sum = sum(weights)
    if weight_sum <= 0:
        # Degenerate case: give the whole amount to the first line.
        out = [0] * len(weights)
        if out:
            out[0] = total_paise
        return out

    exact = [total_paise * w / weight_sum for w in weights]
    floors = [int(x) for x in exact]
    remainder = total_paise - sum(floors)
    order = sorted(
        range(len(weights)),
        key=lambda i: (exact[i] - floors[i], weights[i]),
        reverse=True,
    )
    for i in range(remainder):
        floors[order[i % len(order)]] += 1
    return floors


def compute_invoice_totals(
    line_gross: Iterable[int],
    line_rates: Iterable[int],
    bill_discount_paise: int,
    additional_charges_paise: int,
) -> dict:
    """Full inclusive-GST invoice calculation for a POS bill.

    Returns integer paise components. `total_paise` is rounded to the nearest
    rupee and the difference is reported as `round_off_paise`.
    """
    from ..utils.money import round_to_rupee

    gross = list(line_gross)
    rates = list(line_rates)
    if len(gross) != len(rates):
        raise ValueError("line_gross and line_rates length mismatch")
    if not gross:
        raise ValueError("invoice has no lines")
    if any(g < 0 for g in gross):
        raise ValueError("line gross cannot be negative")

    subtotal = sum(gross)                      # sum(unit_price * qty)
    item_total = subtotal                      # caller subtracts item discounts before calling
    if bill_discount_paise < 0:
        raise ValueError("bill discount cannot be negative")
    if bill_discount_paise > item_total:
        raise ValueError("bill discount exceeds discountable amount")
    if additional_charges_paise < 0:
        raise ValueError("additional charges cannot be negative")

    net = item_total - bill_discount_paise
    net_lines = allocate_proportional(net, gross) if bill_discount_paise else gross

    taxes = [inclusive_tax(g, r) for g, r in zip(net_lines, rates)]
    tax_total = sum(taxes)
    taxable_total = net - tax_total
    cgst, sgst = split_cgst_sgst(tax_total)

    raw_total = net + additional_charges_paise
    total = round_to_rupee(raw_total)
    round_off = total - raw_total

    return {
        "subtotal_paise": subtotal,
        "discount_paise": bill_discount_paise,
        "taxable_paise": taxable_total,
        "tax_paise": tax_total,
        "cgst_paise": cgst,
        "sgst_paise": sgst,
        "igst_paise": 0,
        "additional_charges_paise": additional_charges_paise,
        "round_off_paise": round_off,
        "total_paise": total,
        "line_tax_paise": taxes,
        "line_net_paise": net_lines,
    }
