"""Pure GST maths tests (no database)."""

import pytest

from app.services.gst_service import (
    allocate_proportional,
    compute_invoice_totals,
    inclusive_tax,
    split_cgst_sgst,
    taxable_from_inclusive,
    validate_rate,
)


def test_inclusive_tax_examples():
    # ₹80.00 at 28% GST inclusive: 8000 * 28 / 128 = 1750 paise exactly.
    assert inclusive_tax(8000, 28) == 1750
    assert taxable_from_inclusive(8000, 28) == 6250
    assert inclusive_tax(10000, 0) == 0
    assert inclusive_tax(10000, 5) == round(10000 * 5 / 105)


def test_inclusive_tax_rejects_bad_input():
    with pytest.raises(ValueError):
        inclusive_tax(-1, 18)
    with pytest.raises(ValueError):
        inclusive_tax(1000, 7)


def test_validate_rate():
    assert validate_rate(18) == 18
    with pytest.raises(ValueError):
        validate_rate(15)


def test_split_cgst_sgst_is_exact():
    cgst, sgst = split_cgst_sgst(1751)
    assert cgst + sgst == 1751
    assert cgst == 875
    assert sgst == 876


def test_allocate_proportional_sums_to_total():
    assert allocate_proportional(100, [1, 1, 1]) == [34, 33, 33]
    assert sum(allocate_proportional(999, [7, 3, 5])) == 999
    assert allocate_proportional(0, [5, 5]) == [0, 0]


def test_invoice_totals_simple():
    totals = compute_invoice_totals(
        line_gross=[8000], line_rates=[28], bill_discount_paise=0,
        additional_charges_paise=0,
    )
    assert totals["subtotal_paise"] == 8000
    assert totals["taxable_paise"] == 6250
    assert totals["tax_paise"] == 1750
    assert totals["total_paise"] == 8000
    assert totals["round_off_paise"] == 0
    assert totals["cgst_paise"] + totals["sgst_paise"] == totals["tax_paise"]


def test_invoice_totals_rounds_to_nearest_rupee():
    # net = 1049 -> nearest rupee = 1000, round-off = -49
    totals = compute_invoice_totals(
        line_gross=[1049], line_rates=[0], bill_discount_paise=0,
        additional_charges_paise=0,
    )
    assert totals["total_paise"] == 1000
    assert totals["round_off_paise"] == -49

    # 1051 -> 1100
    totals = compute_invoice_totals(
        line_gross=[1051], line_rates=[0], bill_discount_paise=0,
        additional_charges_paise=0,
    )
    assert totals["total_paise"] == 1100
    assert totals["round_off_paise"] == 49


def test_invoice_totals_rejects_oversized_discount():
    with pytest.raises(ValueError):
        compute_invoice_totals(
            line_gross=[1000], line_rates=[5], bill_discount_paise=1001,
            additional_charges_paise=0,
        )


def test_invoice_totals_lines_add_up_to_total():
    totals = compute_invoice_totals(
        line_gross=[4000, 3500, 1250], line_rates=[28, 18, 5],
        bill_discount_paise=250, additional_charges_paise=0,
    )
    # line_net is the GST-inclusive amount per line after all discounts.
    assert sum(totals["line_net_paise"]) == 4000 + 3500 + 1250 - 250
    assert sum(totals["line_tax_paise"]) == totals["tax_paise"]
    # taxable = inclusive net minus the tax contained inside it
    assert sum(totals["line_net_paise"]) - sum(totals["line_tax_paise"]) == (
        totals["taxable_paise"]
    )
    assert totals["taxable_paise"] + totals["tax_paise"] == 8500
    assert totals["total_paise"] == 8500
