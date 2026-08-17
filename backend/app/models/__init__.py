"""SQLAlchemy models — import all models here so they are registered with the ORM."""
from .audit import AuditLog
from .billing import (
    DevelopmentFund,
    EvChargingSession,
    Invoice,
    InvoiceLine,
    Payment,
    PaymentAllocation,
    PaymentMethod,
)
from .community import (
    Announcement,
    Document,
    DocumentFolder,
    FacilityBooking,
    VisitorPass,
)
from .development import Development, DevelopmentSettings, OnboardingStep
from .feature_flag import FeatureFlag, FeatureFlagOverride
from .governance import Meeting, Resolution, Vote
from .integration import (
    ApiKey,
    Integration,
    WhatsAppMessage,
    WhatsAppNumber,
    WhatsAppStat,
    WhatsAppTemplate,
)
from .maintenance import (
    MaintenanceEvent,
    MaintenanceMessage,
    MaintenancePhoto,
    MaintenanceRequest,
    Vendor,
)
from .monitoring import SystemAlert, SystemMetric
from .property import (
    Block,
    Facility,
    ParkingBay,
    StorageUnit,
    Unit,
    UnitOwnership,
    UnitTenancy,
)
from .resident import Invitation, Notification, ResidentPreference
from .subscription import RevenueSnapshot, Subscription, SubscriptionInvoice, SubscriptionPlan
from .user import User

__all__ = [
    'Announcement',
    'ApiKey',
    'AuditLog',
    'Block',
    'Development',
    'DevelopmentFund',
    'DevelopmentSettings',
    'Document',
    'DocumentFolder',
    'EvChargingSession',
    'Facility',
    'FacilityBooking',
    'FeatureFlag',
    'FeatureFlagOverride',
    'Integration',
    'Invitation',
    'Invoice',
    'InvoiceLine',
    'MaintenanceEvent',
    'MaintenanceMessage',
    'MaintenancePhoto',
    'MaintenanceRequest',
    'Meeting',
    'Notification',
    'OnboardingStep',
    'ParkingBay',
    'Payment',
    'PaymentAllocation',
    'PaymentMethod',
    'ResidentPreference',
    'Resolution',
    'RevenueSnapshot',
    'StorageUnit',
    'Subscription',
    'SubscriptionInvoice',
    'SubscriptionPlan',
    'SystemAlert',
    'SystemMetric',
    'Unit',
    'UnitOwnership',
    'UnitTenancy',
    'User',
    'Vendor',
    'VisitorPass',
    'Vote',
    'WhatsAppMessage',
    'WhatsAppNumber',
    'WhatsAppStat',
    'WhatsAppTemplate',
]
