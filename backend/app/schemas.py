"""Pydantic request/response schemas for the Phase 1 API."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

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
