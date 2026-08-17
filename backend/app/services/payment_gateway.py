"""
Payment gateway seam.

No Mauritian acquirer is wired up yet, so payments run through
SimulatedGateway: it authorises, returns a reference, and the ledger is updated
for real. Everything downstream of the charge — allocation, receipts, the
statement, the audit row — is production code exercised on every payment.

When a real provider is chosen (MIPS, Peach, MyT Money), it implements this
interface and `PAYMENT_GATEWAY` selects it. No route, screen or ledger rule
changes, because none of them know which gateway they are talking to.

The interface is deliberately narrow. A gateway authorises and refunds; it does
not know what an invoice is.
"""
import secrets
from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal

from flask import current_app


@dataclass(frozen=True)
class GatewayResult:
    ok: bool
    reference: str | None = None
    failure_reason: str | None = None


class PaymentGateway(ABC):
    name = 'abstract'

    @abstractmethod
    def charge(self, amount: Decimal, method_label: str, metadata: dict) -> GatewayResult:
        """Authorise and capture `amount`. Must not raise for a declined card."""

    @abstractmethod
    def refund(self, gateway_reference: str, amount: Decimal) -> GatewayResult:
        """Reverse a previously captured charge."""


class SimulatedGateway(PaymentGateway):
    """
    Approves any positive amount and mints a reference.

    A declined path exists so the failure branch in the route is real code
    rather than an untested else: any amount at or below zero is refused, which
    is also the only decline a simulated acquirer can honestly produce.
    """

    name = 'simulated'

    def charge(self, amount, method_label, metadata):
        if amount is None or Decimal(str(amount)) <= 0:
            return GatewayResult(ok=False, failure_reason='Amount must be greater than zero')
        return GatewayResult(ok=True, reference=f'SIM-{secrets.token_hex(6).upper()}')

    def refund(self, gateway_reference, amount):
        if not gateway_reference:
            return GatewayResult(ok=False, failure_reason='Unknown transaction')
        return GatewayResult(ok=True, reference=f'SIMRF-{secrets.token_hex(5).upper()}')


_GATEWAYS = {
    'simulated': SimulatedGateway,
}


def get_gateway() -> PaymentGateway:
    configured = (current_app.config.get('PAYMENT_GATEWAY') or 'simulated').lower()
    gateway_class = _GATEWAYS.get(configured, SimulatedGateway)
    return gateway_class()
