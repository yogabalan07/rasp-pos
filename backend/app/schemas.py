"""Pydantic request/response schemas for the Phase 1 API."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .utils.money import MAX_MONEY_PAISE, to_paise

Role = Literal["OWNER", "ADMIN", "CASHIER"]
PaymentMethod = Literal["CASH", "UPI", "CARD", "CREDIT"]


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")


# ------------------------------------------------------------------ auth

class LoginRequest(ApiModel):
    identifier: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class PinLoginRequest(ApiModel):
    pin: str = Field(min_length=1, max_length=32)


class ChangePasswordRequest(ApiModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


class RegisterRequest(ApiModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=200)
    display_name: str = Field(min_length=1, max_length=120)
    role: Role = "CASHIER"
    email: Optional[str] = Field(default=None, max_length=200)
    pin: Optional[str] = Field(default=None, min_length=4, max_length=12)


# --------------------------------------------------------------- product

class ProductCreate(ApiModel):
    sku: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    barcode: Optional[str] = Field(default=None, max_length=64)
    brand: str = ""
    category_id: str = ""
    category: str = ""
    subcategory: str = ""
    unit: str = "Piece"
    selling_price_paise: int = Field(ge=0)
    purchase_price_paise: int = Field(default=0, ge=0)
    mrp_paise: int = Field(default=0, ge=0)
    wholesale_price_paise: int = Field(default=0, ge=0)
    gst_rate: int = 0
    hsn_code: str = ""
    image: Optional[str] = None
    min_stock: int = Field(default=0, ge=0)
    batch_tracked: int = 0
    stock: int = Field(default=0, ge=0)


class ProductStatusUpdate(ApiModel):
    is_active: bool


class ProductUpdate(ApiModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    sku: Optional[str] = Field(default=None, min_length=1, max_length=64)
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    barcode: Optional[str] = Field(default=None, max_length=64)
    brand: Optional[str] = None
    category_id: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    selling_price_paise: Optional[int] = Field(default=None, ge=0)
    purchase_price_paise: Optional[int] = Field(default=None, ge=0)
    mrp_paise: Optional[int] = Field(default=None, ge=0)
    wholesale_price_paise: Optional[int] = Field(default=None, ge=0)
    gst_rate: Optional[int] = None
    hsn_code: Optional[str] = None
    image: Optional[str] = None
    min_stock: Optional[int] = Field(default=None, ge=0)
    batch_tracked: Optional[int] = None
    is_active: Optional[int] = None
    subcategory: Optional[str] = None


# ------------------------------------------------------------- inventory

class StockAdjustRequest(ApiModel):
    delta: int
    reason: str = Field(min_length=1, max_length=300)
    reason_code: Optional[str] = None


class OpeningStockRequest(ApiModel):
    product_id: Optional[str] = Field(default=None, max_length=64)
    quantity: int = Field(ge=0, le=1_000_000)
    reason: Optional[str] = Field(default=None, max_length=300)


# ------------------------------------------------------------------ sale

class DiscountSpec(ApiModel):
    """Explicit discount request (Phase 3).

    `FIXED`    -> `value` is INTEGER PAISE (₹10 == 1000)
    `PERCENT`  -> `value` is a percentage 0..100, evaluated SERVER-SIDE

    The server recomputes every rupee amount from SQLite; a discount spec is
    only an instruction, never an authoritative money value on its own.
    """

    type: Literal["FIXED", "PERCENT"]
    value: float = Field(ge=0)


class SaleLineRequest(ApiModel):
    product_id: str = Field(min_length=1, max_length=64)
    quantity: int = Field(gt=0, le=10_000)
    discount_paise: int = Field(default=0, ge=0)
    unit_price_paise: Optional[int] = Field(default=None, ge=0)
    discount: Optional[DiscountSpec] = None


class CreateSaleRequest(ApiModel):
    client_sale_id: str = Field(min_length=1, max_length=64)
    device_id: str = Field(min_length=1, max_length=64)
    items: list[SaleLineRequest] = Field(min_length=1, max_length=500)
    payment_method: PaymentMethod
    discount: Optional[DiscountSpec] = None
    bill_discount_paise: int = Field(default=0, ge=0)
    additional_charges_paise: int = Field(default=0, ge=0)
    amount_received_paise: Optional[int] = Field(default=None, ge=0)
    payment_reference: Optional[str] = Field(default=None, max_length=200)
    customer_id: Optional[str] = Field(default=None, max_length=64)
    customer_name: Optional[str] = Field(default=None, max_length=200)
    customer_phone: Optional[str] = Field(default=None, max_length=32)


# ------------------------------------------------- customers (Phase 4)

class CustomerCreate(ApiModel):
    """New khata customer. Codes (CUST-0001) are assigned by the server."""

    name: str = Field(min_length=1, max_length=200)
    phone: str = Field(min_length=1, max_length=32)
    email: str = Field(default="", max_length=200)
    address: str = Field(default="", max_length=300)
    gstin: str = Field(default="", max_length=20)
    credit_limit_paise: int = Field(default=0, ge=0, le=MAX_MONEY_PAISE)
    notes: str = Field(default="", max_length=500)


class CustomerUpdate(ApiModel):
    """Partial profile edit.

    Deliberately absent: `code` (identity) and any outstanding/balance field -
    the balance is derived from ledger rows and is not editable, so a payload
    that tries to set it is rejected by `extra="forbid"` with 422.
    """

    name: Optional[str] = Field(default=None, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=32)
    email: Optional[str] = Field(default=None, max_length=200)
    address: Optional[str] = Field(default=None, max_length=300)
    gstin: Optional[str] = Field(default=None, max_length=20)
    credit_limit_paise: Optional[int] = Field(default=None, ge=0, le=MAX_MONEY_PAISE)
    notes: Optional[str] = Field(default=None, max_length=500)
    is_active: Optional[bool] = None


class PaymentRequest(ApiModel):
    """Shared body for customer + supplier money collection.

    `amount_paise` is authoritative (INTEGER paise, RULE 4). `amount` is the
    public rupee alias: it is converted with `to_paise()` here, in the request
    model, so the service layer only ever sees one field. Exactly one of the
    two may be supplied; both missing reaches the service, which answers
    `400 INVALID_PAYMENT_AMOUNT`.
    """

    amount_paise: Optional[int] = Field(default=None, ge=0, le=MAX_MONEY_PAISE)
    amount: Optional[float] = None
    reference: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=500)
    idempotency_key: Optional[str] = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def _normalise_amount(self) -> "PaymentRequest":
        if self.amount_paise is not None and self.amount is not None:
            raise ValueError("Provide amount_paise or amount, not both")
        if self.amount_paise is None and self.amount is not None:
            try:
                paise = to_paise(self.amount)
            except (ValueError, TypeError):
                raise ValueError(f"invalid money value: {self.amount!r}") from None
            if paise < 0 or paise > MAX_MONEY_PAISE:
                raise ValueError(
                    f"amount must be between 0 and {MAX_MONEY_PAISE} paise"
                )
            self.amount_paise = paise
        self.amount = None
        return self


class CustomerPaymentRequest(PaymentRequest):
    """Khata collection: `{amount_paise}` or the rupee alias `{amount}`."""

    payment_method: Literal["CASH", "UPI", "CARD"] = "CASH"


# ------------------------------------------------- suppliers (Phase 4)

class SupplierCreate(ApiModel):
    name: str = Field(min_length=1, max_length=200)
    contact_person: str = Field(default="", max_length=120)
    phone: str = Field(min_length=1, max_length=32)
    email: str = Field(default="", max_length=200)
    address: str = Field(default="", max_length=300)
    gstin: str = Field(default="", max_length=20)
    payment_terms: str = Field(default="Net 30 Days", max_length=60)
    credit_limit_paise: int = Field(default=0, ge=0, le=MAX_MONEY_PAISE)
    notes: str = Field(default="", max_length=500)


class SupplierUpdate(ApiModel):
    name: Optional[str] = Field(default=None, max_length=200)
    contact_person: Optional[str] = Field(default=None, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=32)
    email: Optional[str] = Field(default=None, max_length=200)
    address: Optional[str] = Field(default=None, max_length=300)
    gstin: Optional[str] = Field(default=None, max_length=20)
    payment_terms: Optional[str] = Field(default=None, max_length=60)
    credit_limit_paise: Optional[int] = Field(default=None, ge=0, le=MAX_MONEY_PAISE)
    notes: Optional[str] = Field(default=None, max_length=500)
    is_active: Optional[bool] = None


class SupplierPaymentRequest(PaymentRequest):
    """Same money contract as `CustomerPaymentRequest` (see its docstring)."""
